// The admin panel (/admin/): sign-in with CAT_ADMIN_TOKEN, player numbers, a live
// view of the whole town, and the language-model settings.
//
// Scripts keep using the x-admin-token header (scripts/admin.mjs); the panel trades
// the token for a signed cookie that only travels to /api/admin and lasts a day.
import { createHmac, timingSafeEqual } from 'node:crypto';
import { statSync } from 'node:fs';
import { join } from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { route, HttpError, type Req } from './http';
import { ADMIN_TOKEN, DATA_DIR, HMAC_KEY } from './config';
import { isHttps } from './security';
import * as db from './db';
import { worldSnapshot } from './world';
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
const count = (sql: string, ...args: number[]) => (db.db.prepare(sql).get(...args) as { n: number }).n;

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
