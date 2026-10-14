import { randomBytes, randomUUID } from 'node:crypto';
import { route, HttpError, str, cleanText } from './http';
import * as db from './db';
import * as game from './game';
import { ITEM_MAP, WEAR_SLOT } from '../../shared/items';
import { validateLayout } from '../../shared/nest';
import { applyDelta } from '../../shared/stats';
import { CAT_NAMES } from '../../shared/genes';
import { POIS } from '../../shared/world';
import type { CatRecord, NestLayout, UserSettings } from '../../shared/types';
import type { SpeechCtx } from '../../shared/speech';
import { catLine, interpretCommand, llmEnabled } from './llm';
import { progressWish, wishState, addBond } from './wish';
import { localClock, WORLD_TZ } from '../../shared/time';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function code(n: number) {
  const b = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
  return s;
}

function myCat(uid: string, id: string): CatRecord {
  const c = game.getCat(id);
  if (!c || !game.canAccess(uid, c)) throw new HttpError(404, '找不到这只猫猫');
  return game.refresh(c);
}

// ---------- account ----------
const regLog = new Map<string, number[]>();
route('POST', '/api/register', (r) => {
  const ip = String(r.raw.headers['x-forwarded-for'] ?? r.raw.socket.remoteAddress ?? '').split(',')[0].trim();
  const now = Date.now();
  const recent = (regLog.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (recent.length >= 12) throw new HttpError(429, '领养得太频繁啦，休息一下再来吧');
  recent.push(now);
  regLog.set(ip, recent);
  const nickname = r.body.nickname ? cleanText(str(r.body.nickname, 12, '昵称')) : '铲屎官';
  const id = 'u_' + randomUUID().replace(/-/g, '').slice(0, 12);
  const token = randomBytes(24).toString('base64url');
  const recovery = `${code(4)}-${code(4)}-${code(4)}`;
  const settings: UserSettings = { ...game.DEFAULT_SETTINGS, tzOffset: Number(r.body.tzOffset) || -480 };
  db.insertUser({ id, token, code: recovery, nickname, fish: 200, settings });
  return { token, me: game.me(db.getUser(id)!) };
}, false);

route('POST', '/api/login', (r) => {
  const c = str(r.body.code, 20, '找回码').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const formatted = c.length === 12 ? `${c.slice(0, 4)}-${c.slice(4, 8)}-${c.slice(8)}` : c;
  const u = db.getUserByCode(formatted);
  if (!u) throw new HttpError(404, '没有找到这个找回码');
  return { token: u.token, me: game.me(u) };
}, false);

route('GET', '/api/me', (r) => {
  const me = game.me(r.user);
  const gap = Date.now() - r.user.last_seen;
  if (gap > 3 * 3600_000 && me.cats.length) {
    const entries = me.cats
      .flatMap((c) => db.getJournal(c.id, Date.now() + 1, 12).filter((e) => e.ts > r.user.last_seen))
      .sort((a, b) => a.ts - b.ts)
      .slice(-8);
    me.away = { since: r.user.last_seen, entries };
  }
  return me;
});

route('POST', '/api/settings', (r) => {
  const cur = game.settingsOf(r.user);
  const b = r.body ?? {};
  const next: UserSettings = {
    push: typeof b.push === 'boolean' ? b.push : cur.push,
    quietStart: Number.isInteger(b.quietStart) ? Math.max(0, Math.min(23, b.quietStart)) : cur.quietStart,
    quietEnd: Number.isInteger(b.quietEnd) ? Math.max(0, Math.min(23, b.quietEnd)) : cur.quietEnd,
    tzOffset: Number.isFinite(b.tzOffset) ? b.tzOffset : cur.tzOffset,
    sound: typeof b.sound === 'boolean' ? b.sound : cur.sound,
    music: typeof b.music === 'boolean' ? b.music : cur.music,
  };
  const patch: Partial<db.UserRow> = { settings: JSON.stringify(next) };
  if (typeof b.nickname === 'string' && b.nickname.trim()) patch.nickname = cleanText(str(b.nickname, 12, '昵称'));
  db.updateUser(r.user.id, patch);
  return game.me(db.getUser(r.user.id)!);
});

route('POST', '/api/daily', (r) => {
  const s = game.settingsOf(r.user);
  const today = localClock(Date.now(), s.tzOffset).day;
  const last = localClock(r.user.last_daily, s.tzOffset).day;
  if (r.user.last_daily && today === last) return { got: 0, fish: r.user.fish };
  const got = 30;
  db.updateUser(r.user.id, { last_daily: Date.now() });
  return { got, fish: game.addFish(r.user.id, got) };
});

// ---------- cats ----------
route('POST', '/api/adopt', (r) => {
  const own = game.catsOf(r.user.id).filter((c) => c.ownerId === r.user.id && !c.coOwnerId);
  if (own.length >= 1) throw new HttpError(400, '你已经有一只猫猫啦');
  const name = cleanText(str(r.body.name, 8, '名字'));
  const seed = Number(r.body.seed) >>> 0;
  if (!seed) throw new HttpError(400, '请选择一只猫猫');
  const c = game.createCat(r.user.id, name, seed);
  game.giveStarter(r.user.id);
  db.updateUser(r.user.id, { active_cat: c.id });
  db.addJournal(c.id, 'home', `${name}来到了新家。这里有一个软软的猫窝，和一个会摸摸它的人。`);
  return game.me(db.getUser(r.user.id)!);
});

route('POST', '/api/active', (r) => {
  const c = myCat(r.user.id, str(r.body.catId, 40));
  db.updateUser(r.user.id, { active_cat: c.id });
  return { ok: true };
});

route('POST', '/api/cat/:id/rename', (r) => {
  const c = myCat(r.user.id, r.params.id);
  c.name = cleanText(str(r.body.name, 8, '名字'));
  game.saveNow(c);
  return c;
});

const petCooldown = new Map<string, number>();
route('POST', '/api/cat/:id/act', (r) => {
  const c = myCat(r.user.id, r.params.id);
  const kind = String(r.body.kind);
  const now = Date.now();
  const key = `${r.user.id}:${c.id}:${kind}`;
  const cool = (petCooldown.get(key) ?? 0) < now;
  let delta: Record<string, number> = {};
  let bond = 0;
  let wishDone = false;
  let first = false;
  switch (kind) {
    case 'pet':
      delta = { mood: 3, social: 6 };
      bond = cool ? 1 : 0;
      if (cool) petCooldown.set(key, now + 20_000);
      wishDone = progressWish(c, 'pet');
      break;
    case 'play':
      delta = { mood: 5, energy: -3, social: 4 };
      bond = cool ? 1 : 0;
      if (cool) petCooldown.set(key, now + 30_000);
      wishDone = progressWish(c, 'play');
      break;
    case 'feed': {
      const it = ITEM_MAP[String(r.body.item)];
      if (!it?.food) throw new HttpError(400, '这个不能吃哦');
      if (db.invCount(r.user.id, it.id) <= 0) throw new HttpError(400, `没有${it.name}了`);
      db.invAdd(r.user.id, it.id, -1);
      delta = { hunger: it.food.hunger, mood: it.food.mood };
      bond = it.food.bond;
      wishDone = progressWish(c, 'treat', it.id);
      break;
    }
    case 'brush':
      delta = { clean: 15, mood: 2 };
      bond = cool ? 1 : 0;
      if (cool) petCooldown.set(key, now + 40_000);
      break;
    case 'goodnight': {
      // once per night (a "night" runs from noon to noon)
      const night = localClock(now - 12 * 3600_000, game.settingsOf(r.user).tzOffset).day;
      const k = `gn:${c.id}:${r.user.id}:${night}`;
      if (!db.kvGet(k)) {
        db.kvSet(k, 1);
        first = true;
        delta = { mood: 6, energy: 10 };
        bond = 2;
        db.addJournal(c.id, 'mood', pickOne(['今晚你哄我睡觉了。梦里也是暖暖的。', '你说了晚安，我就安心地闭上了眼睛。', '睡前被摸了摸头，今天圆满了。']));
      }
      wishDone = progressWish(c, 'goodnight');
      break;
    }
    default:
      throw new HttpError(400, '未知的互动');
  }
  c.stats = applyDelta(c.stats, delta);
  if (bond) addBond(c, bond);
  game.markDirty(c);
  return { stats: c.stats, inventory: db.getInventory(r.user.id), wishDone, first };
});

function pickOne<T>(a: T[]): T {
  return a[Math.floor(Math.random() * a.length)];
}

route('GET', '/api/cat/:id/wish', (r) => {
  const c = myCat(r.user.id, r.params.id);
  return wishState(c);
});

route('POST', '/api/cat/:id/outfit', (r) => {
  const c = myCat(r.user.id, r.params.id);
  const list: string[] = Array.isArray(r.body.outfit) ? r.body.outfit.map(String) : [];
  const slots = new Set<string>();
  for (const id of list) {
    const slot = WEAR_SLOT[id];
    if (!slot) throw new HttpError(400, '这个不能穿哦');
    if (slots.has(slot)) throw new HttpError(400, '同一个位置只能戴一个');
    slots.add(slot);
    if (db.invCount(r.user.id, id) <= 0) throw new HttpError(400, `还没有${ITEM_MAP[id].name}`);
  }
  const changed = list.join() !== c.outfit.join();
  c.outfit = list;
  game.saveNow(c);
  if (changed && list.length) progressWish(c, 'outfit');
  return c;
});

route('GET', '/api/cat/:id/journal', (r) => {
  const c = myCat(r.user.id, r.params.id);
  const before = Number(r.query.get('before')) || Date.now() + 1;
  return db.getJournal(c.id, before, 30);
});

route('GET', '/api/cat/:id/line', (r) => {
  const c = myCat(r.user.id, r.params.id);
  const ctx = (r.query.get('ctx') ?? 'idle') as SpeechCtx;
  const info: Record<string, string> = {};
  for (const k of ['place', 'item', 'other', 'food']) {
    const v = r.query.get(k);
    if (v) info[k] = v.slice(0, 20);
  }
  return { text: catLine(c, ctx, { ...info, owner: r.user.nickname }) };
});

route('POST', '/api/cat/:id/command', async (r) => {
  const c = myCat(r.user.id, r.params.id);
  const text = str(r.body.text, 60, '指令');
  const where = r.body.where === 'world' ? 'world' : 'nest';
  const places = POIS.filter((p) => c.discovered.includes(p.id) || where === 'world').map((p) => ({ id: p.id, name: p.name }));
  return interpretCommand(c, text, places, where);
});

route('GET', '/api/status', () => ({ llm: llmEnabled(), worldTz: WORLD_TZ }), false);

// ---------- nest ----------
route('GET', '/api/nest/:catId', (r) => {
  const c = game.getCat(r.params.catId);
  if (!c) throw new HttpError(404, '找不到这个猫窝');
  const layout = db.getNest(c.id);
  const mine = game.canAccess(r.user.id, c);
  const owner = db.getUser(c.ownerId);
  return {
    layout,
    cat: game.refresh(c),
    mine,
    ownerName: owner?.nickname ?? '小镇',
  };
});

route('PUT', '/api/nest/:catId', (r) => {
  const c = myCat(r.user.id, r.params.catId);
  const layout = r.body.layout as NestLayout;
  // co-owned nests may use furniture from both owners' inventories
  const inv = db.getInventory(c.ownerId);
  if (c.coOwnerId) {
    for (const [k, n] of Object.entries(db.getInventory(c.coOwnerId))) inv[k] = (inv[k] ?? 0) + n;
  }
  const err = validateLayout(layout, inv);
  if (err) throw new HttpError(400, err);
  db.saveNest(c.id, { wallpaper: layout.wallpaper, floor: layout.floor, items: layout.items.map((i) => ({ uid: String(i.uid).slice(0, 16), item: i.item, gx: i.gx, gy: i.gy, flip: !!i.flip })), wall: layout.wall.map((w) => ({ uid: String(w.uid).slice(0, 16), item: w.item, wx: w.wx })) });
  return { ok: true };
});

// ---------- shop ----------
route('POST', '/api/shop/buy', (r) => {
  const it = ITEM_MAP[String(r.body.item)];
  const qty = Math.max(1, Math.min(20, Number(r.body.qty) || 1));
  if (!it || !it.shop || it.price <= 0) throw new HttpError(400, '这个不卖哦');
  if ((it.cat === 'wear' || it.cat === 'wallpaper' || it.cat === 'floor') && db.invCount(r.user.id, it.id) > 0) throw new HttpError(400, '已经有啦');
  const cost = it.price * qty;
  const u = db.getUser(r.user.id)!;
  if (u.fish < cost) throw new HttpError(400, '小鱼干不够啦');
  db.tx(() => {
    game.addFish(u.id, -cost);
    db.invAdd(u.id, it.id, it.cat === 'wear' || it.cat === 'wallpaper' || it.cat === 'floor' ? 1 : qty);
  });
  return { fish: db.getUser(u.id)!.fish, inventory: db.getInventory(u.id) };
});

route('POST', '/api/shop/sell', (r) => {
  const it = ITEM_MAP[String(r.body.item)];
  const qty = Math.max(1, Math.min(50, Number(r.body.qty) || 1));
  if (!it || it.cat !== 'collect') throw new HttpError(400, '这个不收哦');
  if (db.invCount(r.user.id, it.id) < qty) throw new HttpError(400, '数量不够');
  const got = (it.sell ?? 1) * qty;
  db.tx(() => {
    db.invAdd(r.user.id, it.id, -qty);
    game.addFish(r.user.id, got);
  });
  return { got, fish: db.getUser(r.user.id)!.fish, inventory: db.getInventory(r.user.id) };
});

route('GET', '/api/collection', (r) => ({ found: game.foundItems(r.user.id) }));

// ---------- letters / events ----------
route('GET', '/api/events', (r) => {
  return db.db.prepare('SELECT id, ts, kind, title, text, seen FROM events WHERE user_id = ? ORDER BY ts DESC LIMIT 60').all(r.user.id);
});
route('POST', '/api/events/seen', (r) => {
  db.db.prepare('UPDATE events SET seen = 1 WHERE user_id = ?').run(r.user.id);
  return { ok: true };
});

// ---------- social: friends, visiting, notes ----------
route('GET', '/api/cat/:id/friends', (r) => {
  const c = myCat(r.user.id, r.params.id);
  const rows = db.db.prepare('SELECT a, b, affinity, meets, last FROM friendships WHERE a = ? OR b = ? ORDER BY affinity DESC LIMIT 40').all(c.id, c.id) as any[];
  return rows
    .map((f) => {
      const oid = f.a === c.id ? f.b : f.a;
      const o = game.getCat(oid);
      if (!o) return null;
      return { id: o.id, name: o.name, genes: o.genes, outfit: o.outfit, affinity: f.affinity, meets: f.meets, last: f.last, location: o.location, isTown: o.ownerId === 'town' };
    })
    .filter(Boolean);
});

route('GET', '/api/visit/random', (r) => {
  const rows = db.db.prepare("SELECT id FROM cats WHERE owner_id != ? AND (co_owner_id IS NULL OR co_owner_id != ?) AND owner_id != 'town' ORDER BY RANDOM() LIMIT 8").all(r.user.id, r.user.id) as { id: string }[];
  return rows.map((x) => game.getCat(x.id)).filter(Boolean).map((c) => ({ id: c!.id, name: c!.name, genes: c!.genes, outfit: c!.outfit, location: c!.location }));
});

const STICKERS = ['paw', 'heart', 'fish', 'flower', 'star', 'sun', 'moon', 'leaf', 'cake', 'music'];
route('POST', '/api/notes', (r) => {
  const c = game.getCat(str(r.body.catId, 40));
  if (!c) throw new HttpError(404, '找不到这个猫窝');
  const sticker = STICKERS.includes(r.body.sticker) ? r.body.sticker : 'paw';
  const text = r.body.text ? cleanText(str(r.body.text, 30, '留言')) : '';
  const since = Date.now() - 86400_000;
  const n = (db.db.prepare('SELECT COUNT(*) n FROM notes WHERE from_user = ? AND cat_id = ? AND ts > ?').get(r.user.id, c.id, since) as { n: number }).n;
  if (n >= 3) throw new HttpError(400, '今天已经留过很多纸条啦，明天再来吧');
  const myCats = game.catsOf(r.user.id);
  db.db.prepare('INSERT INTO notes (cat_id, from_user, from_name, from_cat, sticker, text, ts) VALUES (?, ?, ?, ?, ?, ?, ?)').run(c.id, r.user.id, r.user.nickname, myCats[0]?.name ?? null, sticker, text, Date.now());
  for (const uid of game.ownersOf(c)) if (uid !== r.user.id) game.notify(uid, 'note', `${myCats[0]?.name ?? r.user.nickname}来串门了`, text ? `留下了一张纸条：「${text}」` : '在你的猫窝门口留下了一个小贴纸');
  return { ok: true };
});

route('GET', '/api/notes/:catId', (r) => {
  const c = game.getCat(r.params.catId);
  if (!c) throw new HttpError(404, '找不到');
  const rows = db.db.prepare('SELECT id, from_name, from_cat, sticker, text, ts, seen FROM notes WHERE cat_id = ? ORDER BY ts DESC LIMIT 30').all(c.id);
  if (game.canAccess(r.user.id, c)) db.db.prepare('UPDATE notes SET seen = 1 WHERE cat_id = ?').run(c.id);
  return rows;
});

// ---------- co-parenting (共养) ----------
function bondView(uid: string, b: any) {
  const partnerId = b.user_a === uid ? b.user_b : b.user_a;
  const partner = partnerId ? db.getUser(partnerId) : undefined;
  const cat = b.cat_id ? game.getCat(b.cat_id) : undefined;
  const diary = db.db.prepare('SELECT user_id, text, ts FROM diary WHERE bond_id = ? ORDER BY ts DESC LIMIT 30').all(b.id) as any[];
  return {
    id: b.id,
    status: b.status,
    code: b.status === 'invite' && b.user_a === uid ? b.code : undefined,
    partnerName: partner?.nickname ?? null,
    cat: cat ? game.refresh(cat) : null,
    created: b.created,
    diary: diary.map((d) => ({ mine: d.user_id === uid, text: d.text, ts: d.ts })),
  };
}

function createBond(a: string, b: string): string {
  const id = 'b_' + randomUUID().replace(/-/g, '').slice(0, 10);
  const seed = (Math.random() * 2 ** 31) >>> 0;
  const name = CAT_NAMES[seed % CAT_NAMES.length];
  const c = game.createCat(a, name, seed, b);
  db.addJournal(c.id, 'home', `${name}有了两个铲屎官。它还不知道，自己会被加倍地爱着。`);
  db.db.prepare('INSERT INTO bonds (id, user_a, user_b, cat_id, created, status) VALUES (?, ?, ?, ?, ?, ?)').run(id, a, b, c.id, Date.now(), 'active');
  for (const uid of [a, b]) game.notify(uid, 'bond', '有了一只共养的小猫', `${name}来了！你和一位陌生的朋友会一起照顾它。`);
  return id;
}

route('GET', '/api/bond', (r) => {
  const rows = db.db.prepare("SELECT * FROM bonds WHERE (user_a = ? OR user_b = ?) AND status != 'ended' ORDER BY created DESC").all(r.user.id, r.user.id) as any[];
  const queued = !!db.db.prepare('SELECT 1 FROM match_queue WHERE user_id = ?').get(r.user.id);
  return { bonds: rows.map((b) => bondView(r.user.id, b)), queued };
});

route('POST', '/api/bond/match', (r) => {
  const active = db.db.prepare("SELECT COUNT(*) n FROM bonds WHERE (user_a = ? OR user_b = ?) AND status = 'active'").get(r.user.id, r.user.id) as { n: number };
  if (active.n >= 2) throw new HttpError(400, '已经有两只共养的猫猫啦');
  const other = db.db.prepare('SELECT user_id FROM match_queue WHERE user_id != ? ORDER BY ts LIMIT 1').get(r.user.id) as { user_id: string } | undefined;
  if (other) {
    const already = db.db.prepare("SELECT 1 FROM bonds WHERE status = 'active' AND ((user_a = ? AND user_b = ?) OR (user_a = ? AND user_b = ?))").get(r.user.id, other.user_id, other.user_id, r.user.id);
    if (!already) {
      db.db.prepare('DELETE FROM match_queue WHERE user_id IN (?, ?)').run(r.user.id, other.user_id);
      createBond(other.user_id, r.user.id);
      return { matched: true };
    }
  }
  db.db.prepare('INSERT OR REPLACE INTO match_queue (user_id, ts) VALUES (?, ?)').run(r.user.id, Date.now());
  return { matched: false, queued: true };
});

route('DELETE', '/api/bond/match', (r) => {
  db.db.prepare('DELETE FROM match_queue WHERE user_id = ?').run(r.user.id);
  return { ok: true };
});

route('POST', '/api/bond/invite', (r) => {
  const existing = db.db.prepare("SELECT * FROM bonds WHERE user_a = ? AND status = 'invite'").get(r.user.id) as any;
  if (existing) return { code: existing.code };
  const c = code(6);
  db.db.prepare('INSERT INTO bonds (id, user_a, user_b, cat_id, code, created, status) VALUES (?, ?, NULL, NULL, ?, ?, ?)').run('b_' + randomUUID().replace(/-/g, '').slice(0, 10), r.user.id, c, Date.now(), 'invite');
  return { code: c };
});

route('POST', '/api/bond/join', (r) => {
  const c = str(r.body.code, 10, '邀请码').toUpperCase();
  const b = db.db.prepare("SELECT * FROM bonds WHERE code = ? AND status = 'invite'").get(c) as any;
  if (!b) throw new HttpError(404, '邀请码不对或已经用过了');
  if (b.user_a === r.user.id) throw new HttpError(400, '不能和自己共养哦');
  db.db.prepare("UPDATE bonds SET status = 'ended' WHERE id = ?").run(b.id);
  createBond(b.user_a, r.user.id);
  return { ok: true };
});

route('POST', '/api/bond/:id/diary', (r) => {
  const b = db.db.prepare("SELECT * FROM bonds WHERE id = ? AND status = 'active' AND (user_a = ? OR user_b = ?)").get(r.params.id, r.user.id, r.user.id) as any;
  if (!b) throw new HttpError(404, '找不到');
  const text = cleanText(str(r.body.text, 120, '日记'));
  const since = Date.now() - 20 * 3600_000;
  const n = (db.db.prepare('SELECT COUNT(*) n FROM diary WHERE bond_id = ? AND user_id = ? AND ts > ?').get(b.id, r.user.id, since) as { n: number }).n;
  if (n >= 1) throw new HttpError(400, '今天已经写过啦，明天再写一页吧');
  db.db.prepare('INSERT INTO diary (bond_id, user_id, text, ts) VALUES (?, ?, ?, ?)').run(b.id, r.user.id, text, Date.now());
  const partner = b.user_a === r.user.id ? b.user_b : b.user_a;
  const cat = game.getCat(b.cat_id);
  if (partner) game.notify(partner, 'diary', '交换日记翻开了新的一页', `关于${cat?.name ?? '猫猫'}的一点小事，等你来看。`);
  return bondView(r.user.id, b);
});

route('POST', '/api/bond/:id/leave', (r) => {
  const b = db.db.prepare("SELECT * FROM bonds WHERE id = ? AND status != 'ended' AND (user_a = ? OR user_b = ?)").get(r.params.id, r.user.id, r.user.id) as any;
  if (!b) throw new HttpError(404, '找不到');
  db.db.prepare("UPDATE bonds SET status = 'ended' WHERE id = ?").run(b.id);
  const c = b.cat_id ? game.getCat(b.cat_id) : undefined;
  if (c) {
    // The cat moves into the town and becomes a resident everyone can still meet.
    c.ownerId = 'town';
    c.coOwnerId = null;
    c.location = 'world';
    game.saveNow(c);
    const partner = b.user_a === r.user.id ? b.user_b : b.user_a;
    for (const uid of [b.user_a, b.user_b].filter(Boolean)) game.notify(uid, 'bond', `${c.name}搬去小镇生活了`, '它会在小镇里过得很好，你们还能在街上遇见它。');
    void partner;
  }
  return { ok: true };
});
