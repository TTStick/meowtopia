// 猫窝小区: who lives next door, cats visiting each other's houses, and
// appointments to play. Nothing here asks anyone to hurry: an unanswered knock
// or invitation simply lapses, and a missed appointment is nobody's fault.
import { route, HttpError, str, cleanText } from './http';
import { isOpen } from './townmode';
import * as db from './db';
import * as game from './game';
import { HOUSES, MY_HOUSE, houseDoor, HOME_SPAWN, POI_MAP, roomById } from '../../shared/world';
import { roomOpen } from '../../shared/rooms';
import { clockAt } from '../../shared/time';
import { hashf } from '../../shared/rng';
import type { CatRecord, DoorSetting } from '../../shared/types';
import { goVisit, keepDate, catsTogether, atPlace, playTogether, dropDate, onDate, hooks } from './world';

db.db.exec(`
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guest_cat TEXT NOT NULL,
  guest_user TEXT NOT NULL,
  host_cat TEXT NOT NULL,
  host_user TEXT NOT NULL,
  status TEXT NOT NULL,
  created INTEGER NOT NULL,
  started INTEGER,
  ends INTEGER
);
CREATE INDEX IF NOT EXISTS visits_host ON visits(host_user, status);
CREATE INDEX IF NOT EXISTS visits_guest ON visits(guest_user, status);
CREATE TABLE IF NOT EXISTS playdates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_user TEXT NOT NULL,
  from_cat TEXT NOT NULL,
  to_user TEXT NOT NULL,
  to_cat TEXT NOT NULL,
  poi TEXT NOT NULL,
  at INTEGER NOT NULL,
  note TEXT,
  status TEXT NOT NULL,
  created INTEGER NOT NULL,
  reminded INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS playdates_to ON playdates(to_user, status);
CREATE INDEX IF NOT EXISTS playdates_from ON playdates(from_user, status);
`);

const VISIT_MINUTES = 15;
const ACTIVE_DAYS = 45;
const SLOTS = HOUSES.map((_, i) => i).filter((i) => i !== MY_HOUSE);

// ---------- who lives next door ----------
/** The cat that's "at home" for a player: the active one if it's their own, else their first own cat. */
function homeCat(uid: string): CatRecord | null {
  const u = db.getUser(uid);
  const own = game.catsOf(uid).filter((c) => c.ownerId === uid);
  return own.find((c) => c.id === u?.active_cat) ?? own[0] ?? null;
}

function alive(uid: string, now: number): boolean {
  const u = db.getUser(uid);
  return !!u && !u.banned && u.last_seen > now - ACTIVE_DAYS * 86400_000 && !!homeCat(uid);
}

/** How close two players are, from everything their cats and they have done together. */
function closeness(uid: string): Map<string, number> {
  const m = new Map<string, number>();
  const add = (u: string | null | undefined, n: number) => {
    if (u && u !== uid && u !== 'town') m.set(u, (m.get(u) ?? 0) + n);
  };
  for (const b of db.db.prepare("SELECT user_a, user_b FROM bonds WHERE status = 'active' AND (user_a = ? OR user_b = ?)").all(uid, uid) as { user_a: string; user_b: string }[]) add(b.user_a === uid ? b.user_b : b.user_a, 1000);
  for (const c of game.catsOf(uid)) {
    for (const f of db.db.prepare('SELECT a, b, affinity, meets FROM friendships WHERE a = ? OR b = ?').all(c.id, c.id) as { a: string; b: string; affinity: number; meets: number }[]) {
      add(game.getCat(f.a === c.id ? f.b : f.a)?.ownerId, f.affinity * 2 + f.meets);
    }
  }
  const since = Date.now() - 90 * 86400_000;
  for (const r of db.db.prepare('SELECT n.from_user AS u FROM notes n JOIN cats c ON c.id = n.cat_id WHERE c.owner_id = ? AND n.ts > ?').all(uid, since) as { u: string }[]) add(r.u, 6);
  for (const r of db.db.prepare('SELECT c.owner_id AS u FROM notes n JOIN cats c ON c.id = n.cat_id WHERE n.from_user = ? AND n.ts > ?').all(uid, since) as { u: string }[]) add(r.u, 6);
  for (const r of db.db.prepare("SELECT guest_user, host_user FROM visits WHERE (guest_user = ? OR host_user = ?) AND status IN ('in', 'done')").all(uid, uid) as { guest_user: string; host_user: string }[]) add(r.guest_user === uid ? r.host_user : r.guest_user, 10);
  for (const r of db.db.prepare('SELECT from_user, to_user, status FROM playdates WHERE from_user = ? OR to_user = ?').all(uid, uid) as { from_user: string; to_user: string; status: string }[]) add(r.from_user === uid ? r.to_user : r.from_user, r.status === 'done' ? 25 : 12);
  return m;
}

