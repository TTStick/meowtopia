// The standalone watch app (watchos/): everything it shows, with names already looked
// up and words already chosen, since a watch carries neither the game's catalogs nor
// its drawing code. (The iPhone's companion watch app uses /api/companion.)
import { route, HttpError, type Req } from './http';
import * as db from './db';
import * as game from './game';
import { ITEMS, ITEM_MAP, WEAR_SLOT } from '../../shared/items';
import { POIS, BUILDINGS, HOME_SPAWN, TILE, WW, WH, getWorld, getRooms } from '../../shared/world';
import { WORLD_VERSION } from '../../shared/protocol';
import type { ClientMsg } from '../../shared/protocol';
import { ageOf, bondLevel, moodWord } from '../../shared/stats';
import { coatName, traitWords } from '../../shared/genes';
import { clockAt, phaseOf, PHASE_NAME, weatherAt, WEATHER_NAME, SEASON_NAME } from '../../shared/time';
import { showOn, showAt } from '../../shared/shows';
import type { CatRecord } from '../../shared/types';
import { spriteKey } from './sprites';
import { wishState } from './wish';
import { tripInfo, watchTown, watchSend } from './world';
import { townMode } from './townmode';
import { isNightNow } from './companion';

const SLOT_NAME: Record<string, string> = { head: '头上', neck: '脖子', face: '脸上' };
const OUTDOOR = POIS.filter((p) => p.zone !== 'indoor').length;

function activeCat(r: Req): CatRecord | null {
  const cats = game.catsOf(r.user.id);
  const want = r.query.get('cat') || r.user.active_cat;
  return cats.find((c) => c.id === want) ?? cats[0] ?? null;
}

function stageName(age: number) {
  return age < 0.55 ? '小奶猫' : age < 0.85 ? '半大的猫' : '大猫';
}

/** The town right now: its clock, sky, tonight's show, and whether it's open. */
function townNow() {
  const now = Date.now();
  const ck = clockAt(now);
  const h = Math.floor(ck.hour);
  const show = showOn(ck.day);
  const on = showAt(now);
  const rain = weatherAt(now).kind === 'rain';
  const tm = townMode();
  return {
    time: `${h}:${String(Math.floor((ck.hour - h) * 60)).padStart(2, '0')}`,
    phase: PHASE_NAME[phaseOf(ck.hour)],
    weather: WEATHER_NAME[weatherAt(now).kind],
    season: SEASON_NAME[ck.season],
    show: show ? { name: show.name, blurb: show.blurb, at: '19:30', live: !!on?.live, gathering: !!on && !on.live, rainedOff: rain && ck.hour >= 19 && ck.hour < 21 } : null,
    mode: tm.mode,
    notice: tm.notice,
  };
}

// ---------- the home screen: the cat, its day, and the town ----------
route('GET', '/api/watch', (r) => {
  const u = r.user;
  const user = { nickname: u.nickname, fish: u.fish, secured: game.isSecured(u) };
  const town = townNow();
  const c = activeCat(r);
  if (!c) return { user, cat: null, town };
  game.refresh(c);
  const inv = db.getInventory(u.id);
  const night = isNightNow();
  const out = c.location === 'world';
  const age = ageOf(c.born);
  const bond = bondLevel(c.stats.bond);
  const unread = (db.db.prepare('SELECT COUNT(*) n FROM events WHERE user_id = ? AND seen = 0').get(u.id) as { n: number }).n;
  return {
    user,
    town,
    night,
    unread,
    cat: {
      id: c.id,
      name: c.name,
      out,
      sleepy: !out && (night || c.stats.energy < 25),
      away: c.guestAt ? c.guestAt.hostName : null,
      stats: c.stats,
      mood: moodWord(c.stats),
      coat: coatName(c.genes),
      traits: traitWords(c.personality).slice(0, 3),
      quirk: c.personality.quirk,
      days: Math.max(1, Math.floor((Date.now() - c.born) / 86400_000) + 1),
      stage: stageName(age),
      bond: { level: bond.level, name: bond.name, value: Math.round(c.stats.bond), next: bond.next },
      outfit: c.outfit.map((id) => ITEM_MAP[id]?.name ?? id),
      places: { found: c.discovered.length, total: OUTDOOR },
      // changes whenever the cat looks different (outfit, growing up), so the watch refetches its pictures
      look: spriteKey({ genes: c.genes, outfit: c.outfit, age, frame: '', size: 0, outline: false }),
    },
    trip: out ? tripInfo(c.id) : null,
    wish: wishState(c),
    foods: ITEMS.filter((it) => it.food && (inv[it.id] ?? 0) > 0).map((it) => ({ id: it.id, name: it.name, count: inv[it.id] })),
  };
});

