// Server-side simulation of the shared world: cats exploring, townsfolk living
// their schedules, meetings, finds, and broadcasting to connected clients.
import type { WebSocket } from 'ws';
import type { CatRecord } from '../../shared/types';
import { WORLD_VERSION, type EntState, type ServerMsg, type ClientMsg } from '../../shared/protocol';
import { getWorld, getRooms, roomAt, roomById, planRoute, POIS, POI_MAP, TILE, HOME_SPAWN, walkableAt, zoneAt, poiPoint, ZONE_NAME, type Poi, type Leg, type Room } from '../../shared/world';
import { roomOpen } from '../../shared/rooms';
import { showAt, showRole, STAGE, INSTRUMENTS, type ShowNow } from '../../shared/shows';
import { NPCS, NPC_MAP, scheduleAt, walkBusy, type NpcDef } from '../../shared/npcs';
import { clockAt, weatherAt } from '../../shared/time';
import { ITEMS, type ItemDef } from '../../shared/items';
import { ageOf, applyDelta } from '../../shared/stats';
import { CAT_NAMES } from '../../shared/genes';
import { Rng, hashf } from '../../shared/rng';
import * as game from './game';
import * as db from './db';
import { catLine, catDialogue, npcLine, npcStory, journalEntry, type NpcPersona } from './llm';
import { befriend, bondOf, usedToday, markToday, usedEver, markEver, errandOf, setErrand } from './townsfolk';
import { progressWish } from './wish';
import { isOpen, onModeChange } from './townmode';

const world = getWorld();
const CAT_SPEED = 46;
const NPC_SPEED = 40;

interface Trip {
  started: number;
  ends: number;
  places: string[];
  finds: string[];
  findIds: string[];
  friends: string[];
  userSent: boolean;
  goingHome: boolean;
  recalled?: boolean; // the owner asked it to come home
}

interface Ent {
  st: EntState;
  cat?: CatRecord;
  npc?: NpcDef;
  controlledBy?: string;
  trip?: Trip;
  // movement: the stretch being walked now, then any after a door
  path: [number, number][];
  legs: Leg[];
  run?: boolean;
  t0: number;
  sx: number;
  sy: number;
  speed: number;
  // brain
  mode: 'idle' | 'walk' | 'meet' | 'talk';
  until: number;
  poi?: string;
  nextSay: number;
  onArrive?: () => void;
  meetWith?: string;
  // walking along with someone's cat
  companion?: Companion;
  busyUntil?: number; // doing a resident's little thing together
  nextGreet?: number;
  nextNote?: number;
  date?: number; // on its way to (or waiting at) an appointment to play
}

interface Companion {
  leader: string; // the cat being accompanied
  owner: string;
  since: number;
  places: string[];
  lastSay: number;
  lastPlan: number;
  lx: number; // where the leader was when the walk was last planned
  ly: number;
}

interface Client {
  ws: WebSocket;
  uid: string | null;
  nickname: string;
  cats: Set<string>;
  lastPos: number;
  view: { x: number; y: number } | null; // camera centre; null = not watching the world
  v: number; // world version the client knows (0 = an app from before the town grew)
}

/** Cosmetic, high-frequency messages only travel to players looking nearby. */
const AOI = 1600;
function broadcastNear(m: ServerMsg, x: number, y: number, except?: Client, radius = AOI) {
  const s = JSON.stringify(m);
  for (const c of clients) {
    if (c === except || c.ws.readyState !== 1) continue;
    const mine = c.uid && 'id' in m && c.cats.has((m as { id: string }).id);
    if (!mine && (!c.view || Math.abs(c.view.x - x) > radius || Math.abs(c.view.y - y) > radius * 0.8)) continue;
    c.ws.send(s);
  }
}

const ents = new Map<string, Ent>();
const clients = new Set<Client>();
const meetCooldown = new Map<string, number>();
setInterval(() => {
  const now = Date.now();
  for (const [k, t] of meetCooldown) if (t < now) meetCooldown.delete(k);
  for (const [k, t] of chatterCells) if (t < now) chatterCells.delete(k);
}, 10 * 60_000).unref();

// ---------- broadcast ----------
function send(c: Client, m: ServerMsg) {
  if (c.ws.readyState === 1) c.ws.send(JSON.stringify(m));
}
function broadcast(m: ServerMsg, except?: Client) {
  const s = JSON.stringify(m);
  for (const c of clients) if (c !== except && c.ws.readyState === 1) c.ws.send(s);
}
function toOwners(cat: CatRecord, m: ServerMsg) {
  for (const c of clients) if (c.uid && (c.uid === cat.ownerId || c.uid === cat.coOwnerId)) send(c, m);
}
function ownerOnline(cat: CatRecord) {
  for (const c of clients) if (c.uid && (c.uid === cat.ownerId || c.uid === cat.coOwnerId)) return true;
  return false;
}

// ---------- movement ----------
function posOf(e: Ent, now: number): [number, number] {
  if (!e.path.length) return [e.st.x, e.st.y];
  let d = (e.speed * (now - e.t0)) / 1000;
  let x = e.sx, y = e.sy;
  for (const [px, py] of e.path) {
    const seg = Math.hypot(px - x, py - y);
    if (d <= seg) {
      const k = seg ? d / seg : 1;
      return [x + (px - x) * k, y + (py - y) * k];
    }
    d -= seg;
    x = px;
    y = py;
  }
  return [x, y];
}

function pathDone(e: Ent, now: number): boolean {
  if (!e.path.length) return true;
  let total = 0, x = e.sx, y = e.sy;
  for (const [px, py] of e.path) {
    total += Math.hypot(px - x, py - y);
    x = px;
    y = py;
  }
  return (e.speed * (now - e.t0)) / 1000 >= total;
}

function startLeg(e: Ent, x: number, y: number, path: [number, number][], now: number) {
  e.path = path;
  e.sx = x;
  e.sy = y;
  e.st.x = x;
  e.st.y = y;
  e.t0 = now;
  if (path.length) e.st.dir = path[0][0] >= x ? 1 : -1;
  broadcast({ t: 'move', id: e.st.id, path, speed: e.speed, run: e.run, t0: now, x, y });
}

function walkTo(e: Ent, tx: number, ty: number, now: number, run = false, onArrive?: () => void): boolean {
  const [x, y] = posOf(e, now);
  e.st.x = x;
  e.st.y = y;
  const legs = planRoute(world, x, y, tx, ty);
  if (!legs) return false;
  e.speed = (e.npc ? NPC_SPEED : CAT_SPEED) * (run ? 2.4 : 1);
  e.run = run;
  e.mode = 'walk';
  e.onArrive = onArrive;
  e.st.anim = run ? 'run' : 'walk';
  e.legs = legs.slice(1);
  startLeg(e, x, y, legs[0].pts, now);
  return true;
}

/** Step through a doorway: everyone sees the cat (or townsfolk) appear on the other side. */
function warp(e: Ent, x: number, y: number) {
  e.st.x = e.sx = x;
  e.st.y = e.sy = y;
  e.path = [];
  broadcast({ t: 'door', id: e.st.id, x, y, room: roomAt(x, y)?.id ?? null });
}

/** Advance a walk; true once the whole route (every leg) is done. */
function walkDone(e: Ent, now: number): boolean {
  if (!pathDone(e, now)) return false;
  const next = e.legs.shift();
  if (!next) return true;
  warp(e, next.from[0], next.from[1]);
  startLeg(e, next.from[0], next.from[1], next.pts, now);
  return false;
}

function setAct(e: Ent, anim: string, dur: number, now: number) {
  e.path = [];
  e.legs = [];
  e.mode = 'idle';
  e.until = now + dur;
  e.st.anim = anim;
  broadcast({ t: 'act', id: e.st.id, anim, x: e.st.x, y: e.st.y, dir: e.st.dir });
}

const chatterCells = new Map<number, number>();
/** Idle chatter is rationed per ~600-unit area so crowded places stay readable. */
function chatterAllowed(x: number, y: number, now: number): boolean {
  const key = Math.floor(x / 600) * 1000 + Math.floor(y / 600);
  if ((chatterCells.get(key) ?? 0) > now) return false;
  chatterCells.set(key, now + 7000);
  return true;
}

function say(e: Ent, text: string, idle = false) {
  if (idle && !chatterAllowed(e.st.x, e.st.y, Date.now())) return;
  broadcastNear({ t: 'say', id: e.st.id, text }, e.st.x, e.st.y, undefined, 900);
}

// ---------- spawning ----------
function catState(c: CatRecord, x: number, y: number): EntState {
  const owner = c.ownerId === 'town' ? undefined : db.getUser(c.ownerId);
  return {
    id: c.id, kind: 'cat', name: c.name, genes: c.genes, outfit: c.outfit, age: ageOf(c.born),
    owner: owner?.nickname ?? (c.ownerId === 'town' ? '小镇居民' : undefined), ownerId: c.ownerId,
    x, y, dir: 1, anim: 'stand',
  };
}

function spawnCat(c: CatRecord, x: number, y: number, now: number, trip?: Trip): Ent {
  const existing = ents.get(c.id);
  if (existing) return existing;
  const e: Ent = { st: catState(c, x, y), cat: c, path: [], legs: [], t0: now, sx: x, sy: y, speed: CAT_SPEED, mode: 'idle', until: now + 1500, nextSay: now + 8000 + Math.random() * 20000, trip };
  ents.set(c.id, e);
  c.location = 'world';
  c.wx = x;
  c.wy = y;
  game.markDirty(c);
  broadcast({ t: 'spawn', e: e.st });
  return e;
}

function despawn(e: Ent, how: 'home' | 'leave' = 'home') {
  ents.delete(e.st.id);
  broadcast({ t: 'despawn', id: e.st.id, how });
}

function npcState(n: NpcDef, x: number, y: number): EntState {
  return { id: n.id, kind: 'npc', name: n.name, genes: n.genes, outfit: [], npcOutfit: n.outfit, age: 1, x, y, dir: 1, anim: 'stand', owner: n.role };
}

