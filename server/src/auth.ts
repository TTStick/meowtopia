// Accounts: instant guest play, then optional protection with a passkey and/or
// a recovery code. Device sessions can be listed and signed out.
import type { IncomingMessage } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { route, HttpError, str, type Req } from './http';
import * as db from './db';
import * as game from './game';
import { cleanText, textProblem } from './moderation';
import { EXTRA_ORIGINS, RP_ID } from './config';
import { requireAdmin } from './admin';
import { isHttps, originAllowed } from './security';
import {
  createSession,
  setSessionCookie,
  clearSessionCookie,
  listSessions,
  deleteSession,
  deleteUserSessions,
  newRecoveryCode,
  codeHash,
  issuePow,
  verifyPow,
  sessionFromToken,
} from './sessions';
import type { UserSettings } from '../../shared/types';

// ---------- helpers ----------
function host(req: IncomingMessage): string {
  return String(req.headers['x-forwarded-host'] ?? req.headers.host ?? 'localhost').split(',')[0].trim();
}
/** The page that is talking to us, when it's one we trust (our own site, or an allowed app origin). */
function pageOrigin(req: IncomingMessage): URL | null {
  const o = req.headers.origin as string | undefined;
  if (!o || !originAllowed(req, o)) return null;
  try {
    return new URL(o);
  } catch {
    return null;
  }
}
function rpId(req: IncomingMessage): string {
  return RP_ID || pageOrigin(req)?.hostname || host(req).replace(/:\d+$/, '');
}
function expectedOrigins(req: IncomingMessage): string[] {
  const own = `${isHttps(req) ? 'https' : 'http'}://${host(req)}`;
  const page = pageOrigin(req)?.origin;
  return [...new Set([own, ...EXTRA_ORIGINS, ...(page ? [page] : [])])];
}

/** Start a session: cookie for browsers, token in the body for the native app. */
function signIn(r: Req, uid: string) {
  const app = r.body?.client === 'app';
  const s = createSession(uid, r.raw, app ? 'app' : 'web');
  if (!app) setSessionCookie(r.raw, r.res, s.token);
  return app ? { token: s.token } : {};
}

const challenges = new Map<string, { challenge: string; uid?: string; exp: number }>();
function putChallenge(key: string, challenge: string, uid?: string) {
  challenges.set(key, { challenge, uid, exp: Date.now() + 5 * 60_000 });
}
function takeChallenge(key: string): { challenge: string; uid?: string } | null {
  const c = challenges.get(key);
  challenges.delete(key);
  if (!c || c.exp < Date.now()) return null;
  return c;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, c] of challenges) if (c.exp < now) challenges.delete(k);
}, 60_000).unref();

// ---------- guests ----------
route('GET', '/api/auth/pow', () => issuePow(), { auth: false });

route(
  'POST',
  '/api/auth/guest',
  (r) => {
    if (!verifyPow(r.body.pow)) throw new HttpError(400, '验证没通过，刷新页面再试一次吧');
    const nickname = r.body.nickname ? cleanText(str(r.body.nickname, 12, '昵称')) : '铲屎官';
    const id = 'u_' + randomBytes(9).toString('base64url');
    const settings: UserSettings = { ...game.DEFAULT_SETTINGS, tzOffset: Number.isFinite(r.body.tzOffset) ? Math.max(-840, Math.min(840, r.body.tzOffset)) : -480 };
    db.insertUser({ id, nickname, fish: 200, settings });
    return { ...signIn(r, id), me: game.me(db.getUser(id)!) };
  },
  { auth: false, limit: 'register', by: 'ip' },
);

// ---------- recovery code ----------
route(
  'POST',
  '/api/auth/code',
  (r) => {
    const code = str(r.body.code, 24, '找回码');
    const u = db.getUserByCodeHash(codeHash(code));
    if (!u) throw new HttpError(404, '没有找到这个找回码');
    if (u.banned) throw new HttpError(403, '这个账号已被暂停');
    return { ...signIn(r, u.id), me: game.me(u) };
  },
  { auth: false, limit: 'login', by: 'ip' },
);

route('POST', '/api/auth/recovery-code', (r) => {
  const code = newRecoveryCode();
  db.updateUser(r.user.id, { code_hash: codeHash(code), code_at: Date.now() });
  return { code };
});

