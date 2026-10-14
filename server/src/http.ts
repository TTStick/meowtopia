import type { IncomingMessage, ServerResponse } from 'node:http';
import { updateUser, type UserRow } from './db';
import { allow, clientIp, corsHeaders, fromApp, LIMITS, originAllowed, securityHeaders } from './security';
import { sessionFromRequest, touchSession, type SessionRow } from './sessions';

import { HttpError } from './errors';
export { HttpError };

export interface Req {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  user: UserRow;
  session: SessionRow | null;
  ip: string;
  raw: IncomingMessage;
  res: ServerResponse;
}

type Handler = (r: Req) => unknown | Promise<unknown>;

export interface RouteOpts {
  auth?: boolean; // default true
  limit?: keyof typeof LIMITS; // extra bucket for this route
  by?: 'ip' | 'user'; // what the extra bucket is keyed by (default: user, or ip when unauthenticated)
  allowBanned?: boolean;
}

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  h: Handler;
  o: RouteOpts;
}

const routes: Route[] = [];

export function route(method: string, pattern: string, h: Handler, opts: RouteOpts | boolean = {}) {
  const o: RouteOpts = typeof opts === 'boolean' ? { auth: opts } : opts;
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, h, o });
}

async function readBody(req: IncomingMessage): Promise<any> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 64 * 1024) throw new HttpError(413, '内容太大了');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    const v = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    return v && typeof v === 'object' ? v : {};
  } catch {
    throw new HttpError(400, '格式不对');
  }
}

export function send(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;
  securityHeaders(req, res, false);
  const method = req.method ?? 'GET';
  const ip = clientIp(req);
  const cors = corsHeaders(req, res);
  if (method === 'OPTIONS') {
    res.writeHead(cors ? 204 : 403).end();
    return true;
  }
  try {
    if (!allow(`ip:${ip}`, ...LIMITS.ipGlobal)) throw new HttpError(429, '太快啦，歇一会儿再来');
    const r = routes.find((x) => x.method === method && x.re.test(url.pathname));
    if (!r) throw new HttpError(404, 'not found');
    const m = r.re.exec(url.pathname)!;
    // CSRF: state-changing browser requests must be same-origin and carry our header.
    if (method !== 'GET' && method !== 'HEAD') {
      const bearer = String(req.headers.authorization ?? '').startsWith('Bearer ');
      if (!originAllowed(req, req.headers.origin as string | undefined)) throw new HttpError(403, '来源不被允许');
      if (!bearer && req.headers['x-catnest'] !== '1') throw new HttpError(403, '请求不完整');
    }
    const params: Record<string, string> = {};
    r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
    const auth = r.o.auth !== false;
    // the app authenticates with its bearer token only; cookies never count cross-origin
    let found = sessionFromRequest(req);
    if (found && found.via === 'cookie' && fromApp(req)) found = null;
    if (auth && !found) throw new HttpError(401, '请先登录');
    if (auth && found && found.user.banned && !r.o.allowBanned) throw new HttpError(403, `账号已被暂停${found.user.ban_reason ? `：${found.user.ban_reason}` : ''}`);
    if (found) {
      touchSession(found.session, req, res);
      const now = Date.now();
      if (now - found.user.last_seen > 60_000) updateUser(found.user.id, { last_seen: now });
    }
    // every state change counts against a per-account budget
    if (found && method !== 'GET' && method !== 'HEAD' && !allow(`write:${found.user.id}`, ...LIMITS.write)) throw new HttpError(429, '太频繁啦，休息一下再试试');
    if (r.o.limit) {
      const by = r.o.by ?? (found ? 'user' : 'ip');
      const key = `${r.o.limit}:${by === 'user' && found ? found.user.id : ip}`;
      const [cap, rate] = LIMITS[r.o.limit];
      if (!allow(key, cap, rate)) throw new HttpError(429, '太频繁啦，休息一下再试试');
    }
    const body = await readBody(req);
    const out = await r.h({ method, path: url.pathname, params, query: url.searchParams, body, user: found?.user as UserRow, session: found?.session ?? null, ip, raw: req, res });
    if (!res.headersSent) send(res, 200, out ?? { ok: true });
  } catch (e) {
    if (res.headersSent) return true;
    if (e instanceof HttpError) send(res, e.status, { error: e.message });
    else {
      console.error('[api]', method, url.pathname, e);
      send(res, 500, { error: '服务器打了个盹，请稍后再试' });
    }
  }
  return true;
}

// ---- small validation helpers ----
export function str(v: unknown, max: number, name = '内容'): string {
  if (typeof v !== 'string') throw new HttpError(400, `${name}不对`);
  const s = v.trim();
  if (!s) throw new HttpError(400, `${name}不能为空`);
  if ([...s].length > max) throw new HttpError(400, `${name}太长了`);
  return s;
}

export { cleanText } from './moderation';