// ---------- trips ----------
function newTrip(now: number, userSent: boolean, rng: Rng): Trip {
  const mins = userSent ? rng.range(14, 30) : rng.range(18, 45);
  return { started: now, ends: now + mins * 60_000, places: [], finds: [], findIds: [], friends: [], userSent, goingHome: false };
}

export function startTrip(c: CatRecord, userSent: boolean): boolean {
  const now = Date.now();
  if (ents.has(c.id)) {
    const e = ents.get(c.id)!;
    if (!e.trip) e.trip = newTrip(now, userSent, new Rng(now));
    e.trip.goingHome = false;
    e.trip.recalled = false;
    if (userSent) e.trip.ends = Math.max(e.trip.ends, now + 15 * 60_000);
    return true;
  }
  const [hx, hy] = HOME_SPAWN;
  const e = spawnCat(c, hx + (Math.random() - 0.5) * 30, hy, now, newTrip(now, userSent, new Rng(now)));
  e.until = now + 1200;
  if (!userSent) db.addJournal(c.id, 'explore', `${c.name}${pick(['伸了个懒腰，决定出门转转', '闻到了外面的味道，悄悄出门了', '跟窗外的小鸟说了声再见，出门探险去了'])}。`);
  return true;
}

export function callHome(catId: string) {
  const e = ents.get(catId);
  if (!e?.trip || !e.cat) return;
  e.trip.ends = Date.now();
  e.trip.goingHome = false;
  e.trip.recalled = true;
  e.controlledBy = undefined;
  e.until = 0;
  e.mode = 'idle';
}

function pick<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

function choosePoi(e: Ent, now: number): Poi {
  const c = e.cat!;
  const p = c.personality;
  const ck = clockAt(now);
  const night = ck.hour < 6 || ck.hour > 20;
  const rng = new Rng(now ^ hashf(c.genes.seed) * 1e9);
  const here = anchorOf(e.st.x, e.st.y);
  const weights: [Poi, number][] = POIS.filter((poi) => poi.id !== 'home_lane' && placeOpen(poi, ck.hour)).map((poi) => {
    let w = 1;
    if (!c.discovered.includes(poi.id)) w += p.curious * 2.5;
    if (e.trip?.places.includes(poi.name)) w *= 0.15;
    if (poi.id === e.poi && !(poi.id === 'stage' && tonight?.live)) w = 0;
    if (poi.id === 'stage' && tonight) w *= tonight.live ? 12 : 6;
    const [ax, ay] = poiAnchor(poi);
    const d = Math.hypot(ax - here[0], ay - here[1]) / TILE;
    w *= Math.max(0.15, 1.6 - d / 45);
    if (poi.room) w *= 0.55 + p.social * 0.4 + (poi.id === 'bakery_in' || poi.id === 'cafe_in' ? p.foodie * 0.5 : 0);
    if (poi.acts.includes('play') || poi.acts.includes('roll')) w *= 0.6 + p.playful;
    if (poi.acts.includes('nap') || poi.acts.includes('loaf')) w *= 0.6 + p.lazy;
    if (poi.id === 'bakery' || poi.id === 'pier' || poi.id === 'cafe') w *= 0.7 + p.foodie;
    if (poi.zone === 'plaza' || poi.zone === 'town') w *= 0.6 + p.social;
    if (poi.zone === 'forest' || poi.zone === 'hill') w *= 0.5 + p.brave;
    if (poi.night && night) w *= 3;
    return [poi, w];
  });
  return rng.weighted(weights);
}

/** Where a place is on the town map: a shop's rooms count as being at its front door. */
function poiAnchor(poi: Poi): [number, number] {
  const r = poi.room ? roomById(poi.room) : null;
  return r ? r.outside : [poi.x * TILE, poi.y * TILE];
}
function anchorOf(x: number, y: number): [number, number] {
  return roomAt(x, y)?.outside ?? [x, y];
}
function placeOpen(poi: Poi, hour: number) {
  const r = poi.room ? roomById(poi.room) : null;
  return !r || roomOpen(r, hour);
}

const ACT_ANIM: Record<string, string[]> = {
  sit: ['sit', 'sit_happy'], watch: ['watch', 'window'], groom: ['groom'], sniff: ['sniff'], think: ['think'], beg: ['beg'],
  nap: ['nap', 'sleep'], loaf: ['loaf'], play: ['pounce', 'bat'], run: ['run'], roll: ['belly'], scratch: ['scratch'], pounce: ['pounce'], bat: ['bat'],
};

function rollFind(zone: string, now: number, rng: Rng): ItemDef | null {
  const ck = clockAt(now);
  const w = weatherAt(now);
  const night = ck.hour < 6 || ck.hour > 19.5;
  const cands = ITEMS.filter((i) => i.cat === 'collect' && i.zones?.includes(zone) && (!i.seasons || i.seasons.includes(ck.season)) && (!i.night || night) && (!i.rain || w.kind === 'rain'));
  if (!cands.length) return null;
  const rw = { 1: 10, 2: 4, 3: 1.1, 4: 0.3 } as const;
  return rng.weighted(cands.map((i) => [i, rw[i.rarity ?? 1]] as const));
}

function giveItem(c: CatRecord, item: string, n = 1) {
  // co-parented cats bring finds to whichever parent is around (alternating otherwise)
  const owners = game.ownersOf(c);
  if (!owners.length) return;
  const online = owners.filter((uid) => [...clients].some((cl) => cl.uid === uid));
  const to = online.length ? online[Math.floor(Math.random() * online.length)] : owners[Math.floor(Math.random() * owners.length)];
  if (item === 'fish') game.addFish(to, n);
  else {
    db.invAdd(to, item, n);
    game.markFound(to, item);
  }
}

function arriveAtPoi(e: Ent, poi: Poi, now: number) {
  const c = e.cat!;
  const rng = new Rng(now);
  e.poi = poi.id;
  progressWish(c, 'visit', poi.id);
  const act = rng.pick(poi.acts);
  const anims = ACT_ANIM[act] ?? ['sit'];
  const watching = poi.id === 'stage' && tonight?.live;
  setAct(e, watching ? rng.pick(['watch', 'sit', 'sit_happy']) : rng.pick(anims), watching ? rng.range(60_000, 120_000) : rng.range(18_000, 45_000) * (0.7 + c.personality.lazy * 0.6), now);
  if (watching) e.st.dir = STAGE.x * TILE > e.st.x ? 1 : -1;
  if (e.trip && !e.trip.places.includes(poi.name)) e.trip.places.push(poi.name);
  if (!c.discovered.includes(poi.id) && c.ownerId !== 'town') {
    c.discovered.push(poi.id);
    game.markDirty(c);
    for (const uid of game.ownersOf(c)) game.addFish(uid, 10);
    db.addJournal(c.id, 'explore', `第一次来到了「${poi.name}」！`, { poi: poi.id });
    toOwners(c, { t: 'event', kind: 'discover', text: `${c.name}发现了新地方：${poi.name}（+10 小鱼干）`, catId: c.id });
  }
  // small chance of a find
  if (c.ownerId !== 'town' && rng.chance(0.38)) {
    if (rng.chance(0.18)) {
      const n = rng.int(3, 9);
      giveItem(c, 'fish', n);
      e.trip?.finds.push(`${n}条小鱼干`);
      toOwners(c, { t: 'event', kind: 'find', text: `${c.name}在${poi.name}捡到了${n}条小鱼干！`, item: 'fish', catId: c.id });
      broadcastNear({ t: 'emote', id: c.id, kind: 'fish' }, e.st.x, e.st.y);
    } else {
      const it = rollFind(poi.zone, now, rng);
      if (it) {
        giveItem(c, it.id);
        e.trip?.finds.push(it.name);
        e.trip?.findIds.push(it.id);
        db.addJournal(c.id, 'find', `在${poi.name}捡到了「${it.name}」。${it.desc}`, { item: it.id });
        toOwners(c, { t: 'event', kind: 'find', text: `${c.name}在${poi.name}捡到了「${it.name}」！`, item: it.id, catId: c.id });
        broadcastNear({ t: 'emote', id: c.id, kind: it.rarity && it.rarity >= 3 ? 'star' : 'sparkle' }, e.st.x, e.st.y);
        if (watchedNear(e)) say(e, catLine(c, 'find', { item: it.name, place: poi.name }));
        if (it.rarity && it.rarity >= 3) game.remember(c, `在${poi.name}找到了稀有的${it.name}`);
        return;
      }
    }
  }
  if (watchedNear(e) && rng.chance(0.55)) say(e, catLine(c, 'place', { place: poi.name }), true);
}

function finishTrip(e: Ent, now: number) {
  const c = e.cat!;
  const t = e.trip!;
  despawn(e, 'home');
  c.location = 'nest';
  c.statsAt = now;
  c.stats = applyDelta(c.stats, { energy: -10, mood: 6, social: 10 });
  game.saveNow(c);
  void journalEntry(c, t.places, t.finds, t.friends).then((text) => {
    db.addJournal(c.id, 'home', text, { places: t.places, finds: t.finds, findIds: t.findIds, friends: t.friends });
    const finds = t.finds.length ? `，带回了${t.finds.slice(0, 3).join('、')}` : '';
    for (const uid of game.ownersOf(c)) {
      if (!t.userSent || !ownerOnline(c)) game.notify(uid, 'home', `${c.name}探险回来啦`, `去了${t.places.slice(0, 3).join('、') || '附近'}${finds}。`);
    }
    toOwners(c, { t: 'event', kind: 'home', text: `${c.name}回到了猫窝`, catId: c.id });
  });
  if (t.places.length) game.remember(c, `去了${t.places.slice(-2).join('和')}`);
  // in autumn a leaf sometimes sticks to the cat's head and it refuses to give it back
  if (clockAt(now).season === 2 && Math.random() < 0.12) {
    for (const uid of game.ownersOf(c)) {
      if (db.invCount(uid, 'leaf') === 0) {
        db.invAdd(uid, 'leaf', 1);
        db.addJournal(c.id, 'find', '回家的路上，一片小叶子落在了头顶。我决定一直戴着它。', { item: 'leaf' });
      }
    }
  }
}