route('GET', '/api/auth/state', (r) => {
  const keys = db.db.prepare('SELECT id, name, created, last_used, device_type, backed_up FROM passkeys WHERE user_id = ? ORDER BY created').all(r.user.id) as any[];
  return {
    hasCode: !!r.user.code_hash,
    codeAt: r.user.code_at,
    passkeys: keys.map((k) => ({ id: k.id, name: k.name, created: k.created, lastUsed: k.last_used, synced: !!k.backed_up })),
    sessions: listSessions(r.user.id).map((s) => ({ id: s.id, agent: s.agent, created: s.created, lastUsed: s.last_used, current: s.id === r.session?.id, kind: s.kind })),
  };
});

// ---------- passkeys ----------
route('POST', '/api/auth/passkey/register-options', async (r) => {
  const existing = db.db.prepare('SELECT id, transports FROM passkeys WHERE user_id = ?').all(r.user.id) as { id: string; transports: string | null }[];
  if (existing.length >= 10) throw new HttpError(400, '通行密钥已经很多啦');
  const options = await generateRegistrationOptions({
    rpName: '猫窝',
    rpID: rpId(r.raw),
    userID: new TextEncoder().encode(r.user.id),
    userName: `猫窝 · ${r.user.nickname}`,
    userDisplayName: r.user.nickname,
    attestationType: 'none',
    excludeCredentials: existing.map((k) => ({ id: k.id, transports: k.transports ? JSON.parse(k.transports) : undefined })),
    authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
  });
  putChallenge(`reg:${r.user.id}`, options.challenge, r.user.id);
  return options;
});

