import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, unlinkSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');
{
  const { setWorldTz } = await import('../../shared/time');
  setWorldTz(process.env.CAT_WORLD_TZ !== undefined ? Number(process.env.CAT_WORLD_TZ) : -new Date().getTimezoneOffset() / 60);
}

const { DATA_DIR, PROD } = await import('./config');
const { handleApi } = await import('./http');
const { migrateLegacyAccounts, sessionFromRequest, sessionFromToken } = await import('./sessions');
const { allow, clientIp, LIMITS, originAllowed, securityHeaders } = await import('./security');
await import('./api');
const { onBan, onAccountDeleted } = await import('./auth');
const { startPush } = await import('./push');
const { startWorld, onConnection, kickUser } = await import('./world');
const { flushCats } = await import('./game');
const { db } = await import('./db');
const { WebSocketServer } = await import('ws');
const { llmEnabled } = await import('./llm');

migrateLegacyAccounts();
onBan((uid) => kickUser(uid));
onAccountDeleted((uid, cats) => kickUser(uid, cats));

const PORT = Number(process.env.PORT || 8737);
const DIST = resolve(process.env.CAT_DIST || 'dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
};

/** Resolve a URL path to a file inside dist, or null. No dotfiles, no escaping the folder. */
function staticFile(pathname: string): string | null {
  let rel: string;
  try {
    rel = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (rel.includes('\0') || rel.split('/').some((seg) => seg.startsWith('.') && seg !== '')) return null;
  const p = normalize(join(DIST, rel));
  if (p !== DIST && !p.startsWith(DIST + sep)) return null;
  try {
    return statSync(p).isFile() ? p : null;
  } catch {
    return null;
  }
}

const server = createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain', 'cache-control': 'no-store' }).end('ok');
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { allow: 'GET, HEAD' }).end();
      return;
    }
    // static files (production build); unknown paths fall back to the app shell
    let p = staticFile(url.pathname);
    if (!p && !extname(url.pathname)) p = staticFile('/index.html');
    if (!p) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' }).end(existsSync(join(DIST, 'index.html')) ? 'not found' : 'client not built — run `npm run build` or use the vite dev server');
      return;
    }
    const ext = extname(p);
    const body = readFileSync(p);
    securityHeaders(req, res, ext === '.html');
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'content-length': body.length,
      'cache-control': p.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) res.writeHead(500);
    res.end();
  }
});
// Idle upstream connections must outlive Caddy's (60s, see deploy/Caddyfile),
// otherwise a reused connection can be closed under a request.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 70_000;

// ---------- websocket ----------
// Browsers authenticate with the session cookie (only trusted when the page is
// ours — this blocks cross-site websocket hijacking). The native app, or any
// client without a cookie, sends {t:'auth', token} as its first message.
const MAX_CONNECTIONS = Number(process.env.CAT_MAX_CONNECTIONS || 3000);
const MAX_PER_IP = Number(process.env.CAT_MAX_CONNECTIONS_PER_IP || 30);
const perIp = new Map<string, number>();
const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, perMessageDeflate: false });

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const ip = clientIp(req);
  const reject = (code: number) => {
    socket.end(`HTTP/1.1 ${code} ${code === 429 ? 'Too Many Requests' : code === 503 ? 'Service Unavailable' : 'Forbidden'}\r\nConnection: close\r\n\r\n`);
  };
  if (url.pathname !== '/ws') return reject(404);
  if (!allow(`ws:${ip}`, ...LIMITS.wsConnect) || (perIp.get(ip) ?? 0) >= MAX_PER_IP) return reject(429);
  if (wss.clients.size >= MAX_CONNECTIONS) return reject(503);
  const origin = req.headers.origin as string | undefined;
  const sameSite = originAllowed(req, origin);
  const found = sameSite ? sessionFromRequest(req) : null;
  wss.handleUpgrade(req, socket, head, (ws) => {
    perIp.set(ip, (perIp.get(ip) ?? 0) + 1);
    ws.once('close', () => {
      const n = (perIp.get(ip) ?? 1) - 1;
      if (n <= 0) perIp.delete(ip);
      else perIp.set(ip, n);
    });
    const start = (user: { id: string; nickname: string; banned: number } | null) => {
      if (user?.banned) {
        ws.close(4003, 'banned');
        return false;
      }
      onConnection(ws, user?.id ?? null, user?.nickname ?? '路过的人');
      return true;
    };
    if (found) {
      start(found.user);
      return;
    }
    // wait briefly for an auth message; anything else means a guest viewer
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      ws.off('message', first);
      start(null);
    }, 4000);
    const first = (data: unknown) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      let m: { t?: string; token?: string } = {};
      try {
        m = JSON.parse(String(data));
      } catch {
        /* not json */
      }
      if (m.t === 'auth') {
        const s = typeof m.token === 'string' ? sessionFromToken(m.token) : null;
        start(s?.user ?? null);
      } else if (start(null)) {
        ws.emit('message', data, false); // let the world handle whatever it was
      }
    };
    ws.once('message', first);
  });
});

// ---------- daily backups (data/backups, last 7 kept) ----------
const BACKUPS = join(DATA_DIR, 'backups');
function backup() {
  try {
    mkdirSync(BACKUPS, { recursive: true });
    const day = new Date().toISOString().slice(0, 10);
    const file = join(BACKUPS, `cats-${day}.db`);
    if (existsSync(file)) return;
    flushCats();
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    const old = readdirSync(BACKUPS).filter((f) => /^cats-\d{4}-\d{2}-\d{2}\.db$/.test(f)).sort().slice(0, -7);
    for (const f of old) unlinkSync(join(BACKUPS, f));
    console.log(`[backup] ${file}`);
  } catch (e) {
    console.warn('[backup] failed', e);
  }
}
if (process.env.CAT_BACKUPS !== 'off') {
  setTimeout(backup, 60_000).unref();
  setInterval(backup, 3600_000).unref();
}

startWorld();
startPush();
const { WORLD_TZ } = await import('../../shared/time');
server.listen(PORT, () =>
  console.log(`[cat] server on :${PORT}  ${PROD ? 'production' : 'development'}  llm=${llmEnabled() ? 'on' : 'off (fallback speech)'}  world clock UTC${WORLD_TZ >= 0 ? '+' : ''}${WORLD_TZ}  data=${DATA_DIR}`),
);

let closing = false;
const shutdown = () => {
  if (closing) return;
  closing = true;
  try {
    flushCats();
    db.close();
  } finally {
    process.exit(0);
  }
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
