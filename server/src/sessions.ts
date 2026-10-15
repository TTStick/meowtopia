// Login sessions: one per device, stored as hashes, sliding expiry.
// Browsers get an HttpOnly cookie; the native app sends a Bearer token.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { db, getUser, type UserRow } from './db';
import { HMAC_KEY, SESSION_DAYS } from './config';
import { isHttps } from './security';

export interface SessionRow {
  id: string;
  user_id: string;
  token_hash: string;
  created: number;
  last_used: number;
  expires: number;
  agent: string | null;
  kind: string;
}

const COOKIE = 'cn_sid';
const DAY = 86400_000;
const MAX_SESSIONS = 20;

const q = {
  byHash: db.prepare('SELECT * FROM sessions WHERE token_hash = ?'),
  insert: db.prepare('INSERT INTO sessions (id, user_id, token_hash, created, last_used, expires, agent, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  touch: db.prepare('UPDATE sessions SET last_used = ?, expires = ? WHERE id = ?'),
  del: db.prepare('DELETE FROM sessions WHERE id = ?'),
  delUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  ofUser: db.prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY last_used DESC'),
  purge: db.prepare('DELETE FROM sessions WHERE expires < ?'),
};

export function hashToken(t: string): string {
  return createHash('sha256').update(t).digest('hex');
}

function agentLabel(req: IncomingMessage): string {
  const ua = String(req.headers['user-agent'] ?? '');
  const os = /CatNestWatch|watchOS/.test(ua) ? 'Apple Watch' : /iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : '';
  const br = /CatNestWatch/.test(ua) ? '猫窝 手表' : /CatNestMac/.test(ua) ? '猫窝 Mac' : /CatNestApp/.test(ua) ? '猫窝 App' : /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '浏览器';
  return [os, br].filter(Boolean).join(' · ').slice(0, 40);
}

export function createSession(uid: string, req: IncomingMessage, kind: 'web' | 'app' = 'web'): { id: string; token: string } {
  const now = Date.now();
  const token = 'cn1.' + randomBytes(32).toString('base64url');
  const id = randomBytes(9).toString('base64url');
  q.insert.run(id, uid, hashToken(token), now, now, now + SESSION_DAYS * DAY, agentLabel(req), kind);
  const all = q.ofUser.all(uid) as unknown as SessionRow[];
  for (const s of all.slice(MAX_SESSIONS)) q.del.run(s.id);
  return { id, token };
}

function readCookie(req: IncomingMessage, name: string): string | null {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

/** Token from the session cookie or an Authorization: Bearer header. */
export function tokenFromRequest(req: IncomingMessage): { token: string; via: 'cookie' | 'bearer' } | null {
  const h = String(req.headers.authorization ?? '');
  if (h.startsWith('Bearer ')) return { token: h.slice(7).trim(), via: 'bearer' };
  const c = readCookie(req, COOKIE);
  return c ? { token: c, via: 'cookie' } : null;
}

export function sessionFromToken(token: string): { session: SessionRow; user: UserRow } | null {
  if (!token || token.length > 200) return null;
  const s = q.byHash.get(hashToken(token)) as SessionRow | undefined;
  if (!s || s.expires < Date.now()) return null;
  const user = getUser(s.user_id);
  if (!user) return null;
  return { session: s, user };
}

export function sessionFromRequest(req: IncomingMessage): { session: SessionRow; user: UserRow; via: 'cookie' | 'bearer' } | null {
  const t = tokenFromRequest(req);
  if (!t) return null;
  const found = sessionFromToken(t.token);
  return found ? { ...found, via: t.via } : null;
}

/** Sliding expiry: refresh at most twice a day. */
export function touchSession(s: SessionRow, req: IncomingMessage, res: ServerResponse) {
  const now = Date.now();
  if (now - s.last_used < 12 * 3600_000) return;
  const expires = now + SESSION_DAYS * DAY;
  q.touch.run(now, expires, s.id);
  const t = tokenFromRequest(req);
  if (t?.via === 'cookie') setSessionCookie(req, res, t.token);
}

export function setSessionCookie(req: IncomingMessage, res: ServerResponse, token: string) {
  const parts = [`${COOKIE}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${SESSION_DAYS * 86400}`];
  if (isHttps(req)) parts.push('Secure');
  appendCookie(res, parts.join('; '));
}

export function clearSessionCookie(req: IncomingMessage, res: ServerResponse) {
  const parts = [`${COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (isHttps(req)) parts.push('Secure');
  appendCookie(res, parts.join('; '));
}

function appendCookie(res: ServerResponse, c: string) {
  const prev = res.getHeader('Set-Cookie');
  res.setHeader('Set-Cookie', prev ? [...(Array.isArray(prev) ? prev : [String(prev)]), c] : c);
}

export function listSessions(uid: string): SessionRow[] {
  return q.ofUser.all(uid) as unknown as SessionRow[];
}
export function deleteSession(id: string) {
  q.del.run(id);
}
export function deleteUserSessions(uid: string) {
  q.delUser.run(uid);
}

setInterval(() => q.purge.run(Date.now()), 6 * 3600_000).unref();

// ---------- recovery codes (stored as keyed hashes) ----------
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export function newRecoveryCode(): string {
  const b = randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
  return `${s.slice(0, 4)}-${s.slice(4, 8)}-${s.slice(8)}`;
}

export function normalizeCode(code: string): string {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function codeHash(code: string): string {
  return createHmac('sha256', HMAC_KEY).update('rc:' + normalizeCode(code)).digest('hex');
}

// ---------- proof of work for creating guest accounts ----------
const usedPow = new Map<string, number>();
let recentRegistrations: number[] = [];

export function powDifficulty(): number {
  const now = Date.now();
  recentRegistrations = recentRegistrations.filter((t) => now - t < 60_000);
  const n = recentRegistrations.length;
  return n > 60 ? 21 : n > 20 ? 19 : 16;
}

export function issuePow(): { c: string; d: number; e: number; s: string } {
  const c = randomBytes(16).toString('hex');
  const d = powDifficulty();
  const e = Date.now() + 10 * 60_000;
  const s = createHmac('sha256', HMAC_KEY).update(`pow:${c}:${d}:${e}`).digest('hex');
  return { c, d, e, s };
}

function leadingZeroBits(buf: Buffer): number {
  let n = 0;
  for (const byte of buf) {
    if (byte === 0) {
      n += 8;
      continue;
    }
    n += Math.clz32(byte) - 24;
    break;
  }
  return n;
}

export function verifyPow(p: { c?: string; d?: number; e?: number; s?: string; n?: string } | undefined): boolean {
  if (!p || typeof p.c !== 'string' || typeof p.s !== 'string' || typeof p.n !== 'string' || !Number.isInteger(p.d) || !Number.isInteger(p.e)) return false;
  if (p.e! < Date.now() || p.n.length > 32) return false;
  const expect = createHmac('sha256', HMAC_KEY).update(`pow:${p.c}:${p.d}:${p.e}`).digest();
  const got = Buffer.from(p.s, 'hex');
  if (got.length !== expect.length || !timingSafeEqual(got, expect)) return false;
  if (usedPow.has(p.c)) return false;
  const h = createHash('sha256').update(`${p.c}:${p.n}`).digest();
  if (leadingZeroBits(h) < p.d!) return false;
  usedPow.set(p.c, p.e!);
  recentRegistrations.push(Date.now());
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [k, e] of usedPow) if (e < now) usedPow.delete(k);
}, 10 * 60_000).unref();

// ---------- one-time migration from the old single-token accounts ----------
export function migrateLegacyAccounts() {
  const rows = db.prepare("SELECT id, token, code FROM users WHERE token NOT LIKE '~%'").all() as { id: string; token: string; code: string }[];
  if (!rows.length) return;
  const now = Date.now();
  db.exec('BEGIN');
  try {
    for (const u of rows) {
      // the old bearer token keeps working as a session, so existing players stay signed in
      q.insert.run(randomBytes(9).toString('base64url'), u.id, hashToken(u.token), now, now, now + SESSION_DAYS * DAY, '旧版登录', 'web');
      db.prepare('UPDATE users SET code_hash = ?, code_at = ?, token = ?, code = ? WHERE id = ?').run(codeHash(u.code), now, '~' + u.id, '~' + u.id, u.id);
    }
    db.exec('COMMIT');
    console.log(`[auth] migrated ${rows.length} legacy accounts`);
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
