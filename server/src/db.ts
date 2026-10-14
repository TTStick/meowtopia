import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { CatRecord, NestLayout, UserSettings, JournalEntry, InventoryMap } from '../../shared/types';
import { DATA_DIR } from './config';

export const DB_PATH = resolve(process.env.CAT_DB ?? join(DATA_DIR, 'cats.db'));
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA foreign_keys = OFF;`);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  token TEXT UNIQUE NOT NULL,
  code TEXT UNIQUE NOT NULL,
  nickname TEXT NOT NULL,
  fish INTEGER NOT NULL DEFAULT 0,
  settings TEXT NOT NULL,
  push_sub TEXT,
  created INTEGER NOT NULL,
  last_seen INTEGER NOT NULL,
  active_cat TEXT,
  last_daily INTEGER NOT NULL DEFAULT 0,
  push_day INTEGER NOT NULL DEFAULT 0,
  push_count INTEGER NOT NULL DEFAULT 0,
  last_push INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS cats (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  co_owner_id TEXT,
  data TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS cats_owner ON cats(owner_id);
CREATE TABLE IF NOT EXISTS nests (
  cat_id TEXT PRIMARY KEY,
  layout TEXT NOT NULL,
  updated INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inventory (
  user_id TEXT NOT NULL,
  item TEXT NOT NULL,
  count INTEGER NOT NULL,
  PRIMARY KEY (user_id, item)
);
CREATE TABLE IF NOT EXISTS journal (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  text TEXT NOT NULL,
  data TEXT
);
CREATE INDEX IF NOT EXISTS journal_cat ON journal(cat_id, ts);
CREATE TABLE IF NOT EXISTS friendships (
  a TEXT NOT NULL,
  b TEXT NOT NULL,
  affinity REAL NOT NULL DEFAULT 0,
  meets INTEGER NOT NULL DEFAULT 0,
  last INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (a, b)
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cat_id TEXT NOT NULL,
  from_user TEXT NOT NULL,
  from_name TEXT NOT NULL,
  from_cat TEXT,
  sticker TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS notes_cat ON notes(cat_id, ts);
CREATE TABLE IF NOT EXISTS bonds (
  id TEXT PRIMARY KEY,
  user_a TEXT NOT NULL,
  user_b TEXT,
  cat_id TEXT,
  code TEXT,
  created INTEGER NOT NULL,
  status TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS match_queue (
  user_id TEXT PRIMARY KEY,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS diary (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bond_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  text TEXT NOT NULL,
  ts INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  ts INTEGER NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  pushed INTEGER NOT NULL DEFAULT 0,
  seen INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS events_user ON events(user_id, ts);
CREATE TABLE IF NOT EXISTS kv (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  created INTEGER NOT NULL,
  last_used INTEGER NOT NULL,
  expires INTEGER NOT NULL,
  agent TEXT,
  kind TEXT NOT NULL DEFAULT 'web'
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user_id);
CREATE TABLE IF NOT EXISTS passkeys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  public_key BLOB NOT NULL,
  counter INTEGER NOT NULL,
  transports TEXT,
  device_type TEXT,
  backed_up INTEGER NOT NULL DEFAULT 0,
  name TEXT,
  created INTEGER NOT NULL,
  last_used INTEGER
);
CREATE INDEX IF NOT EXISTS passkeys_user ON passkeys(user_id);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reporter TEXT NOT NULL,
  kind TEXT NOT NULL,
  target TEXT NOT NULL,
  detail TEXT,
  reason TEXT,
  ts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open'
);
CREATE INDEX IF NOT EXISTS reports_status ON reports(status, ts);
CREATE INDEX IF NOT EXISTS users_seen ON users(last_seen);
`);

