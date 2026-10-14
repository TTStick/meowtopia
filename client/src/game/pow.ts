import { api } from './net';

export interface PowSolution {
  c: string;
  d: number;
  e: number;
  s: string;
  n: string;
}

/** Fetch a challenge and solve it in a worker, off the main thread. */
export async function solvePow(): Promise<PowSolution> {
  const ch = await api<{ c: string; d: number; e: number; s: string }>('GET', '/api/auth/pow');
  const w = new Worker(new URL('./pow.worker.ts', import.meta.url), { type: 'module' });
  try {
    const n = await new Promise<string>((resolve, reject) => {
      w.onmessage = (ev) => resolve(ev.data.n);
      w.onerror = () => reject(new Error('验证没能完成，刷新页面再试试'));
      w.postMessage({ c: ch.c, d: ch.d });
    });
    return { ...ch, n };
  } finally {
    w.terminate();
  }
}

let pending: Promise<PowSolution> | null = null;
/** Start solving early (e.g. while the player types a nickname). */
export function prepareGuest(): Promise<PowSolution> {
  if (!pending) {
    pending = solvePow();
    pending.catch(() => (pending = null));
  }
  return pending;
}
export function takeGuestPow(): Promise<PowSolution> {
  const p = prepareGuest();
  pending = null;
  return p;
}
