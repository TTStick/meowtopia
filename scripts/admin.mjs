#!/usr/bin/env node
// Small moderation tool. Talks to the running server with CAT_ADMIN_TOKEN.
//   docker compose exec app node scripts/admin.mjs stats
//   node scripts/admin.mjs reports | resolve <id> | ban <用户或猫id> [原因] | unban <用户id>
//                          rename-cat <猫id> <新名字> | delete-note <纸条id> | delete-diary <日记id>
import { existsSync } from 'node:fs';

if (existsSync('.env')) process.loadEnvFile('.env');
const token = process.env.CAT_ADMIN_TOKEN;
const base = process.env.CAT_ADMIN_URL || `http://127.0.0.1:${process.env.PORT || 8737}`;
if (!token) {
  console.error('需要设置 CAT_ADMIN_TOKEN（.env 或环境变量）');
  process.exit(1);
}

async function call(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'x-admin-token': token, 'x-catnest': '1', ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${res.status} ${data?.error ?? ''}`);
  return data;
}

const [cmd, ...args] = process.argv.slice(2);
const when = (ts) => new Date(ts).toLocaleString('zh-CN', { hour12: false });
try {
  switch (cmd) {
    case 'stats':
      console.table(await call('GET', '/api/admin/stats'));
      break;
    case 'reports': {
      const rows = await call('GET', '/api/admin/reports');
      if (!rows.length) console.log('没有待处理的举报');
      for (const r of rows) console.log(`#${r.id}  ${when(r.ts)}  [${r.kind}] ${r.target}  「${r.detail ?? ''}」  理由：${r.reason || '-'}  作者：${r.target_user ?? '-'}  举报人：${r.reporter}`);
      break;
    }
    case 'resolve':
      await call('POST', '/api/admin/resolve', { id: Number(args[0]) });
      console.log('已处理');
      break;
    case 'ban':
      console.log(await call('POST', '/api/admin/ban', { user: args[0], reason: args.slice(1).join(' ') }));
      break;
    case 'unban':
      console.log(await call('POST', '/api/admin/ban', { user: args[0], unban: true }));
      break;
    case 'rename-cat':
      await call('POST', '/api/admin/rename-cat', { cat: args[0], name: args[1] });
      console.log('已改名');
      break;
    case 'delete-note':
      await call('POST', '/api/admin/delete-note', { id: Number(args[0]) });
      console.log('已删除');
      break;
    case 'delete-diary':
      await call('POST', '/api/admin/delete-diary', { id: Number(args[0]) });
      console.log('已删除');
      break;
    default:
      console.log('用法：admin.mjs stats | reports | resolve <id> | ban <用户或猫id> [原因] | unban <用户id> | rename-cat <猫id> <名字> | delete-note <id> | delete-diary <id>');
  }
} catch (e) {
  console.error('失败：', e.message);
  process.exit(1);
}
