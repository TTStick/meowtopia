// 搬家: packing a cat up to take to another 猫窝 server, and, on the other end,
// a request to move in that the server's admin looks over first.
//
// A package is signed with this server's own key (Ed25519, kept in the data
// volume), so the receiving server can tell nothing was edited on the way.
// Whether to trust the server that signed it is the receiving admin's call: they
// see its key fingerprint, can check it against that server's /api/move/key, and
// can mark servers they trust.
import { generateKeyPairSync, createPrivateKey, createPublicKey, sign, verify, createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { route, HttpError, cleanText } from './http';
import * as db from './db';
import * as game from './game';
import { DATA_DIR } from './config';
import { requireAdmin } from './admin';
import { onAccountDeleted } from './auth';
import { ITEM_MAP, WEAR_SLOT } from '../../shared/items';
import { POI_MAP } from '../../shared/world';
import { validateLayout, starterLayout } from '../../shared/nest';
import { COATS, coatName } from '../../shared/genes';
import { WORLD_VERSION } from '../../shared/protocol';
import type { CatGenes, CatRecord, InventoryMap, JournalEntry, NestLayout, Pattern, Personality } from '../../shared/types';

db.db.exec(`
CREATE TABLE IF NOT EXISTS move_requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  pkg_id TEXT NOT NULL,
  cat_key TEXT NOT NULL,
  origin TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  summary TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT NOT NULL,
  reason TEXT,
  created INTEGER NOT NULL,
  decided INTEGER
);
CREATE INDEX IF NOT EXISTS move_requests_status ON move_requests(status, created);
CREATE INDEX IF NOT EXISTS move_requests_user ON move_requests(user_id, created);
`);

export const FISH_CAP = 50_000; // the most 小鱼干 a move brings, unless the admin says otherwise
const JOURNAL_KEPT = 200;
const PACKAGE_MAX = 512 * 1024;
const EPOCH = Date.UTC(2025, 0, 1); // nothing in 猫窝 is older than this
const MAX_WAITING = 200; // requests waiting for the admin, across the town

// ---------- this server's signing key ----------
interface MoveKey {
  pub: string; // spki der, base64
  priv: string; // pkcs8 der, base64
}
let key: MoveKey | null = null;
function moveKey(): MoveKey {
  if (key) return key;
  const path = join(DATA_DIR, 'move-key.json');
  if (existsSync(path)) key = JSON.parse(readFileSync(path, 'utf8')) as MoveKey;
  else {
    const kp = generateKeyPairSync('ed25519');
    key = { pub: kp.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'), priv: kp.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64') };
    writeFileSync(path, JSON.stringify(key), { mode: 0o600 });
  }
  return key;
}

/** A short, readable fingerprint of a public key: "AB12 CD34 EF56 7890". */
export function fingerprint(pub: string): string {
  const h = createHash('sha256').update(Buffer.from(pub, 'base64')).digest('hex').toUpperCase();
  return h.slice(0, 16).match(/.{4}/g)!.join(' ');
}
export const myFingerprint = () => fingerprint(moveKey().pub);

function originOf(raw: import('node:http').IncomingMessage): string {
  const h = raw.headers;
  const first = (v: unknown) => String(v ?? '').split(',')[0].trim();
  const proto = first(h['x-forwarded-proto']) || ((raw.socket as { encrypted?: boolean }).encrypted ? 'https' : 'http');
  return `${proto}://${first(h['x-forwarded-host']) || first(h.host) || 'localhost'}`;
}

/** Anyone can ask for this server's key, to check a fingerprint they were shown. */
route('GET', '/api/move/key', () => ({ key: moveKey().pub, fingerprint: myFingerprint(), world: WORLD_VERSION }), { auth: false });

// ---------- packing up ----------
interface PackedCat {
  name: string;
  genes: CatGenes;
  personality: Personality;
  stats: CatRecord['stats'];
  born: number;
  outfit: string[];
  discovered: string[];
  memory: string[];
  stage?: number;
  nest: NestLayout | null;
  journal: { ts: number; kind: JournalEntry['kind']; text: string }[];
}

interface PackageBody {
  format: 'catnest-move';
  v: 1;
  id: string;
  createdAt: number;
  source: { origin: string; fingerprint: string; world: number };
  player: { nickname: string; since: number };
  fish: number;
  inventory: InventoryMap;
  found: string[];
  cat: PackedCat;
  left: string[]; // co-parented cats, which stay with the other parent
}

export interface MovePackage {
  format: 'catnest-move';
  v: 1;
  key: string;
  body: string; // the PackageBody as JSON, exactly as signed
  sig: string;
}

