// Boots a real server on a scratch database and walks through the main flows,
// the way a browser (cookies) and the native app (bearer tokens) would.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const ADMIN = 'test-admin-token-123456';
const dir = mkdtempSync(join(tmpdir(), 'catnest-test-'));
let server: ChildProcess;

/** A player: either a browser with a cookie jar, or the app with a bearer token. */
class Player {
  cookie = '';
  token = '';
  constructor(public kind: 'web' | 'app' = 'web') {}
  async call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
    const headers: Record<string, string> = { 'x-catnest': '1', ...extra };
    if (body) headers['content-type'] = 'application/json';
    if (this.cookie) headers.cookie = this.cookie;
    if (this.token) headers.authorization = `Bearer ${this.token}`;
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const set = res.headers.getSetCookie();
    for (const c of set) {
      const [kv] = c.split(';');
      this.cookie = kv.endsWith('=') ? '' : kv;
    }
    return { status: res.status, data: (await res.json().catch(() => null)) as any, setCookie: set };
  }
  async join(nickname?: string) {
    const ch = (await this.call('GET', '/api/auth/pow')).data;
    let n = 0;
    while (leading(createHash('sha256').update(`${ch.c}:${n}`).digest()) < ch.d) n++;
    const r = await this.call('POST', '/api/auth/guest', { nickname, pow: { ...ch, n: String(n) }, client: this.kind });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    if (this.kind === 'app') this.token = r.data.token;
    return r.data.me;
  }
}
function leading(h: Buffer) {
  let n = 0;
  for (const b of h) {
    if (b === 0) {
      n += 8;
      continue;
    }
    return n + Math.clz32(b) - 24;
  }
  return n;
}

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/src/main.ts'], {
    env: { ...process.env, PORT: String(PORT), CAT_DATA_DIR: dir, CAT_DB: join(dir, 'test.db'), ANTHROPIC_API_KEY: '', NODE_ENV: 'test', CAT_ADMIN_TOKEN: ADMIN, CAT_REGISTER_PER_HOUR: '200', CAT_BACKUPS: 'off' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/healthz`)).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  server.kill('SIGKILL');
  rmSync(dir, { recursive: true, force: true });
});

test('guests need proof of work, and sessions live in an HttpOnly cookie', async () => {
  const p = new Player();
  const ch = (await p.call('GET', '/api/auth/pow')).data;
  assert.equal((await p.call('POST', '/api/auth/guest', { pow: { ...ch, n: 'nope' } })).status, 400, 'wrong nonce');
  const me = await p.join('测试');
  assert.equal(me.user.nickname, '测试');
  assert.equal(me.user.secured, false);
  assert.match(p.cookie, /^cn_sid=cn1\./);
  const again = new Player();
  const set = (await again.call('POST', '/api/auth/guest', { pow: { ...ch, n: '0' } })).status;
  assert.equal(set, 400, 'a challenge cannot be reused');
  assert.equal((await p.call('GET', '/api/me')).status, 200);
  assert.equal((await new Player().call('GET', '/api/me')).status, 401);
});

test('csrf: state changes need our header and a same-site origin', async () => {
  const p = new Player();
  await p.join();
  const noHeader = await fetch(BASE + '/api/daily', { method: 'POST', headers: { cookie: p.cookie } });
  assert.equal(noHeader.status, 403);
  assert.equal((await p.call('POST', '/api/daily', {}, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await p.call('POST', '/api/daily', {}, { origin: `http://127.0.0.1:${PORT}` })).status, 200);
});

