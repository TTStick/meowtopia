// Web Push: gentle letters from the cat. Rate limited, respects quiet hours,
// never guilt-trips. In-app letters are always stored; push is optional.
import webpush from 'web-push';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR } from './config';
import { apnsEnabled, sendApns } from './apns';
import { route, HttpError } from './http';
import * as db from './db';
import * as game from './game';
import { localClock } from '../../shared/time';
import { catLetter } from './llm';
import { fallbackLine } from '../../shared/speech';

const VAPID_PATH = join(DATA_DIR, 'vapid.json');
let keys: { publicKey: string; privateKey: string };
if (existsSync(VAPID_PATH)) keys = JSON.parse(readFileSync(VAPID_PATH, 'utf8'));
else {
  keys = webpush.generateVAPIDKeys();
  writeFileSync(VAPID_PATH, JSON.stringify(keys), { mode: 0o600 });
}
webpush.setVapidDetails(process.env.CAT_VAPID_SUBJECT || 'mailto:hello@example.com', keys.publicKey, keys.privateKey);

route('GET', '/api/push/key', () => ({ key: keys.publicKey }), { auth: false });

// The server POSTs to whatever endpoint a subscription names, so only accept the
// browsers' real push services (never an address inside our own network).
const PUSH_HOSTS = ['fcm.googleapis.com', 'android.googleapis.com', 'updates.push.services.mozilla.com', 'push.services.mozilla.com', 'web.push.apple.com', 'notify.windows.com', 'push.apple.com', ...(process.env.CAT_PUSH_HOSTS || '').split(',').map((s) => s.trim()).filter(Boolean)];
function pushEndpointOk(endpoint: unknown): boolean {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  try {
    const u = new URL(endpoint);
    return u.protocol === 'https:' && !u.port && PUSH_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch {
    return false;
  }
}

route('POST', '/api/push/subscribe', (r) => {
  const sub = r.body.sub;
  if (!pushEndpointOk(sub?.endpoint) || typeof sub?.keys?.p256dh !== 'string' || typeof sub?.keys?.auth !== 'string') throw new HttpError(400, '订阅信息不对');
  const clean = { endpoint: sub.endpoint, expirationTime: null, keys: { p256dh: sub.keys.p256dh.slice(0, 200), auth: sub.keys.auth.slice(0, 100) } };
  db.updateUser(r.user.id, { push_sub: JSON.stringify(clean) });
  const s = game.settingsOf(r.user);
  db.updateUser(r.user.id, { settings: JSON.stringify({ ...s, push: true }) });
  return { ok: true };
});

// iOS app: an APNs device token instead of a web push subscription
route('POST', '/api/push/apns', (r) => {
  const token = String(r.body.token ?? '');
  if (!/^[0-9a-f]{64,200}$/i.test(token)) throw new HttpError(400, '设备标识不对');
  const env = r.body.env === 'production' ? 'production' : 'sandbox';
  db.db.prepare('UPDATE users SET apns_token = NULL WHERE apns_token = ? AND id != ?').run(token, r.user.id); // one phone, one account
  db.updateUser(r.user.id, { apns_token: token, apns_env: env });
  const s = game.settingsOf(r.user);
  db.updateUser(r.user.id, { settings: JSON.stringify({ ...s, push: true }) });
  return { ok: true, delivering: apnsEnabled() };
});

route('DELETE', '/api/push/apns', (r) => {
  db.updateUser(r.user.id, { apns_token: null, apns_env: null });
  return { ok: true };
});

route('DELETE', '/api/push/subscribe', (r) => {
  db.updateUser(r.user.id, { push_sub: null });
  return { ok: true };
});

route('POST', '/api/push/test', async (r) => {
  const u = db.getUser(r.user.id)!;
  if (!u.push_sub && !u.apns_token) throw new HttpError(400, '还没有开启通知');
  const cat = game.catsOf(u.id)[0];
  const ok = await sendPush(u, { title: cat ? `${cat.name}的小纸条` : '猫窝', body: cat ? fallbackLine('greet', { name: cat.name, p: cat.personality }) : '通知已开启～', tag: 'test' });
  return { ok };
});

async function sendPush(u: db.UserRow, payload: { title: string; body: string; tag?: string; url?: string }): Promise<boolean> {
  let sent = false;
  if (u.apns_token && apnsEnabled()) {
    const r = await sendApns(u.apns_token, u.apns_env ?? 'sandbox', payload);
    if (r === 'gone') db.updateUser(u.id, { apns_token: null, apns_env: null });
    sent ||= r === 'ok';
  }
  if (u.push_sub) {
    try {
      await webpush.sendNotification(JSON.parse(u.push_sub), JSON.stringify({ url: '/', ...payload }), { TTL: 6 * 3600 });
      sent = true;
    } catch (e: any) {
      if (e?.statusCode === 404 || e?.statusCode === 410) db.updateUser(u.id, { push_sub: null });
      else console.warn('[push] failed', e?.statusCode ?? e?.message);
    }
  }
  return sent;
}

function inQuiet(h: number, a: number, b: number) {
  return a <= b ? h >= a && h < b : h >= a || h < b;
}

const PRIORITY: Record<string, number> = { bond: 5, diary: 4, note: 4, home: 3, find: 3, friend: 2, explore: 1, letter: 1 };
const MIN_GAP = 2.5 * 3600_000;
const MAX_PER_DAY = 4;

async function tick() {
  const now = Date.now();
  const users = db.db.prepare('SELECT * FROM users WHERE (push_sub IS NOT NULL OR apns_token IS NOT NULL) AND banned = 0').all() as unknown as db.UserRow[];
  for (const u of users) {
    const s = game.settingsOf(u);
    if (!s.push) continue;
    const ck = localClock(now, s.tzOffset);
    if (inQuiet(ck.hour, s.quietStart, s.quietEnd)) continue;
    if (now - u.last_push < MIN_GAP) continue;
    let count = u.push_day === ck.day ? u.push_count : 0;
    if (count >= MAX_PER_DAY) continue;
    // don't push while the user is actively playing
    if (now - u.last_seen < 5 * 60_000) continue;
    const evs = db.db.prepare('SELECT * FROM events WHERE user_id = ? AND pushed = 0 AND seen = 0 AND ts > ? ORDER BY ts DESC LIMIT 10').all(u.id, now - 8 * 3600_000) as any[];
    let payload: { title: string; body: string; tag?: string } | null = null;
    if (evs.length) {
      evs.sort((a, b) => (PRIORITY[b.kind] ?? 0) - (PRIORITY[a.kind] ?? 0) || b.ts - a.ts);
      const e = evs[0];
      payload = { title: e.title, body: evs.length > 1 ? `${e.text}（还有${evs.length - 1}件小事）` : e.text, tag: e.kind };
      db.db.prepare('UPDATE events SET pushed = 1 WHERE user_id = ? AND pushed = 0').run(u.id);
    } else if (ck.hour >= 20 && ck.hour < 21.5 && now - u.last_seen > 20 * 3600_000 && now - u.last_seen < 21 * 86400_000 && u.push_day !== ck.day) {
      // one soft evening letter on days the user hasn't come by
      const cat = game.catsOf(u.id)[0];
      if (cat) {
        const fb = { title: `${cat.name}的晚安纸条`, body: fallbackLine('night', { name: cat.name, p: cat.personality }) };
        payload = { ...(await catLetter(cat, '夜晚了，猫猫在窝里准备睡觉，想跟主人说晚安', fb)), tag: 'evening' };
      }
    }
    if (!payload) continue;
    const ok = await sendPush(u, payload);
    if (ok) {
      count++;
      db.updateUser(u.id, { last_push: now, push_day: ck.day, push_count: count });
    }
  }
}

export function startPush() {
  setInterval(() => void tick().catch((e) => console.warn('[push] tick', e)), 60_000).unref();
}