// ---------- meetings ----------
function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function watchedNear(e: Ent): boolean {
  return clients.size > 0;
}

async function meet(a: Ent, b: Ent, now: number, forced = false) {
  // either may still be mid-walk (two cats arriving for an appointment): stop them where they really are
  for (const x of [a, b]) {
    [x.st.x, x.st.y] = posOf(x, now);
    x.sx = x.st.x;
    x.sy = x.st.y;
    x.legs = [];
  }
  const key = pairKey(a.st.id, b.st.id);
  const talk = forced || chatterAllowed(a.st.x, a.st.y, now);
  meetCooldown.set(key, now + 12 * 60_000);
  for (const [x, y] of [[a, b], [b, a]] as const) {
    x.path = [];
    x.mode = 'meet';
    x.until = now + 14_000;
    x.st.dir = y.st.x > x.st.x ? 1 : -1;
    x.meetWith = y.st.id;
  }
  broadcast({ t: 'act', id: a.st.id, anim: 'sit', x: a.st.x, y: a.st.y, dir: a.st.dir });
  broadcast({ t: 'act', id: b.st.id, anim: 'sit', x: b.st.x, y: b.st.y, dir: b.st.dir });
  broadcastNear({ t: 'emote', id: a.st.id, kind: 'heart' }, a.st.x, a.st.y);
  const place = placeName(a.st.x, a.st.y);
  const pa: CatRecord | NpcPersona = a.cat ?? personaOf(a.npc!), pb: CatRecord | NpcPersona = b.cat ?? personaOf(b.npc!);
  // friendship bookkeeping (cats only)
  if (a.cat && b.cat) {
    const [x, y] = a.cat.id < b.cat.id ? [a.cat.id, b.cat.id] : [b.cat.id, a.cat.id];
    const row = db.db.prepare('SELECT affinity, meets FROM friendships WHERE a = ? AND b = ?').get(x, y) as { affinity: number; meets: number } | undefined;
    const aff = (row?.affinity ?? 0) + 1 + (a.cat.personality.social + b.cat.personality.social) / 2;
    db.db.prepare('INSERT INTO friendships (a, b, affinity, meets, last) VALUES (?, ?, ?, 1, ?) ON CONFLICT(a, b) DO UPDATE SET affinity = ?, meets = meets + 1, last = ?').run(x, y, aff, now, aff, now);
    for (const [me, other] of [[a, b], [b, a]] as const) {
      const mc = me.cat!, oc = other.cat!;
      mc.stats = applyDelta(mc.stats, { social: 12, mood: 4 });
      game.markDirty(mc);
      me.trip?.friends.includes(oc.name) || me.trip?.friends.push(oc.name);
      progressWish(mc, 'friend');
      if (!row && mc.ownerId !== 'town') {
        db.addJournal(mc.id, 'friend', `在${place}认识了新朋友「${oc.name}」，我们碰了碰鼻子。`, { cat: oc.id });
        game.remember(mc, `认识了${oc.name}`);
        toOwners(mc, { t: 'event', kind: 'friend', text: `${mc.name}交到了新朋友：${oc.name}`, catId: mc.id });
        if (!ownerOnline(mc)) for (const uid of game.ownersOf(mc)) game.notify(uid, 'friend', `${mc.name}交到了新朋友`, `在${place}遇到了${oc.name}，它们碰了碰鼻子。`);
      }
    }
  }
  if (!talk) {
    // a quiet nose-boop: no words, just a heart
    for (const x of [a, b]) x.until = Date.now() + 5000;
    return;
  }
  const lines = await catDialogue(pa, pb, place);
  let delay = 600;
  for (const l of lines) {
    const who = l.who === 0 ? a : b;
    setTimeout(() => {
      if (ents.has(who.st.id)) say(who, l.text);
    }, delay);
    delay += 2600 + l.text.length * 90;
  }
  for (const x of [a, b]) x.until = Date.now() + delay + 1500;
}

function placeName(x: number, y: number): string {
  const room = roomAt(x, y);
  if (room) return room.name;
  const poi = POIS.find((p) => Math.hypot(p.x * TILE - x, p.y * TILE - y) < (p.r + 1.5) * TILE);
  return poi?.name ?? ZONE_NAME[zoneAt(world, x, y)];
}

// ---------- residents: walking together, their little things, familiarity ----------
const WALK_MAX = 20 * 60_000;
const persona = (o: Ent): NpcPersona => (o.npc ? personaOf(o.npc) : { npc: true, name: o.st.name, role: '小镇的猫', desc: '在小镇里自由自在生活的猫', voice: '软软的' });

function startCompanion(o: Ent, leader: Ent, owner: string, now: number) {
  for (const x of ents.values()) if (x !== o && x.companion?.leader === leader.st.id) endCompanion(x, now, 'swap');
  o.companion = { leader: leader.st.id, owner, since: now, places: [], lastSay: now, lastPlan: 0, lx: 0, ly: 0 };
  o.legs = [];
  o.path = [];
  o.mode = 'idle';
  o.until = 0;
  o.onArrive = undefined;
  if (leader.cat) toOwners(leader.cat, { t: 'companion', catId: leader.st.id, id: o.st.id, name: o.st.name });
}

function endCompanion(o: Ent, now: number, why: 'home' | 'long' | 'busy' | 'bye' | 'swap' | 'show') {
  const c = o.companion;
  if (!c) return;
  o.companion = undefined;
  o.mode = 'idle';
  o.until = now + 2500;
  const leader = ents.get(c.leader);
  const cat = leader?.cat ?? game.getCat(c.leader);
  if (why !== 'swap') {
    const fallback = o.npc?.bye ?? ['今天就逛到这儿啦', '下次再一起走走', '谢谢你陪我'];
    const situation = why === 'busy' ? `陪${cat?.name ?? '小猫'}逛了一会儿，现在要回去忙了，跟它道别` : `陪${cat?.name ?? '小猫'}在小镇逛了一圈，现在要分开了，跟它道别`;
    if (why === 'show') say(o, '我要去露天舞台啦，一起来看吧！');
    else say(o, o.npc ? npcLine(personaOf(o.npc), situation, fallback) : fallback[Math.floor(Math.random() * fallback.length)]);
    broadcastNear({ t: 'emote', id: o.st.id, kind: 'heart' }, o.st.x, o.st.y);
  }
  if (!cat || cat.ownerId === 'town') return;
  toOwners(cat, { t: 'companion', catId: cat.id, id: null });
  const mins = (now - c.since) / 60_000;
  if (mins < 1) return;
  const places = c.places.slice(0, 4);
  const r = befriend(cat.id, o.st.id, mins >= 5 ? 3 : 1, true);
  cat.stats = applyDelta(cat.stats, { social: 10, mood: 6 });
  game.markDirty(cat);
  db.addJournal(cat.id, 'friend', `和${o.st.name}一起逛了${places.length ? places.join('、') : '一小圈'}。`, { npc: o.st.id });
  if (why !== 'swap') game.remember(cat, `和${o.st.name}一起散了步`);
  if (r.up) bondUp(cat, o, r.level, r.name);
}

/** A walk companion keeps up with the cat it's walking with; true while it's busy doing so. */
function tickCompanion(o: Ent, now: number): boolean {
  const c = o.companion!;
  const leader = ents.get(c.leader);
  const hour = clockAt(now).hour;
  const why = !leader ? 'home' : now - c.since > WALK_MAX ? 'long' : o.npc && walkBusy(o.npc, hour) ? 'busy' : o.cat && (hour >= 22 || hour < 6) ? 'busy' : null;
  if (why) {
    endCompanion(o, now, why);
    return false;
  }
  if ((o.mode === 'meet' || o.mode === 'talk') && now < o.until) return true;
  if (o.busyUntil && now < o.busyUntil) return true;
  const [lx, ly] = posOf(leader!, now);
  const [x, y] = posOf(o, now);
  const side = leader!.st.dir === 1 ? -1 : 1;
  const tx = lx + side * 44, ty = ly + 6;
  if (o.mode === 'walk') {
    const done = walkDone(o, now);
    if (!done && now - c.lastPlan > 1200 && Math.hypot(lx - c.lx, ly - c.ly) > 90) {
      c.lastPlan = now;
      c.lx = lx;
      c.ly = ly;
      if (!walkTo(o, tx, ty, now, Math.hypot(lx - x, ly - y) > 260)) warp(o, lx - side * 30, ly);
    }
    if (!done) return true;
    o.mode = 'idle';
    o.path = [];
    o.st.x = x;
    o.st.y = y;
  }
  const dist = Math.hypot(lx - x, ly - y);
  if (dist > 70 || roomAt(lx, ly) !== roomAt(x, y)) {
    c.lastPlan = now;
    c.lx = lx;
    c.ly = ly;
    if (!walkTo(o, tx, ty, now, dist > 300)) warp(o, tx, ty);
    return true;
  }
  // standing by: face the cat, and now and then say something about where they are
  const place = placeName(x, y);
  if (!c.places.includes(place) && c.places.length < 8) c.places.push(place);
  if (o.st.anim === 'walk' || o.st.anim === 'run' || now > o.until) {
    o.st.dir = lx > x ? 1 : -1;
    setAct(o, o.npc ? 'stand' : leader!.st.anim === 'sit' ? 'sit' : 'stand', 6000, now);
  }
  if (clients.size && now - c.lastSay > 40_000 + (hashf(now) * 30_000)) {
    c.lastSay = now;
    // lines about the place are shared by every cat the resident walks with
    if (o.npc) say(o, npcLine(personaOf(o.npc), `陪着一只小猫一起散步，走到了${place}`, o.npc.lines));
    else if (o.cat) say(o, catLine(o.cat, 'place', { place }));
  }
  return true;
}

