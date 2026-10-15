// Web vs. native app (Capacitor). The app ships the game inside its bundle and
// talks to the server cross-origin with a bearer token kept in the Keychain.
import { Capacitor, registerPlugin, SystemBars, SystemBarsStyle } from '@capacitor/core';

export const isNative = Capacitor.isNativePlatform();

/** Running inside the 猫窝 Mac app (a native window around the website). */
export const isMacShell = typeof navigator !== 'undefined' && /CatNestMac/.test(navigator.userAgent);
type MacMsg = { type: string; [k: string]: unknown };
export function toMac(m: MacMsg) {
  (window as { webkit?: { messageHandlers?: { catnest?: { postMessage(m: MacMsg): void } } } }).webkit?.messageHandlers?.catnest?.postMessage(m);
}
export const platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'

/** The public server the apps connect to unless a build says otherwise. */
export const OFFICIAL_SERVER = 'https://mycat.xioix.xin';

/** Where the API lives. Empty for the website (same origin); app builds use VITE_API_BASE, or the public server. */
export const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || (Capacitor.isNativePlatform() ? OFFICIAL_SERVER : '')).replace(/\/$/, '');

export function wsUrl(): string {
  const base = API_BASE || location.origin;
  return base.replace(/^http/, 'ws') + '/ws';
}

// ---------- session token (native only; the website uses an HttpOnly cookie) ----------
interface CatNativePlugin {
  get(o: { key: string }): Promise<{ value: string | null }>;
  set(o: { key: string; value: string }): Promise<void>;
  remove(o: { key: string }): Promise<void>;
  shareFile(o: { name: string; base64: string }): Promise<{ completed: boolean; saved?: boolean }>;
  watchState(): Promise<{ supported: boolean; paired: boolean; installed: boolean }>;
  sendToWatch(o: { token: string; server: string }): Promise<void>;
  // Android: letters from the cat, checked in the background (no Google services needed)
  enableLetters(o: { server: string; prompt: boolean }): Promise<{ granted: boolean }>;
  setBackdrop(o: { color: string }): Promise<void>;
  disableLetters(): Promise<void>;
  sampleLetter(o: { title: string; body: string }): Promise<void>;
  addListener(event: 'open', fn: (e: { panel: string }) => void): Promise<{ remove(): void }>;
}
const Native = registerPlugin<CatNativePlugin>('CatNative');
const TOKEN_KEY = 'session';

export async function loadToken(): Promise<string | null> {
  if (!isNative) return null;
  try {
    return (await Native.get({ key: TOKEN_KEY })).value;
  } catch {
    return null;
  }
}
export async function saveToken(t: string | null) {
  if (!isNative) return;
  try {
    if (t) await Native.set({ key: TOKEN_KEY, value: t });
    else await Native.remove({ key: TOKEN_KEY });
  } catch (e) {
    console.warn('keychain', e);
  }
}

// ---------- Apple Watch ----------
const HANDOFF_KEY = 'catnest.watchHandoff';
/**
 * If the 猫窝 watch app is installed on a paired watch, give it its own session
 * (minted by the server) so it signs in without typing a code. Once per account.
 */
export async function handOffToWatch(account: string, mint: () => Promise<string>) {
  if (!isNative || platform !== 'ios') return;
  const st = await Native.watchState().catch(() => null);
  if (!st?.installed) return;
  try {
    if (localStorage.getItem(HANDOFF_KEY) === account) return;
  } catch {
    /* ignore */
  }
  const token = await mint();
  await Native.sendToWatch({ token, server: API_BASE });
  try {
    localStorage.setItem(HANDOFF_KEY, account);
  } catch {
    /* ignore */
  }
}

// ---------- haptics ----------
type Buzz = 'tap' | 'soft' | 'happy' | 'purr';
let lastBuzz = 0;
let selecting = false;
export function haptic(kind: Buzz) {
  if (!isNative) return;
  const now = Date.now();
  if (kind !== 'happy' && now - lastBuzz < 120) return;
  lastBuzz = now;
  void import('@capacitor/haptics').then(({ Haptics, ImpactStyle, NotificationType }) => {
    if (kind === 'tap') return Haptics.impact({ style: ImpactStyle.Light });
    if (kind === 'soft') {
      // the selection buzz only fires between selectionStart/End, on both iOS and Android
      if (!selecting) {
        selecting = true;
        void Haptics.selectionStart();
      }
      return Haptics.selectionChanged();
    }
    if (kind === 'happy') return Haptics.notification({ type: NotificationType.Success });
    // a purr: a few gentle, uneven pulses
    const beats = [0, 160, 330, 470, 640];
    for (const t of beats) setTimeout(() => void Haptics.impact({ style: ImpactStyle.Light }), t);
  });
}

