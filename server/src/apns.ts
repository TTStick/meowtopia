// Apple Push Notification service for the iOS app: token-based auth (.p8 key)
// over HTTP/2, using only Node built-ins.
//   CAT_APNS_KEY_ID, CAT_APNS_TEAM_ID, CAT_APNS_BUNDLE_ID
//   CAT_APNS_KEY_FILE (path to the .p8) or CAT_APNS_KEY (its contents, \n allowed)
import { connect, type ClientHttp2Session } from 'node:http2';
import { createPrivateKey, sign, type KeyObject } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const KEY_ID = process.env.CAT_APNS_KEY_ID || '';
const TEAM_ID = process.env.CAT_APNS_TEAM_ID || '';
export const APNS_TOPIC = process.env.CAT_APNS_BUNDLE_ID || 'com.catnest.app';

let key: KeyObject | null = null;
try {
  const file = process.env.CAT_APNS_KEY_FILE;
  const pem = file && existsSync(file) ? readFileSync(file, 'utf8') : (process.env.CAT_APNS_KEY || '').replace(/\\n/g, '\n');
  if (pem.includes('PRIVATE KEY')) key = createPrivateKey(pem);
} catch (e) {
  console.warn('[apns] could not read the key', (e as Error).message);
}

export const apnsEnabled = () => !!(key && KEY_ID && TEAM_ID);

let jwt = '';
let jwtAt = 0;
function bearer(): string {
  const now = Math.floor(Date.now() / 1000);
  if (jwt && now - jwtAt < 50 * 60) return jwt; // Apple wants a fresh token at most hourly
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const data = `${b64({ alg: 'ES256', kid: KEY_ID })}.${b64({ iss: TEAM_ID, iat: now })}`;
  const sig = sign('sha256', Buffer.from(data), { key: key!, dsaEncoding: 'ieee-p1363' }).toString('base64url');
  jwt = `${data}.${sig}`;
  jwtAt = now;
  return jwt;
}

const sessions = new Map<string, ClientHttp2Session>();
function session(host: string): ClientHttp2Session {
  let s = sessions.get(host);
  if (s && !s.closed && !s.destroyed) return s;
  s = connect(`https://${host}`);
  s.on('error', () => sessions.delete(host));
  s.on('close', () => sessions.delete(host));
  s.setTimeout(10 * 60_000, () => s!.close());
  sessions.set(host, s);
  return s;
}

export type ApnsResult = 'ok' | 'gone' | 'error';

export function sendApns(token: string, env: string, p: { title: string; body: string; tag?: string; url?: string }): Promise<ApnsResult> {
  if (!apnsEnabled()) return Promise.resolve('error');
  const host = env === 'production' ? 'api.push.apple.com' : 'api.sandbox.push.apple.com';
  const payload = JSON.stringify({
    aps: { alert: { title: p.title, body: p.body }, sound: 'default', 'thread-id': p.tag ?? 'cat' },
    url: p.url ?? '/',
  });
  return new Promise((resolve) => {
    let req;
    try {
      req = session(host).request({
        ':method': 'POST',
        ':path': `/3/device/${token}`,
        authorization: `bearer ${bearer()}`,
        'apns-topic': APNS_TOPIC,
        'apns-push-type': 'alert',
        'apns-priority': '5',
        'apns-expiration': String(Math.floor(Date.now() / 1000) + 6 * 3600),
        ...(p.tag ? { 'apns-collapse-id': p.tag.slice(0, 64) } : {}),
        'content-type': 'application/json',
      });
    } catch {
      resolve('error');
      return;
    }
    let status = 0;
    let body = '';
    req.setTimeout(15_000, () => req.close());
    req.on('response', (h) => (status = Number(h[':status'])));
    req.on('data', (c) => (body += c));
    req.on('error', () => resolve('error'));
    req.on('close', () => {
      if (status === 200) return resolve('ok');
      const reason = (() => {
        try {
          return JSON.parse(body).reason as string;
        } catch {
          return '';
        }
      })();
      if (status === 410 || reason === 'BadDeviceToken' || reason === 'Unregistered' || reason === 'DeviceTokenNotForTopic') return resolve('gone');
      console.warn('[apns]', status, reason);
      resolve('error');
    });
    req.end(payload);
  });
}
