// Account protection and sign-in: passkeys, recovery codes, devices, export, delete.
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api, setBearer } from './net';
import { isNative, isMacShell, saveToken, saveFile } from './platform';
import { ui } from './state';
import type { MeResponse } from '../../../shared/types';

export interface AuthState {
  hasCode: boolean;
  codeAt: number | null;
  passkeys: { id: string; name: string; created: number; lastUsed: number | null; synced: boolean }[];
  sessions: { id: string; agent: string; created: number; lastUsed: number; current: boolean; kind: string }[];
}

// In the app the page isn't served from our domain, so WebAuthn can't bind to it (yet).
export const passkeysSupported = () => !isNative && !isMacShell && typeof window !== 'undefined' && window.isSecureContext && browserSupportsWebAuthn();

/** Sign-in responses carry a token for the app (the website gets a cookie instead). */
async function adopt(r: { me: MeResponse; token?: string }): Promise<MeResponse> {
  if (r.token) {
    setBearer(r.token);
    await saveToken(r.token);
  }
  return r.me;
}
const client = isNative ? 'app' : 'web';

export async function guestLogin(body: Record<string, unknown>): Promise<MeResponse> {
  return adopt(await api('POST', '/api/auth/guest', { ...body, client }));
}

/** Sign a watch (or another small device) in: it shows a code, we approve it here. */
export function approveDevice(code: string) {
  return api<{ ok: boolean; name: string }>('POST', '/api/auth/device/approve', { code });
}

export function registerApns(token: string, env: string) {
  return api('POST', '/api/push/apns', { token, env });
}

export function authState() {
  return api<AuthState>('GET', '/api/auth/state');
}

function deviceName(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return '安卓手机';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows 电脑';
  return '这台设备';
}

function friendly(e: unknown): Error {
  const name = (e as { name?: string })?.name;
  if (name === 'NotAllowedError' || name === 'AbortError') return new Error('已取消');
  if (name === 'InvalidStateError') return new Error('这台设备已经绑定过啦');
  if (name === 'SecurityError') return new Error('这个网址暂时用不了通行密钥，先用找回码吧');
  if (name === 'NotSupportedError') return new Error('这台设备不支持通行密钥，先用找回码吧');
  return new Error('通行密钥没有成功，再试一次或者用找回码吧');
}

export async function addPasskey() {
  const options = await api('POST', '/api/auth/passkey/register-options');
  let response;
  try {
    response = await startRegistration({ optionsJSON: options });
  } catch (e) {
    throw friendly(e);
  }
  await api('POST', '/api/auth/passkey/register', { response, name: deviceName() });
}

export async function passkeyLogin(): Promise<MeResponse> {
  const { cid, options } = await api('POST', '/api/auth/passkey/login-options');
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options });
  } catch (e) {
    throw friendly(e);
  }
  return adopt(await api('POST', '/api/auth/passkey/login', { cid, response, client }));
}

export async function codeLogin(code: string): Promise<MeResponse> {
  return adopt(await api('POST', '/api/auth/code', { code, client }));
}

export async function newRecoveryCode(): Promise<string> {
  const r = await api<{ code: string }>('POST', '/api/auth/recovery-code');
  return r.code;
}

/** Today as 2026-10-18, in the player's own time zone (for file names). */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export async function exportData() {
  const data = await api('GET', '/api/account/export');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  await saveFile(`猫窝-${today()}.json`, blob);
}

// ---------------- 搬家: moving a cat between 猫窝 towns ----------------
export interface MovePackage {
  format: 'catnest-move';
  v: 1;
  key: string;
  body: string;
  sig: string;
}
export interface MoveSummary {
  nickname: string;
  createdAt: number;
  fish: number;
  items: number;
  found: number;
  cat: { name: string; coat: string; days: number; places: number; diary: number; bond: number };
  left: string[];
  flags: string[];
}
export interface MoveRequest {
  id: number;
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  reason: string | null;
  created: number;
  decided: number | null;
  origin: string;
  summary: MoveSummary;
}
export interface MoveStatus {
  request: MoveRequest | null;
  out: { at: number; cat: string } | null;
  fingerprint: string;
}

export const moveStatus = () => api<MoveStatus>('GET', '/api/move/request');

/** Pack the cat up into a signed file to take to another town. */
export async function packForMove(catName: string) {
  const pkg = await api<MovePackage>('POST', '/api/move/export');
  const blob = new Blob([JSON.stringify(pkg)], { type: 'application/json' });
  await saveFile(`猫窝搬家包-${catName}-${today()}.json`, blob, '猫窝搬家包');
}

/** Read a moving package from a file the player picked (only its shape; the server checks the signature). */
export async function readMoveFile(f: File): Promise<MovePackage> {
  if (f.size > 700 * 1024) throw new Error('这个文件太大了，不像是搬家包');
  let pkg: MovePackage;
  try {
    pkg = JSON.parse(await f.text());
  } catch {
    throw new Error('这个文件读不出来，换一个试试');
  }
  if (pkg?.format !== 'catnest-move' || typeof pkg.body !== 'string') throw new Error('这不是猫窝的搬家包（要选「猫窝搬家包-…」那个文件）');
  return pkg;
}

export const requestMove = (pkg: MovePackage) => api<MoveRequest>('POST', '/api/move/request', { pkg });
export const withdrawMove = () => api('DELETE', '/api/move/request');

async function forgetSession() {
  setBearer(null);
  await saveToken(null);
}

export async function logout() {
  await api('POST', '/api/auth/logout').catch(() => {});
  await forgetSession();
  location.reload();
}

export async function deleteAccount() {
  await api('POST', '/api/account/delete', { confirm: '删除' });
  await forgetSession();
  location.reload();
}

export function report(kind: 'cat' | 'note' | 'diary' | 'user', target: string, reason = '') {
  return api('POST', '/api/report', { kind, target, reason });
}

// ---------------- gentle reminder to protect the account ----------------
const NUDGE_KEY = 'catnest.protectNudge';
export function scheduleProtectNudge() {
  setTimeout(() => {
    const s = ui.state;
    if (!s.me || s.me.user.secured || s.panel || s.phase !== 'game') return;
    let last = 0;
    try {
      last = Number(localStorage.getItem(NUDGE_KEY)) || 0;
    } catch {
      /* ignore */
    }
    if (Date.now() - last < 3 * 86400_000) return;
    try {
      localStorage.setItem(NUDGE_KEY, String(Date.now()));
    } catch {
      /* ignore */
    }
    ui.set({ panel: 'protect' });
  }, 4 * 60_000);
}
