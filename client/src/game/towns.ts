// The towns (servers) a player knows: the official trial town, plus any they add.
// Each town is its own server with its own accounts; switching is in platform.ts.
import { OFFICIAL_SERVER, DEFAULT_SERVER, SERVER } from './platform';

export interface Town {
  url: string; // an origin: https://cat.example.com
  builtin?: boolean;
}

export interface TownStatus {
  ok: boolean;
  trial?: boolean;
  mode?: 'open' | 'paused' | 'closed';
}

const LIST_KEY = 'catnest.towns';

/** "cat.example.com", "https://cat.example.com/play/" → "https://cat.example.com"; null if it isn't a web address. */
export function normalizeTown(input: string): string | null {
  let s = input.trim();
  if (!s) return null;
  if (!/^[a-z]+:\/\//i.test(s)) s = (/^(localhost|127\.0\.0\.1|10\.|192\.168\.)/.test(s) ? 'http://' : 'https://') + s;
  try {
    const u = new URL(s);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return null;
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.origin;
  } catch {
    return null;
  }
}

function saved(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(LIST_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function save(list: string[]) {
  try {
    localStorage.setItem(LIST_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

/** The official town first, then the ones the player added; the current town is always in the list. */
export function towns(): Town[] {
  const out: Town[] = [{ url: OFFICIAL_SERVER, builtin: true }];
  for (const url of [DEFAULT_SERVER, SERVER, ...saved()]) if (url && !out.some((t) => t.url === url)) out.push({ url });
  return out;
}

export function addTown(url: string) {
  if (url === OFFICIAL_SERVER) return;
  save([...saved().filter((u) => u !== url), url]);
}

export function removeTown(url: string) {
  save(saved().filter((u) => u !== url));
}

export const isOfficial = (url: string) => url === OFFICIAL_SERVER;

export function townName(url: string): string {
  if (isOfficial(url)) return '官方体验服';
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/** Is a town up? Asks its public status (a plain GET, so any page or app may ask). */
export async function checkTown(url: string): Promise<TownStatus> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 6000);
  try {
    const r = await fetch(`${url}/api/status`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) return { ok: false };
    const s = await r.json();
    return typeof s?.worldTz === 'number' ? { ok: true, trial: !!s.trial, mode: s.mode ?? 'open' } : { ok: false };
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(timer);
  }
}
