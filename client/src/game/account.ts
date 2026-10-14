// Account protection and sign-in: passkeys, recovery codes, devices, export, delete.
import { startAuthentication, startRegistration, browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { api } from './net';
import { ui } from './state';
import type { MeResponse } from '../../../shared/types';

export interface AuthState {
  hasCode: boolean;
  codeAt: number | null;
  passkeys: { id: string; name: string; created: number; lastUsed: number | null; synced: boolean }[];
  sessions: { id: string; agent: string; created: number; lastUsed: number; current: boolean; kind: string }[];
}

export const passkeysSupported = () => typeof window !== 'undefined' && window.isSecureContext && browserSupportsWebAuthn();

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
  const r = await api<{ me: MeResponse }>('POST', '/api/auth/passkey/login', { cid, response });
  return r.me;
}

export async function codeLogin(code: string): Promise<MeResponse> {
  const r = await api<{ me: MeResponse }>('POST', '/api/auth/code', { code });
  return r.me;
}

export async function newRecoveryCode(): Promise<string> {
  const r = await api<{ code: string }>('POST', '/api/auth/recovery-code');
  return r.code;
}

export async function exportData() {
  const data = await api('GET', '/api/account/export');
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `猫窝-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function logout() {
  await api('POST', '/api/auth/logout').catch(() => {});
  location.reload();
}

export async function deleteAccount() {
  await api('POST', '/api/account/delete', { confirm: '删除' });
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