const ownCat = (uid: string) => game.catsOf(uid).find((c) => c.ownerId === uid && !c.coOwnerId);

route('POST', '/api/move/export', (r) => {
  const u = r.user;
  const own = ownCat(u.id);
  if (!own) throw new HttpError(400, '还没有可以带走的猫猫（一起养的猫会留在这里）');
  const c = game.refresh(own);
  const body: PackageBody = {
    format: 'catnest-move',
    v: 1,
    id: 'mv_' + randomBytes(12).toString('base64url'),
    createdAt: Date.now(),
    source: { origin: originOf(r.raw), fingerprint: myFingerprint(), world: WORLD_VERSION },
    player: { nickname: u.nickname, since: u.created },
    fish: u.fish,
    inventory: db.getInventory(u.id),
    found: game.foundItems(u.id),
    cat: {
      name: c.name, genes: c.genes, personality: c.personality, stats: c.stats, born: c.born, outfit: c.outfit,
      discovered: c.discovered, memory: c.memory, stage: c.stage,
      nest: db.getNest(c.id) ?? null,
      journal: db.getJournal(c.id, Date.now() + 1, JOURNAL_KEPT).reverse().map((e) => ({ ts: e.ts, kind: e.kind, text: e.text.slice(0, 200) })),
    },
    left: game.catsOf(u.id).filter((x) => x.coOwnerId).map((x) => x.name),
  };
  const text = JSON.stringify(body);
  const sig = sign(null, Buffer.from(text), createPrivateKey({ key: Buffer.from(moveKey().priv, 'base64'), format: 'der', type: 'pkcs8' })).toString('base64');
  db.kvSet(`moveout:${u.id}`, { at: body.createdAt, cat: c.name });
  return { format: 'catnest-move', v: 1, key: moveKey().pub, body: text, sig } satisfies MovePackage;
}, { limit: 'move' });

// ---------- reading a package (on the receiving server) ----------
const PATTERNS: Pattern[] = ['solid', 'tabby', 'mackerel', 'calico', 'tortie', 'tuxedo', 'bicolor', 'pointed', 'spotted'];
const KINDS: JournalEntry['kind'][] = ['explore', 'find', 'friend', 'home', 'mood', 'note', 'care', 'letter'];
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : d);
const num = (v: unknown, lo: number, hi: number, d: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d);
const words = (v: unknown, max: number) => (typeof v === 'string' ? [...cleanText(v.slice(0, max * 4).trim())].slice(0, max).join('') : '');
const list = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

function cleanGenes(g: any): CatGenes {
  const eye = color(g?.eye, '#8fc45a');
  return {
    seed: Math.floor(num(g?.seed, 1, 2 ** 32 - 1, 1)),
    coat: COATS.some((c) => c.key === g?.coat) ? g.coat : 'orange',
    base: color(g?.base, '#f6b26b'),
    accent: color(g?.accent, '#e38b3d'),
    accent2: color(g?.accent2, '#5a5352'),
    pattern: PATTERNS.includes(g?.pattern) ? g.pattern : 'tabby',
    white: num(g?.white, 0, 1, 0),
    blaze: !!g?.blaze,
    eye,
    eye2: color(g?.eye2, eye),
    nose: color(g?.nose, '#e99a8b'),
    earSize: num(g?.earSize, 0.8, 1.25, 1),
    earFold: !!g?.earFold,
    tail: num(g?.tail, 0.7, 1.3, 1),
    fluff: num(g?.fluff, 0, 1, 0),
    chonk: num(g?.chonk, 0.85, 1.35, 1),
    socks: !!g?.socks,
  };
}

function cleanPersonality(p: any): Personality {
  const t = (k: string) => num(p?.[k], 0, 1, 0.5);
  return { curious: t('curious'), playful: t('playful'), lazy: t('lazy'), social: t('social'), foodie: t('foodie'), brave: t('brave'), quirk: words(p?.quirk, 40) || '喜欢晒太阳', voice: words(p?.voice, 40) || '软软的' };
}

export interface MovePlan {
  pkgId: string;
  origin: string;
  fingerprint: string;
  createdAt: number;
  nickname: string;
  since: number;
  fish: number;
  inventory: InventoryMap;
  found: string[];
  cat: Omit<PackedCat, 'nest'> & { nest: NestLayout; nestKept: boolean };
  left: string[];
}

