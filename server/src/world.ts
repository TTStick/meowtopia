// Server-side simulation of the shared world: cats exploring, townsfolk living
// their schedules, meetings, finds, and broadcasting to connected clients.
import type { WebSocket } from 'ws';
import type { CatRecord } from '../../shared/types';
import type { EntState, ServerMsg, ClientMsg } from '../../shared/protocol';
import { getWorld, POIS, POI_MAP, TILE, HOME_SPAWN, walkable, zoneAt, poiPoint, ZONE_NAME, type Poi } from '../../shared/world';
import { findPath, smoothPath } from '../../shared/path';
import { NPCS, scheduleAt, type NpcDef } from '../../shared/npcs';
import { clockAt, weatherAt } from '../../shared/time';
import { ITEMS, type ItemDef } from '../../shared/items';
import { ageOf, applyDelta } from '../../shared/stats';
import { CAT_NAMES } from '../../shared/genes';
import { Rng, hashf } from '../../shared/rng';
import * as game from './game';
import * as db from './db';
import { catLine, catDialogue, npcLine, journalEntry, type NpcPersona } from './llm';

const world = getWorld();
const CAT_SPEED = 46;
const NPC_SPEED = 40;

interface Trip {
  started: number;
  ends: number;
  places: string[];
  finds: string[];
  friends: string[];
  userSent: boolean;
  goingHome: boolean;
}

interface Ent {
  st: EntState;
  cat?: CatRecord;
  npc?: NpcDef;
  controlledBy?: string;
  trip?: Trip;
  // movement
  path: [number, number][];
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
}

interface Client {
  ws: WebSocket;
  uid: string | null;
  nickname: string;
  cats: Set<string>;
  lastPos: number;
}

const ents = new Map<string, Ent>();
const clients = new Set<Client>();
const meetCooldown = new Map<string, number>();

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

function planPath(fx: number, fy: number, tx: number, ty: number): [number, number][] | null {
  const p = findPath(world.grid, Math.floor(fx / TILE), Math.floor(fy / TILE), Math.floor(tx / TILE), Math.floor(ty / TILE));
  if (!p) return null;
  const s = smoothPath(world.grid, p);
  const pts: [number, number][] = s.slice(1).map(([x, y]) => [(x + 0.5) * TILE, (y + 0.5) * TILE]);
  if (pts.length) pts[pts.length - 1] = walkable(world, tx, ty) ? [tx, ty] : pts[pts.length - 1];
  else pts.push([tx, ty]);
  return pts;
}

function walkTo(e: Ent, tx: number, ty: number, now: number, run = false, onArrive?: () => void): boolean {
  const [x, y] = posOf(e, now);
  e.st.x = x;
  e.st.y = y;
  const path = planPath(x, y, tx, ty);
  if (!path) return false;
  e.path = path;
  e.sx = x;
  e.sy = y;
  e.t0 = now;
  e.speed = (e.npc ? NPC_SPEED : CAT_SPEED) * (run ? 2.4 : 1);
  e.mode = 'walk';
  e.onArrive = onArrive;
  e.st.anim = run ? 'run' : 'walk';
  if (path.length) e.st.dir = path[0][0] >= x ? 1 : -1;
  broadcast({ t: 'move', id: e.st.id, path, speed: e.speed, run, t0: now, x, y });
  return true;
}

function setAct(e: Ent, anim: string, dur: number, now: number) {
  e.path = [];
  e.mode = 'idle';
  e.until = now + dur;
  e.st.anim = anim;
  broadcast({ t: 'act', id: e.st.id, anim, x: e.st.x, y: e.st.y, dir: e.st.dir });
}

function say(e: Ent, text: string) {
  broadcast({ t: 'say', id: e.st.id, text });
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
  const e: Ent = { st: catState(c, x, y), cat: c, path: [], t0: now, sx: x, sy: y, speed: CAT_SPEED, mode: 'idle', until: now + 1500, nextSay: now + 8000 + Math.random() * 20000, trip };
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
  return { started: now, ends: now + mins * 60_000, places: [], finds: [], friends: [], userSent, goingHome: false };
}