/** Old friends get a hello when they pass by. */
const greeted = new Map<string, number>();
function greetFriends(o: Ent, n: NpcDef, now: number) {
  o.nextGreet = now + 5000;
  for (const e of ents.values()) {
    if (!e.cat || e.cat.ownerId === 'town' || e.companion || Math.hypot(e.st.x - o.st.x, e.st.y - o.st.y) > 130) continue;
    const key = `${n.id}|${e.st.id}`;
    if ((greeted.get(key) ?? 0) > now) continue;
    greeted.set(key, now + 30 * 60_000);
    const b = bondOf(e.st.id, n.id);
    if (b.level < 2) continue;
    o.st.dir = e.st.x > o.st.x ? 1 : -1;
    say(o, npcLine(personaOf(n), `看到${b.name === '好朋友' ? '好朋友' : '熟悉的'}小猫${e.st.name}路过，叫着它的名字打招呼`, [`${e.st.name}，你好呀！`, `是${e.st.name}呀`]));
    broadcastNear({ t: 'emote', id: o.st.id, kind: 'heart' }, o.st.x, o.st.y);
    return;
  }
}

function bondUp(cat: CatRecord, o: Ent, level: number, name: string) {
  db.addJournal(cat.id, 'friend', `和${o.st.name}变得${name}了。`, { npc: o.st.id });
  toOwners(cat, { t: 'event', kind: 'friend', text: `${cat.name}和${o.st.name}变得${name}了`, catId: cat.id });
  if (level >= 3 && o.npc) {
    for (const uid of game.ownersOf(cat)) game.notify(uid, 'town', `${o.npc.name}的信`, `${cat.name}：谢谢你常常来看我。一起走过的路、说过的话，我都记着呢。以后路过${o.npc.role.replace(/的.*$/, '')}，记得进来坐坐。——${o.npc.name}`);
  }
}

function inviteWalk(e: Ent, o: Ent, c: Client, now: number) {
  const cat = e.cat!;
  if (o.companion?.leader === e.st.id) return;
  if (o.companion) {
    say(o, '我在陪别的小猫逛呢，下次吧');
    return;
  }
  const hour = clockAt(now).hour;
  const busy = o.npc ? (showRole(o.npc.id, tonight) ? '要去露天舞台啦，一起去看吧' : walkBusy(o.npc, hour)) : hour >= 22 || hour < 6 || o.st.anim === 'sleep' ? '有点困了' : null;
  if (busy) {
    say(o, o.npc ? npcLine(personaOf(o.npc), `${cat.name}邀请你一起去逛逛，可你${busy}，温柔地婉拒，约它下次`, [`${busy}，下次一起吧`]) : '呼……下次吧……');
    send(c, { t: 'event', kind: 'busy', text: `${o.st.name}${busy}`, catId: cat.id });
    return;
  }
  startCompanion(o, e, c.uid!, now);
  say(o, o.npc ? npcLine(personaOf(o.npc), `${cat.name}邀请你一起去小镇逛逛，你很高兴地答应了`, ['好呀，一起走走！', '走吧，我陪你']) : catLine(o.cat!, 'friend', { other: cat.name }));
  broadcastNear({ t: 'emote', id: o.st.id, kind: 'heart' }, o.st.x, o.st.y);
  befriend(cat.id, o.st.id, 1);
}

function giveTo(uid: string, item: string) {
  const def = ITEMS.find((i) => i.id === item);
  if (!def) return;
  if (def.cat === 'wear' && db.invCount(uid, item) > 0) return;
  db.invAdd(uid, item, 1);
  if (def.cat === 'collect') game.markFound(uid, item);
}

async function doSpecial(e: Ent, o: Ent, c: Client, now: number) {
  const n = o.npc;
  const cat = e.cat!;
  const sp = n?.special;
  if (!n || !sp || !c.uid) return;
  const key = `npcsp:${n.id}:${cat.id}`;
  if (usedToday(key)) {
    say(o, npcLine(personaOf(n), `${cat.name}今天已经和你「${sp.label}」过了，你笑着让它明天再来`, ['今天已经来过啦，明天再来吧']));
    return;
  }
  markToday(key);
  e.st.dir = o.st.x > e.st.x ? 1 : -1;
  o.st.dir = e.st.x > o.st.x ? 1 : -1;
  setAct(e, sp.anim, sp.secs * 1000, now);
  if (sp.npcAnim) setAct(o, sp.npcAnim, sp.secs * 1000 + 1500, now);
  o.busyUntil = now + sp.secs * 1000;
  game.refresh(cat, now);
  cat.stats = applyDelta(cat.stats, sp.effect);
  game.markDirty(cat);
  const b = befriend(cat.id, n.id, 2);
  let diary = `${sp.done}。`;
  if (sp.story) {
    const lines = await npcStory(personaOf(n), cat.name, sp.story, n.id === 'npc_travel' ? 'travel' : 'default');
    let delay = 400;
    for (const l of lines) {
      setTimeout(() => ents.has(o.st.id) && say(o, l), delay);
      delay += 2800 + l.length * 110;
    }
    o.busyUntil = Math.max(o.busyUntil, Date.now() + delay);
    e.until = Math.max(e.until, Date.now() + delay);
    o.until = Math.max(o.until, Date.now() + delay);
    diary = `${n.name}讲了一个故事：「${lines.join('')}」`;
  } else say(o, npcLine(personaOf(n), `${sp.done}，你对${cat.name}说的话`, n.lines));
  if (sp.errand) {
    // usually someone nearby, now and then a little journey
    const to = NPCS.filter((x) => x.id !== n.id && x.id !== 'npc_night' && ents.has(x.id));
    const [ax, ay] = anchorOf(o.st.x, o.st.y);
    const target = to.length ? new Rng(now).weighted(to.map((x) => {
      const [bx, by] = anchorOf(ents.get(x.id)!.st.x, ents.get(x.id)!.st.y);
      return [x, 1 / (1 + Math.hypot(bx - ax, by - ay) / (25 * TILE)) ** 2] as const;
    })) : null;
    if (target) {
      setErrand(cat.id, { from: n.id, to: target.id, day: clockAt(now).day });
      diary = `${n.name}托我把一封信送给${target.name}。`;
      send(c, { t: 'event', kind: 'npc', text: `${n.name}请${cat.name}把一封信送给${target.name}（${target.role}），找到它打个招呼就好`, catId: cat.id });
    }
  } else send(c, { t: 'event', kind: 'npc', text: sp.done, catId: cat.id });
  const gift = sp.gift;
  if (gift && b.level >= (gift.minLevel ?? 0) && Math.random() < gift.chance && !(gift.once && usedEver(`npcgift:${n.id}:${cat.id}`))) {
    if (gift.once) markEver(`npcgift:${n.id}:${cat.id}`);
    setTimeout(() => {
      giveTo(c.uid!, gift.item);
      send(c, { t: 'event', kind: 'gift', text: gift.text, item: gift.item });
      broadcastNear({ t: 'emote', id: o.st.id, kind: 'heart' }, o.st.x, o.st.y);
    }, Math.min(sp.secs * 1000, 9000));
  }
  db.addJournal(cat.id, 'friend', diary, { npc: n.id });
  if (b.up) bondUp(cat, o, b.level, b.name);
}

/** Delivering a letter someone gave the cat to carry. */
function deliverErrand(e: Ent, o: Ent, c: Client): boolean {
  const cat = e.cat!;
  const job = errandOf(cat.id);
  if (!job || job.to !== o.st.id || !c.uid) return false;
  setErrand(cat.id, null);
  const from = NPC_MAP[job.from];
  game.addFish(c.uid, 15);
  befriend(cat.id, o.st.id, 2);
  const r = befriend(cat.id, job.from, 2);
  say(o, npcLine(personaOf(o.npc!), `${cat.name}替${from?.name ?? '邮递员'}把一封信送到了你手里，你很惊喜地道谢`, ['哎呀，是给我的信！谢谢你', '辛苦啦，小信使']));
  db.addJournal(cat.id, 'friend', `把${from?.name ?? '阿信'}的信送给了${o.st.name}，它很高兴。`, { npc: o.st.id });
  send(c, { t: 'event', kind: 'npc', text: `信送到啦！${o.st.name}很高兴（+15 小鱼干）`, catId: cat.id });
  if (r.up && from) {
    const fe = ents.get(from.id);
    if (fe) bondUp(cat, fe, r.level, r.name);
  }
  return true;
}

/** What the target card shows about a resident. */
export function npcInfo(catId: string, id: string) {
  const o = ents.get(id);
  const n = NPC_MAP[id];
  const b = bondOf(catId, id);
  const hour = clockAt(Date.now()).hour;
  const job = errandOf(catId);
  return {
    level: b.level,
    name: b.name,
    points: b.points,
    next: b.next,
    walks: b.walks,
    walking: o?.companion?.leader === catId,
    busy: o?.companion && o.companion.leader !== catId ? '在陪别的小猫逛' : n && showRole(n.id, tonight) ? '今晚在露天舞台' : n ? walkBusy(n, hour) : hour >= 22 || hour < 6 ? '有点困了' : null,
    special: n?.special ? { label: n.special.label, done: usedToday(`npcsp:${n.id}:${catId}`) } : null,
    errand: job ? { to: NPC_MAP[job.to]?.name ?? '', from: NPC_MAP[job.from]?.name ?? '', here: job.to === id } : null,
  };
}

function personaOf(n: NpcDef): NpcPersona {
  return { npc: true, name: n.name, role: n.role, desc: n.desc, voice: n.voice };
}