interface Hood {
  houses: (string | null)[]; // by slot
  at: number;
}

/**
 * Each player has their own street: the people they're closest to move in first,
 * and stay. Someone only moves out after a long time away, or when a much closer
 * friend needs the house. Empty houses go to players who've been around lately,
 * picked the same way every time for this viewer.
 */
export function hoodOf(uid: string, now = Date.now()): (string | null)[] {
  const prev = db.kvGet<Hood>(`hood:${uid}`);
  if (prev && prev.houses.length === SLOTS.length && now - prev.at < 10 * 60_000) return prev.houses;
  const scores = closeness(uid);
  let houses = prev?.houses.length === SLOTS.length ? prev.houses.slice() : Array<string | null>(SLOTS.length).fill(null);
  houses = houses.map((u) => (u && u !== uid && alive(u, now) ? u : null));
  const close = [...scores].filter(([u]) => !houses.includes(u) && alive(u, now)).sort((a, b) => b[1] - a[1]);
  for (const [u, sc] of close) {
    const empty = houses.indexOf(null);
    if (empty >= 0) {
      houses[empty] = u;
      continue;
    }
    let worst = -1, low = Infinity;
    houses.forEach((h, i) => {
      const s = scores.get(h!) ?? 0;
      if (s < low) [worst, low] = [i, s];
    });
    if (sc < low + 10) break;
    houses[worst] = u;
  }
  if (houses.includes(null)) {
    const rows = db.db
      .prepare("SELECT u.id FROM users u WHERE u.banned = 0 AND u.id != ? AND u.last_seen > ? AND EXISTS (SELECT 1 FROM cats c WHERE c.owner_id = u.id) ORDER BY u.last_seen DESC LIMIT 300")
      .all(uid, now - 14 * 86400_000) as { id: string }[];
    const pool = rows.map((r) => r.id).filter((u) => !houses.includes(u)).sort((a, b) => hashf(seedOf(uid + a)) - hashf(seedOf(uid + b)));
    for (let i = 0; i < houses.length && pool.length; i++) if (!houses[i]) houses[i] = pool.shift()!;
  }
  db.kvSet(`hood:${uid}`, { houses, at: now } satisfies Hood);
  return houses;
}

