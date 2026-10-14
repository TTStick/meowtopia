import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'client',
  envDir: import.meta.dirname, // .env.ios etc. live at the project root
  plugins: [preact()],
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
      input: {
        main: resolve(import.meta.dirname, 'client/index.html'),
      },
    },
  },
});