export function startTrip(c: CatRecord, userSent: boolean): boolean {
  const now = Date.now();
  if (ents.has(c.id)) {
    const e = ents.get(c.id)!;
    if (!e.trip) e.trip = newTrip(now, userSent, new Rng(now));
    e.trip.goingHome = false;
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
  const weights: [Poi, number][] = POIS.filter((poi) => poi.id !== 'home_lane').map((poi) => {
    let w = 1;
    if (!c.discovered.includes(poi.id)) w += p.curious * 2.5;
    if (e.trip?.places.includes(poi.name)) w *= 0.15;
    if (poi.id === e.poi) w = 0;
    const d = Math.hypot(poi.x * TILE - e.st.x, poi.y * TILE - e.st.y) / TILE;
    w *= Math.max(0.15, 1.6 - d / 45);
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
  const act = rng.pick(poi.acts);
  const anims = ACT_ANIM[act] ?? ['sit'];
  setAct(e, rng.pick(anims), rng.range(18_000, 45_000) * (0.7 + c.personality.lazy * 0.6), now);
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
      broadcast({ t: 'emote', id: c.id, kind: 'fish' });
    } else {
      const it = rollFind(poi.zone, now, rng);
      if (it) {
        giveItem(c, it.id);
        e.trip?.finds.push(it.name);
        db.addJournal(c.id, 'find', `在${poi.name}捡到了「${it.name}」。${it.desc}`, { item: it.id });
        toOwners(c, { t: 'event', kind: 'find', text: `${c.name}在${poi.name}捡到了「${it.name}」！`, item: it.id, catId: c.id });
        broadcast({ t: 'emote', id: c.id, kind: it.rarity && it.rarity >= 3 ? 'star' : 'sparkle' });
        if (watchedNear(e)) say(e, catLine(c, 'find', { item: it.name, place: poi.name }));
        if (it.rarity && it.rarity >= 3) game.remember(c, `在${poi.name}找到了稀有的${it.name}`);
        return;
      }
    }
  }
  if (watchedNear(e) && rng.chance(0.55)) say(e, catLine(c, 'place', { place: poi.name }));
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
    db.addJournal(c.id, 'home', text, { places: t.places, finds: t.finds, friends: t.friends });
    const finds = t.finds.length ? `，带回了${t.finds.slice(0, 3).join('、')}` : '';
    for (const uid of game.ownersOf(c)) {
      if (!t.userSent || !ownerOnline(c)) game.notify(uid, 'home', `${c.name}探险回来啦`, `去了${t.places.slice(0, 3).join('、') || '附近'}${finds}。`);
    }
    toOwners(c, { t: 'event', kind: 'home', text: `${c.name}回到了猫窝`, catId: c.id });
  });
  if (t.places.length) game.remember(c, `去了${t.places.slice(-2).join('和')}`);
}

// ---------- meetings ----------
function pairKey(a: string, b: string) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function watchedNear(e: Ent): boolean {
  return clients.size > 0;
}

async function meet(a: Ent, b: Ent, now: number) {
  const key = pairKey(a.st.id, b.st.id);
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
  broadcast({ t: 'emote', id: a.st.id, kind: 'heart' });
  const place = a.poi ? POI_MAP[a.poi]?.name ?? ZONE_NAME[zoneAt(world, a.st.x, a.st.y)] : ZONE_NAME[zoneAt(world, a.st.x, a.st.y)];
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
      if (!row && mc.ownerId !== 'town') {
        db.addJournal(mc.id, 'friend', `在${place}认识了新朋友「${oc.name}」，我们碰了碰鼻子。`, { cat: oc.id });
        game.remember(mc, `认识了${oc.name}`);
        toOwners(mc, { t: 'event', kind: 'friend', text: `${mc.name}交到了新朋友：${oc.name}`, catId: mc.id });
        if (!ownerOnline(mc)) for (const uid of game.ownersOf(mc)) game.notify(uid, 'friend', `${mc.name}交到了新朋友`, `在${place}遇到了${oc.name}，它们碰了碰鼻子。`);
      }
    }
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

function personaOf(n: NpcDef): NpcPersona {
  return { npc: true, name: n.name, role: n.role, desc: n.desc, voice: n.voice };
}