test('adopt → care → shop → decorate', async () => {
  const p = new Player();
  await p.join();
  const me = await p.call('POST', '/api/adopt', { name: '团子', seed: 42 });
  assert.equal(me.data.cats.length, 1);
  const cat = me.data.cats[0].id;
  assert.equal((await p.call('POST', '/api/adopt', { name: '二号', seed: 43 })).status, 400, 'only one own cat');
  assert.equal((await p.call('POST', '/api/adopt', { name: '加我微信', seed: 43 })).status, 400);

  const feed = await p.call('POST', `/api/cat/${cat}/act`, { kind: 'feed', item: 'treat_can' });
  assert.equal(feed.status, 200);
  assert.equal(feed.data.inventory.treat_can ?? 0, 0);
  assert.equal((await p.call('POST', `/api/cat/${cat}/act`, { kind: 'feed', item: 'treat_can' })).status, 400, 'no cans left');

  assert.equal((await p.call('POST', '/api/shop/buy', { item: 'crown' })).status, 400, 'too expensive');
  const buy = await p.call('POST', '/api/shop/buy', { item: 'cat_grass' });
  assert.equal(buy.data.inventory.cat_grass, 1);

  const nest = await p.call('GET', `/api/nest/${cat}`);
  const layout = nest.data.layout;
  layout.items.push({ uid: 'g1', item: 'cat_grass', gx: 4, gy: 5 });
  assert.equal((await p.call('PUT', `/api/nest/${cat}`, { layout })).status, 200);
  layout.items.push({ uid: 'g2', item: 'cat_grass', gx: 5, gy: 5 });
  assert.equal((await p.call('PUT', `/api/nest/${cat}`, { layout })).status, 400, 'only one cat grass owned');

  const wish = await p.call('GET', `/api/cat/${cat}/wish`);
  assert.ok(wish.data.wish.text);
  const cmd = await p.call('POST', `/api/cat/${cat}/command`, { text: '去码头看看海', where: 'world' });
  assert.deepEqual([cmd.data.action, cmd.data.place], ['goto', 'pier']);
});