function seedOf(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** The house a neighbour lives in, on this viewer's street (or null). */
function houseOf(viewer: string, other: string): number | null {
  const slot = hoodOf(viewer).indexOf(other);
  return slot >= 0 ? SLOTS[slot] : null;
}

function doorOf(u: db.UserRow): DoorSetting {
  return game.settingsOf(u).door ?? 'open';
}

function catView(c: CatRecord) {
  return { id: c.id, name: c.name, genes: c.genes, outfit: c.outfit, born: c.born, out: c.location === 'world', away: c.guestAt ? c.guestAt.hostName : null };
}

route('GET', '/api/neighbors', (r) => {
  const me = r.user;
  const scores = closeness(me.id);
  const houses = hoodOf(me.id)
    .map((uid, slot) => {
      const u = uid ? db.getUser(uid) : undefined;
      if (!u) return null;
      const cats = game.catsOf(u.id).filter((c) => c.ownerId === u.id).slice(0, 3);
      return { n: SLOTS[slot], uid: u.id, name: u.nickname, cats: cats.map(catView), door: doorOf(u), close: (scores.get(u.id) ?? 0) >= 10 };
    })
    .filter(Boolean);
  const mine = game.catsOf(me.id).filter((c) => c.ownerId === me.id).slice(0, 3);
  return { mine: MY_HOUSE, me: { n: MY_HOUSE, uid: me.id, name: me.nickname, cats: mine.map(catView), door: doorOf(me), close: true }, houses };
});

// ---------- visiting a neighbour's house ----------
interface VisitRow {
  id: number;
  guest_cat: string;
  guest_user: string;
  host_cat: string;
  host_user: string;
  status: string;
  created: number;
  started: number | null;
  ends: number | null;
}

function startVisit(v: VisitRow) {
  const cat = game.getCat(v.guest_cat), host = game.getCat(v.host_cat);
  const hostUser = db.getUser(v.host_user), guestUser = db.getUser(v.guest_user);
  if (!cat || !host || !hostUser || !guestUser) return;
  const now = Date.now();
  db.db.prepare("UPDATE visits SET status = 'in', started = ?, ends = ? WHERE id = ?").run(now, now + VISIT_MINUTES * 60_000, v.id);
  cat.guestAt = { visit: v.id, hostCat: host.id, hostCatName: host.name, hostName: hostUser.nickname, until: now + VISIT_MINUTES * 60_000 };
  game.markDirty(cat);
  const n = houseOf(v.guest_user, v.host_user);
  const door = n !== null ? houseDoor(HOUSES[n]) : HOME_SPAWN;
  goVisit(cat, door, () => {
    game.saveNow(cat);
    game.notify(v.host_user, 'guest', `${cat.name}来家里做客了`, `${guestUser.nickname}家的${cat.name}来找${host.name}玩，会待一会儿。`);
  });
}

function endVisit(v: VisitRow, early = false) {
  db.db.prepare("UPDATE visits SET status = 'done', ends = ? WHERE id = ?").run(Date.now(), v.id);
  const cat = game.getCat(v.guest_cat), host = game.getCat(v.host_cat);
  const hostUser = db.getUser(v.host_user), guestUser = db.getUser(v.guest_user);
  if (cat?.guestAt?.visit === v.id) {
    cat.guestAt = null;
    cat.location = 'nest';
    game.saveNow(cat);
  }
  if (!cat || !host) return;
  // the two cats are better friends for it
  const [a, b] = cat.id < host.id ? [cat.id, host.id] : [host.id, cat.id];
  const row = db.db.prepare('SELECT affinity FROM friendships WHERE a = ? AND b = ?').get(a, b) as { affinity: number } | undefined;
  db.db.prepare('INSERT INTO friendships (a, b, affinity, meets, last) VALUES (?, ?, ?, 1, ?) ON CONFLICT(a, b) DO UPDATE SET affinity = ?, meets = meets + 1, last = ?').run(a, b, (row?.affinity ?? 0) + 3, Date.now(), (row?.affinity ?? 0) + 3, Date.now());
  const toy = ['毛线球', '纸箱', '小鱼玩具', '窗台上的阳光', '羽毛'][v.id % 5];
  db.addJournal(cat.id, 'friend', `去${hostUser?.nickname ?? '邻居'}家找${host.name}玩了，我们一起玩了${toy}。`, { cat: host.id });
  db.addJournal(host.id, 'friend', `${guestUser?.nickname ?? '邻居'}家的${cat.name}来家里做客，我们一起玩了${toy}。`, { cat: cat.id });
  game.remember(cat, `去${host.name}家做客`);
  game.remember(host, `${cat.name}来家里玩`);
  if (!early) game.notify(v.guest_user, 'guest', `${cat.name}做客回来啦`, `在${hostUser?.nickname ?? '邻居'}家和${host.name}玩了一会儿。`);
}

hooks.endVisit = (c) => {
  const v = c.guestAt ? (db.db.prepare('SELECT * FROM visits WHERE id = ?').get(c.guestAt.visit) as unknown as VisitRow | undefined) : undefined;
  if (v) endVisit(v, true);
  else {
    c.guestAt = null;
    game.saveNow(c);
  }
};

route('POST', '/api/neighbors/knock', (r) => {
  const cat = game.getCat(str(r.body.catId, 64, '猫'));
  if (!cat || !game.canAccess(r.user.id, cat)) throw new HttpError(404, '找不到这只猫猫');
  if (cat.guestAt) throw new HttpError(400, `${cat.name}已经在${cat.guestAt.hostName}家做客啦`);
  const hostUser = db.getUser(str(r.body.host, 64, '邻居'));
  if (!hostUser || hostUser.banned || hostUser.id === r.user.id) throw new HttpError(404, '找不到这户人家');
  const host = homeCat(hostUser.id);
  if (!host) throw new HttpError(404, '这户人家还没有猫');
  const door = doorOf(hostUser);
  if (door === 'closed') throw new HttpError(400, '这家的门先关着，改天再来吧');
  if (host.guestAt) throw new HttpError(400, `${host.name}去别人家做客了，家里没人`);
  if (host.location === 'world') throw new HttpError(400, `${host.name}出门玩去了，家里没人。可以在门口留张纸条`);
  const now = Date.now();
  const today = (db.db.prepare('SELECT COUNT(*) n FROM visits WHERE guest_user = ? AND created > ?').get(r.user.id, now - 86400_000) as { n: number }).n;
  if (today >= 8) throw new HttpError(400, '今天已经串了好多门啦，明天再去吧');
  if (db.db.prepare("SELECT 1 FROM visits WHERE guest_cat = ? AND host_user = ? AND status = 'asked'").get(cat.id, hostUser.id)) throw new HttpError(400, '已经敲过门啦，等等回音吧');
  const id = Number(
    db.db.prepare('INSERT INTO visits (guest_cat, guest_user, host_cat, host_user, status, created) VALUES (?, ?, ?, ?, ?, ?)').run(cat.id, r.user.id, host.id, hostUser.id, door === 'ask' ? 'asked' : 'in', now).lastInsertRowid,
  );
  const v = db.db.prepare('SELECT * FROM visits WHERE id = ?').get(id) as unknown as VisitRow;
  if (door === 'ask') {
    game.notify(hostUser.id, 'knock', `${cat.name}来敲门了`, `${r.user.nickname}家的${cat.name}想来找${host.name}玩。去「邻里 · 小区」里请它进来吧，不方便也没关系。`);
    return { status: 'asked', host: hostUser.nickname };
  }
  startVisit(v);
  return { status: 'in', host: hostUser.nickname, hostCat: host.name, minutes: VISIT_MINUTES };
});

route('POST', '/api/neighbors/answer', (r) => {
  const v = db.db.prepare("SELECT * FROM visits WHERE id = ? AND host_user = ? AND status = 'asked'").get(Number(r.body.id), r.user.id) as unknown as VisitRow | undefined;
  if (!v) throw new HttpError(404, '这次敲门已经过去啦');
  const cat = game.getCat(v.guest_cat);
  if (!r.body.yes || !cat || cat.guestAt) {
    db.db.prepare("UPDATE visits SET status = 'declined' WHERE id = ?").run(v.id);
    if (cat) game.notify(v.guest_user, 'guest', `${r.user.nickname}家这次不太方便`, `下次再带${cat.name}来玩吧。`);
    return { ok: true };
  }
  startVisit(v);
  game.notify(v.guest_user, 'guest', `${r.user.nickname}请${cat.name}进去玩啦`, `${cat.name}去找${game.getCat(v.host_cat)?.name ?? '邻居家的猫'}玩了，会待一会儿。`);
  return { ok: true };
});

/** Bring a cat home from a neighbour's early. */
route('POST', '/api/neighbors/home', (r) => {
  const cat = game.getCat(str(r.body.catId, 64, '猫'));
  if (!cat || !game.canAccess(r.user.id, cat)) throw new HttpError(404, '找不到这只猫猫');
  hooks.endVisit!(cat);
  return { ok: true };
});

/** Which neighbours' cats are visiting this nest right now. */
export function guestsAt(hostCat: string) {
  const rows = db.db.prepare("SELECT * FROM visits WHERE host_cat = ? AND status = 'in'").all(hostCat) as unknown as VisitRow[];
  return rows
    .map((v) => {
      const c = game.getCat(v.guest_cat);
      if (!c || c.guestAt?.visit !== v.id) return null;
      return { cat: game.refresh(c), ownerName: db.getUser(v.guest_user)?.nickname ?? '邻居', until: v.ends };
    })
    .filter(Boolean);
}

// ---------- appointments to play ----------
export const DATE_PLACES = ['fountain', 'pond', 'playground', 'park_tree', 'flowerfield', 'meadow', 'picnic', 'riverbank', 'beach', 'pier', 'sakura_slope', 'orchard', 'island', 'hotspring', 'stage', 'camp', 'bakery_in', 'cafe_in', 'library_in'];

interface DateRow {
  id: number;
  from_user: string;
  from_cat: string;
  to_user: string;
  to_cat: string;
  poi: string;
  at: number;
  note: string | null;
  status: string; // asked | yes | no | going | done | missed | off | gone
  created: number;
  reminded: number;
}

function when(at: number): string {
  const now = clockAt(Date.now()), then = clockAt(at);
  const day = then.day === now.day ? '今天' : then.day === now.day + 1 ? '明天' : '后天';
  const h = Math.floor(then.hour), m = Math.round((then.hour - h) * 60);
  return `${day} ${h}:${String(m).padStart(2, '0')}`;
}

function dateView(d: DateRow, uid: string) {
  const fromCat = game.getCat(d.from_cat), toCat = game.getCat(d.to_cat);
  return {
    id: d.id,
    mine: d.from_user === uid,
    with: db.getUser(d.from_user === uid ? d.to_user : d.from_user)?.nickname ?? '邻居',
    fromCat: fromCat?.name ?? '', toCat: toCat?.name ?? '',
    myCat: (d.from_user === uid ? fromCat : toCat)?.name ?? '',
    theirCat: (d.from_user === uid ? toCat : fromCat)?.name ?? '',
    place: POI_MAP[d.poi]?.name ?? '',
    at: d.at,
    when: when(d.at),
    note: d.note,
    status: d.status,
  };
}

route('POST', '/api/playdates', (r) => {
  const cat = game.getCat(str(r.body.catId, 64, '猫'));
  if (!cat || !game.canAccess(r.user.id, cat)) throw new HttpError(404, '找不到这只猫猫');
  const toUser = db.getUser(str(r.body.to, 64, '邻居'));
  if (!toUser || toUser.banned || toUser.id === r.user.id) throw new HttpError(404, '找不到这户人家');
  const toCat = homeCat(toUser.id);
  if (!toCat) throw new HttpError(404, '这户人家还没有猫');
  const poi = String(r.body.poi);
  if (!DATE_PLACES.includes(poi) || !POI_MAP[poi]) throw new HttpError(400, '换个地方吧');
  const at = Number(r.body.at), now = Date.now();
  if (!Number.isFinite(at) || at < now + 10 * 60_000 || at > now + 50 * 3600_000) throw new HttpError(400, '约在十分钟以后、两天以内吧');
  const hour = clockAt(at).hour;
  if (hour < 8 || hour > 20.5) throw new HttpError(400, '猫猫晚上要早点回家，约在白天或傍晚吧');
  const room = POI_MAP[poi].room ? roomById(POI_MAP[poi].room!) : null;
  if (room && !roomOpen(room, hour)) throw new HttpError(400, `那时候${room.name}还没开门`);
  const note = r.body.note ? cleanText(str(r.body.note, 30, '留言')) : null;
  const pending = (db.db.prepare("SELECT COUNT(*) n FROM playdates WHERE from_user = ? AND status IN ('asked', 'yes')").get(r.user.id) as { n: number }).n;
  if (pending >= 3) throw new HttpError(400, '已经约了好几场啦，先玩完这些吧');
  if (db.db.prepare("SELECT 1 FROM playdates WHERE status IN ('asked', 'yes') AND ((from_user = ? AND to_user = ?) OR (from_user = ? AND to_user = ?))").get(r.user.id, toUser.id, toUser.id, r.user.id)) throw new HttpError(400, '你们已经有一个约定啦');
  const id = Number(db.db.prepare("INSERT INTO playdates (from_user, from_cat, to_user, to_cat, poi, at, note, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, 'asked', ?)").run(r.user.id, cat.id, toUser.id, toCat.id, poi, at, note, now).lastInsertRowid);
  game.notify(toUser.id, 'playdate', `${cat.name}约${toCat.name}一起玩`, `${r.user.nickname}想约在${when(at)}，地点${POI_MAP[poi].name}${note ? `：「${note}」` : '。'}去「邻里 · 小区」里回复吧，不方便也没关系。`);
  return dateView(db.db.prepare('SELECT * FROM playdates WHERE id = ?').get(id) as unknown as DateRow, r.user.id);
});

route('POST', '/api/playdates/:id/answer', (r) => {
  const d = db.db.prepare("SELECT * FROM playdates WHERE id = ? AND to_user = ? AND status = 'asked'").get(Number(r.params.id), r.user.id) as unknown as DateRow | undefined;
  if (!d) throw new HttpError(404, '这个约定已经过去啦');
  const yes = !!r.body.yes;
  db.db.prepare('UPDATE playdates SET status = ? WHERE id = ?').run(yes ? 'yes' : 'no', d.id);
  const v = dateView(d, d.from_user);
  game.notify(d.from_user, 'playdate', yes ? `${v.theirCat}答应啦` : `${r.user.nickname}这次不太方便`, yes ? `${v.when}，${v.myCat}和${v.theirCat}在${v.place}见。到时候它会自己过去的。` : `下次再约${v.theirCat}一起玩吧。`);
  return dateView({ ...d, status: yes ? 'yes' : 'no' }, r.user.id);
});

route('POST', '/api/playdates/:id/cancel', (r) => {
  const d = db.db.prepare("SELECT * FROM playdates WHERE id = ? AND (from_user = ? OR to_user = ?) AND status IN ('asked', 'yes', 'going')").get(Number(r.params.id), r.user.id, r.user.id) as unknown as DateRow | undefined;
  if (!d) throw new HttpError(404, '这个约定已经过去啦');
  db.db.prepare("UPDATE playdates SET status = 'off' WHERE id = ?").run(d.id);
  dropDate(d.id);
  const other = d.from_user === r.user.id ? d.to_user : d.from_user;
  game.notify(other, 'playdate', '约定改天啦', `${r.user.nickname}说${when(d.at)}去不了了，下次再约吧。`);
  return { ok: true };
});

route('GET', '/api/playdates', (r) => {
  const rows = db.db.prepare('SELECT * FROM playdates WHERE (from_user = ? OR to_user = ?) AND (status IN (\'asked\', \'yes\', \'going\') OR at > ?) ORDER BY at ASC LIMIT 40').all(r.user.id, r.user.id, Date.now() - 3 * 86400_000) as unknown as DateRow[];
  const knocks = (db.db.prepare("SELECT * FROM visits WHERE host_user = ? AND status = 'asked' AND created > ? ORDER BY created DESC").all(r.user.id, Date.now() - 3 * 3600_000) as unknown as VisitRow[]).map((v) => ({
    id: v.id,
    cat: game.getCat(v.guest_cat)?.name ?? '',
    owner: db.getUser(v.guest_user)?.nickname ?? '邻居',
  }));
  return { dates: rows.map((d) => dateView(d, r.user.id)), knocks, places: DATE_PLACES.map((id) => ({ id, name: POI_MAP[id].name })) };
});

// ---------- the clock: visits ending, appointments coming round ----------
function tick() {
  const now = Date.now();
  for (const v of db.db.prepare("SELECT * FROM visits WHERE status = 'in' AND ends < ?").all(now) as unknown as VisitRow[]) endVisit(v);
  db.db.prepare("UPDATE visits SET status = 'gone' WHERE status = 'asked' AND created < ?").run(now - 3 * 3600_000);
  // invitations nobody got round to answering quietly lapse
  db.db.prepare("UPDATE playdates SET status = 'gone' WHERE status = 'asked' AND at < ?").run(now);
  for (const d of db.db.prepare("SELECT * FROM playdates WHERE status = 'yes' AND at < ?").all(now + 10 * 60_000) as unknown as DateRow[]) {
    const a = game.getCat(d.from_cat), b = game.getCat(d.to_cat);
    if (!a || !b) {
      db.db.prepare("UPDATE playdates SET status = 'off' WHERE id = ?").run(d.id);
      continue;
    }
    if (!d.reminded) {
      db.db.prepare('UPDATE playdates SET reminded = 1 WHERE id = ?').run(d.id);
      const place = POI_MAP[d.poi]?.name ?? '';
      for (const [u, me, them] of [[d.from_user, a, b], [d.to_user, b, a]] as const) game.notify(u, 'playdate', `${me.name}快要去赴约啦`, `${when(d.at)}，在${place}和${them.name}一起玩。它会自己过去的。`);
    }
    if (now < d.at - 60_000) continue;
    db.db.prepare("UPDATE playdates SET status = 'going' WHERE id = ?").run(d.id);
    for (const [c, side] of [[a, -1], [b, 1]] as const) {
      if (c.guestAt) hooks.endVisit!(c);
      keepDate(c, d.id, d.poi, side);
    }
  }
  for (const d of db.db.prepare("SELECT * FROM playdates WHERE status = 'going'").all() as unknown as DateRow[]) {
    const a = game.getCat(d.from_cat), b = game.getCat(d.to_cat);
    const place = POI_MAP[d.poi]?.name ?? '约好的地方';
    // they've kept it once both are there, together (not just leaving home at the same moment)
    if (a && b && catsTogether(a.id, b.id) && atPlace(a.id, d.poi) && atPlace(b.id, d.poi)) {
      db.db.prepare("UPDATE playdates SET status = 'done' WHERE id = ?").run(d.id);
      playTogether(d.id, a.id, b.id);
      for (const [me, them] of [[a, b], [b, a]] as const) {
        db.addJournal(me.id, 'friend', `和${them.name}约好了在${place}玩，我们玩得好开心。`, { cat: them.id });
        game.remember(me, `和${them.name}在${place}玩`);
      }
      for (const [u, me, them] of [[d.from_user, a, b], [d.to_user, b, a]] as const) game.notify(u, 'playdate', `${me.name}和${them.name}玩得很开心`, `按约定在${place}碰面了，一起玩了好一会儿。`);
    } else if (now <= d.at + 25 * 60_000) {
      // a cat that lost track (the server restarted, say) is sent on its way again
      for (const [c, side] of [[a, -1], [b, 1]] as const) if (c && !onDate(c.id, d.id)) keepDate(c, d.id, d.poi, side);
    } else {
      db.db.prepare("UPDATE playdates SET status = 'missed' WHERE id = ?").run(d.id);
      dropDate(d.id);
      for (const [u, me, them] of [[d.from_user, a, b], [d.to_user, b, a]] as const) {
        if (!me || !them) continue;
        db.addJournal(me.id, 'explore', `在${place}等了一会儿${them.name}，看了好一会儿风景。`);
        game.notify(u, 'playdate', '这次没碰上', `${me.name}和${them.name}这次在${place}没碰到，下次再约吧。`);
      }
    }
  }
}
setInterval(() => {
  if (!isOpen()) return; // appointments wait while the town is shut
  try {
    tick();
  } catch (e) {
    console.error('[neighbors]', e);
  }
}, 15_000).unref();
