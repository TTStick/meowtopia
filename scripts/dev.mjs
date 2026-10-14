// Runs the API/WS server and the Vite dev server together.
import { spawn } from 'node:child_process';

const node = process.execPath;
const procs = [
  spawn(node, ['--import', 'tsx', '--watch', '--watch-preserve-output', 'server/src/main.ts'], { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'development' } }),
  spawn(node, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit' }),
];
const stop = () => procs.forEach((p) => p.kill('SIGTERM'));
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
for (const p of procs) p.on('exit', (code) => { if (code) console.error('child exited', code); });