test('recovery code: shown once, stored hashed, regenerating revokes the old one', async () => {
  const p = new Player();
  const me = await p.join();
  const code1 = (await p.call('POST', '/api/auth/recovery-code')).data.code as string;
  assert.match(code1, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  assert.equal((await p.call('GET', '/api/me')).data.user.secured, true);
  assert.equal((await p.call('GET', '/api/auth/state')).data.hasCode, true);

  const phone = new Player();
  const back = await phone.call('POST', '/api/auth/code', { code: code1.toLowerCase().replace(/-/g, ' ') });
  assert.equal(back.status, 200);
  assert.equal(back.data.me.user.id, me.user.id);
  assert.notEqual(phone.cookie, p.cookie, 'each device gets its own session');

  const code2 = (await p.call('POST', '/api/auth/recovery-code')).data.code as string;
  assert.notEqual(code1, code2);
  assert.equal((await new Player().call('POST', '/api/auth/code', { code: code1 })).status, 404);
  assert.equal((await new Player().call('POST', '/api/auth/code', { code: code2 })).status, 200);

  const bad = new Player();
  bad.token = 'cn1.nope';
  assert.equal((await bad.call('GET', '/api/me')).status, 401);
});

test('devices: list, sign out others, sign out', async () => {
  const a = new Player();
  await a.join();
  const code = (await a.call('POST', '/api/auth/recovery-code')).data.code;
  const b = new Player();
  await b.call('POST', '/api/auth/code', { code });
  const st = (await a.call('GET', '/api/auth/state')).data;
  assert.equal(st.sessions.length, 2);
  assert.equal(st.sessions.filter((s: any) => s.current).length, 1);
  await a.call('POST', '/api/auth/logout-others');
  assert.equal((await b.call('GET', '/api/me')).status, 401, 'other device signed out');
  assert.equal((await a.call('GET', '/api/me')).status, 200);
  const out = await a.call('POST', '/api/auth/logout');
  assert.ok(out.setCookie.some((c) => c.includes('Max-Age=0')));
  assert.equal((await a.call('GET', '/api/me')).status, 401);
});

test('co-parenting (app clients): two strangers share a kitten; deleting an account hands it over', async () => {
  const a = new Player('app');
  const b = new Player('app');
  await a.join('A');
  await b.join('B');
  assert.match(a.token, /^cn1\./);
  assert.equal((await a.call('POST', '/api/bond/match', {})).data.queued, true);
  assert.equal((await b.call('POST', '/api/bond/match', {})).data.matched, true);
  const bonds = (await a.call('GET', '/api/bond')).data.bonds;
  assert.equal(bonds.length, 1);
  assert.equal(bonds[0].partnerName, 'B');
  const id = bonds[0].id;
  assert.equal((await a.call('POST', `/api/bond/${id}/diary`, { text: '它今天踩奶了' })).status, 200);
  assert.equal((await a.call('POST', `/api/bond/${id}/diary`, { text: '再写一页' })).status, 400, 'one page a day');
  assert.equal((await b.call('POST', `/api/bond/${id}/diary`, { text: '加 我 V 信' })).status, 400, 'no contact info');
  assert.equal((await b.call('POST', `/api/bond/${id}/diary`, { text: '我的号码是一三八零零一三八零零零' })).status, 400, 'no phone numbers');
  const meB = (await b.call('GET', '/api/me')).data;
  assert.equal(meB.cats.length, 1, 'B co-owns the kitten');
  const kitten = meB.cats[0].id;

  // B reports a diary page, then A deletes their account
  const page = (await b.call('GET', '/api/bond')).data.bonds[0].diary[0];
  assert.equal((await b.call('POST', '/api/report', { kind: 'diary', target: String(page.id), reason: '测试' })).status, 200);
  assert.equal((await a.call('POST', '/api/account/delete', { confirm: '好' })).status, 400);
  assert.equal((await a.call('POST', '/api/account/delete', { confirm: '删除' })).status, 200);
  assert.equal((await a.call('GET', '/api/me')).status, 401);
  const after = (await b.call('GET', '/api/me')).data;
  assert.deepEqual(after.cats.map((c: any) => c.id), [kitten], 'the kitten stays with B');
  assert.equal(after.cats[0].ownerId, after.user.id);
});

test('export, reports and admin bans', async () => {
  const p = new Player();
  const me = await p.join('坏人');
  const cat = (await p.call('POST', '/api/adopt', { name: '小黑', seed: 7 })).data.cats[0].id;
  const exp = (await p.call('GET', '/api/account/export')).data;
  assert.equal(exp.user.id, me.user.id);
  assert.equal(exp.cats[0].id, cat);

  const r = new Player();
  await r.join();
  assert.equal((await r.call('POST', '/api/report', { kind: 'cat', target: cat })).status, 200);
  assert.equal((await r.call('GET', '/api/admin/reports')).status, 404, 'admin is hidden without the token');
  const reports = (await r.call('GET', '/api/admin/reports', undefined, { 'x-admin-token': ADMIN })).data;
  assert.ok(reports.some((x: any) => x.target === cat && x.detail === '小黑'));
  const ban = await r.call('POST', '/api/admin/ban', { user: cat, reason: '测试' }, { 'x-admin-token': ADMIN });
  assert.equal(ban.data.user, me.user.id, 'a cat id resolves to its owner');
  assert.equal((await p.call('GET', '/api/me')).status, 401, 'sessions revoked');
  const visit = (await r.call('GET', '/api/visit/random')).data;
  assert.ok(!visit.some((c: any) => c.id === cat), 'banned cats are not offered for visits');
});

test('websocket: cookie only counts from our own pages; the app authenticates by message', async () => {
  const p = new Player();
  const me = await p.join();
  const open = (headers: Record<string, string>, first?: unknown) =>
    new Promise<any>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws`, { headers });
      ws.on('open', () => first && ws.send(JSON.stringify(first)));
      ws.on('message', (d) => {
        const m = JSON.parse(String(d));
        if (m.t === 'welcome') {
          ws.close();
          resolve(m);
        }
      });
      ws.on('error', reject);
    });
  assert.equal((await open({ cookie: p.cookie, origin: `http://127.0.0.1:${PORT}` })).you, me.user.id);
  assert.equal((await open({ cookie: p.cookie, origin: 'https://evil.example' }, { t: 'watch' })).you, null, 'cross-site cookie ignored');
  const app = new Player('app');
  const appMe = await app.join();
  assert.equal((await open({}, { t: 'auth', token: app.token })).you, appMe.user.id);
});

test('static files cannot escape dist; html gets security headers', async () => {
  for (const path of ['/../package.json', '/%2e%2e/package.json', '/.env', '/assets/../../server/src/main.ts']) {
    const res = await fetch(BASE + path);
    const body = await res.text();
    assert.ok(!body.includes('"dependencies"') && !body.includes('loadEnvFile'), `${path} leaked`);
  }
  const res = await fetch(BASE + '/api/status');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

// ---- a tiny software passkey (ES256, "none" attestation) ----
function cbor(v: unknown): Buffer {
  const head = (major: number, n: number) => {
    if (n < 24) return Buffer.from([(major << 5) | n]);
    if (n < 256) return Buffer.from([(major << 5) | 24, n]);
    const b = Buffer.alloc(3);
    b[0] = (major << 5) | 25;
    b.writeUInt16BE(n, 1);
    return b;
  };
  if (typeof v === 'number') return v >= 0 ? head(0, v) : head(1, -1 - v);
  if (typeof v === 'string') return Buffer.concat([head(3, Buffer.byteLength(v)), Buffer.from(v)]);
  if (Buffer.isBuffer(v)) return Buffer.concat([head(2, v.length), v]);
  if (v instanceof Map) return Buffer.concat([head(5, v.size), ...[...v].flatMap(([k, x]) => [cbor(k), cbor(x)])]);
  throw new Error('cbor: unsupported');
}

test('passkeys: bind on one device, sign in on another', async () => {
  const { generateKeyPairSync, sign, randomBytes } = await import('node:crypto');
  const origin = `http://127.0.0.1:${PORT}`;
  const rpHash = createHash('sha256').update('127.0.0.1').digest();
  const b64 = (b: Buffer) => b.toString('base64url');
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' }) as { x: string; y: string };
  const credId = randomBytes(16);

  const p = new Player();
  const me = await p.join();
  const opts = (await p.call('POST', '/api/auth/passkey/register-options', {}, { origin })).data;
  assert.equal(opts.rp.id, '127.0.0.1');
  const cose = cbor(new Map<number, unknown>([[1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')]]));
  const len = Buffer.alloc(2);
  len.writeUInt16BE(credId.length);
  const authData = Buffer.concat([rpHash, Buffer.from([0x45]), Buffer.alloc(4), Buffer.alloc(16), len, credId, cose]);
  const clientData = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge: opts.challenge, origin, crossOrigin: false }));
  const attestation = cbor(new Map<string, unknown>([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]));
  const reg = await p.call('POST', '/api/auth/passkey/register', {
    name: '测试钥匙',
    response: { id: b64(credId), rawId: b64(credId), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(clientData), attestationObject: b64(attestation), transports: ['internal'] } },
  }, { origin });
  assert.equal(reg.status, 200, JSON.stringify(reg.data));
  assert.equal((await p.call('GET', '/api/me')).data.user.secured, true);

  const phone = new Player();
  const login = async (counter: number) => {
    const { cid, options } = (await phone.call('POST', '/api/auth/passkey/login-options', {}, { origin })).data;
    const cnt = Buffer.alloc(4);
    cnt.writeUInt32BE(counter);
    const ad = Buffer.concat([rpHash, Buffer.from([0x05]), cnt]);
    const cd = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: options.challenge, origin, crossOrigin: false }));
    const sig = sign('sha256', Buffer.concat([ad, createHash('sha256').update(cd).digest()]), privateKey);
    return phone.call('POST', '/api/auth/passkey/login', {
      cid,
      response: { id: b64(credId), rawId: b64(credId), type: 'public-key', clientExtensionResults: {}, response: { clientDataJSON: b64(cd), authenticatorData: b64(ad), signature: b64(sig), userHandle: b64(Buffer.from(me.user.id)) } },
    }, { origin });
  };
  const ok = await login(1);
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.me.user.id, me.user.id);
  assert.equal((await login(1)).status, 400, 'a replayed counter is refused');
  const keys = (await p.call('GET', '/api/auth/state')).data.passkeys;
  assert.equal(keys[0].name, '测试钥匙');
  await p.call('DELETE', `/api/auth/passkey/${encodeURIComponent(keys[0].id)}`);
  assert.equal((await login(5)).status, 404, 'deleted passkeys stop working');
});