/** Check a package's signature and turn it into something safe to import. Throws a friendly error. */
export function readPackage(pkg: any): MovePlan {
  if (!pkg || pkg.format !== 'catnest-move' || pkg.v !== 1 || typeof pkg.body !== 'string' || typeof pkg.key !== 'string' || typeof pkg.sig !== 'string') throw new HttpError(400, '这不是猫窝的搬家包');
  if (pkg.body.length > PACKAGE_MAX) throw new HttpError(413, '搬家包太大了');
  let ok = false;
  try {
    ok = verify(null, Buffer.from(pkg.body), createPublicKey({ key: Buffer.from(pkg.key, 'base64'), format: 'der', type: 'spki' }), Buffer.from(pkg.sig, 'base64'));
  } catch {
    ok = false;
  }
  if (!ok) throw new HttpError(400, '搬家包被改动过，或者不完整');
  let b: any;
  try {
    b = JSON.parse(pkg.body);
  } catch {
    throw new HttpError(400, '搬家包读不出来');
  }
  if (b?.format !== 'catnest-move' || typeof b.id !== 'string' || !/^mv_[\w-]{8,40}$/.test(b.id) || !b.cat) throw new HttpError(400, '这不是猫窝的搬家包');
  const fp = fingerprint(pkg.key);
  if (b.source?.fingerprint !== fp) throw new HttpError(400, '搬家包的来源对不上');
  const now = Date.now();
  const inventory: InventoryMap = {};
  for (const [k, v] of Object.entries(b.inventory ?? {})) if (ITEM_MAP[k] && typeof v === 'number' && v >= 1) inventory[k] = Math.min(99, Math.floor(v));
  const found = [...new Set(list(b.found).filter((k): k is string => typeof k === 'string' && ITEM_MAP[k]?.cat === 'collect'))];
  const c = b.cat;
  const nestKept = !!c.nest && validateLayout(c.nest, inventory) === null;
  const stat = (k: keyof CatRecord['stats']) => num(c.stats?.[k], 0, k === 'bond' ? 1000 : 100, 60);
  return {
    pkgId: b.id,
    origin: typeof b.source?.origin === 'string' && /^https?:\/\/[\w.:[\]-]{1,100}$/.test(b.source.origin) ? b.source.origin : '',
    fingerprint: fp,
    createdAt: num(b.createdAt, EPOCH, now + 3600_000, now),
    nickname: words(b.player?.nickname, 12),
    since: num(b.player?.since, EPOCH, now, now),
    fish: Math.floor(num(b.fish, 0, 10_000_000, 0)),
    inventory,
    found,
    cat: {
      name: words(c.name, 8) || '小猫',
      genes: cleanGenes(c.genes),
      personality: cleanPersonality(c.personality),
      stats: { hunger: stat('hunger'), energy: stat('energy'), mood: stat('mood'), clean: stat('clean'), social: stat('social'), bond: stat('bond') },
      born: num(c.born, EPOCH, now, now),
      outfit: [...new Set(list(c.outfit).filter((w): w is string => typeof w === 'string' && !!WEAR_SLOT[w] && (inventory[w] ?? 0) > 0))].slice(0, 3),
      discovered: [...new Set(list(c.discovered).filter((p): p is string => typeof p === 'string' && !!POI_MAP[p]))],
      memory: list(c.memory).map((m) => words(m, 40)).filter(Boolean).slice(-7),
      stage: Math.round(num(c.stage, 0, 2, 0)),
      nest: nestKept ? (c.nest as NestLayout) : starterLayout(),
      nestKept,
      journal: list(c.journal)
        .slice(-JOURNAL_KEPT)
        .flatMap((e: any) => (KINDS.includes(e?.kind) && typeof e?.text === 'string' ? [{ ts: num(e.ts, EPOCH, now, now), kind: e.kind as JournalEntry['kind'], text: words(e.text, 200) }] : []))
        .filter((e) => e.text),
    },
    left: list(b.left).map((n) => words(n, 8)).filter(Boolean).slice(0, 10),
  };
}

/** The same cat from the same town, however many times it's packed. */
const catKey = (p: MovePlan) => `${p.fingerprint}|${p.cat.genes.seed}|${p.cat.born}`;
const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return '别的小镇';
  }
};

// ---------- servers this one trusts ----------
interface Trusted {
  fingerprint: string;
  origin: string;
  at: number;
}
const trustedList = () => db.kvGet<Trusted[]>('move:trusted') ?? [];
const isTrusted = (fp: string) => trustedList().some((t) => t.fingerprint === fp);