// ---------- the wardrobe: what it can wear (and what the tailor sells) ----------
route('GET', '/api/watch/wardrobe', (r) => {
  const c = activeCat(r);
  if (!c) throw new HttpError(404, '还没有猫猫');
  const inv = db.getInventory(r.user.id);
  const wear = ITEMS.filter((it) => WEAR_SLOT[it.id]);
  const item = (it: (typeof ITEMS)[number]) => ({ id: it.id, name: it.name, slot: WEAR_SLOT[it.id], slotName: SLOT_NAME[WEAR_SLOT[it.id]], desc: it.desc, price: it.price });
  return {
    worn: c.outfit,
    owned: wear.filter((it) => (inv[it.id] ?? 0) > 0).map(item),
    forSale: wear.filter((it) => it.shop && it.price > 0 && !(inv[it.id] ?? 0)).map(item),
  };
});

// ---------- the shop: food to buy now and then ----------
route('GET', '/api/watch/shop', (r) => {
  const inv = db.getInventory(r.user.id);
  return {
    fish: r.user.fish,
    foods: ITEMS.filter((it) => it.food && it.shop && it.price > 0).map((it) => ({ id: it.id, name: it.name, desc: it.desc, price: it.price, owned: inv[it.id] ?? 0 })),
  };
});

// ---------- the collection book ----------
route('GET', '/api/watch/collection', (r) => {
  const inv = db.getInventory(r.user.id);
  const found = new Set(game.foundItems(r.user.id));
  const all = ITEMS.filter((it) => it.cat === 'collect');
  return {
    total: all.length,
    found: all
      .filter((it) => found.has(it.id))
      .sort((a, b) => (b.rarity ?? 1) - (a.rarity ?? 1))
      .map((it) => ({ id: it.id, name: it.name, rarity: it.rarity ?? 1, desc: it.desc, count: inv[it.id] ?? 0 })),
  };
});

// ---------- the town, on the watch ----------
const TREES = new Set(['tree', 'pine', 'sakura', 'bigtree', 'fruittree', 'palm', 'bamboo', 'bush']);
let mapCache: string | null = null;

/** The map, once: terrain (one character per tile), buildings, trees, places and the shops' rooms. */
route('GET', '/api/watch/map', (r) => {
  if (!mapCache) {
    const w = getWorld();
    mapCache = JSON.stringify({
      version: WORLD_VERSION,
      tile: TILE,
      w: WW,
      h: WH,
      ter: Array.from(w.ter, (t) => t.toString(36)).join(''),
      buildings: BUILDINGS.map((b) => ({ x: b.x, y: b.y, w: b.w, h: b.h, kind: b.k, label: b.label ?? null, v: b.v })),
      trees: w.props.filter((p) => TREES.has(p.k)).map((p) => [Math.round(p.x), Math.round(p.y), p.k === 'sakura' ? 1 : p.k === 'bamboo' ? 2 : 0]),
      places: POIS.filter((p) => p.zone !== 'indoor').map((p) => ({ id: p.id, name: p.name, x: Math.round(p.x * TILE), y: Math.round(p.y * TILE) })),
      rooms: getRooms().map((rm) => ({ id: rm.id, name: rm.name, x: rm.ox, y: rm.oy, w: rm.w * TILE, h: rm.h * TILE })),
      home: HOME_SPAWN,
    });
  }
  const etag = `"map-${WORLD_VERSION}"`;
  if (r.raw.headers['if-none-match'] === etag) {
    r.res.writeHead(304, { etag }).end();
    return;
  }
  r.res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', etag, 'cache-control': 'private, max-age=86400' });
  r.res.end(mapCache);
});

/** Who's around the cat right now, and what was said since the watch last asked. */
route('GET', '/api/watch/town', (r) => {
  const c = activeCat(r);
  if (!c) throw new HttpError(404, '还没有猫猫');
  return watchTown(r.user.id, r.user.nickname, c.id);
});

/** Doing something in the town: going out, coming home, walking somewhere, the residents and other cats. */
const TOWN_MOVES = new Set(['enter', 'leave', 'goto', 'npcAct', 'interact', 'act', 'explore']);
route('POST', '/api/watch/town', (r) => {
  const c = activeCat(r);
  if (!c) throw new HttpError(404, '还没有猫猫');
  const t = String(r.body?.t);
  if (!TOWN_MOVES.has(t)) throw new HttpError(400, '不认识这个动作');
  if (c.guestAt) throw new HttpError(400, `${c.name}在${c.guestAt.hostName}家做客呢`);
  const m = { ...r.body, t, catId: c.id } as ClientMsg;
  if (t === 'act') (m as { anim: string }).anim = ['meow', 'sit_happy', 'roll', 'stretch', 'groom'].includes(String(r.body.anim)) ? String(r.body.anim) : 'meow';
  watchSend(r.user.id, r.user.nickname, m);
  return { ok: true };
});