// ---------- AI tick ----------
function tickCat(e: Ent, now: number) {
  const c = e.cat!;
  if (e.controlledBy) return;
  if (e.companion && tickCompanion(e, now)) return;
  if (e.mode === 'walk') {
    if (walkDone(e, now)) {
      const [x, y] = posOf(e, now);
      e.st.x = x;
      e.st.y = y;
      e.path = [];
      e.mode = 'idle';
      e.until = now + 800;
      const cb = e.onArrive;
      e.onArrive = undefined;
      if (cb) cb();
      else setAct(e, 'stand', 1500, now);
    }
    return;
  }
  if (now < e.until) return;
  if (e.mode === 'meet') e.mode = 'idle';
  if (e.date && dateWaiting(e, now)) return;
  // trip end?
  const ck = clockAt(now);
  const w = weatherAt(now);
  const isTown = c.ownerId === 'town';
  if (!isTown && e.trip) {
    // while the owner is out with the cat, it stays as long as they like (even late at night)
    const accompanied = e.trip.userSent && !e.trip.recalled && ownerOnline(c);
    if (accompanied) e.trip.ends = Math.max(e.trip.ends, now + 10 * 60_000);
    const late = (ck.hour >= 21 || ck.hour < 5.5) && !accompanied;
    if (!e.trip.goingHome && (now > e.trip.ends || late || (w.kind === 'rain' && !e.trip.userSent && now - e.trip.started > 5 * 60_000))) {
      e.trip.goingHome = true;
      if (watchedNear(e)) say(e, catLine(c, 'home'));
      const [hx, hy] = HOME_SPAWN;
      if (!walkTo(e, hx, hy, now, false, () => finishTrip(e, Date.now()))) finishTrip(e, now);
      return;
    }
    if (e.trip.goingHome) {
      finishTrip(e, now);
      return;
    }
  }
  // town cats sleep somewhere cozy at night
  if (isTown && (ck.hour >= 22 || ck.hour < 6)) {
    if (e.st.anim !== 'sleep') setAct(e, 'sleep', 120_000, now);
    else e.until = now + 120_000;
    return;
  }
  // look for a nearby cat to meet
  for (const o of ents.values()) {
    if (o === e || o.mode === 'meet' || o.mode === 'walk' || o.controlledBy) continue;
    if (o.companion?.leader === e.st.id || e.companion?.leader === o.st.id) continue;
    if (o.npc && showRole(o.npc.id, tonight)) continue; // busy with tonight's show
    if (Math.hypot(o.st.x - e.st.x, o.st.y - e.st.y) > 110) continue;
    const key = pairKey(e.st.id, o.st.id);
    if ((meetCooldown.get(key) ?? 0) > now) continue;
    if (Math.random() < 0.6) {
      void meet(e, o, now);
      return;
    }
  }
  const poi = choosePoi(e, now);
  const [tx, ty] = poiPoint(world, poi, (now / 1000) | 0);
  if (!walkTo(e, tx, ty, now, Math.random() < 0.08 * (1 + c.personality.playful), () => arriveAtPoi(e, poi, Date.now()))) setAct(e, 'sit', 5000, now);
  if (Math.random() < 0.15) setTimeout(() => ents.has(e.st.id) && say(e, catLine(c, 'explore'), true), 1500);
}

// NPC behaviour
const npcEnts = new Map<string, Ent>();
function tickNpc(n: NpcDef, now: number) {
  const ck = clockAt(now);
  const s = scheduleAt(n, ck.hour);
  let e = ents.get(n.id);
  // a show tonight comes before the usual routine
  const role = showRole(n.id, tonight);
  if (role) {
    tickShowNpc(n, e, role, now);
    return;
  }
  if (!s) {
    if (e && e.mode !== 'walk') {
      // walk home and disappear
      if (!e.onArrive) {
        const [hx, hy] = HOME_SPAWN;
        if (!walkTo(e, hx + 40, hy, now, false, () => despawn(e!, 'home'))) despawn(e, 'home');
      }
    }
    return;
  }
  if (e?.companion && tickCompanion(e, now)) return;
  const poi = POI_MAP[s.poi];
  const post = keeperPost(n, s.act, poi);
  if (!e) {
    const [x, y] = post ?? poiPoint(world, poi, hashf(n.genes.seed) * 1000);
    e = { st: npcState(n, x, y), npc: n, path: [], legs: [], t0: now, sx: x, sy: y, speed: NPC_SPEED, mode: 'idle', until: 0, nextSay: now + 5000 + Math.random() * 30000 };
    ents.set(n.id, e);
    npcEnts.set(n.id, e);
    broadcast({ t: 'spawn', e: e.st });
  }
  if (e.mode === 'walk') {
    if (walkDone(e, now)) {
      const [x, y] = posOf(e, now);
      e.st.x = x;
      e.st.y = y;
      e.path = [];
      e.mode = 'idle';
      const cb = e.onArrive;
      e.onArrive = undefined;
      if (cb) cb();
    }
    return;
  }
  if (now < e.until) {
    if (clients.size && now > (e.nextGreet ?? 0)) greetFriends(e, n, now);
    // chatter
    if (now > e.nextSay && clients.size) {
      e.nextSay = now + 25_000 + Math.random() * 50_000;
      const friend = [...npcEnts.values()].find((o) => o !== e && ents.has(o.st.id) && o.mode === 'idle' && Math.hypot(o.st.x - e.st.x, o.st.y - e.st.y) < 160 && (meetCooldown.get(pairKey(e.st.id, o.st.id)) ?? 0) < now);
      if (friend && Math.random() < 0.6) void npcChat(e, friend, now);
      else say(e, npcLine(personaOf(n), `在${poi.name}${actWord(s.act)}`, n.lines), true);
    }
    return;
  }
  if (s.act === 'patrol' && s.route?.length) {
    const idx = (s.route.indexOf(e.poi ?? '') + 1) % s.route.length;
    const next = POI_MAP[s.route[idx]];
    const [tx, ty] = poiPoint(world, next, now);
    e.poi = next.id;
    walkTo(e, tx, ty, now, false, () => setAct(e!, 'stand', 6000 + Math.random() * 8000, Date.now()));
    return;
  }
  const [px, py] = post ?? [poi.x * TILE, poi.y * TILE];
  if (Math.hypot(px - e.st.x, py - e.st.y) > (post ? 24 : poi.r * TILE * 1.5)) {
    const [tx, ty] = post ?? poiPoint(world, poi, hashf(n.genes.seed, ck.day) * 1000);
    e.poi = poi.id;
    walkTo(e, tx, ty, now, false, () => {
      if (post) e!.st.dir = 1;
      setAct(e!, s.act, 30_000, Date.now());
    });
    return;
  }
  // small idle wander around the spot for lively feel
  if (s.act === 'play' && Math.random() < 0.7) {
    const [tx, ty] = poiPoint(world, poi, now);
    walkTo(e, tx, ty, now, Math.random() < 0.5, () => setAct(e!, 'play', 4000 + Math.random() * 6000, Date.now()));
    return;
  }
  setAct(e, s.act, 20_000 + Math.random() * 30_000, now);
}

// ---------- neighbours: visits and appointments ----------
/** Set by the neighbourhood module (which builds on this one). */
export const hooks: { endVisit?: (c: CatRecord) => void } = {};
const dates = new Map<number, { place: string; until: number }>();

/** A cat going to a neighbour's house: if it's out, it walks to the door and knocks first. */
export function goVisit(c: CatRecord, door: [number, number], inside: () => void) {
  const e = ents.get(c.id);
  if (!e) return inside();
  const now = Date.now();
  e.controlledBy = undefined;
  e.st.controlled = false;
  e.date = undefined;
  const knock = () => {
    broadcastNear({ t: 'emote', id: e.st.id, kind: 'exclaim' }, e.st.x, e.st.y);
    setAct(e, 'sit_happy', 4000, Date.now());
    setTimeout(() => {
      if (!ents.has(c.id)) return;
      despawn(e, 'home');
      c.location = 'nest';
      game.markDirty(c);
      inside();
      if (c.guestAt) toOwners(c, { t: 'event', kind: 'guestin', text: `${c.name}进了${c.guestAt.hostName}家，和${c.guestAt.hostCatName}玩去啦`, catId: c.id });
    }, 1400);
  };
  const far = Math.hypot(door[0] - e.st.x, door[1] - e.st.y);
  if (!walkTo(e, door[0], door[1], now, far > 30 * TILE, knock)) knock();
}

/** Send a cat to an appointment: out of its nest if need be, then to the place. */
export function keepDate(c: CatRecord, id: number, poiId: string, side: number): boolean {
  const poi = POI_MAP[poiId];
  if (!poi || c.guestAt) return false;
  const now = Date.now();
  if (!ents.has(c.id)) startTrip(c, false);
  const e = ents.get(c.id);
  if (!e) return false;
  if (e.trip) e.trip.ends = Math.max(e.trip.ends, now + 40 * 60_000);
  dates.set(id, { place: poi.name, until: now + 30 * 60_000 });
  e.date = id;
  if (e.controlledBy) return true; // its person is steering; they'll bring it along
  const [tx, ty] = poiPoint(world, poi, id * 7 + side);
  const far = Math.hypot(tx - e.st.x, ty - e.st.y);
  walkTo(e, tx + side * 30, ty, now, far > 35 * TILE, () => setAct(e, 'sit', 25 * 60_000, Date.now()));
  return true;
}

/** While a cat waits for a friend at an appointment it stays where it is. */
function dateWaiting(e: Ent, now: number): boolean {
  const d = dates.get(e.date!);
  if (!d || now > d.until) {
    e.date = undefined;
    return false;
  }
  setAct(e, Math.random() < 0.5 ? 'sit' : 'watch', 20_000, now);
  return true;
}

/** Is this cat on its way to (or waiting at) this appointment? */
export function onDate(catId: string, id: number): boolean {
  return ents.get(catId)?.date === id;
}

/** Is this cat at a place (in its room, if it's a shop)? */
export function atPlace(catId: string, poiId: string, slack = 3): boolean {
  const e = ents.get(catId), poi = POI_MAP[poiId];
  if (!e || !poi) return false;
  const [x, y] = posOf(e, Date.now());
  if ((poi.room ?? null) !== (roomAt(x, y)?.id ?? null)) return false;
  return Math.hypot(x - poi.x * TILE, y - poi.y * TILE) < (poi.r + slack) * TILE;
}

/** Are both cats out, and close? */
export function catsTogether(a: string, b: string, tiles = 3): boolean {
  const ea = ents.get(a), eb = ents.get(b);
  if (!ea || !eb || roomAt(ea.st.x, ea.st.y) !== roomAt(eb.st.x, eb.st.y)) return false;
  const [ax, ay] = posOf(ea, Date.now()), [bx, by] = posOf(eb, Date.now());
  return Math.hypot(ax - bx, ay - by) < tiles * TILE;
}