// ---------- status bar ----------
let barDark: boolean | null = null;
/** dark = the content under the status bar is dark, so the clock should be light. */
export function statusBarOver(dark: boolean) {
  if (!isNative || barDark === dark) return;
  barDark = dark;
  // Android: tell Capacitor's own SystemBars, which otherwise re-applies the device theme on every configuration change
  if (platform === 'android') void SystemBars.setStyle({ style: dark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }).catch(() => {});
  else void import('@capacitor/status-bar').then(({ StatusBar, Style }) => StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light }).catch(() => {}));
}

let backdrop = '';
/**
 * Match the system bars to what's actually at the top of the screen: light or dark
 * icons by brightness, and on Android the colour behind the bars too (older WebViews
 * are padded away from them).
 */
export function matchSystemBars(rgb: [number, number, number]) {
  if (!isNative) return;
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255;
  statusBarOver(lum < 0.55);
  if (platform !== 'android') return;
  const hex = '#' + rgb.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
  if (hex === backdrop) return;
  backdrop = hex;
  void Native.setBackdrop({ color: hex }).catch(() => {});
}

let splashHidden = false;
export function hideSplash() {
  if (!isNative || splashHidden) return;
  splashHidden = true;
  void import('@capacitor/splash-screen').then(({ SplashScreen }) => SplashScreen.hide({ fadeOutDuration: 300 }).catch(() => {}));
}

// ---------- files ----------
/**
 * Save or share a file: the share sheet where available (phones, the app), a download otherwise.
 * Resolves true when it also went straight into the gallery (photos on Android).
 */
export async function saveFile(name: string, blob: Blob, title = '猫窝'): Promise<boolean> {
  if (isNative) {
    // the web share/download paths need a fresh user gesture, which is gone after an await
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return !!(await Native.shareFile({ name, base64: btoa(bin) })).saved;
  }
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title });
      return false;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return false;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return false;
}

// ---------- Android back button ----------
const backClosers: (() => void)[] = [];

/** Something small and local (the "say something" bar…) that back should close first. Returns the unregister. */
export function closeOnBack(close: () => void): () => void {
  backClosers.push(close);
  return () => {
    const i = backClosers.indexOf(close);
    if (i >= 0) backClosers.splice(i, 1);
  };
}

/** `handler` returns true when it handled the press; otherwise the app goes to the background. */
export function onBackButton(handler: () => boolean) {
  if (platform !== 'android') return;
  void import('@capacitor/app').then(({ App }) =>
    App.addListener('backButton', () => {
      const close = backClosers.pop();
      if (close) close();
      else if (!handler()) void App.minimizeApp();
    }),
  );
}

// ---------- app lifecycle ----------
export function onResume(fn: () => void) {
  if (isNative) {
    void import('@capacitor/app').then(({ App }) => App.addListener('resume', fn));
  } else {
    document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && fn());
  }
}

// ---------- native push (APNs) ----------
const APNS_ENV = (import.meta.env.VITE_APNS_ENV as string | undefined) === 'production' ? 'production' : 'sandbox';

/** Ask for permission and hand the device token to `send`. Resolves false if the player said no. */
export async function enableNativePush(send: (token: string, env: string) => Promise<unknown>): Promise<boolean> {
  if (platform === 'android') {
    // Android: the app itself looks for new letters now and then (FCM isn't available everywhere)
    return (await Native.enableLetters({ server: API_BASE, prompt: true })).granted;
  }
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') return false;
  const token = await new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('暂时拿不到通知权限，稍后再试')), 15_000);
    void PushNotifications.addListener('registration', (t) => (clearTimeout(timer), resolve(t.value)));
    void PushNotifications.addListener('registrationError', (e) => (clearTimeout(timer), reject(new Error(e.error || '注册通知失败'))));
    void PushNotifications.register();
  });
  await send(token, APNS_ENV);
  return true;
}

/** Notifications turned off. On iOS the server simply stops pushing; Android stops looking. */
export async function disableNativePush() {
  if (platform === 'android') await Native.disableLetters();
}

/** Right after turning notifications on: one little note so the player sees what they look like. */
export async function sampleNotification(title: string, body: string, viaServer: () => Promise<unknown>) {
  if (platform === 'android') await Native.sampleLetter({ title, body });
  else await viaServer();
}

/** Re-register silently on launch (tokens can change) and route taps on a notification. */
export async function initNativePush(send: (token: string, env: string) => Promise<unknown>, onOpen: () => void, wanted = true) {
  if (!isNative) return;
  if (platform === 'android') {
    void Native.addListener('open', () => onOpen());
    if (wanted) await Native.enableLetters({ server: API_BASE, prompt: false });
    else await Native.disableLetters();
    return;
  }
  const { PushNotifications } = await import('@capacitor/push-notifications');
  void PushNotifications.addListener('pushNotificationActionPerformed', () => onOpen());
  const perm = await PushNotifications.checkPermissions();
  if (perm.receive !== 'granted') return;
  void PushNotifications.addListener('registration', (t) => void send(t.value, APNS_ENV).catch(() => {}));
  await PushNotifications.register();
}
