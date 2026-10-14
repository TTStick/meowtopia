import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';

if (existsSync('.env')) process.loadEnvFile('.env');

const { handleApi, authUser } = await import('./http');
await import('./api');
const { startPush } = await import('./push');
const { startWorld, onConnection } = await import('./world');
const { flushCats } = await import('./game');
const { WebSocketServer } = await import('ws');
const { llmEnabled } = await import('./llm');

const PORT = Number(process.env.PORT || 8787);
const DIST = resolve('dist');
const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2',
};

const server = createServer(async (req, res) => {
  try {
    if (await handleApi(req, res)) return;
    // static files (production build)
    const url = new URL(req.url ?? '/', 'http://x');
    let p = join(DIST, decodeURIComponent(url.pathname));
    if (!p.startsWith(DIST)) {
      res.writeHead(403).end();
      return;
    }
    if (!existsSync(p) || statSync(p).isDirectory()) p = join(DIST, 'index.html');
    if (!existsSync(p)) {
      res.writeHead(404, { 'content-type': 'text/plain' }).end('client not built — run `npm run build` or use the vite dev server');
      return;
    }
    const ext = extname(p);
    res.writeHead(200, {
      'content-type': MIME[ext] ?? 'application/octet-stream',
      'cache-control': p.includes('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache',
    });
    res.end(readFileSync(p));
  } catch (e) {
    console.error(e);
    res.writeHead(500).end();
  }
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname !== '/ws') {
    socket.destroy();
    return;
  }
  const user = authUser(url.searchParams.get('t'));
  wss.handleUpgrade(req, socket, head, (ws) => onConnection(ws, user?.id ?? null, user?.nickname ?? '路过的人'));
});

startWorld();
startPush();
server.listen(PORT, () => console.log(`[cat] server on http://localhost:${PORT}  llm=${llmEnabled() ? 'on' : 'off (fallback speech)'}`));

const shutdown = () => {
  flushCats();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
