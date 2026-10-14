import type { ClientMsg, ServerMsg } from '../../../shared/protocol';

// Browsers are signed in with an HttpOnly cookie the page can't read. The native
// app (no shared cookie jar with the server) holds a bearer token instead.
let bearer: string | null = null;
export function setBearer(t: string | null) {
  bearer = t;
}

const LEGACY_KEY = 'catnest.token';
/** Token from older versions that kept it in localStorage; moved to a cookie once. */
export function takeLegacyToken(): string | null {
  try {
    const t = localStorage.getItem(LEGACY_KEY);
    return t;
  } catch {
    return null;
  }
}
export function clearLegacyToken() {
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    /* private mode */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, msg: string) {
    super(msg);
    this.status = status;
  }
}

export async function api<T = any>(method: string, path: string, body?: unknown, auth?: string): Promise<T> {
  const headers: Record<string, string> = { 'x-catnest': '1' };
  const t = auth ?? bearer;
  if (t) headers.authorization = `Bearer ${t}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError(0, '网络好像断开了');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Only trust auth failures that come from our own server (JSON {error}); anything else is a hiccup.
    const ours = data && typeof data.error === 'string';
    throw new ApiError(ours ? res.status : res.status === 401 ? 502 : res.status, ours ? data.error : '服务器暂时连不上');
  }
  return data as T;
}

type Handler = (m: ServerMsg) => void;

/** Auto-reconnecting websocket for the shared world. */
export class WorldSocket {
  private ws: WebSocket | null = null;
  private handlers = new Set<Handler>();
  private queue: ClientMsg[] = [];
  private closed = false;
  private retry = 0;
  private pingTimer: any;
  connected = false;
  onState?: (connected: boolean) => void;
  onKicked?: () => void;

  connect() {
    this.closed = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws = ws;
    ws.onopen = () => {
      if (bearer) ws.send(JSON.stringify({ t: 'auth', token: bearer }));
      this.connected = true;
      this.retry = 0;
      this.onState?.(true);
      for (const m of this.queue) ws.send(JSON.stringify(m));
      this.queue = [];
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.send({ t: 'ping' }), 25_000);
    };
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(ev.data);
      } catch {
        return;
      }
      this.handlers.forEach((h) => h(m));
    };
    ws.onclose = (ev) => {
      this.connected = false;
      this.onState?.(false);
      clearInterval(this.pingTimer);
      if (ev.code === 4003) {
        // signed out elsewhere, deleted or suspended: don't hammer the server
        this.closed = true;
        this.onKicked?.();
      }
      if (this.closed) return;
      const d = Math.min(10_000, 800 * 2 ** this.retry++);
      setTimeout(() => !this.closed && this.connect(), d);
    };
  }

  close() {
    this.closed = true;
    this.ws?.close();
    this.ws = null;
  }

  send(m: ClientMsg) {
    if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(m));
    else if (m.t !== 'pos' && m.t !== 'ping') this.queue.push(m);
  }

  on(h: Handler) {
    this.handlers.add(h);
    return () => this.handlers.delete(h);
  }
}
