// How well each cat knows the town's residents. Greeting, walking together and
// doing a resident's little thing all count; a few points a day at most, so it
// grows the way acquaintances do.
import { db, kvGet, kvSet } from './db';
import { townBond } from '../../shared/npcs';
import { clockAt } from '../../shared/time';

db.exec(`
CREATE TABLE IF NOT EXISTS npc_bonds (
  cat_id TEXT NOT NULL,
  npc_id TEXT NOT NULL,
  points INTEGER NOT NULL DEFAULT 0,
  walks INTEGER NOT NULL DEFAULT 0,
  day INTEGER NOT NULL DEFAULT 0,
  today INTEGER NOT NULL DEFAULT 0,
  last INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (cat_id, npc_id)
);
`);

const DAILY_CAP = 6;

interface Row {
  points: number;
  walks: number;
  day: number;
  today: number;
}

const q = {
  get: db.prepare('SELECT points, walks, day, today FROM npc_bonds WHERE cat_id = ? AND npc_id = ?'),
  put: db.prepare(
    'INSERT INTO npc_bonds (cat_id, npc_id, points, walks, day, today, last) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(cat_id, npc_id) DO UPDATE SET points = excluded.points, walks = excluded.walks, day = excluded.day, today = excluded.today, last = excluded.last',
  ),
  ofCat: db.prepare('SELECT npc_id, points, walks FROM npc_bonds WHERE cat_id = ?'),
};

export function bondOf(catId: string, npcId: string) {
  const r = q.get.get(catId, npcId) as Row | undefined;
  const points = r?.points ?? 0;
  return { points, walks: r?.walks ?? 0, ...townBond(points) };
}

/** Add familiarity (capped per day); says whether it reached a new level. */
export function befriend(catId: string, npcId: string, n: number, walk = false): { level: number; name: string; up: boolean } {
  const d = clockAt(Date.now()).day;
  const r = (q.get.get(catId, npcId) as Row | undefined) ?? { points: 0, walks: 0, day: d, today: 0 };
  const today = r.day === d ? r.today : 0;
  const add = Math.max(0, Math.min(n, DAILY_CAP - today));
  const before = townBond(r.points).level;
  const points = r.points + add;
  q.put.run(catId, npcId, points, r.walks + (walk ? 1 : 0), d, today + add, Date.now());
  const b = townBond(points);
  return { level: b.level, name: b.name, up: b.level > before };
}

export function bondsOf(catId: string): Record<string, { points: number; walks: number; level: number; name: string }> {
  const out: Record<string, { points: number; walks: number; level: number; name: string }> = {};
  for (const r of q.ofCat.all(catId) as { npc_id: string; points: number; walks: number }[]) {
    const b = townBond(r.points);
    out[r.npc_id] = { points: r.points, walks: r.walks, level: b.level, name: b.name };
  }
  return out;
}

/** Once-a-day (or once-ever) flags, kept in the kv table. */
export function usedToday(key: string): boolean {
  return kvGet<number>(`${key}:${clockAt(Date.now()).day}`) === 1;
}
export function markToday(key: string) {
  kvSet(`${key}:${clockAt(Date.now()).day}`, 1);
}
export function usedEver(key: string): boolean {
  return kvGet<number>(key) === 1;
}
export function markEver(key: string) {
  kvSet(key, 1);
}

/** A letter a resident asked a cat to carry today. */
export interface Errand {
  from: string;
  to: string;
  day: number;
}
export function errandOf(catId: string): Errand | null {
  const e = kvGet<Errand>(`errand:${catId}`);
  return e && e.day === clockAt(Date.now()).day ? e : null;
}
export function setErrand(catId: string, e: Errand | null) {
  kvSet(`errand:${catId}`, e);
}