/** Two cats who kept their appointment play together for a while. */
export function playTogether(id: number, a: string, b: string) {
  const ea = ents.get(a), eb = ents.get(b);
  dates.delete(id);
  if (!ea || !eb) return;
  ea.date = eb.date = undefined;
  const now = Date.now();
  meetCooldown.delete(pairKey(a, b));
  void meet(ea, eb, now, true).then(() => {
    for (const [x, k] of [[ea, 0], [eb, 1]] as const) {
      setTimeout(() => {
        if (!ents.has(x.st.id)) return;
        setAct(x, k ? 'pounce' : 'bat', 12_000, Date.now());
        broadcastNear({ t: 'emote', id: x.st.id, kind: 'heart' }, x.st.x, x.st.y);
      }, 600 + k * 400);
    }
  });
}

/** Where a cat is, in words. */
export function whereIs(catId: string): string | null {
  const e = ents.get(catId);
  return e ? placeName(e.st.x, e.st.y) : null;
}

/** Called off: let a waiting cat get on with its day. */
export function dropDate(id: number) {
  dates.delete(id);
  for (const e of ents.values()) if (e.date === id) e.date = undefined;
}

// ---------- the open-air stage ----------
let tonight: ShowNow | null = null;
const showLine = new Map<string, number>(); // how far through the show's lines each performer is

/** A townsfolk with a part in tonight's show: walk over, then perform or watch. */
function tickShowNpc(n: NpcDef, e: Ent | undefined, role: NonNullable<ReturnType<typeof showRole>>, now: number) {
  const [px, py] = [role.spot[0] * TILE, role.spot[1] * TILE];
  if (!e) {
    e = { st: npcState(n, px, py), npc: n, path: [], legs: [], t0: now, sx: px, sy: py, speed: NPC_SPEED, mode: 'idle', until: 0, nextSay: now + 8000 + Math.random() * 20000 };
    ents.set(n.id, e);
    npcEnts.set(n.id, e);
    broadcast({ t: 'spawn', e: e.st });
  }
  if (e.companion) endCompanion(e, now, 'show');
  if (e.busyUntil && now < e.busyUntil) return;
  if (e.mode === 'walk') {
    if (!walkDone(e, now)) return;
    [e.st.x, e.st.y] = posOf(e, now);
    e.path = [];
    e.mode = 'idle';
    e.onArrive = undefined;
  }
  const dist = Math.hypot(px - e.st.x, py - e.st.y);
  if (dist > 24) {
    e.poi = 'stage';
    if (!walkTo(e, px, py, now, dist > 900)) warp(e, px, py);
    return;
  }
  const show = tonight!.show;
  // the audience faces the stage; performers face the audience, turning now and then
  const dir: 1 | -1 = role.stage ? (Math.floor(now / 9000 + role.spot[0]) % 2 ? 1 : -1) : STAGE.x * TILE > e.st.x ? 1 : -1;
  if (e.st.anim !== role.act || now > e.until || e.st.dir !== dir) {
    e.st.dir = dir;
    setAct(e, role.act, 60_000, now);
  }
  if (!tonight!.live || !clients.size) return;
  // whoever holds an instrument sends notes up now and then
  if (role.stage && INSTRUMENTS.has(role.act) && now > (e.nextNote ?? 0)) {
    e.nextNote = now + 5000 + Math.random() * 6000;
    broadcastNear({ t: 'emote', id: e.st.id, kind: 'note' }, e.st.x, e.st.y);
  }
  if (now < e.nextSay) return;
  if (role.stage) {
    const host = n.id === show.host;
    e.nextSay = now + (host ? 26_000 : 70_000) + Math.random() * 18_000;
    const i = showLine.get(n.id) ?? 0;
    showLine.set(n.id, i + 1);
    // the host keeps to the programme, with something of its own every other time
    const li = (i / 2) % show.lines.length;
    // the programme is the host's; everyone else on stage speaks for themselves
    const line = host && i % 2 === 0 ? show.lines[li] : npcLine(personaOf(n), `在露天舞台的《${show.name}》上（${show.blurb}）${host ? '主持' : '表演'}，对台下的观众说一句`, host ? show.lines : n.lines);
    say(e, line);
    if (show.notes) broadcastNear({ t: 'emote', id: e.st.id, kind: 'note' }, e.st.x, e.st.y);
    // a solo the host just called for
    const solo = host && i % 2 === 0 ? show.solos?.[li] : undefined;
    const player = solo && ents.get(solo[0]);
    if (player) {
      player.nextSay = Math.max(player.nextSay, Date.now() + 9000);
      setTimeout(() => {
        if (!ents.has(player.st.id)) return;
        say(player, solo![1]);
        for (let k = 0; k < 3; k++) setTimeout(() => broadcastNear({ t: 'emote', id: player.st.id, kind: k === 1 ? 'star' : 'note' }, player.st.x, player.st.y), k * 900);
      }, 2600);
    }
  } else {
    e.nextSay = now + 45_000 + Math.random() * 60_000;
    if (Math.random() < 0.55) say(e, show.cheers[Math.floor(Math.random() * show.cheers.length)], true);
    else broadcastNear({ t: 'emote', id: e.st.id, kind: Math.random() < 0.5 ? 'heart' : 'note' }, e.st.x, e.st.y);
  }
}

let announced = '';
let lastShowCheck = 0;
/** Tell the town when a show is about to begin, and thank the cats who watch it. */
function tickShow(now: number) {
  tonight = showAt(now);
  if (!tonight) return;
  const { show, day, live } = tonight;
  const key = `${day}:${live ? 'live' : 'gather'}`;
  if (announced !== key) {
    announced = key;
    if (!live) showLine.clear();
    broadcast({ t: 'event', kind: 'show', text: live ? `露天舞台的《${show.name}》开始啦` : `今晚 19:30，露天舞台有演出：《${show.name}》` });
  }
  if (!live || now - lastShowCheck < 5000) return;
  lastShowCheck = now;
  const [cx, cy] = [STAGE.x * TILE, (STAGE.front + 3.6) * TILE];
  const finale = show.finale !== undefined && tonight.progress >= show.finale;
  for (const e of ents.values()) {
    const c = e.cat;
    if (!c || Math.hypot(e.st.x - cx, (e.st.y - cy) * 1.3) > 6 * TILE) continue;
    // when the dancers call everyone up, the cats in the audience join in
    if (finale && e.mode === 'idle' && !e.controlledBy && !e.companion && Math.random() < 0.5) {
      e.st.dir = Math.random() < 0.5 ? 1 : -1;
      setAct(e, ['pounce', 'belly', 'stretch', 'sit_happy', 'pounce'][Math.floor(Math.random() * 5)], 4500, now);
    }
    if (c.ownerId === 'town') continue;
    const k = `show:${day}:${c.id}`;
    if (db.kvGet(k)) continue;
    db.kvSet(k, 1);
    game.refresh(c, now);
    c.stats = applyDelta(c.stats, { mood: 10, social: 6 });
    game.markDirty(c);
    giveItem(c, 'ticket');
    befriend(c.id, show.host, 1);
    db.addJournal(c.id, 'explore', `在露天舞台看了《${show.name}》。${show.blurb}。`, { show: show.id });
    game.remember(c, `在露天舞台看了${show.name}`);
    toOwners(c, { t: 'event', kind: 'show', text: `${c.name}在露天舞台看了《${show.name}》，拿到一张票根`, item: 'ticket', catId: c.id });
  }
}

/** Shopkeepers work behind their own counter. */
function keeperPost(n: NpcDef, act: string, poi: Poi): [number, number] | null {
  const r = poi.room ? roomById(poi.room) : null;
  if (!r?.counter || r.keeper !== n.id || (act !== 'work' && act !== 'read')) return null;
  return [r.ox + r.counter[0] * TILE, r.oy + r.counter[1] * TILE];
}

async function npcChat(a: Ent, b: Ent, now: number) {
  meetCooldown.set(pairKey(a.st.id, b.st.id), now + 6 * 60_000);
  a.st.dir = b.st.x > a.st.x ? 1 : -1;
  b.st.dir = a.st.x > b.st.x ? 1 : -1;
  broadcast({ t: 'act', id: a.st.id, anim: a.st.anim, x: a.st.x, y: a.st.y, dir: a.st.dir });
  broadcast({ t: 'act', id: b.st.id, anim: b.st.anim, x: b.st.x, y: b.st.y, dir: b.st.dir });
  const lines = await catDialogue(personaOf(a.npc!), personaOf(b.npc!), placeName(a.st.x, a.st.y));
  let delay = 300;
  for (const l of lines) {
    const who = l.who === 0 ? a : b;
    setTimeout(() => ents.has(who.st.id) && say(who, l.text), delay);
    delay += 2600 + l.text.length * 90;
  }
  a.until = Math.max(a.until, Date.now() + delay);
  b.until = Math.max(b.until, Date.now() + delay);
}

function actWord(a: string) {
  return ({ work: '工作', sit: '坐着休息', play: '玩耍', fish: '钓鱼', music: '弹琴', read: '看书', sleep: '打盹', knit: '织毛线', gaze: '看星星', patrol: '送信', stand: '站着', walk: '散步' } as Record<string, string>)[a] ?? '待着';
}

// ---------- idle chatter for cats ----------
function chatter(now: number) {
  if (!clients.size) return;
  for (const e of ents.values()) {
    if (!e.cat || e.mode !== 'idle' || now < e.nextSay || e.controlledBy) continue;
    e.nextSay = now + 30_000 + Math.random() * 60_000;
    if (Math.random() < 0.5) {
      const ctx = e.st.anim === 'sleep' || e.st.anim === 'nap' ? 'sleepy' : e.st.anim === 'belly' ? 'sun' : 'idle';
      say(e, catLine(e.cat, ctx, { place: e.poi ? POI_MAP[e.poi]?.name : undefined }), true);
    }
  }
}