/** What the admin sees about a request, including anything worth a second look. */
function summarize(p: MovePlan, uid: string) {
  const items = Object.values(p.inventory).reduce((a, b) => a + b, 0);
  const rare = p.found.filter((k) => (ITEM_MAP[k]?.rarity ?? 1) >= 3).length;
  const days = Math.max(1, Math.round((Date.now() - p.cat.born) / 86400_000));
  const flags: string[] = [];
  if (p.fish > 20_000) flags.push(`小鱼干特别多（${p.fish}）`);
  if (items > 400) flags.push(`东西特别多（${items} 件）`);
  if (p.cat.stats.bond > 200 && days < 14) flags.push('才养了没几天，羁绊却很高');
  if (p.found.length > 40 && days < 14) flags.push('才养了没几天，收藏却很全');
  if (p.createdAt < Date.now() - 30 * 86400_000) flags.push('搬家包是一个多月前打的');
  if (!p.cat.nestKept) flags.push('猫窝布置对不上背包，会换成新手猫窝');
  const before = db.db.prepare("SELECT user_id FROM move_requests WHERE cat_key = ? AND status = 'approved' AND user_id != ? LIMIT 1").get(catKey(p), uid);
  if (before) flags.push('这只猫之前已经搬进来过一次（别的账号）');
  return {
    nickname: p.nickname,
    since: p.since,
    createdAt: p.createdAt,
    fish: p.fish,
    items,
    found: p.found.length,
    rare,
    cat: { name: p.cat.name, coat: coatName(p.cat.genes), days, places: p.cat.discovered.length, diary: p.cat.journal.length, bond: Math.round(p.cat.stats.bond) },
    left: p.left,
    flags,
  };
}

// ---------- asking to move in ----------
interface RequestRow {
  id: number;
  user_id: string;
  pkg_id: string;
  cat_key: string;
  origin: string;
  fingerprint: string;
  summary: string;
  body: string;
  status: string; // pending | approved | rejected | withdrawn
  reason: string | null;
  created: number;
  decided: number | null;
}

const one = (sql: string, ...args: (string | number)[]) => db.db.prepare(sql).get(...args) as unknown as RequestRow | undefined;

function requestView(row: RequestRow) {
  return { id: row.id, status: row.status, reason: row.reason, created: row.created, decided: row.decided, origin: row.origin, summary: JSON.parse(row.summary) as ReturnType<typeof summarize> };
}

route('POST', '/api/move/request', (r) => {
  const plan = readPackage(r.body?.pkg);
  if (plan.fingerprint === myFingerprint()) throw new HttpError(400, '这就是同一个小镇呀，不用搬家');
  if (ownCat(r.user.id)) throw new HttpError(400, '这个账号已经有一只猫猫了。搬家要用一个还没领养猫猫的新账号');
  if (one("SELECT * FROM move_requests WHERE user_id = ? AND status = 'pending'", r.user.id)) throw new HttpError(400, '已经有一份搬家申请在等回复了');
  if (one("SELECT * FROM move_requests WHERE pkg_id = ? AND status IN ('pending', 'approved')", plan.pkgId)) throw new HttpError(400, '这个搬家包已经用过了');
  const waiting = (db.db.prepare("SELECT COUNT(*) n FROM move_requests WHERE status = 'pending'").get() as { n: number }).n;
  if (waiting >= MAX_WAITING) throw new HttpError(429, '最近搬来的猫猫太多啦，管理员还没看完，过几天再来试试');
  const summary = summarize(plan, r.user.id);
  const id = Number(
    db.db
      .prepare("INSERT INTO move_requests (user_id, pkg_id, cat_key, origin, fingerprint, summary, body, status, created) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)")
      .run(r.user.id, plan.pkgId, catKey(plan), plan.origin, plan.fingerprint, JSON.stringify(summary), JSON.stringify(plan), Date.now()).lastInsertRowid,
  );
  return requestView(one('SELECT * FROM move_requests WHERE id = ?', id)!);
}, { limit: 'move', maxBody: 768 * 1024 });

route('GET', '/api/move/request', (r) => {
  const row = one('SELECT * FROM move_requests WHERE user_id = ? ORDER BY created DESC LIMIT 1', r.user.id);
  return { request: row ? requestView(row) : null, out: db.kvGet(`moveout:${r.user.id}`) ?? null, fingerprint: myFingerprint() };
});

route('DELETE', '/api/move/request', (r) => {
  db.db.prepare("UPDATE move_requests SET status = 'withdrawn', body = '{}', decided = ? WHERE user_id = ? AND status = 'pending'").run(Date.now(), r.user.id);
  return { ok: true };
});

