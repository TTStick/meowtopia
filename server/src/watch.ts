// The standalone watch app (watchos/): everything it shows, with names already looked
// up and words already chosen, since a watch carries neither the game's catalogs nor
// its drawing code. (The iPhone's companion watch app uses /api/companion.)
import { route, HttpError, type Req } from './http';
import * as db from './db';
import * as game from './game';
import { ITEMS, ITEM_MAP, WEAR_SLOT } from '../../shared/items';
import { POIS } from '../../shared/world';
import { ageOf, bondLevel, moodWord } from '../../shared/stats';
import { coatName, traitWords } from '../../shared/genes';
import { clockAt, phaseOf, PHASE_NAME, weatherAt, WEATHER_NAME, SEASON_NAME } from '../../shared/time';
import { showOn, showAt } from '../../shared/shows';
import type { CatRecord } from '../../shared/types';
import { spriteKey } from './sprites';
import { wishState } from './wish';
import { tripInfo } from './world';
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