function addColumn(table: string, col: string, def: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn('users', 'code_hash', 'TEXT');
addColumn('users', 'code_at', 'INTEGER');
addColumn('users', 'banned', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'ban_reason', 'TEXT');
addColumn('reports', 'target_user', 'TEXT');
db.exec('CREATE INDEX IF NOT EXISTS users_code_hash ON users(code_hash)');

export interface UserRow {
  id: string;
  token: string; // legacy placeholder ('~' + id); real credentials live in sessions
  code: string; // legacy placeholder; recovery codes are stored hashed in code_hash
  code_hash: string | null;
  code_at: number | null;
  banned: number;
  ban_reason: string | null;
  nickname: string;
  fish: number;
  settings: string;
  push_sub: string | null;
  created: number;
  last_seen: number;
  active_cat: string | null;
  last_daily: number;
  push_day: number;
  push_count: number;
  last_push: number;
}

const q = {
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByCodeHash: db.prepare('SELECT * FROM users WHERE code_hash = ?'),
  insertUser: db.prepare('INSERT INTO users (id, token, code, nickname, fish, settings, created, last_seen) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'),
  catsByUser: db.prepare('SELECT data FROM cats WHERE owner_id = ? OR co_owner_id = ? ORDER BY rowid'),
  catById: db.prepare('SELECT data FROM cats WHERE id = ?'),
  upsertCat: db.prepare('INSERT INTO cats (id, owner_id, co_owner_id, data, updated) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET owner_id=excluded.owner_id, co_owner_id=excluded.co_owner_id, data=excluded.data, updated=excluded.updated'),
  allCats: db.prepare('SELECT data FROM cats'),
  nest: db.prepare('SELECT layout FROM nests WHERE cat_id = ?'),
  upsertNest: db.prepare('INSERT INTO nests (cat_id, layout, updated) VALUES (?, ?, ?) ON CONFLICT(cat_id) DO UPDATE SET layout=excluded.layout, updated=excluded.updated'),
  inv: db.prepare('SELECT item, count FROM inventory WHERE user_id = ?'),
  invGet: db.prepare('SELECT count FROM inventory WHERE user_id = ? AND item = ?'),
  invSet: db.prepare('INSERT INTO inventory (user_id, item, count) VALUES (?, ?, ?) ON CONFLICT(user_id, item) DO UPDATE SET count=excluded.count'),
  invDel: db.prepare('DELETE FROM inventory WHERE user_id = ? AND item = ?'),
  addJournal: db.prepare('INSERT INTO journal (cat_id, ts, kind, text, data) VALUES (?, ?, ?, ?, ?)'),
  journal: db.prepare('SELECT * FROM journal WHERE cat_id = ? AND ts < ? ORDER BY ts DESC LIMIT ?'),
  addEvent: db.prepare('INSERT INTO events (user_id, ts, kind, title, text) VALUES (?, ?, ?, ?, ?)'),
};

export function getUser(id: string): UserRow | undefined {
  return q.userById.get(id) as UserRow | undefined;
}
export function getUserByCodeHash(hash: string): UserRow | undefined {
  return q.userByCodeHash.get(hash) as UserRow | undefined;
}
export function insertUser(u: { id: string; nickname: string; fish: number; settings: UserSettings }) {
  const now = Date.now();
  q.insertUser.run(u.id, '~' + u.id, '~' + u.id, u.nickname, u.fish, JSON.stringify(u.settings), now, now);
}
export function updateUser(id: string, patch: Partial<Omit<UserRow, 'id'>>) {
  const keys = Object.keys(patch);
  if (!keys.length) return;
  const sql = `UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...(keys.map((k) => (patch as any)[k]) as any[]), id);
}

export function getCatsOfUser(uid: string): CatRecord[] {
  return (q.catsByUser.all(uid, uid) as { data: string }[]).map((r) => JSON.parse(r.data));
}
export function getCat(id: string): CatRecord | undefined {
  const r = q.catById.get(id) as { data: string } | undefined;
  return r ? JSON.parse(r.data) : undefined;
}
export function saveCat(c: CatRecord) {
  q.upsertCat.run(c.id, c.ownerId, c.coOwnerId, JSON.stringify(c), Date.now());
}
export function allCats(): CatRecord[] {
  return (q.allCats.all() as { data: string }[]).map((r) => JSON.parse(r.data));
}

export function getNest(catId: string): NestLayout | undefined {
  const r = q.nest.get(catId) as { layout: string } | undefined;
  return r ? JSON.parse(r.layout) : undefined;
}
export function saveNest(catId: string, layout: NestLayout) {
  q.upsertNest.run(catId, JSON.stringify(layout), Date.now());
}

export function getInventory(uid: string): InventoryMap {
  const out: InventoryMap = {};
  for (const r of q.inv.all(uid) as { item: string; count: number }[]) out[r.item] = r.count;
  return out;
}
export function invCount(uid: string, item: string): number {
  const r = q.invGet.get(uid, item) as { count: number } | undefined;
  return r?.count ?? 0;
}
export function invAdd(uid: string, item: string, n: number): number {
  const c = Math.max(0, invCount(uid, item) + n);
  if (c === 0) q.invDel.run(uid, item);
  else q.invSet.run(uid, item, c);
  return c;
}

export function addJournal(catId: string, kind: JournalEntry['kind'], text: string, data?: any, ts = Date.now()): JournalEntry {
  const r = q.addJournal.run(catId, ts, kind, text, data ? JSON.stringify(data) : null);
  return { id: Number(r.lastInsertRowid), catId, ts, kind, text, data };
}
export function getJournal(catId: string, before = Date.now() + 1, limit = 40): JournalEntry[] {
  return (q.journal.all(catId, before, limit) as any[]).map((r) => ({ id: r.id, catId: r.cat_id, ts: r.ts, kind: r.kind, text: r.text, data: r.data ? JSON.parse(r.data) : undefined }));
}

export function addEvent(uid: string, kind: string, title: string, text: string) {
  q.addEvent.run(uid, Date.now(), kind, title, text);
}

export function kvGet<T>(k: string): T | undefined {
  const r = db.prepare('SELECT v FROM kv WHERE k = ?').get(k) as { v: string } | undefined;
  return r ? JSON.parse(r.v) : undefined;
}
export function kvSet(k: string, v: unknown) {
  db.prepare('INSERT INTO kv (k, v) VALUES (?, ?) ON CONFLICT(k) DO UPDATE SET v=excluded.v').run(k, JSON.stringify(v));
}

export function tx<T>(fn: () => T): T {
  db.exec('BEGIN');
  try {
    const r = fn();
    db.exec('COMMIT');
    return r;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
}
