// Whether the town is open. An admin can pause it (暂停: it'll be back) or close it
// (关服: for good). Either way the town stands still and the game itself is shut,
// but players can still sign in, on the website too, and pack their cat up to take
// to another town. Set from the admin panel; kept in the kv table.
import { kvGet, kvSet } from './db';

export type TownMode = 'open' | 'paused' | 'closed';

export interface ModeState {
  mode: TownMode;
  notice: string; // what players see
  since: number;
}

export const DEFAULT_NOTICE: Record<Exclude<TownMode, 'open'>, string> = {
  paused: '小镇暂停开放一阵子，会再回来的。这段时间可以把猫猫打包带走，搬到你自己或别人开的小镇。',
  closed: '这个小镇要关门了，谢谢你来过。请把猫猫打包带走，搬到你自己或别人开的小镇，它会带着猫窝、背包和日记一起过去。',
};

const KEY = 'town:mode';
let state: ModeState | null = null;
const listeners: ((s: ModeState) => void)[] = [];

export function townMode(): ModeState {
  return (state ??= kvGet<ModeState>(KEY) ?? { mode: 'open', notice: '', since: 0 });
}
export const isOpen = () => townMode().mode === 'open';

export function setTownMode(mode: TownMode, notice = ''): ModeState {
  state = { mode, notice: mode === 'open' ? '' : notice.trim() || DEFAULT_NOTICE[mode], since: Date.now() };
  kvSet(KEY, state);
  for (const l of listeners) l(state);
  return state;
}

export function onModeChange(l: (s: ModeState) => void) {
  listeners.push(l);
}

/**
 * What still works while the town is paused or closed: reading (GET), signing in
 * (but not signing up), packing the cat, withdrawing a move, deleting the account,
 * and the admin panel.
 */
export function allowedWhileShut(method: string, path: string): boolean {
  if (method === 'GET' || method === 'HEAD') return true;
  if (path.startsWith('/api/admin/')) return true;
  if (path.startsWith('/api/auth/')) return path !== '/api/auth/guest';
  if (path === '/api/move/export' || path === '/api/account/delete') return true;
  if (path === '/api/move/request') return method === 'DELETE';
  return false;
}

// ---------- who can come in: the website and the web version can be turned off ----------
/**
 * site: the homepage and the guide. web: the game in a browser. With the web version
 * off, only the apps (iOS, Android, Mac, Watch) sign in and play; a browser that's
 * already signed in may still get a recovery code (to sign in from an app) or pack
 * the cat up, so nobody is left without a way to their cat.
 */
export interface Access {
  site: boolean;
  web: boolean;
}
const ACCESS_KEY = 'town:access';
let access: Access | null = null;

export function townAccess(): Access {
  return (access ??= { site: true, web: true, ...kvGet<Partial<Access>>(ACCESS_KEY) });
}

export function setTownAccess(next: Partial<Access>): Access {
  access = { ...townAccess(), ...next };
  kvSet(ACCESS_KEY, access);
  return access;
}

/**
 * Pictures of the cats and residents are public, and open whatever the web version's state:
 * the Mac menu bar fetches its cat's frames with a plain URLSession, which on macOS carries the
 * web pages' sign-in cookie but not the app's name, so it can't be told apart from a browser.
 */
export function publicPicture(method: string, path: string): boolean {
  return method === 'GET' && path.startsWith('/api/sprite/');
}

/** What a browser that's already signed in may still do while the web version is off. */
export function allowedOnClosedWeb(method: string, path: string): boolean {
  if (method === 'GET') return path === '/api/me' || path === '/api/account/export' || path === '/api/move/request';
  return ['/api/auth/recovery-code', '/api/move/export', '/api/auth/logout', '/api/account/delete'].includes(path);
}
