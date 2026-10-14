import type { CatRecord } from '../../shared/types';
import { wishFor, type Wish, type WishKind } from '../../shared/wish';
import { clockAt } from '../../shared/time';
import { applyDelta, bondLevel } from '../../shared/stats';
import * as db from './db';
import * as game from './game';

export interface WishState {
  wish: Wish;
  progress: number;
  done: boolean;
}

function day() {
  return clockAt(Date.now()).day;
}

export function wishState(c: CatRecord): WishState {
  const d = day();
  const st = db.kvGet<{ progress: number; done: boolean }>(`wish:${c.id}:${d}`) ?? { progress: 0, done: false };
  return { wish: wishFor(c, d), ...st };
}

/** Record progress toward today's wish; returns true if it just came true. */
export function progressWish(c: CatRecord, kind: WishKind, target?: string): boolean {
  if (c.ownerId === 'town') return false;
  const d = day();
  const wish = wishFor(c, d);
  if (wish.kind !== kind) return false;
  if (wish.target && target && wish.target !== target) return false;
  if (wish.target && !target) return false;
  const key = `wish:${c.id}:${d}`;
  const st = db.kvGet<{ progress: number; done: boolean }>(key) ?? { progress: 0, done: false };
  if (st.done) return false;
  st.progress++;
  if (st.progress >= wish.need) st.done = true;
  db.kvSet(key, st);
  if (!st.done) return false;
  addBond(c, 3, { mood: 8 });
  for (const uid of game.ownersOf(c)) {
    game.addFish(uid, 20);
    game.notify(uid, 'wish', `${c.name}的心愿实现啦`, `「${wish.text}」——谢谢你。（+20 小鱼干）`);
  }
  db.addJournal(c.id, 'mood', `今天的小心愿「${wish.text}」实现了。被记住的感觉真好。`);
  game.remember(c, `心愿「${wish.text}」被实现了`);
  return true;
}

/** Increase bond, announcing level-ups gently. */
export function addBond(c: CatRecord, n: number, extra: Partial<CatRecord['stats']> = {}) {
  const before = bondLevel(c.stats.bond).level;
  c.stats = applyDelta(c.stats, { bond: n, ...extra });
  const after = bondLevel(c.stats.bond);
  game.markDirty(c);
  if (after.level > before && c.ownerId !== 'town') {
    db.addJournal(c.id, 'mood', `我们之间的感觉变成了「${after.name}」。`, { bond: after.level });
    for (const uid of game.ownersOf(c)) game.notify(uid, 'bond', `和${c.name}的羁绊加深了`, `现在是「${after.name}」（Lv.${after.level}）。`);
  }
}
