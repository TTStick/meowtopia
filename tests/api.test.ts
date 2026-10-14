// Boots a real server on a scratch database and walks through the main flows.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const PORT = 18000 + Math.floor(Math.random() * 1000);
const BASE = `http://127.0.0.1:${PORT}`;
const dir = mkdtempSync(join(tmpdir(), 'catnest-test-'));
let server: ChildProcess;

async function call(method: string, path: string, body?: unknown, token?: string) {
  const res = await fetch(BASE + path, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, data: (await res.json()) as any };
}

before(async () => {
  server = spawn(process.execPath, ['--import', 'tsx', 'server/src/main.ts'], {
    env: { ...process.env, PORT: String(PORT), CAT_DB: join(dir, 'test.db'), ANTHROPIC_API_KEY: '', NODE_ENV: 'test' },
    stdio: 'ignore',
  });
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${BASE}/api/status`)).ok) return;
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

test('register → adopt → care → shop → decorate', async () => {
  const reg = await call('POST', '/api/register', { nickname: '测试' });
  assert.equal(reg.status, 200);
  const t = reg.data.token as string;
  assert.match(reg.data.me.user.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);

  const me = await call('POST', '/api/adopt', { name: '团子', seed: 42 }, t);
  assert.equal(me.data.cats.length, 1);
  const cat = me.data.cats[0].id;
  assert.equal((await call('POST', '/api/adopt', { name: '二号', seed: 43 }, t)).status, 400, 'only one own cat');

  const feed = await call('POST', `/api/cat/${cat}/act`, { kind: 'feed', item: 'treat_can' }, t);
  assert.equal(feed.status, 200);
  assert.equal(feed.data.inventory.treat_can ?? 0, 0);
  assert.equal((await call('POST', `/api/cat/${cat}/act`, { kind: 'feed', item: 'treat_can' }, t)).status, 400, 'no cans left');

  assert.equal((await call('POST', '/api/shop/buy', { item: 'crown' }, t)).status, 400, 'too expensive');
  const buy = await call('POST', '/api/shop/buy', { item: 'cat_grass' }, t);
  assert.equal(buy.data.inventory.cat_grass, 1);

  const nest = await call('GET', `/api/nest/${cat}`, undefined, t);
  const layout = nest.data.layout;
  layout.items.push({ uid: 'g1', item: 'cat_grass', gx: 4, gy: 5 });
  assert.equal((await call('PUT', `/api/nest/${cat}`, { layout }, t)).status, 200);
  layout.items.push({ uid: 'g2', item: 'cat_grass', gx: 5, gy: 5 });
  assert.equal((await call('PUT', `/api/nest/${cat}`, { layout }, t)).status, 400, 'only one cat grass owned');

  const wish = await call('GET', `/api/cat/${cat}/wish`, undefined, t);
  assert.ok(wish.data.wish.text);
  const cmd = await call('POST', `/api/cat/${cat}/command`, { text: '去码头看看海', where: 'world' }, t);
  assert.deepEqual([cmd.data.action, cmd.data.place], ['goto', 'pier']);
});

test('recovery code logs back in; bad tokens are rejected', async () => {
  const reg = await call('POST', '/api/register', {});
  const code = reg.data.me.user.code as string;
  const login = await call('POST', '/api/login', { code: code.toLowerCase().replace(/-/g, '') });
  assert.equal(login.data.token, reg.data.token);
  assert.equal((await call('GET', '/api/me', undefined, 'nope')).status, 401);
});

test('co-parenting: two strangers match and share a kitten and a diary', async () => {
  const a = (await call('POST', '/api/register', { nickname: 'A' })).data.token;
  const b = (await call('POST', '/api/register', { nickname: 'B' })).data.token;
  assert.equal((await call('POST', '/api/bond/match', {}, a)).data.queued, true);
  assert.equal((await call('POST', '/api/bond/match', {}, b)).data.matched, true);
  const bonds = (await call('GET', '/api/bond', undefined, a)).data.bonds;
  assert.equal(bonds.length, 1);
  assert.equal(bonds[0].partnerName, 'B');
  const id = bonds[0].id;
  assert.equal((await call('POST', `/api/bond/${id}/diary`, { text: '它今天踩奶了' }, a)).status, 200);
  assert.equal((await call('POST', `/api/bond/${id}/diary`, { text: '再写一页' }, a)).status, 400, 'one page a day');
  assert.equal((await call('POST', `/api/bond/${id}/diary`, { text: '加我微信' }, b)).status, 400, 'no contact info');
  const meB = (await call('GET', '/api/me', undefined, b)).data;
  assert.equal(meB.cats.length, 1, 'B now co-owns the kitten');
  assert.equal((await call('POST', `/api/bond/${id}/leave`, {}, b)).status, 200);
  assert.equal((await call('GET', '/api/me', undefined, a)).data.cats.length, 0, 'kitten moved to town');
});
