// Requests from the admin panel. The panel's cookie only travels to /api/admin.

export class AdminError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

/** Fired when the session is gone (a 404 from any admin route), so the panel can show the sign-in. */
export const signedOut = new EventTarget();

export async function adminApi<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/admin${path}`, {
    method,
    credentials: 'same-origin',
    headers: { 'x-catnest': '1', ...(body !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    if (res.status === 404 && path !== '/me') signedOut.dispatchEvent(new Event('out'));
    throw new AdminError(res.status, (data as { error?: string } | null)?.error ?? `请求失败（${res.status}）`);
  }
  return data as T;
}

// ---------- shapes of the answers ----------
export interface Overview {
  online: { players: number; guests: number; watching: number; catsInTown: number; townCats: number; residents: number; peakToday: number };
  users: { total: number; newToday: number; new7d: number; activeToday: number; active7d: number; active30d: number; secured: number; banned: number };
  cats: { total: number };
  reports: number;
  days: { day: string; newUsers: number; active: number | null; peak: number | null }[];
  server: { startedAt: number; uptime: number; rss: number; dbBytes: number; node: string; worldTz: number };
  llm: { active: boolean; model: string; calls: number; failed: number; cost: number | null; currency: string };
}

export interface WorldEnt {
  id: string;
  kind: 'cat' | 'town' | 'npc'; // a player's cat, one of the town's own cats, a resident
  name: string;
  role: string | null;
  owner: string | null;
  ownerId: string | null;
  x: number;
  y: number;
  dest: [number, number] | null;
  anim: string;
  mode: string;
  place: string;
  controlled: boolean;
  trip: { since: number; finds: string[]; friends: string[]; places: number; goingHome: boolean; userSent: boolean } | null;
}
export interface WorldSnap {
  now: number;
  ents: WorldEnt[];
  players: number;
  guests: number;
  watching: number;
  connections: number;
  clock: { time: string; phase: string; season: string; weather: string };
}

export type Effort = 'low' | 'medium' | 'high';
export interface LlmSettings {
  enabled: boolean;
  apiKey: string; // masked
  keySource: 'panel' | 'env' | 'none';
  model: string;
  baseURL: string;
  effort: Effort;
  rpm: number;
  daily: number;
  userDaily: number;
  priceIn: number;
  priceOut: number;
  currency: '$' | '¥';
  active: boolean;
  defaults: { model: string; rpm: number; daily: number; userDaily: number };
}
export interface LlmUsage {
  calls: number;
  ok: number;
  failed: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  avgMs: number | null;
  cost: number | null;
  currency: string;
  lastError: string | null;
  lastErrorAt: number | null;
  budget: { minute: number; rpm: number; today: number; daily: number };
}

export interface PlayerRow {
  id: string;
  name: string;
  born: number;
  location: string;
  uid: string;
  nickname: string;
  fish: number;
  lastSeen: number;
  created: number;
  banned: number;
  discovered: number;
  places: number;
}

export interface Report {
  id: number;
  ts: number;
  kind: string;
  target: string;
  detail: string | null;
  reason: string | null;
  target_user: string | null;
  reporter: string;
}
