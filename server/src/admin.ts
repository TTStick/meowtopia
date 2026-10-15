// The admin panel (/admin/): sign-in with CAT_ADMIN_TOKEN, player numbers, a live
// view of the whole town, and the language-model settings.
//
// Scripts keep using the x-admin-token header (scripts/admin.mjs); the panel trades
// the token for a signed cookie that only travels to /api/admin and lasts a day.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { route, HttpError, str, type Req } from './http';
import { ADMIN_TOKEN, DATA_DIR, HMAC_KEY } from './config';
import { isHttps } from './security';
import * as db from './db';
import * as game from './game';
import { ITEMS } from '../../shared/items';
import { POIS } from '../../shared/world';
import { ageOf, bondLevel, moodWord } from '../../shared/stats';
import { onlineUsers, worldSnapshot } from './world';
import { llmSettings, llmUsage, resetLlmSettings, testLlm, updateLlmSettings, llmEnabled } from './llm';
import { clockAt, phaseOf, weatherAt, PHASE_NAME, SEASON_NAME, WEATHER_NAME, WORLD_TZ } from '../../shared/time';

const COOKIE = 'cn_admin';
const TTL = 24 * 3600;
const STARTED = Date.now();

function same(a: string, b: string) {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
/** Changing CAT_ADMIN_TOKEN signs everyone out of the panel. */
function sign(exp: number) {
  const fp = createHmac('sha256', HMAC_KEY).update(`admin-token:${ADMIN_TOKEN}`).digest('base64url').slice(0, 16);
  return createHmac('sha256', HMAC_KEY).update(`admin:${exp}:${fp}`).digest('base64url');
}
function cookieOf(req: IncomingMessage): string | null {
  for (const part of String(req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return decodeURIComponent(v.join('='));
  }
  return null;
}
function setCookie(req: IncomingMessage, res: ServerResponse, value: string, maxAge: number) {
  const parts = [`${COOKIE}=${encodeURIComponent(value)}`, 'Path=/api/admin', 'HttpOnly', 'SameSite=Strict', `Max-Age=${maxAge}`];
  if (isHttps(req)) parts.push('Secure');
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [...(Array.isArray(prev) ? prev : [String(prev)]), parts.join('; ')] : parts.join('; '));
}

/** Unknown to anyone without the token: every admin route answers 404. */
export function requireAdmin(r: Req) {
  if (!ADMIN_TOKEN) throw new HttpError(404, 'not found');
  const header = r.raw.headers['x-admin-token'];
  if (typeof header === 'string' && same(header, ADMIN_TOKEN)) return;
  const c = cookieOf(r.raw);
  if (c) {
    const [exp, sig] = c.split('.');
    if (Number(exp) * 1000 > Date.now() && sig && same(sig, sign(Number(exp)))) return;
  }
  throw new HttpError(404, 'not found');
}

route('POST', '/api/admin/login', (r) => {
  if (!ADMIN_TOKEN) throw new HttpError(403, '管理功能还没有开启：在服务器的 .env 里设置 CAT_ADMIN_TOKEN');
  if (!same(String(r.body.token ?? '').trim(), ADMIN_TOKEN)) throw new HttpError(401, '口令不对');
  const exp = Math.floor(Date.now() / 1000) + TTL;
  setCookie(r.raw, r.res, `${exp}.${sign(exp)}`, TTL);
  return { ok: true };
}, { auth: false, limit: 'admin', by: 'ip' });

route('POST', '/api/admin/logout', (r) => {
  setCookie(r.raw, r.res, '', 0);
  return { ok: true };
}, { auth: false });

route('GET', '/api/admin/me', (r) => {
  requireAdmin(r);
  return { ok: true };
}, { auth: false });

// ---------- numbers ----------
const DAY = 86400_000;
const tzMs = () => WORLD_TZ * 3600_000;
/** Start of the town's day (the world clock's time zone) containing `t`. */
const dayStart = (t: number) => Math.floor((t + tzMs()) / DAY) * DAY - tzMs();
const dayKey = (t: number) => new Date(t + tzMs()).toISOString().slice(0, 10);
const count = (sql: string, ...args: (string | number)[]) => (db.db.prepare(sql).get(...args) as { n: number }).n;

interface DayStats { active: number; peak: number; llmCalls: number }
let peakToday = 0;
let peakDay = dayKey(Date.now());
function samplePeak() {
  const d = dayKey(Date.now());
  if (d !== peakDay) {
    peakDay = d;
    peakToday = 0;
  }
  peakToday = Math.max(peakToday, worldSnapshot().players);
}
/** Keep a small record per day so the panel can draw the last two weeks. */
function recordDay() {
  samplePeak();
  const now = Date.now();
  const prev = db.kvGet<DayStats>(`stats:${peakDay}`);
  const s: DayStats = {
    active: count('SELECT COUNT(*) n FROM users WHERE last_seen >= ?', dayStart(now)),
    peak: Math.max(prev?.peak ?? 0, peakToday),
    llmCalls: llmUsage().calls,
  };
  db.kvSet(`stats:${peakDay}`, s);
}
setInterval(samplePeak, 60_000).unref();
setInterval(recordDay, 10 * 60_000).unref();
setTimeout(recordDay, 5_000).unref();

route('GET', '/api/admin/overview', (r) => {
  requireAdmin(r);
  samplePeak();
  const now = Date.now();
  const today = dayStart(now);
  const w = worldSnapshot();
  const newByDay = new Map<number, number>();
  for (const row of db.db.prepare('SELECT CAST((created + ?) / ? AS INTEGER) d, COUNT(*) n FROM users WHERE created >= ? GROUP BY d').all(tzMs(), DAY, today - 13 * DAY) as { d: number; n: number }[]) newByDay.set(row.d, row.n);
  const days = Array.from({ length: 14 }, (_, i) => {
    const start = today - (13 - i) * DAY;
    const key = dayKey(start);
    const s = db.kvGet<DayStats>(`stats:${key}`);
    const isToday = i === 13;
    return {
      day: key.slice(5),
      newUsers: newByDay.get(Math.floor((start + tzMs()) / DAY)) ?? 0,
      active: isToday ? count('SELECT COUNT(*) n FROM users WHERE last_seen >= ?', today) : (s?.active ?? null),
      peak: isToday ? Math.max(s?.peak ?? 0, peakToday) : (s?.peak ?? null),
    };
  });
  let dbBytes = 0;
  for (const f of ['cats.db', 'cats.db-wal']) {
    try {
      dbBytes += statSync(join(DATA_DIR, f)).size;
    } catch {
      /* no wal yet */
    }
  }
  const u = llmUsage();
  return {
    online: { players: w.players, guests: w.guests, watching: w.watching, catsInTown: w.ents.filter((e) => e.kind === 'cat').length, townCats: w.ents.filter((e) => e.kind === 'town').length, residents: w.ents.filter((e) => e.kind === 'npc').length, peakToday: Math.max(peakToday, w.players) },
    users: {
      total: count('SELECT COUNT(*) n FROM users'),
      newToday: count('SELECT COUNT(*) n FROM users WHERE created >= ?', today),
      new7d: count('SELECT COUNT(*) n FROM users WHERE created >= ?', today - 6 * DAY),
      activeToday: count('SELECT COUNT(*) n FROM users WHERE last_seen >= ?', today),
      active7d: count('SELECT COUNT(*) n FROM users WHERE last_seen >= ?', today - 6 * DAY),
      active30d: count('SELECT COUNT(*) n FROM users WHERE last_seen >= ?', today - 29 * DAY),
      secured: count('SELECT COUNT(*) n FROM users WHERE code_hash IS NOT NULL OR id IN (SELECT user_id FROM passkeys)'),
      banned: count('SELECT COUNT(*) n FROM users WHERE banned = 1'),
    },
    cats: { total: count("SELECT COUNT(*) n FROM cats WHERE owner_id != 'town'") },
    reports: count("SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
    days,
    server: { startedAt: STARTED, uptime: Math.round((now - STARTED) / 1000), rss: process.memoryUsage().rss, dbBytes, node: process.version, worldTz: WORLD_TZ },
    llm: { active: llmEnabled(), model: llmSettings().model, calls: u.calls, failed: u.failed, cost: u.cost, currency: u.currency },
  };
}, { auth: false });

// ---------- the town, live ----------
route('GET', '/api/admin/world', (r) => {
  requireAdmin(r);
  const now = Date.now();
  const ck = clockAt(now);
  const h = Math.floor(ck.hour), m = Math.floor((ck.hour - h) * 60);
  return {
    ...worldSnapshot(),
    clock: { time: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, phase: PHASE_NAME[phaseOf(ck.hour)], season: SEASON_NAME[ck.season], weather: WEATHER_NAME[weatherAt(now).kind] },
  };
}, { auth: false });

// ---------- players ----------
// Only what looking after the town needs: no diary pages, notes or recovery codes.
const SECURED = '(u.code_hash IS NOT NULL OR EXISTS (SELECT 1 FROM passkeys p WHERE p.user_id = u.id))';
type Filter = 'all' | 'today' | 'week' | 'new' | 'secured' | 'paused';
const FILTERS: Record<Filter, (today: number) => [string, number[]]> = {
  all: () => ['1 = 1', []],
  today: (t) => ['u.last_seen >= ?', [t]],
  week: (t) => ['u.last_seen >= ?', [t - 6 * DAY]],
  new: (t) => ['u.created >= ?', [t - 6 * DAY]],
  secured: () => [SECURED, []],
  paused: () => ['u.banned = 1', []],
};
const SORTS = { recent: 'u.last_seen DESC', new: 'u.created DESC', name: 'u.nickname ASC' } as const;
const PAGE = 30;

function stageOf(born: number) {
  const a = ageOf(born);
  return a < 0.6 ? '小奶猫' : a < 0.9 ? '少年猫' : '成年猫';
}
function catsOfUser(uid: string) {
  return (db.db.prepare('SELECT id FROM cats WHERE owner_id = ? OR co_owner_id = ?').all(uid, uid) as { id: string }[])
    .map((row) => game.getCat(row.id))
    .filter((c): c is NonNullable<typeof c> => !!c);
}

route('GET', '/api/admin/players', (r) => {
  requireAdmin(r);
  const today = dayStart(Date.now());
  const filter = (Object.keys(FILTERS).includes(String(r.query.get('filter'))) ? r.query.get('filter') : 'all') as Filter;
  const sort = SORTS[(r.query.get('sort') as keyof typeof SORTS) ?? 'recent'] ?? SORTS.recent;
  const page = Math.max(0, Math.floor(Number(r.query.get('page')) || 0));
  const q = String(r.query.get('q') ?? '').trim().slice(0, 40);
  const like = `%${q.replace(/[%_]/g, '')}%`;
  const search = `(? = '' OR u.nickname LIKE ? OR u.id = ? OR EXISTS (SELECT 1 FROM cats c WHERE (c.owner_id = u.id OR c.co_owner_id = u.id) AND (json_extract(c.data, '$.name') LIKE ? OR c.id = ?)))`;
  const searchArgs = [q, like, q, like, q];
  const [where, args] = FILTERS[filter](today);
  const total = count(`SELECT COUNT(*) n FROM users u WHERE ${where} AND ${search}`, ...args, ...searchArgs);
  const rows = db.db
    .prepare(`SELECT u.id, u.nickname, u.created, u.last_seen lastSeen, u.banned, u.ban_reason banReason, ${SECURED} secured FROM users u WHERE ${where} AND ${search} ORDER BY ${sort} LIMIT ? OFFSET ?`)
    .all(...args, ...searchArgs, PAGE, page * PAGE) as { id: string; nickname: string; created: number; lastSeen: number; banned: number; banReason: string | null; secured: number }[];
  const online = onlineUsers();
  const counts = Object.fromEntries((Object.keys(FILTERS) as Filter[]).map((f) => {
    const [w, a] = FILTERS[f](today);
    return [f, count(`SELECT COUNT(*) n FROM users u WHERE ${w}`, ...a)];
  }));
  return {
    total,
    page,
    pageSize: PAGE,
    counts,
    rows: rows.map((u) => ({
      ...u,
      secured: !!u.secured,
      online: online.has(u.id),
      cats: catsOfUser(u.id).map((c) => ({ id: c.id, name: c.name, stage: stageOf(c.born), out: c.location === 'world', shared: !!c.coOwnerId })),
    })),
  };
}, { auth: false });

route('GET', '/api/admin/players/:uid', (r) => {
  requireAdmin(r);
  const u = db.getUser(r.params.uid);
  if (!u) throw new HttpError(404, '没有这位玩家');
  const now = Date.now();
  const where = new Map(worldSnapshot().ents.map((e) => [e.id, e.place]));
  const inv = db.getInventory(u.id);
  const collectibles = ITEMS.filter((it) => it.cat === 'collect').map((it) => it.id);
  return {
    id: u.id,
    nickname: u.nickname,
    created: u.created,
    lastSeen: u.last_seen,
    online: onlineUsers().has(u.id),
    fish: u.fish,
    banned: !!u.banned,
    banReason: u.ban_reason ?? null,
    recoveryCode: !!u.code_hash,
    passkeys: count('SELECT COUNT(*) n FROM passkeys WHERE user_id = ?', u.id),
    devices: count('SELECT COUNT(*) n FROM sessions WHERE user_id = ? AND expires > ?', u.id, now),
    notifications: !!game.settingsOf(u).push,
    items: Object.entries(inv).filter(([id]) => !collectibles.includes(id)).reduce((n, [, k]) => n + k, 0),
    collection: { found: game.foundItems(u.id).length, total: collectibles.length },
    cats: catsOfUser(u.id).map((c) => {
      game.refresh(c);
      const partner = c.coOwnerId ? db.getUser(c.ownerId === u.id ? c.coOwnerId : c.ownerId) : null;
      return {
        id: c.id,
        name: c.name,
        born: c.born,
        stage: stageOf(c.born),
        place: c.location === 'world' ? (where.get(c.id) ?? '小镇里') : '窝里',
        mood: moodWord(c.stats),
        stats: { hunger: Math.round(c.stats.hunger), energy: Math.round(c.stats.energy), mood: Math.round(c.stats.mood), clean: Math.round(c.stats.clean), social: Math.round(c.stats.social) },
        bond: bondLevel(c.stats.bond),
        discovered: c.discovered.length,
        places: POIS.length,
        partner: partner?.nickname ?? null,
      };
    }),
  };
}, { auth: false });

/** A letter from the town, with a little gift if you like. Lands in the player's mailbox. */
route('POST', '/api/admin/players/:uid/letter', (r) => {
  requireAdmin(r);
  const u = db.getUser(r.params.uid);
  if (!u) throw new HttpError(404, '没有这位玩家');
  const text = str(r.body.text, 200, '信');
  const fish = Math.max(0, Math.min(1000, Math.round(Number(r.body.fish) || 0)));
  if (fish) game.addFish(u.id, fish);
  game.notify(u.id, 'town', fish ? `小镇寄来一封信，还附上了 ${fish} 小鱼干` : '小镇寄来一封信', text);
  return { ok: true };
}, { auth: false });

/**
 * For trying the game out: everything the shop sells and the town hides, on one
 * cat's owner. Doesn't touch the cat's age or bond.
 */
route('POST', '/api/admin/unlock', (r) => {
  requireAdmin(r);
  const c = game.getCat(str(r.body.cat, 64, '猫'));
  if (!c || c.ownerId === 'town') throw new HttpError(404, '没有这只猫');
  const uid = c.ownerId;
  const inv = db.getInventory(uid);
  const want = (cat: string) => (cat === 'wear' || cat === 'wallpaper' || cat === 'floor' || cat === 'collect' ? 1 : cat === 'food' ? 20 : 3);
  let items = 0;
  db.tx(() => {
    for (const it of ITEMS) {
      const n = want(it.cat) - (inv[it.id] ?? 0);
      if (n > 0) {
        db.invAdd(uid, it.id, n);
        items += n;
      }
      if (it.cat === 'collect') game.markFound(uid, it.id);
    }
  });
  c.discovered = POIS.map((p) => p.id);
  game.saveNow(c);
  const user = db.getUser(uid)!;
  const fish = user.fish < 9999 ? game.addFish(uid, 9999 - user.fish) : user.fish;
  return { ok: true, cat: c.name, items, places: POIS.length, collectibles: ITEMS.filter((it) => it.cat === 'collect').length, fish };
}, { auth: false });

// ---------- the language model ----------
route('GET', '/api/admin/llm', (r) => {
  requireAdmin(r);
  return { settings: llmSettings(), usage: llmUsage() };
}, { auth: false });

route('PUT', '/api/admin/llm', (r) => {
  requireAdmin(r);
  try {
    return { settings: updateLlmSettings(r.body ?? {}), usage: llmUsage() };
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}, { auth: false });

route('POST', '/api/admin/llm/reset', (r) => {
  requireAdmin(r);
  return { settings: resetLlmSettings(), usage: llmUsage() };
}, { auth: false });

route('POST', '/api/admin/llm/test', async (r) => {
  requireAdmin(r);
  try {
    return await testLlm(r.body ?? {});
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
}, { auth: false, limit: 'admin', by: 'ip' });
