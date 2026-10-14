import type { ClientMsg, ServerMsg } from '../../../shared/protocol';

const TOKEN_KEY = 'catnest.token';

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}
export function setToken(t: string | null) {
  try {
    if (t) localStorage.setItem(TOKEN_KEY, t);
    else localStorage.removeItem(TOKEN_KEY);
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

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = {};
  const t = getToken();
  if (t) headers.authorization = `Bearer ${t}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
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

  connect() {
    this.closed = false;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?t=${encodeURIComponent(getToken() ?? '')}`);
    this.ws = ws;
    ws.onopen = () => {
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
    ws.onclose = () => {
      this.connected = false;
      this.onState?.(false);
      clearInterval(this.pingTimer);
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
