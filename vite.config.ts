import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { resolve } from 'node:path';

export default defineConfig({
  root: 'client',
  plugins: [preact()],
  optimizeDeps: { include: ['preact', 'preact/hooks', 'preact/jsx-runtime'] },
  server: {
    host: true,
    port: 5199,
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
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
