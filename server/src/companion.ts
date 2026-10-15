// Endpoints for the small companions: the Mac menu bar and the Apple Watch.
import { route, HttpError, type Req } from './http';
import * as db from './db';
import * as game from './game';
import { ITEMS } from '../../shared/items';
import { moodWord, ageOf } from '../../shared/stats';
import { randomGenes } from '../../shared/genes';
import { clockAt } from '../../shared/time';
import type { CatGenes, CatRecord } from '../../shared/types';
import { FRAMES, renderSprite, snapSize, spriteKey, type SpriteSpec } from './sprites';
import { wishState } from './wish';
import { catLine } from './llm';
import { startTrip, callHome } from './world';

// ---------- sprites ----------
async function sendSprite(r: Req, genes: CatGenes, outfit: string[], age: number) {
  const frame = r.params.frame;
  if (!FRAMES[frame]) throw new HttpError(404, '没有这个姿势');
  const spec: SpriteSpec = {
    genes,
    outfit,
    age,
    frame,
    size: snapSize(Number(r.query.get('size')) || 128),
    outline: r.query.get('outline') === '1',
  };
  const etag = `"${spriteKey(spec)}"`;
  const headers = { etag, 'cache-control': 'public, max-age=300' };
  if (r.raw.headers['if-none-match'] === etag) {
    r.res.writeHead(304, headers).end();
    return;
  }
  const png = await renderSprite(spec);
  if (!png) throw new HttpError(503, '暂时画不出来');
  r.res.writeHead(200, { ...headers, 'content-type': 'image/png', 'content-length': png.length });
  r.res.end(png);
}

// cats are visible to everyone in the town anyway, so their pictures are public
route('GET', '/api/sprite/cat/:id/:frame', (r) => {
  const c = game.getCat(r.params.id);
  if (!c) throw new HttpError(404, '找不到这只猫');
  return sendSprite(r, c.genes, c.outfit, ageOf(c.born));
}, { auth: false });

// kittens to choose from when adopting on the watch
route('GET', '/api/sprite/seed/:seed/:frame', (r) => {
  const seed = Number(r.params.seed) >>> 0;
  if (!seed) throw new HttpError(400, '不对');
  return sendSprite(r, randomGenes(seed), [], 0.2);
}, { auth: false });

// ---------- one snapshot of everything a companion shows ----------
function activeCat(r: Req): CatRecord | null {
  const cats = game.catsOf(r.user.id);
  const want = r.query.get('cat') || r.user.active_cat;
  return cats.find((c) => c.id === want) ?? cats[0] ?? null;
}

export function isNightNow(now = Date.now()): boolean {
  const h = clockAt(now).hour;
  return h >= 21.5 || h < 6.5;
}

route('GET', '/api/companion', (r) => {
  const c = activeCat(r);
  const user = { nickname: r.user.nickname, fish: r.user.fish };
  if (!c) return { user, cat: null };
  game.refresh(c);
  const inv = db.getInventory(r.user.id);
  const foods = ITEMS.filter((it) => it.food && (inv[it.id] ?? 0) > 0).map((it) => ({ id: it.id, name: it.name, count: inv[it.id] }));
  const letters = db.db
    .prepare('SELECT id, ts, kind, title, text, seen FROM events WHERE user_id = ? ORDER BY ts DESC LIMIT 6')
    .all(r.user.id) as { id: number; ts: number; kind: string; title: string; text: string; seen: number }[];
  const night = isNightNow();
  const out = c.location === 'world';
  const sleepy = !out && (night || c.stats.energy < 25);
  return {
    user,
    cat: {
      id: c.id,
      name: c.name,
      out,
      sleepy,
      stats: c.stats,
      mood: moodWord(c.stats),
      age: ageOf(c.born),
      // changes whenever the cat looks different (outfit, growing up), so clients refetch sprites
      look: spriteKey({ genes: c.genes, outfit: c.outfit, age: ageOf(c.born), frame: '', size: 0, outline: false }),
    },
    line: catLine(c, out ? 'explore' : sleepy ? 'sleepy' : 'idle', {}, r.user.id),
    wish: wishState(c),
    foods,
    letters: letters.map((e) => ({ id: e.id, ts: e.ts, kind: e.kind, title: e.title, text: e.text, seen: !!e.seen })),
    unread: letters.filter((e) => !e.seen).length,
    night,
  };
});

// ---------- going out / coming home without the realtime connection ----------
route('POST', '/api/cat/:id/outing', (r) => {
  const c = game.getCat(r.params.id);
  if (!c || !game.canAccess(r.user.id, c)) throw new HttpError(404, '找不到这只猫猫');
  if (r.body.go) {
    if (c.stats.energy < 15) throw new HttpError(400, `${c.name}太困了，想先睡一会儿`);
    startTrip(c, true);
  } else {
    callHome(c.id);
  }
  return { out: r.body.go ? true : c.location === 'world', location: c.location };
});
