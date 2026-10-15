import { defineConfig, type Plugin } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

/** Dev server mirrors production: the website at /, the game at /play/. */
function sitePaths(): Plugin {
  return {
    name: 'site-paths',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const [path, query] = (req.url ?? '/').split('?');
        const intoGame = /(^|&)(panel|scene)=/.test(query ?? '');
        if (path === '/' && !intoGame) req.url = '/home.html' + (query ? '?' + query : '');
        else if (path.startsWith('/play/') && !path.slice(6).includes('.')) req.url = '/index.html' + (query ? '?' + query : '');
        next();
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  // the apps bundle only the game; the website is for the web build
  const native = mode === 'ios' || mode === 'android';
  const page = (name: string) => resolve(import.meta.dirname, `client/${name}.html`);
  return {
    root: 'client',
    envDir: import.meta.dirname, // .env.ios etc. live at the project root
    plugins: [preact(), sitePaths()],
    optimizeDeps: { include: ['preact', 'preact/hooks', 'preact/jsx-runtime'] },
    server: {
      host: true,
      port: 5199,
      strictPort: true,
      proxy: {
        '/api': 'http://127.0.0.1:8737',
        '/ws': { target: 'ws://127.0.0.1:8737', ws: true },
      },
    },
    build: {
      outDir: '../dist',
      emptyOutDir: true,
      rollupOptions: {
        input: { main: page('index'), companion: page('companion'), ...(native ? {} : { home: page('home') }) },
      },
    },
  };
});