route('POST', '/api/auth/passkey/register', async (r) => {
  const ch = takeChallenge(`reg:${r.user.id}`);
  if (!ch) throw new HttpError(400, '时间太久了，再试一次吧');
  let v;
  try {
    v = await verifyRegistrationResponse({ response: r.body.response, expectedChallenge: ch.challenge, expectedOrigin: expectedOrigins(r.raw), expectedRPID: rpId(r.raw), requireUserVerification: false });
  } catch {
    throw new HttpError(400, '通行密钥没有绑定成功');
  }
  if (!v.verified) throw new HttpError(400, '通行密钥没有绑定成功');
  const c = v.registrationInfo.credential;
  const name = typeof r.body.name === 'string' && r.body.name.trim() && !textProblem(r.body.name) ? r.body.name.trim().slice(0, 20) : '通行密钥';
  db.db
    .prepare('INSERT OR REPLACE INTO passkeys (id, user_id, public_key, counter, transports, device_type, backed_up, name, created) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(c.id, r.user.id, Buffer.from(c.publicKey), c.counter, JSON.stringify(c.transports ?? []), v.registrationInfo.credentialDeviceType, v.registrationInfo.credentialBackedUp ? 1 : 0, name, Date.now());
  return { ok: true };
});

route('DELETE', '/api/auth/passkey/:id', (r) => {
  db.db.prepare('DELETE FROM passkeys WHERE id = ? AND user_id = ?').run(r.params.id, r.user.id);
  return { ok: true };
});

route(
  'POST',
  '/api/auth/passkey/login-options',
  async (r) => {
    const options = await generateAuthenticationOptions({ rpID: rpId(r.raw), userVerification: 'preferred' });
    const cid = randomBytes(12).toString('base64url');
    putChallenge(`auth:${cid}`, options.challenge);
    return { cid, options };
  },
  { auth: false, limit: 'login', by: 'ip' },
);

route(
  'POST',
  '/api/auth/passkey/login',
  async (r) => {
    const ch = takeChallenge(`auth:${str(r.body.cid, 40)}`);
    if (!ch) throw new HttpError(400, '时间太久了，再试一次吧');
    const credId = String(r.body.response?.id ?? '');
    const row = db.db.prepare('SELECT * FROM passkeys WHERE id = ?').get(credId) as any;
    if (!row) throw new HttpError(404, '这个通行密钥不认识，可能已经被删除了');
    let v;
    try {
      v = await verifyAuthenticationResponse({
        response: r.body.response,
        expectedChallenge: ch.challenge,
        expectedOrigin: expectedOrigins(r.raw),
        expectedRPID: rpId(r.raw),
        credential: { id: row.id, publicKey: new Uint8Array(row.public_key), counter: row.counter, transports: row.transports ? JSON.parse(row.transports) : undefined },
        requireUserVerification: false,
      });
    } catch {
      throw new HttpError(400, '验证没有通过');
    }
    if (!v.verified) throw new HttpError(400, '验证没有通过');
    db.db.prepare('UPDATE passkeys SET counter = ?, last_used = ? WHERE id = ?').run(v.authenticationInfo.newCounter, Date.now(), row.id);
    const u = db.getUser(row.user_id);
    if (!u) throw new HttpError(404, '账号不存在');
    if (u.banned) throw new HttpError(403, '这个账号已被暂停');
    return { ...signIn(r, u.id), me: game.me(u) };
  },
  { auth: false, limit: 'login', by: 'ip' },
);

// ---------- sessions ----------
route('POST', '/api/auth/logout', (r) => {
  if (r.session) deleteSession(r.session.id);
  clearSessionCookie(r.raw, r.res);
  return { ok: true };
}, { allowBanned: true });

route('DELETE', '/api/auth/session/:id', (r) => {
  const s = listSessions(r.user.id).find((x) => x.id === r.params.id);
  if (s) deleteSession(s.id);
  return { ok: true };
});

route('POST', '/api/auth/logout-others', (r) => {
  for (const s of listSessions(r.user.id)) if (s.id !== r.session?.id) deleteSession(s.id);
  return { ok: true };
});

// ---------- signing in small devices (Apple Watch) ----------
// Like signing in on a TV: the watch shows a short code, the player types it on a
// device that is already signed in, and the watch picks up its own session.
const DEVICE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const pairing = new Map<string, { secret: string; exp: number; uid?: string; name: string }>();
setInterval(() => {
  const now = Date.now();
  for (const [k, p] of pairing) if (p.exp < now) pairing.delete(k);
}, 60_000).unref();

function deviceName(req: IncomingMessage): string {
  const ua = String(req.headers['user-agent'] ?? '');
  return /CatNestWatch/.test(ua) ? 'Apple Watch' : /CatNestMac/.test(ua) ? 'Mac' : '新设备';
}

route(
  'POST',
  '/api/auth/device/start',
  (r) => {
    let code = '';
    do {
      const b = randomBytes(6);
      code = [...b].map((x) => DEVICE_CHARS[x % DEVICE_CHARS.length]).join('');
    } while (pairing.has(code));
    const secret = randomBytes(24).toString('base64url');
    pairing.set(code, { secret, exp: Date.now() + 10 * 60_000, name: deviceName(r.raw) });
    return { code, secret, expiresIn: 600, interval: 3 };
  },
  { auth: false, limit: 'pair', by: 'ip' },
);

route('POST', '/api/auth/device/approve', (r) => {
  const code = String(r.body.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const p = pairing.get(code);
  if (!p || p.exp < Date.now()) throw new HttpError(404, '没有找到这个配对码，看看手表上的码是不是变了');
  if (p.uid && p.uid !== r.user.id) throw new HttpError(409, '这个配对码已经被使用了');
  p.uid = r.user.id;
  return { ok: true, name: p.name };
}, { limit: 'login', by: 'user' });

route(
  'POST',
  '/api/auth/device/poll',
  (r) => {
    const secret = String(r.body.secret ?? '');
    for (const [code, p] of pairing) {
      const a = Buffer.from(p.secret), b = Buffer.from(secret);
      if (a.length !== b.length || !timingSafeEqual(a, b)) continue;
      if (p.exp < Date.now()) {
        pairing.delete(code);
        break;
      }
      if (!p.uid) return { status: 'pending' };
      pairing.delete(code);
      const u = db.getUser(p.uid);
      if (!u || u.banned) throw new HttpError(403, '这个账号暂时不能登录');
      const s = createSession(u.id, r.raw, 'app');
      return { status: 'ok', token: s.token, me: game.me(u) };
    }
    return { status: 'expired' };
  },
  { auth: false },
);

/** A fresh session for a paired watch, handed over by the phone app (WatchConnectivity). */
route('POST', '/api/auth/device/mint', (r) => {
  const s = createSession(r.user.id, r.raw, 'app');
  db.db.prepare('UPDATE sessions SET agent = ? WHERE id = ?').run('Apple Watch · 猫窝 手表', s.id);
  return { token: s.token };
}, { limit: 'login', by: 'user' });

/** Move an old localStorage bearer token into a fresh HttpOnly cookie session. */
route('POST', '/api/auth/upgrade', (r) => {
  if (r.session) deleteSession(r.session.id);
  return signIn(r, r.user.id);
});

// ---------- account ----------
route('GET', '/api/account/export', (r) => {
  const uid = r.user.id;
  const cats = game.catsOf(uid);
  return {
    exported: new Date().toISOString(),
    user: { id: uid, nickname: r.user.nickname, created: r.user.created, fish: r.user.fish, settings: game.settingsOf(r.user) },
    cats,
    nests: cats.map((c) => ({ catId: c.id, layout: db.getNest(c.id) })),
    journal: cats.flatMap((c) => db.getJournal(c.id, Date.now() + 1, 1000)),
    inventory: db.getInventory(uid),
    letters: db.db.prepare('SELECT ts, kind, title, text FROM events WHERE user_id = ? ORDER BY ts').all(uid),
    notesWritten: db.db.prepare('SELECT cat_id, sticker, text, ts FROM notes WHERE from_user = ? ORDER BY ts').all(uid),
    diaryPages: db.db.prepare('SELECT bond_id, text, ts FROM diary WHERE user_id = ? ORDER BY ts').all(uid),
  };
});

export type AccountDeletedHook = (uid: string, catIds: string[]) => void;
const deleteHooks: AccountDeletedHook[] = [];
export function onAccountDeleted(h: AccountDeletedHook) {
  deleteHooks.push(h);
}

export function deleteAccount(uid: string) {
  const cats = game.catsOf(uid);
  const removed: string[] = [];
  db.tx(() => {
    for (const c of cats) {
      if (c.ownerId === uid && c.coOwnerId) {
        // a shared kitten stays with the other parent
        c.ownerId = c.coOwnerId;
        c.coOwnerId = null;
        game.saveNow(c);
      } else if (c.coOwnerId === uid) {
        c.coOwnerId = null;
        game.saveNow(c);
      } else {
        removed.push(c.id);
        for (const t of ['journal', 'notes'] as const) db.db.prepare(`DELETE FROM ${t} WHERE cat_id = ?`).run(c.id);
        db.db.prepare('DELETE FROM nests WHERE cat_id = ?').run(c.id);
        db.db.prepare('DELETE FROM friendships WHERE a = ? OR b = ?').run(c.id, c.id);
        db.db.prepare('DELETE FROM cats WHERE id = ?').run(c.id);
        game.forget(c.id);
      }
    }
    db.db.prepare("UPDATE bonds SET status = 'ended' WHERE user_a = ? OR user_b = ?").run(uid, uid);
    for (const t of ['inventory', 'events', 'diary', 'match_queue', 'passkeys'] as const) db.db.prepare(`DELETE FROM ${t} WHERE user_id = ?`).run(uid);
    db.db.prepare('DELETE FROM notes WHERE from_user = ?').run(uid);
    db.db.prepare('DELETE FROM kv WHERE k = ?').run(`found:${uid}`);
    deleteUserSessions(uid);
    db.db.prepare('DELETE FROM users WHERE id = ?').run(uid);
  });
  for (const h of deleteHooks) h(uid, removed);
}

route('POST', '/api/account/delete', (r) => {
  if (r.body.confirm !== '删除') throw new HttpError(400, '请输入“删除”来确认');
  deleteAccount(r.user.id);
  clearSessionCookie(r.raw, r.res);
  return { ok: true };
}, { allowBanned: true });

// ---------- reports ----------
const REPORT_KINDS = ['cat', 'note', 'diary', 'user'];
route('POST', '/api/report', (r) => {
  const kind = String(r.body.kind);
  if (!REPORT_KINDS.includes(kind)) throw new HttpError(400, '举报类型不对');
  const target = str(r.body.target, 64, '对象');
  const reason = typeof r.body.reason === 'string' ? r.body.reason.slice(0, 100) : '';
  let detail = '';
  let author: string | null = null;
  if (kind === 'cat') {
    const c = game.getCat(target);
    detail = c?.name ?? '';
    author = c && c.ownerId !== 'town' ? c.ownerId : null;
  } else if (kind === 'note') {
    const n = db.db.prepare('SELECT text, from_user FROM notes WHERE id = ?').get(Number(target)) as { text: string; from_user: string } | undefined;
    detail = n?.text ?? '';
    author = n?.from_user ?? null;
  } else if (kind === 'diary') {
    // only pages from a bond the reporter is part of
    const d = db.db
      .prepare("SELECT d.text, d.user_id FROM diary d JOIN bonds b ON b.id = d.bond_id WHERE d.id = ? AND (b.user_a = ? OR b.user_b = ?)")
      .get(Number(target), r.user.id, r.user.id) as { text: string; user_id: string } | undefined;
    detail = d?.text ?? '';
    author = d?.user_id ?? null;
  } else if (kind === 'user') {
    const u = db.getUser(target);
    detail = u?.nickname ?? '';
    author = u?.id ?? null;
  }
  if (author === r.user.id) throw new HttpError(400, '不能举报自己哦');
  db.db.prepare('INSERT INTO reports (reporter, kind, target, detail, reason, ts, target_user) VALUES (?, ?, ?, ?, ?, ?, ?)').run(r.user.id, kind, target, detail, reason, Date.now(), author);
  return { ok: true };
}, { limit: 'report' });

// ---------- admin (token from CAT_ADMIN_TOKEN, header x-admin-token) ----------
// (the panel's signed cookie works here too, see admin.ts)
const admin = requireAdmin;

export type BanHook = (uid: string) => void;
const banHooks: BanHook[] = [];
export function onBan(h: BanHook) {
  banHooks.push(h);
}

route('GET', '/api/admin/reports', (r) => {
  admin(r);
  return db.db.prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY ts DESC LIMIT 200").all();
}, { auth: false });

route('POST', '/api/admin/resolve', (r) => {
  admin(r);
  db.db.prepare("UPDATE reports SET status = 'done' WHERE id = ?").run(Number(r.body.id));
  return { ok: true };
}, { auth: false });

route('POST', '/api/admin/ban', (r) => {
  admin(r);
  let uid = str(r.body.user, 64, '用户');
  if (uid.startsWith('c_')) uid = game.getCat(uid)?.ownerId ?? uid; // allow passing a cat id
  const banned = r.body.unban ? 0 : 1;
  db.updateUser(uid, { banned, ban_reason: banned ? String(r.body.reason ?? '').slice(0, 60) || null : null });
  if (banned) {
    deleteUserSessions(uid);
    for (const h of banHooks) h(uid);
  }
  return { ok: true, user: uid, banned: !!banned };
}, { auth: false });

route('POST', '/api/admin/rename-cat', (r) => {
  admin(r);
  const c = game.getCat(str(r.body.cat, 64, '猫'));
  if (!c) throw new HttpError(404, '没有这只猫');
  c.name = str(r.body.name, 8, '名字');
  game.saveNow(c);
  return { ok: true };
}, { auth: false });

route('POST', '/api/admin/delete-note', (r) => {
  admin(r);
  db.db.prepare('DELETE FROM notes WHERE id = ?').run(Number(r.body.id));
  return { ok: true };
}, { auth: false });

route('POST', '/api/admin/delete-diary', (r) => {
  admin(r);
  db.db.prepare('DELETE FROM diary WHERE id = ?').run(Number(r.body.id));
  return { ok: true };
}, { auth: false });

route('GET', '/api/admin/stats', (r) => {
  admin(r);
  const one = (sql: string) => (db.db.prepare(sql).get() as { n: number }).n;
  const day = Date.now() - 86400_000;
  return {
    users: one('SELECT COUNT(*) n FROM users'),
    activeToday: (db.db.prepare('SELECT COUNT(*) n FROM users WHERE last_seen > ?').get(day) as { n: number }).n,
    cats: one('SELECT COUNT(*) n FROM cats'),
    protectedAccounts: one('SELECT COUNT(*) n FROM users WHERE code_hash IS NOT NULL OR id IN (SELECT user_id FROM passkeys)'),
    openReports: one("SELECT COUNT(*) n FROM reports WHERE status = 'open'"),
  };
}, { auth: false });

export { sessionFromToken };
