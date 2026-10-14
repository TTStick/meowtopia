// Game state service: cat cache, stats, inventory, currency, notifications.
import { randomUUID } from 'node:crypto';
import type { CatRecord, MeResponse, UserSettings } from '../../shared/types';
import { randomGenes, randomPersonality } from '../../shared/genes';
import { advanceStats, freshStats } from '../../shared/stats';
import { starterLayout, STARTER_ITEMS } from '../../shared/nest';
import { HOME_SPAWN } from '../../shared/world';
import * as db from './db';

const cache = new Map<string, CatRecord>();
const dirty = new Set<string>();

export function getCat(id: string): CatRecord | undefined {
  let c = cache.get(id);
  if (!c) {
    c = db.getCat(id);
    if (c) cache.set(id, c);
  }
  return c;
}

export function markDirty(c: CatRecord) {
  cache.set(c.id, c);
  dirty.add(c.id);
}

export function saveNow(c: CatRecord) {
  cache.set(c.id, c);
  dirty.delete(c.id);
  db.saveCat(c);
}

export function flushCats() {
  for (const id of dirty) {
    const c = cache.get(id);
    if (c) db.saveCat(c);
  }
  dirty.clear();
}
setInterval(flushCats, 20_000).unref();

export function catsOf(uid: string): CatRecord[] {
  return db.getCatsOfUser(uid).map((c) => {
    const cached = cache.get(c.id);
    if (cached) return cached;
    cache.set(c.id, c);
    return c;
  });
}

export function allCatIds(): string[] {
  return db.allCats().map((c) => c.id);
}

export function refresh(c: CatRecord, now = Date.now()): CatRecord {
  if (now - c.statsAt > 60_000) {
    c.stats = advanceStats(c.stats, c.personality, c.statsAt, now, c.location);
    c.statsAt = now;
    markDirty(c);
  }
  return c;
}

export function canAccess(uid: string, c: CatRecord) {
  return c.ownerId === uid || c.coOwnerId === uid;
}

export function createCat(ownerId: string, name: string, seed: number, coOwnerId: string | null = null): CatRecord {
  const now = Date.now();
  const c: CatRecord = {
    id: 'c_' + randomUUID().replace(/-/g, '').slice(0, 12),
    ownerId,
    coOwnerId,
    name,
    genes: randomGenes(seed),
    personality: randomPersonality(seed),
    stats: freshStats(),
    statsAt: now,
    born: now,
    location: 'nest',
    outfit: [],
    discovered: ['home_lane'],
    memory: [],
    wx: HOME_SPAWN[0],
    wy: HOME_SPAWN[1],
  };
  saveNow(c);
  db.saveNest(c.id, starterLayout());
  return c;
}

export function giveStarter(uid: string) {
  for (const [k, n] of Object.entries(STARTER_ITEMS)) db.invAdd(uid, k, n);
}

export function addFish(uid: string, n: number): number {
  const u = db.getUser(uid);
  if (!u) return 0;
  const fish = Math.max(0, u.fish + n);
  db.updateUser(uid, { fish });
  return fish;
}

export function remember(c: CatRecord, m: string) {
  c.memory.push(m);
  if (c.memory.length > 8) c.memory.splice(0, c.memory.length - 8);
  markDirty(c);
}

export const DEFAULT_SETTINGS: UserSettings = { push: false, quietStart: 23, quietEnd: 8, tzOffset: -480, sound: true, music: true };

export function settingsOf(u: db.UserRow): UserSettings {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(u.settings) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function me(u: db.UserRow): MeResponse {
  const cats = catsOf(u.id).map((c) => refresh(c));
  const active = u.active_cat && cats.some((c) => c.id === u.active_cat) ? u.active_cat : cats[0]?.id ?? null;
  return {
    user: { id: u.id, nickname: u.nickname, fish: u.fish, settings: settingsOf(u), code: u.code },
    cats,
    activeCatId: active,
    inventory: db.getInventory(u.id),
  };
}

// ---- notifications (in-app letters; pushed by push.ts) ----
type Listener = (uid: string, ev: { kind: string; title: string; text: string }) => void;
const listeners: Listener[] = [];
export function onNotify(l: Listener) {
  listeners.push(l);
}
export function notify(uid: string, kind: string, title: string, text: string) {
  db.addEvent(uid, kind, title, text);
  for (const l of listeners) l(uid, { kind, title, text });
}

export function ownersOf(c: CatRecord): string[] {
  return [c.ownerId, c.coOwnerId].filter((x): x is string => !!x && x !== 'town');
}

export function foundItems(uid: string): string[] {
  return db.kvGet<string[]>(`found:${uid}`) ?? [];
}
export function markFound(uid: string, item: string) {
  const f = foundItems(uid);
  if (!f.includes(item)) {
    f.push(item);
    db.kvSet(`found:${uid}`, f);
  }
}
