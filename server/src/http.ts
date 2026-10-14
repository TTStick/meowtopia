import type { IncomingMessage, ServerResponse } from 'node:http';
import { getUserByToken, updateUser, type UserRow } from './db';

export class HttpError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export interface Req {
  method: string;
  path: string;
  params: Record<string, string>;
  query: URLSearchParams;
  body: any;
  user: UserRow;
  raw: IncomingMessage;
}

type Handler = (r: Req) => unknown | Promise<unknown>;

interface Route {
  method: string;
  re: RegExp;
  keys: string[];
  h: Handler;
  auth: boolean;
}

const routes: Route[] = [];

export function route(method: string, pattern: string, h: Handler, auth = true) {
  const keys: string[] = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => (keys.push(k), '([^/]+)')) + '$');
  routes.push({ method, re, keys, h, auth });
}

async function readBody(req: IncomingMessage): Promise<any> {
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > 256 * 1024) throw new HttpError(413, '内容太大了');
    chunks.push(c as Buffer);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, '格式不对');
  }
}

export function send(res: ServerResponse, status: number, data: unknown) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' });
  res.end(body);
}

export function authUser(token: string | null | undefined): UserRow | undefined {
  if (!token) return undefined;
  return getUserByToken(token);
}

export async function handleApi(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://x');
  if (!url.pathname.startsWith('/api/')) return false;
  const method = req.method ?? 'GET';
  for (const r of routes) {
    if (r.method !== method) continue;
    const m = r.re.exec(url.pathname);
    if (!m) continue;
    try {
      const params: Record<string, string> = {};
      r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      let user: UserRow | undefined;
      if (r.auth) {
        const h = req.headers.authorization;
        user = authUser(h?.startsWith('Bearer ') ? h.slice(7) : null);
        if (!user) throw new HttpError(401, '请先登录');
        const now = Date.now();
        if (now - user.last_seen > 60_000) updateUser(user.id, { last_seen: now });
      }
      const body = await readBody(req);
      const out = await r.h({ method, path: url.pathname, params, query: url.searchParams, body, user: user!, raw: req });
      send(res, 200, out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) send(res, e.status, { error: e.message });
      else {
        console.error('[api]', method, url.pathname, e);
        send(res, 500, { error: '服务器打了个盹，请稍后再试' });
      }
    }
    return true;
  }
  send(res, 404, { error: 'not found' });
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

const BAD = /(微信|weixin|vx|v信|qq|电话|手机号|加我|私聊|扣扣|telegram|whatsapp|https?:\/\/|www\.|\.com|\.cn|傻|蠢|滚|死|操|艹|妈的|垃圾|贱|婊)/i;
/** Gentle community filter: no contact info, links, or insults. */
export function cleanText(s: string): string {
  if (BAD.test(s) || /\d{5,}/.test(s.replace(/\s/g, ''))) throw new HttpError(400, '这句话不太适合猫猫小镇哦，换个说法吧');
  return s;
}