// ---------- autonomous trips ----------
// Only cats whose people have been around lately wander on their own, so the
// town stays lively without filling up with cats nobody will ever check on.
const ACTIVE_OWNER_DAYS = 7;
const MAX_WANDERERS = Number(process.env.CAT_MAX_WANDERERS || 60);
function autoTrips(now: number) {
  const ck = clockAt(now);
  if (ck.hour < 8.5 || ck.hour > 18) return;
  const w = weatherAt(now);
  if (w.kind === 'rain' || w.kind === 'snow') return;
  let wandering = 0;
  for (const e of ents.values()) if (e.cat && e.cat.ownerId !== 'town' && e.trip && !e.trip.userSent) wandering++;
  if (wandering >= MAX_WANDERERS) return;
  const rows = db.db
    .prepare("SELECT c.id FROM cats c JOIN users u ON u.id = c.owner_id WHERE c.owner_id != 'town' AND u.banned = 0 AND u.last_seen > ? ORDER BY RANDOM() LIMIT 400")
    .all(now - ACTIVE_OWNER_DAYS * 86400_000) as { id: string }[];
  for (const { id } of rows) {
    if (wandering >= MAX_WANDERERS) break;
    if (ents.has(id)) continue;
    const c = game.getCat(id);
    if (!c || c.location !== 'nest' || c.guestAt) continue;
    if (ownerOnline(c)) continue; // the owner is with it
    game.refresh(c, now);
    if (c.stats.energy < 35) continue;
    const p = 1 / 200 * (0.5 + c.personality.curious + c.personality.brave * 0.5 - c.personality.lazy * 0.4);
    if (Math.random() < p && startTrip(c, false)) wandering++;
  }
}

// ---------- town residents ----------
function ensureResidents() {
  const n = (db.db.prepare("SELECT COUNT(*) n FROM cats WHERE owner_id = 'town'").get() as { n: number }).n;
  const want = 9;
  for (let i = n; i < want; i++) {
    const seed = 5000 + i * 7919;
    const c = game.createCat('town', CAT_NAMES[(i * 7 + 3) % CAT_NAMES.length], seed);
    c.born = Date.now() - 30 * 86400_000;
    c.location = 'world';
    c.discovered = POIS.map((p) => p.id);
    game.saveNow(c);
  }
  const rows = db.db.prepare("SELECT id FROM cats WHERE owner_id = 'town'").all() as { id: string }[];
  const now = Date.now();
  for (const { id } of rows) {
    const c = game.getCat(id)!;
    if (ents.has(id)) continue;
    const poi = POIS[Math.floor(hashf(c.genes.seed) * POIS.length)];
    const [x, y] = poiPoint(world, poi, c.genes.seed);
    const e = spawnCat(c, x, y, now);
    e.poi = poi.id;
    e.until = now + Math.random() * 20_000;
  }
}

function restoreCats() {
  const rows = db.db.prepare("SELECT c.id FROM cats c JOIN users u ON u.id = c.owner_id WHERE c.owner_id != 'town' AND u.banned = 0").all() as { id: string }[];
  const now = Date.now();
  for (const { id } of rows) {
    const c = game.getCat(id);
    if (!c || c.location !== 'world') continue;
    const x = walkableAt(world, c.wx, c.wy) ? c.wx : HOME_SPAWN[0];
    const y = walkableAt(world, c.wx, c.wy) ? c.wy : HOME_SPAWN[1];
    const e = spawnCat(c, x, y, now, newTrip(now, false, new Rng(now)));
    e.trip!.ends = now + 5 * 60_000;
  }
}

// ---------- main loop ----------
let lastAuto = 0;
function tick() {
  if (!isOpen()) return; // a paused or closed town stands still
  const now = Date.now();
  tickShow(now);
  for (const e of [...ents.values()]) {
    try {
      if (e.cat) tickCat(e, now);
    } catch (err) {
      console.error('[world] cat tick', err);
    }
  }
  for (const n of NPCS) {
    try {
      tickNpc(n, now);
    } catch (err) {
      console.error('[world] npc tick', err);
    }
  }
  chatter(now);
  if (now - lastAuto > 60_000) {
    lastAuto = now;
    autoTrips(now);
    for (const e of ents.values()) {
      if (e.cat) {
        const [x, y] = posOf(e, now);
        e.cat.wx = x;
        e.cat.wy = y;
        game.markDirty(e.cat);
      }
    }
  }
}

// relay in-app letters to players who are online right now
game.onNotify((uid, ev) => {
  if (ev.kind === 'home' || ev.kind === 'friend') return; // these already have live toasts
  for (const c of clients) if (c.uid === uid) send(c, { t: 'event', kind: ev.kind, text: `${ev.title}：${ev.text}` });
});

export function startWorld() {
  game.keepCached((id) => ents.has(id));
  ensureResidents();
  restoreCats();
  if (!isOpen()) shutTown();
  setInterval(tick, 250).unref();
}

export function catInWorld(id: string) {
  return ents.has(id);
}

// ---------- client connections ----------
function snapshot(now: number): EntState[] {
  const out: EntState[] = [];
  for (const e of ents.values()) {
    const [x, y] = posOf(e, now);
    const st: EntState = { ...e.st, x, y };
    if (e.mode === 'walk' && e.path.length) {
      // remaining path
      let d = (e.speed * (now - e.t0)) / 1000, px = e.sx, py = e.sy;
      const rem: [number, number][] = [];
      for (const p of e.path) {
        const seg = Math.hypot(p[0] - px, p[1] - py);
        if (d < seg) rem.push(p);
        d -= seg;
        px = p[0];
        py = p[1];
      }
      st.path = rem;
      st.speed = e.speed;
      st.t0 = now;
    }
    st.controlled = !!e.controlledBy;
    out.push(st);
  }
  return out;
}

/** Pausing or closing the town: everyone's cat goes home, and the pages are told to look again. */
function shutTown() {
  for (const e of [...ents.values()]) {
    if (!e.cat || e.cat.ownerId === 'town') continue;
    despawn(e, 'home');
    e.cat.location = 'nest';
    game.saveNow(e.cat);
  }
  for (const c of [...clients]) c.ws.close(4005, 'town');
}
onModeChange((s) => s.mode !== 'open' && shutTown());

/** A banned or deleted account: drop its connections and send its cats home. */
export function kickUser(uid: string, deletedCats: string[] = []) {
  for (const c of [...clients]) if (c.uid === uid) c.ws.close(4003, 'account');
  for (const e of [...ents.values()]) {
    if (!e.cat) continue;
    if (deletedCats.includes(e.cat.id)) {
      despawn(e, 'leave');
    } else if (e.cat.ownerId === uid && !e.cat.coOwnerId) {
      despawn(e, 'home');
      e.cat.location = 'nest';
      game.saveNow(e.cat);
    }
  }
}

// drop connections that stopped answering (phones going to sleep, flaky networks)
const alive = new WeakSet<WebSocket>();
setInterval(() => {
  for (const c of clients) {
    if (!alive.has(c.ws)) {
      c.ws.terminate();
      continue;
    }
    alive.delete(c.ws);
    try {
      c.ws.ping();
    } catch {
      /* closed */
    }
  }
}, 30_000).unref();

export function onConnection(ws: WebSocket, uid: string | null, nickname: string) {
  const c: Client = { ws, uid, nickname, cats: new Set(), lastPos: 0, view: null, v: 0 };
  // apps from before the town grew carry the old map: ask them, once, to update
  setTimeout(() => {
    if (c.v < WORLD_VERSION && ws.readyState === 1) send(c, { t: 'event', kind: 'update', text: '猫窝更新啦：小镇变大了，店也能进去了。请到官网下载新版 App，网页刷新一下就好' });
  }, 5000).unref();
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
  if (uid) for (const cat of game.catsOf(uid)) c.cats.add(cat.id);
  let budget = 40, budgetAt = Date.now();
  clients.add(c);
  send(c, { t: 'welcome', you: uid, ents: snapshot(Date.now()), now: Date.now(), online: clients.size });
  broadcast({ t: 'online', n: clients.size }, c);
  ws.on('message', (data) => {
    // token bucket: ~20 messages/second sustained, bursts of 40
    const now = Date.now();
    budget = Math.min(40, budget + ((now - budgetAt) / 1000) * 20);
    budgetAt = now;
    if (budget < 1) return;
    budget -= 1;
    alive.add(ws);
    let m: ClientMsg;
    try {
      m = JSON.parse(String(data));
    } catch {
      return;
    }
    try {
      handle(c, m);
    } catch (e) {
      console.error('[ws] handle', e);
    }
  });
  ws.on('close', () => {
    clients.delete(c);
    // release control of cats
    for (const id of c.cats) {
      const e = ents.get(id);
      if (e && e.controlledBy === c.uid) {
        e.controlledBy = undefined;
        e.st.controlled = false;
        e.until = Date.now() + 3000;
      }
    }
    broadcast({ t: 'online', n: clients.size });
  });
}

function ownCat(c: Client, catId: string): CatRecord | null {
  if (!c.uid) return null;
  const cat = game.getCat(catId);
  if (!cat || !game.canAccess(c.uid, cat)) return null;
  return cat;
}