test('native app origin: CORS without credentials, bearer only, APNs tokens', async () => {
  const app = 'capacitor://localhost';
  const pre = await fetch(BASE + '/api/me', { method: 'OPTIONS', headers: { origin: app, 'access-control-request-method': 'GET', 'access-control-request-headers': 'authorization' } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get('access-control-allow-origin'), app);
  assert.equal(pre.headers.get('access-control-allow-credentials'), null, 'never with credentials');
  assert.equal((await fetch(BASE + '/api/me', { method: 'OPTIONS', headers: { origin: 'https://evil.example' } })).status, 403);

  const web = new Player();
  await web.join();
  assert.equal((await web.call('GET', '/api/me', undefined, { origin: app })).status, 401, 'cookies do not count from the app origin');

  const phone = new Player('app');
  await phone.join('手机');
  const me = await phone.call('GET', '/api/me', undefined, { origin: app });
  assert.equal(me.status, 200);
  assert.equal(me.data.user.nickname, '手机');
  assert.equal((await phone.call('POST', '/api/push/apns', { token: 'nope' }, { origin: app })).status, 400);
  const token = 'ab'.repeat(32);
  const reg = await phone.call('POST', '/api/push/apns', { token, env: 'sandbox' }, { origin: app });
  assert.equal(reg.status, 200);
  assert.equal(reg.data.delivering, false, 'no APNs key configured in tests');
  assert.equal((await phone.call('GET', '/api/me')).data.user.settings.push, true);
});

test('companions: sprites, snapshot, outing and pairing a watch', async () => {
  const phone = new Player('app');
  await phone.join('主人');
  const cat = (await phone.call('POST', '/api/adopt', { name: '团团', seed: 951 })).data.cats[0].id;

  // sprites are real PNGs, cached with ETags
  const res = await fetch(`${BASE}/api/sprite/cat/${cat}/happy?size=100&outline=1`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/png');
  const png = Buffer.from(await res.arrayBuffer());
  assert.deepEqual([...png.subarray(1, 4)], [0x50, 0x4e, 0x47]);
  assert.equal(png.readUInt32BE(16), 128, 'sizes snap to the next standard size');
  const etag = res.headers.get('etag')!;
  assert.equal((await fetch(`${BASE}/api/sprite/cat/${cat}/happy?size=100&outline=1`, { headers: { 'if-none-match': etag } })).status, 304);
  assert.equal((await fetch(`${BASE}/api/sprite/cat/${cat}/dance`)).status, 404);
  assert.equal((await fetch(`${BASE}/api/sprite/seed/12345/sit?size=64`)).status, 200);

  // one snapshot with everything a small screen shows
  const home = (await phone.call('GET', '/api/companion')).data;
  assert.equal(home.cat.name, '团团');
  assert.equal(home.cat.out, false);
  assert.ok(home.line.length > 0);
  assert.ok(home.cat.look && home.wish && Array.isArray(home.foods));
  // what the Android app needs to follow the player's notification rules by itself
  assert.equal(home.notify.push, false);
  assert.equal(typeof home.notify.quietStart, 'number');
  assert.equal(typeof home.notify.tzOffset, 'number');

  // go out and come back without a websocket
  const out = await phone.call('POST', `/api/cat/${cat}/outing`, { go: true });
  assert.equal(out.data.out, true);
  assert.equal((await phone.call('GET', '/api/companion')).data.cat.out, true);
  await phone.call('POST', `/api/cat/${cat}/outing`, { go: false });

  // the watch shows a code; the phone approves it; the watch gets its own session
  const watch = new Player('app');
  const start = (await watch.call('POST', '/api/auth/device/start', {}, { 'user-agent': 'CatNestWatch/1.0 watchOS' })).data;
  assert.match(start.code, /^[A-Z0-9]{6}$/);
  assert.equal((await watch.call('POST', '/api/auth/device/poll', { secret: start.secret })).data.status, 'pending');
  assert.equal((await phone.call('POST', '/api/auth/device/approve', { code: 'ZZZZZZ' })).status, 404);
  const ok = await phone.call('POST', '/api/auth/device/approve', { code: start.code.toLowerCase() });
  assert.equal(ok.data.name, 'Apple Watch');
  const got = (await watch.call('POST', '/api/auth/device/poll', { secret: start.secret }, { 'user-agent': 'CatNestWatch/1.0 watchOS' })).data;
  assert.equal(got.status, 'ok');
  watch.token = got.token;
  assert.equal((await watch.call('GET', '/api/companion')).data.cat.name, '团团');
  assert.equal((await new Player().call('POST', '/api/auth/device/poll', { secret: start.secret })).data.status, 'expired', 'codes are single use');
  const devices = (await phone.call('GET', '/api/auth/state')).data.sessions;
  assert.ok(devices.some((s: any) => s.agent.includes('猫窝 手表')));

  // the phone app can also hand a fresh session straight to its paired watch
  const minted = (await phone.call('POST', '/api/auth/device/mint')).data.token;
  const w2 = new Player('app');
  w2.token = minted;
  assert.equal((await w2.call('GET', '/api/me')).status, 200);
});

test('admin panel: sign in, numbers, the town, model settings', async () => {
  const outsider = new Player();
  // without a session every admin route stays hidden
  assert.equal((await outsider.call('GET', '/api/admin/overview')).status, 404);
  assert.equal((await outsider.call('POST', '/api/admin/login', { token: 'wrong' })).status, 401);

  const admin = new Player();
  const login = await admin.call('POST', '/api/admin/login', { token: ADMIN });
  assert.equal(login.status, 200);
  const cookie = login.setCookie.find((c) => c.startsWith('cn_admin='))!;
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Strict/);
  assert.match(cookie, /Path=\/api\/admin/);
  // a forged or expired cookie is no good
  assert.equal((await outsider.call('GET', '/api/admin/me', undefined, { cookie: `cn_admin=${Math.floor(Date.now() / 1000) + 999}.forged` })).status, 404);
  assert.equal((await outsider.call('GET', '/api/admin/me', undefined, { cookie: admin.cookie.replace(/=\d+/, '=1000') })).status, 404);

  // a player with a cat out in the town shows up in the numbers and the sandbox
  const p = new Player();
  await p.join('沙盘测试员');
  const cat = (await p.call('POST', '/api/adopt', { name: '沙盘猫', seed: 77 })).data.cats[0].id;
  assert.equal((await p.call('POST', `/api/cat/${cat}/outing`, { go: true })).status, 200);
  const o = (await admin.call('GET', '/api/admin/overview')).data;
  assert.ok(o.users.total >= 1 && o.users.newToday >= 1 && o.cats.total >= 1);
  assert.equal(o.days.length, 14);
  assert.ok(o.online.catsInTown >= 1);
  const w = (await admin.call('GET', '/api/admin/world')).data;
  const mine = w.ents.find((e: { id: string }) => e.id === cat);
  assert.ok(mine, 'the cat is in the snapshot');
  assert.equal(mine.owner, '沙盘测试员');
  assert.ok(w.ents.some((e: { kind: string }) => e.kind === 'npc'));
  assert.match(w.clock.time, /^\d\d:\d\d$/);
  // the old header still works for scripts, and old routes accept the panel's cookie
  assert.equal((await outsider.call('GET', '/api/admin/stats', undefined, { 'x-admin-token': ADMIN })).status, 200);
  assert.equal((await admin.call('GET', '/api/admin/reports')).status, 200);

  // model settings: saved, masked, validated, and back to the defaults
  const before = (await admin.call('GET', '/api/admin/llm')).data;
  assert.equal(before.settings.active, false);
  assert.equal(before.settings.keySource, 'none');
  const saved = await admin.call('PUT', '/api/admin/llm', { model: 'claude-haiku-5-5', rpm: 10, apiKey: 'sk-ant-test-0123456789abcdef', effort: 'medium' });
  assert.equal(saved.status, 200);
  assert.equal(saved.data.settings.model, 'claude-haiku-5-5');
  assert.equal(saved.data.settings.rpm, 10);
  assert.equal(saved.data.settings.keySource, 'panel');
  assert.ok(!saved.data.settings.apiKey.includes('0123456789'), 'the key is masked');
  assert.equal((await admin.call('PUT', '/api/admin/llm', { baseURL: 'http://insecure.example' })).status, 400);
  assert.equal((await outsider.call('PUT', '/api/admin/llm', { model: 'x' })).status, 404);
  assert.equal((await p.call('GET', '/api/status')).data.llm, true, 'a key from the panel turns the model on');
  const reset = (await admin.call('POST', '/api/admin/llm/reset')).data;
  assert.equal(reset.settings.keySource, 'none');
  assert.equal(reset.settings.model, 'claude-opus-5-5');
  assert.equal((await p.call('GET', '/api/status')).data.llm, false);
  const t = (await admin.call('POST', '/api/admin/llm/test', {})).data;
  assert.equal(t.ok, false);

  assert.equal((await admin.call('POST', '/api/admin/logout')).status, 200);
  assert.equal((await admin.call('GET', '/api/admin/me')).status, 404);
});
