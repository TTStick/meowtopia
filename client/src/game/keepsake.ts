// A moving package kept on this device. Once a day or so the app asks its town for
// a fresh, signed copy of the cat (the same package as 搬家), so that even if the
// town closes for good, the cat can still move to another one from here.
import { api } from './net';
import { isNative, saveFile, SERVER } from './platform';
import { ui } from './state';
import type { MovePackage } from './account';
import type { CatGenes } from '../../../shared/types';

export interface Keepsake {
  server: string; // the town it came from
  at: number;
  cat: { name: string; genes: CatGenes | null; born: number };
  pkg: MovePackage;
}

const KEY = 'catnest.keepsakes';
const FRESH = 20 * 3600_000;

function all(): Record<string, Keepsake> {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return v && typeof v === 'object' ? v : {};
  } catch {
    return {};
  }
}
function store(v: Record<string, Keepsake>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* full or private mode: the player can still pack by hand */
  }
}

/** Every package this device holds, newest first. */
export const keepsakes = (): Keepsake[] => Object.values(all()).sort((a, b) => b.at - a.at);
/** The one from the town we're in. */
export const keepsakeHere = (): Keepsake | null => all()[SERVER] ?? null;
/** The ones from other towns (what you could move in with here). */
export const keepsakesFromElsewhere = (): Keepsake[] => keepsakes().filter((k) => k.server !== SERVER);

let busy = false;
/** Ask the town for a fresh copy if ours is old (or missing). Quiet: failures just wait for next time. */
export async function refreshKeepsake(force = false) {
  if (!isNative) return; // a website can't be opened once its town is gone, so only the apps keep one
  const me = ui.state.me;
  const own = me?.cats.find((c) => c.ownerId === me.user.id && !c.coOwnerId);
  if (!me || !own || busy) return;
  const had = all()[SERVER];
  if (!force && had && Date.now() - had.at < FRESH) return;
  busy = true;
  try {
    const pkg = await api<MovePackage>('POST', '/api/move/export', { keep: true });
    store({ ...all(), [SERVER]: { server: SERVER, at: Date.now(), cat: { name: own.name, genes: own.genes, born: own.born }, pkg } });
  } catch {
    /* next time */
  } finally {
    busy = false;
  }
}

/** Signing out or leaving a town: don't keep its cat on this device. */
export function dropKeepsake(server = SERVER) {
  const v = all();
  delete v[server];
  store(v);
}

/** Save a kept package as a file, to take to a town in a browser or on another device. */
export async function saveKeepsakeFile(k: Keepsake) {
  const d = new Date(k.at);
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  await saveFile(`猫窝搬家包-${k.cat.name}-${day}.json`, new Blob([JSON.stringify(k.pkg)], { type: 'application/json' }), '猫窝搬家包');
}