/** Bring the cat (and its things) into the requesting account. */
function moveIn(row: RequestRow, fishCap: number): CatRecord {
  const plan = JSON.parse(row.body) as MovePlan;
  const u = db.getUser(row.user_id);
  if (!u) throw new HttpError(404, '这位玩家已经不在了');
  if (ownCat(u.id)) throw new HttpError(400, '这位玩家在这里已经领养了一只猫猫，没法再搬进来');
  const from = hostOf(plan.origin);
  const p = plan.cat;
  let made!: CatRecord;
  db.tx(() => {
    made = game.createCat(u.id, p.name, p.genes.seed);
    Object.assign(made, {
      genes: p.genes, personality: p.personality, stats: p.stats, statsAt: Date.now(), born: p.born, outfit: p.outfit, stage: p.stage,
      discovered: [...new Set(['home_lane', ...p.discovered])],
      memory: [...p.memory, `从${from}搬到了这里`],
    });
    game.saveNow(made);
    db.saveNest(made.id, p.nest);
    if (!p.nestKept) game.giveStarter(u.id);
    for (const e of p.journal) db.addJournal(made.id, e.kind, e.text, undefined, e.ts);
    db.addJournal(made.id, 'home', `从${from}搬到了这个小镇。新家的窗外，是没见过的风景。`);
    for (const [k, n] of Object.entries(plan.inventory)) db.invAdd(u.id, k, n);
    for (const k of plan.found) game.markFound(u.id, k);
    if (plan.fish > 0) game.addFish(u.id, Math.min(plan.fish, fishCap));
    db.updateUser(u.id, { active_cat: made.id });
    db.db.prepare("UPDATE move_requests SET status = 'approved', body = '{}', decided = ? WHERE id = ?").run(Date.now(), row.id);
  });
  game.notify(u.id, 'letter', '搬家完成啦', `${made.name}已经从${from}搬进来了，带着它的猫窝、背包和日记。欢迎来到这个小镇！`);
  return made;
}

// ---------- the admin's side ----------
route('GET', '/api/admin/moves', (r) => {
  requireAdmin(r);
  const rows = db.db.prepare("SELECT * FROM move_requests WHERE user_id != '' AND (status = 'pending' OR decided > ?) ORDER BY status = 'pending' DESC, created DESC LIMIT 60").all(Date.now() - 30 * 86400_000) as unknown as RequestRow[];
  return {
    fingerprint: myFingerprint(),
    trusted: trustedList(),
    requests: rows.map((row) => ({ ...requestView(row), user: db.getUser(row.user_id)?.nickname ?? '（已注销）', uid: row.user_id, fingerprint: row.fingerprint, trusted: isTrusted(row.fingerprint) })),
  };
}, { auth: false });

route('POST', '/api/admin/moves/:id', (r) => {
  requireAdmin(r);
  const row = one("SELECT * FROM move_requests WHERE id = ? AND status = 'pending'", Number(r.params.id));
  if (!row) throw new HttpError(404, '这份申请已经处理过了');
  if (r.body?.trust && !isTrusted(row.fingerprint)) db.kvSet('move:trusted', [...trustedList(), { fingerprint: row.fingerprint, origin: row.origin, at: Date.now() } satisfies Trusted]);
  if (!r.body?.approve) {
    const reason = words(r.body?.reason, 60);
    db.db.prepare("UPDATE move_requests SET status = 'rejected', reason = ?, body = '{}', decided = ? WHERE id = ?").run(reason || null, Date.now(), row.id);
    game.notify(row.user_id, 'letter', '搬家申请没有通过', reason ? `小镇管理员说：${reason}` : '这次没能搬过来。可以问问小镇的管理员。');
    return { ok: true, status: 'rejected' };
  }
  const cap = typeof r.body?.fishCap === 'number' ? Math.max(0, Math.floor(r.body.fishCap)) : FISH_CAP;
  const c = moveIn(row, cap);
  return { ok: true, status: 'approved', cat: c.id };
}, { auth: false });

// A player who leaves takes their request with them; an approved one keeps only
// what stops the same package (or cat) from being let in twice.
onAccountDeleted((uid) => {
  db.db.prepare("DELETE FROM move_requests WHERE user_id = ? AND status != 'approved'").run(uid);
  db.db.prepare("UPDATE move_requests SET user_id = '', origin = '', summary = '{}', body = '{}' WHERE user_id = ?").run(uid);
  db.db.prepare('DELETE FROM kv WHERE k = ?').run(`moveout:${uid}`);
});

route('POST', '/api/admin/moves-trusted/remove', (r) => {
  requireAdmin(r);
  const fp = String(r.body?.fingerprint ?? '');
  db.kvSet('move:trusted', trustedList().filter((t) => t.fingerprint !== fp));
  return { trusted: trustedList() };
}, { auth: false });