function handle(c: Client, m: ClientMsg) {
  const now = Date.now();
  switch (m.t) {
    case 'ping':
      return;
    case 'hello':
      c.v = Number(m.v) || 0;
      return;
    case 'view':
      if (Number.isFinite(m.x) && Number.isFinite(m.y)) c.view = { x: m.x, y: m.y };
      return;
    case 'watch':
      send(c, { t: 'welcome', you: c.uid, ents: snapshot(now), now, online: clients.size });
      return;
    case 'enter': {
      const cat = ownCat(c, m.catId);
      if (!cat) return;
      if (cat.guestAt) hooks.endVisit?.(cat); // called home from a neighbour's first
      c.cats.add(cat.id);
      startTrip(cat, true);
      return;
    }
    case 'leave': {
      const cat = ownCat(c, m.catId);
      if (!cat) return;
      callHome(cat.id);
      return;
    }
    case 'explore': {
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      if (!e) return;
      e.controlledBy = undefined;
      e.st.controlled = false;
      e.until = 0;
      e.mode = 'idle';
      return;
    }
    case 'control': {
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      if (!e) return;
      c.cats.add(cat.id);
      if (m.on) {
        const [x, y] = posOf(e, now);
        e.st.x = x;
        e.st.y = y;
        e.path = [];
        e.mode = 'idle';
        e.controlledBy = c.uid!;
        e.st.controlled = true;
        broadcast({ t: 'act', id: e.st.id, anim: 'stand', x, y, dir: e.st.dir });
      } else {
        e.controlledBy = undefined;
        e.st.controlled = false;
        e.until = now + 4000;
        if (e.trip) e.trip.ends = Math.max(e.trip.ends, now + 10 * 60_000);
      }
      return;
    }
    case 'pos': {
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      if (!e || e.controlledBy !== c.uid) return;
      const dt = Math.max(50, now - c.lastPos);
      c.lastPos = now;
      const d = Math.hypot(m.x - e.st.x, m.y - e.st.y);
      if (d > (dt / 1000) * CAT_SPEED * 3.5 + 40) return; // too fast, ignore
      if (!walkableAt(world, m.x, m.y)) return;
      if (roomAt(m.x, m.y) !== roomAt(e.st.x, e.st.y)) return; // doors are taken with a 'door' message
      e.st.x = m.x;
      e.st.y = m.y;
      e.st.dir = m.dir === -1 ? -1 : 1;
      e.st.anim = String(m.anim).slice(0, 16);
      broadcastNear({ t: 'pos', id: e.st.id, x: m.x, y: m.y, dir: e.st.dir, anim: e.st.anim }, m.x, m.y, c);
      // discovering places by walking there yourself
      for (const poi of POIS) {
        if (Math.hypot(poi.x * TILE - m.x, poi.y * TILE - m.y) < poi.r * TILE && e.poi !== poi.id) {
          e.poi = poi.id;
          if (!cat!.discovered.includes(poi.id)) {
            arriveAtPoi(e, poi, now);
            e.controlledBy = c.uid!;
            e.st.controlled = true;
          } else if (e.trip && !e.trip.places.includes(poi.name)) e.trip.places.push(poi.name);
        }
      }
      return;
    }
    case 'goto': {
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      if (!e) return;
      let [tx, ty] = [m.x, m.y];
      const room = typeof m.room === 'string' ? roomById(m.room) : roomAt(tx, ty);
      if (room && !roomOpen(room, clockAt(now).hour) && roomAt(e.st.x, e.st.y) !== room) {
        send(c, { t: 'event', kind: 'closed', text: `${room.name}已经打烊啦，明天再来吧`, catId: cat!.id });
        return;
      }
      if (typeof m.room === 'string' && room) [tx, ty] = poiPoint(world, POI_MAP[room.poi.id], now);
      if (!Number.isFinite(tx) || !Number.isFinite(ty)) return;
      const poi = POIS.find((p) => Math.hypot(p.x * TILE - tx, p.y * TILE - ty) < p.r * TILE);
      e.controlledBy = undefined;
      e.st.controlled = false;
      walkTo(e, tx, ty, now, !!m.run, () => (poi ? arriveAtPoi(e, poi, Date.now()) : setAct(e, 'sit', 20_000, Date.now())));
      if (e.trip) e.trip.ends = Math.max(e.trip.ends, now + 10 * 60_000);
      return;
    }
    case 'door': {
      // a cat being steered by hand walked into a doorway
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      if (!e || e.controlledBy !== c.uid) return;
      const inside = roomAt(e.st.x, e.st.y);
      if (inside) {
        if (Math.hypot(e.st.x - inside.door[0], e.st.y - inside.door[1]) > 56) return;
        warp(e, inside.outside[0], inside.outside[1]);
      } else {
        const r = getRooms().find((rr) => Math.hypot(e.st.x - rr.outside[0], e.st.y - rr.outside[1]) < 56);
        if (!r) return;
        if (!roomOpen(r, clockAt(now).hour)) {
          send(c, { t: 'event', kind: 'closed', text: `${r.name}已经打烊啦，明天再来吧`, catId: cat!.id });
          return;
        }
        warp(e, r.door[0], r.door[1] - 6);
      }
      return;
    }
    case 'act':
    case 'emote': {
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      if (!e) return;
      if (m.t === 'emote') broadcastNear({ t: 'emote', id: e.st.id, kind: String(m.kind).slice(0, 12) }, e.st.x, e.st.y);
      else {
        const anim = String(m.anim).slice(0, 16);
        if (!e.controlledBy) {
          e.path = [];
          const [x, y] = posOf(e, now);
          e.st.x = x;
          e.st.y = y;
        }
        setAct(e, anim, 15_000, now);
        if (anim === 'meow') say(e, catLine(cat!, 'idle'));
      }
      return;
    }
    case 'npcAct': {
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      const o = ents.get(m.npc);
      if (!e || !o || e === o || (o.cat && o.cat.ownerId !== 'town')) return;
      if (m.act === 'bye') {
        if (o.companion?.leader === e.st.id) endCompanion(o, now, 'bye');
        return;
      }
      if (m.act === 'special' && !o.npc?.special) return;
      e.controlledBy = undefined;
      e.st.controlled = false;
      const ox = o.st.x + (e.st.x < o.st.x ? -42 : 42), oy = o.st.y + 4;
      walkTo(e, ox, oy, now, false, () => {
        const t = Date.now();
        e.st.dir = o.st.x > e.st.x ? 1 : -1;
        if (m.act === 'walk') inviteWalk(e, o, c, t);
        else void doSpecial(e, o, c, t);
      });
      if (e.trip) e.trip.ends = Math.max(e.trip.ends, now + 10 * 60_000);
      return;
    }
    case 'interact': {
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      const o = ents.get(m.target);
      if (!e || !o || e === o) return;
      e.controlledBy = undefined;
      e.st.controlled = false;
      const ox = o.st.x + (e.st.x < o.st.x ? -42 : 42), oy = o.st.y + 4;
      walkTo(e, ox, oy, now, false, () => {
        const t = Date.now();
        e.st.dir = o.st.x > e.st.x ? 1 : -1;
        if (o.npc) talkNpc(e, o, c, t);
        else {
          meetCooldown.delete(pairKey(e.st.id, o.st.id));
          void meet(e, o, t, true);
        }
      });
      return;
    }
  }
}

function talkNpc(e: Ent, o: Ent, c: Client, now: number) {
  const n = o.npc!;
  setAct(e, 'sit_happy', 10_000, now);
  o.st.dir = e.st.x > o.st.x ? 1 : -1;
  broadcast({ t: 'act', id: o.st.id, anim: o.st.anim, x: o.st.x, y: o.st.y, dir: o.st.dir });
  say(e, catLine(e.cat!, 'meet', { other: n.name }));
  const b = befriend(e.st.id, n.id, 1);
  if (b.up) bondUp(e.cat!, o, b.level, b.name);
  setTimeout(() => {
    if (deliverErrand(e, o, c)) return;
    const known = b.level >= 1 ? `，你们已经${b.name}了，叫它的名字` : '';
    say(o, npcLine(personaOf(n), `${e.cat!.name}（一只${e.cat!.personality.voice.split('，')[0]}的猫）跑过来跟你打招呼${known}`, n.lines));
    if (n.gift && c.uid && Math.random() < n.gift.chance * (1 + b.level * 0.25)) {
      const key = `gift:${n.id}:${c.uid}:${clockAt(now).day}`;
      if (!db.kvGet(key)) {
        db.kvSet(key, 1);
        db.invAdd(c.uid, n.gift.item, 1);
        send(c, { t: 'event', kind: 'gift', text: n.gift.text, item: n.gift.item });
        broadcastNear({ t: 'emote', id: o.st.id, kind: 'heart' }, o.st.x, o.st.y);
      }
    }
  }, 2200);
}

export function worldStats() {
  return { ents: ents.size, clients: clients.size };
}

/** Players with the game open right now. */
export function onlineUsers(): Set<string> {
  const s = new Set<string>();
  for (const c of clients) if (c.uid) s.add(c.uid);
  return s;
}

/** Everything in the town right now, for the admin sandbox. Read-only. */
export function worldSnapshot() {
  const now = Date.now();
  const list = [...ents.values()].map((e) => {
    let [x, y] = posOf(e, now);
    let dest = e.legs.length ? e.legs[e.legs.length - 1].pts.at(-1) ?? null : e.path.length ? e.path[e.path.length - 1] : null;
    // the sandbox shows people inside a shop on its doorstep
    const room = roomAt(x, y);
    if (room) [x, y] = [room.outside[0] + ((x - room.ox) / (room.w * TILE) - 0.5) * room.building.w * TILE, room.outside[1] - TILE * 0.6];
    if (dest && roomAt(dest[0], dest[1])) dest = roomAt(dest[0], dest[1])!.outside;
    return {
      room: room?.name ?? null,
      id: e.st.id,
      kind: e.npc ? ('npc' as const) : e.cat?.ownerId === 'town' ? ('town' as const) : ('cat' as const),
      name: e.st.name,
      role: e.npc?.role ?? null,
      owner: e.st.owner ?? null,
      ownerId: e.st.ownerId ?? null,
      x: Math.round(x),
      y: Math.round(y),
      dest: dest ? [Math.round(dest[0]), Math.round(dest[1])] : null,
      speed: e.speed,
      anim: e.st.anim,
      mode: e.mode,
      place: room?.name ?? placeName(x, y),
      controlled: !!e.controlledBy,
      trip: e.trip ? { since: e.trip.started, finds: e.trip.finds, friends: e.trip.friends, places: e.trip.places.length, goingHome: e.trip.goingHome, userSent: e.trip.userSent } : null,
    };
  });
  const players = new Set<string>();
  let guests = 0, watching = 0;
  for (const c of clients) {
    if (c.uid) players.add(c.uid);
    else guests++;
    if (c.view) watching++;
  }
  return { now, ents: list, players: players.size, guests, watching, connections: clients.size };
}