// ---------- AI tick ----------
function tickCat(e: Ent, now: number) {
  const c = e.cat!;
  if (e.controlledBy) return;
  if (e.mode === 'walk') {
    if (pathDone(e, now)) {
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
  // trip end?
  const ck = clockAt(now);
  const w = weatherAt(now);
  const isTown = c.ownerId === 'town';
  if (!isTown && e.trip) {
    const late = ck.hour >= 21 || ck.hour < 5.5;
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
  if (Math.random() < 0.15) setTimeout(() => ents.has(e.st.id) && say(e, catLine(c, 'explore')), 1500);
}

// NPC behaviour
const npcEnts = new Map<string, Ent>();
function tickNpc(n: NpcDef, now: number) {
  const ck = clockAt(now);
  const s = scheduleAt(n, ck.hour);
  let e = ents.get(n.id);
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
  const poi = POI_MAP[s.poi];
  if (!e) {
    const [x, y] = poiPoint(world, poi, hashf(n.genes.seed) * 1000);
    e = { st: npcState(n, x, y), npc: n, path: [], t0: now, sx: x, sy: y, speed: NPC_SPEED, mode: 'idle', until: 0, nextSay: now + 5000 + Math.random() * 30000 };
    ents.set(n.id, e);
    npcEnts.set(n.id, e);
    broadcast({ t: 'spawn', e: e.st });
  }
  if (e.mode === 'walk') {
    if (pathDone(e, now)) {
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
    // chatter
    if (now > e.nextSay && clients.size) {
      e.nextSay = now + 25_000 + Math.random() * 50_000;
      say(e, npcLine(personaOf(n), `在${poi.name}${actWord(s.act)}`, n.lines));
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
  const dist = Math.hypot(poi.x * TILE - e.st.x, poi.y * TILE - e.st.y);
  if (dist > poi.r * TILE * 1.5) {
    const [tx, ty] = poiPoint(world, poi, hashf(n.genes.seed, ck.day) * 1000);
    e.poi = poi.id;
    walkTo(e, tx, ty, now, false, () => setAct(e!, s.act, 30_000, Date.now()));
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
      say(e, catLine(e.cat, ctx, { place: e.poi ? POI_MAP[e.poi]?.name : undefined }));
    }
  }
}

// ---------- autonomous trips ----------
function autoTrips(now: number) {
  const ck = clockAt(now);
  if (ck.hour < 8.5 || ck.hour > 18) return;
  const w = weatherAt(now);
  if (w.kind === 'rain' || w.kind === 'snow') return;
  const rows = db.db.prepare("SELECT id FROM cats WHERE owner_id != 'town'").all() as { id: string }[];
  for (const { id } of rows) {
    if (ents.has(id)) continue;
    const c = game.getCat(id);
    if (!c || c.location !== 'nest') continue;
    if (ownerOnline(c)) continue; // the owner is with it
    game.refresh(c, now);
    if (c.stats.energy < 35) continue;
    const p = 1 / 200 * (0.5 + c.personality.curious + c.personality.brave * 0.5 - c.personality.lazy * 0.4);
    if (Math.random() < p) startTrip(c, false);
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
  const rows = db.db.prepare("SELECT id FROM cats WHERE owner_id != 'town'").all() as { id: string }[];
  const now = Date.now();
  for (const { id } of rows) {
    const c = game.getCat(id);
    if (!c || c.location !== 'world') continue;
    const x = walkable(world, c.wx, c.wy) ? c.wx : HOME_SPAWN[0];
    const y = walkable(world, c.wx, c.wy) ? c.wy : HOME_SPAWN[1];
    const e = spawnCat(c, x, y, now, newTrip(now, false, new Rng(now)));
    e.trip!.ends = now + 5 * 60_000;
  }
}

// ---------- main loop ----------
let lastAuto = 0;
function tick() {
  const now = Date.now();
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

export function startWorld() {
  ensureResidents();
  restoreCats();
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

export function onConnection(ws: WebSocket, uid: string | null, nickname: string) {
  const c: Client = { ws, uid, nickname, cats: new Set(), lastPos: 0 };
  clients.add(c);
  send(c, { t: 'welcome', you: uid, ents: snapshot(Date.now()), now: Date.now(), online: clients.size });
  broadcast({ t: 'online', n: clients.size }, c);
  ws.on('message', (data) => {
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
    case 'watch':
      send(c, { t: 'welcome', you: c.uid, ents: snapshot(now), now, online: clients.size });
      return;
    case 'enter': {
      const cat = ownCat(c, m.catId);
      if (!cat) return;
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
      if (!walkable(world, m.x, m.y)) return;
      e.st.x = m.x;
      e.st.y = m.y;
      e.st.dir = m.dir === -1 ? -1 : 1;
      e.st.anim = String(m.anim).slice(0, 16);
      broadcast({ t: 'pos', id: e.st.id, x: m.x, y: m.y, dir: e.st.dir, anim: e.st.anim }, c);
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
      const poi = POIS.find((p) => Math.hypot(p.x * TILE - m.x, p.y * TILE - m.y) < p.r * TILE);
      e.controlledBy = undefined;
      e.st.controlled = false;
      walkTo(e, m.x, m.y, now, !!m.run, () => (poi ? arriveAtPoi(e, poi, Date.now()) : setAct(e, 'sit', 20_000, Date.now())));
      if (e.trip) e.trip.ends = Math.max(e.trip.ends, now + 10 * 60_000);
      return;
    }
    case 'act':
    case 'emote': {
      const cat = ownCat(c, m.catId);
      const e = cat && ents.get(cat.id);
      if (!e) return;
      if (m.t === 'emote') broadcast({ t: 'emote', id: e.st.id, kind: String(m.kind).slice(0, 12) });
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
          void meet(e, o, t);
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
  setTimeout(() => {
    say(o, npcLine(personaOf(n), `${e.cat!.name}（一只${e.cat!.personality.voice.split('，')[0]}的猫）跑过来跟你打招呼`, n.lines));
    if (n.gift && c.uid && Math.random() < n.gift.chance) {
      const key = `gift:${n.id}:${c.uid}:${clockAt(now).day}`;
      if (!db.kvGet(key)) {
        db.kvSet(key, 1);
        db.invAdd(c.uid, n.gift.item, 1);
        send(c, { t: 'event', kind: 'gift', text: n.gift.text, item: n.gift.item });
        broadcast({ t: 'emote', id: o.st.id, kind: 'heart' });
      }
    }
  }, 2200);
}

export function worldStats() {
  return { ents: ents.size, clients: clients.size };
}
