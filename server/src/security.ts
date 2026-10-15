// Request-level protections: client IP behind a proxy, rate limits, origin
// checks (CSRF / cross-site websocket), and security headers.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { isIP } from 'node:net';
import { EXTRA_ORIGINS, PROD, TRUST_PROXY } from './config';

// ---------- client IP ----------
function isPrivate(ip: string): boolean {
  const v4 = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (isIP(v4) === 4) {
    const [a, b] = v4.split('.').map(Number);
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return ip === '::1' || /^f[cd]/i.test(ip) || /^fe80:/i.test(ip);
}

/**
 * The client's address. X-Forwarded-For is only honoured when the direct peer
 * is a trusted proxy (loopback/private network, e.g. Caddy next to us), and we
 * take the right-most address that isn't itself private.
 */
export function clientIp(req: IncomingMessage): string {
  const peer = req.socket.remoteAddress ?? '';
  if (TRUST_PROXY === 'none' || !isPrivate(peer)) return peer;
  const xff = req.headers['x-forwarded-for'];
  if (!xff) return peer;
  const chain = String(xff).split(',').map((s) => s.trim()).filter(Boolean);
  for (let i = chain.length - 1; i >= 0; i--) if (!isPrivate(chain[i])) return chain[i];
  return chain[0] ?? peer;
}

// ---------- rate limiting (token buckets) ----------
const buckets = new Map<string, { tokens: number; at: number }>();

/** Returns true if allowed. `capacity` tokens, refilled at `perSecond`. */
export function allow(key: string, capacity: number, perSecond: number, cost = 1): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, at: now };
    buckets.set(key, b);
  }
  b.tokens = Math.min(capacity, b.tokens + ((now - b.at) / 1000) * perSecond);
  b.at = now;
  if (b.tokens < cost) return false;
  b.tokens -= cost;
  return true;
}

setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [k, b] of buckets) if (b.at < cutoff) buckets.delete(k);
}, 5 * 60_000).unref();

/** Common limits, expressed as [capacity, refill per second]. */
export const LIMITS = {
  ipGlobal: [240, 4] as const, // any API call per IP
  register: [Number(process.env.CAT_REGISTER_PER_HOUR || 6), Number(process.env.CAT_REGISTER_PER_HOUR || 6) / 3600] as const, // new guests per IP
  login: [10, 10 / 900] as const, // recovery-code / passkey logins per IP
  pair: [12, 12 / 600] as const, // watches asking for a pairing code, per IP
  llm: [30, 30 / 600] as const, // model-backed calls per user
  write: [60, 1] as const, // state-changing calls per user
  report: [20, 20 / 86400] as const,
  wsConnect: [20, 20 / 60] as const, // websocket connections per IP
};

// ---------- origins ----------
/**
 * The native apps load the game from their own bundle (capacitor://localhost on
 * iOS, https://localhost on Android) and talk to us cross-origin with a bearer
 * token. Requests from these origins never get cookie sessions.
 */
export const APP_ORIGINS = ['capacitor://localhost', 'ionic://localhost', 'https://localhost'];
export function isAppOrigin(origin: string | undefined): boolean {
  return !!origin && APP_ORIGINS.includes(origin);
}

/** Is this request coming from a native app (and not from our own site, which might be https://localhost)? */
export function fromApp(req: IncomingMessage): boolean {
  const origin = req.headers.origin as string | undefined;
  if (!isAppOrigin(origin)) return false;
  const host = requestHost(req);
  return origin !== `https://${host}` && origin !== `http://${host}`;
}

/** CORS for the native app: no credentials, only our own headers. */
export function corsHeaders(req: IncomingMessage, res: ServerResponse): boolean {
  const origin = req.headers.origin as string | undefined;
  if (!fromApp(req)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin!);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-catnest');
  res.setHeader('Access-Control-Max-Age', '600');
  return true;
}

function requestHost(req: IncomingMessage): string {
  return String(req.headers['x-forwarded-host'] ?? req.headers.host ?? '').split(',')[0].trim().toLowerCase();
}

/** Same-origin, an explicitly configured origin, or localhost during development. */
export function originAllowed(req: IncomingMessage, origin: string | undefined): boolean {
  if (!origin) return true; // non-browser clients (curl, scripts) send no Origin
  if (EXTRA_ORIGINS.includes(origin) || APP_ORIGINS.includes(origin)) return true;
  let u: URL;
  try {
    u = new URL(origin);
  } catch {
    return false;
  }
  if (u.host.toLowerCase() === requestHost(req)) return true;
  if (!PROD && (u.hostname === 'localhost' || u.hostname === '127.0.0.1')) return true;
  return false;
}

export function isHttps(req: IncomingMessage): boolean {
  return String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https' || !!(req.socket as { encrypted?: boolean }).encrypted;
}

// ---------- headers ----------
export function securityHeaders(req: IncomingMessage, res: ServerResponse, html: boolean) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  if (isHttps(req)) res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  if (html) {
    const host = requestHost(req);
    const ws = host ? (isHttps(req) ? ` wss://${host}` : ` ws://${host} wss://${host}`) : '';
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob:",
        "font-src 'self'",
        `connect-src 'self'${ws}`,
        "worker-src 'self' blob:",
        "manifest-src 'self'",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "frame-ancestors 'none'",
      ].join('; '),
    );
  }
}
