import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getWorld, POIS, HOME_SPAWN, TILE, poiPoint, walkable } from '../shared/world';
import { findPath, makeGrid, smoothPath } from '../shared/path';
import { starterLayout, STARTER_ITEMS, validateLayout, canPlace } from '../shared/nest';
import { advanceStats, freshStats, applyDelta, bondLevel, ageOf } from '../shared/stats';
import { randomGenes, randomPersonality } from '../shared/genes';
import { wishFor } from '../shared/wish';
import { fallbackLine, type SpeechCtx } from '../shared/speech';
import { ITEMS, ITEM_MAP, WEAR_SLOT } from '../shared/items';
import { weatherAt, clockAt, setWorldTz } from '../shared/time';
import type { CatRecord } from '../shared/types';

const world = getWorld();

test('every place in town is reachable from the home lane', () => {
  const [hx, hy] = HOME_SPAWN;
  for (const poi of POIS) {
    const [px, py] = poiPoint(world, poi, 1);
    const path = findPath(world.grid, Math.floor(hx / TILE), Math.floor(hy / TILE), Math.floor(px / TILE), Math.floor(py / TILE), 100000);
    assert.ok(path, `cannot reach ${poi.id}`);
    assert.ok(walkable(world, px, py), `${poi.id} target point is not walkable`);
  }
});

test('pathfinding avoids walls and smoothing keeps line of sight', () => {
  const g = makeGrid(10, 10);
  for (let y = 0; y < 9; y++) g.blocked[y * 10 + 5] = 1; // wall with a gap at the bottom
  const p = findPath(g, 0, 0, 9, 0)!;
  assert.ok(p.length > 10);
  assert.ok(p.every(([x, y]) => !g.blocked[y * 10 + x]));
  const s = smoothPath(g, p);
  assert.ok(s.length < p.length);
  assert.deepEqual(s[0], [0, 0]);
  assert.deepEqual(s.at(-1), [9, 0]);
});

test('starter nest is valid for the starter inventory', () => {
  assert.equal(validateLayout(starterLayout(), STARTER_ITEMS), null);
});

test('layout validation rejects overlaps, missing items and out-of-room placement', () => {
  const l = starterLayout();
  l.items.push({ uid: 'x', item: 'box', gx: l.items[0].gx, gy: l.items[0].gy });
  assert.match(validateLayout(l, { ...STARTER_ITEMS, box: 5 }) ?? '', /重叠/);
  const l2 = starterLayout();
  l2.items.push({ uid: 'y', item: 'sofa', gx: 0, gy: 5 });
  assert.match(validateLayout(l2, STARTER_ITEMS) ?? '', /不够/);
  const l3 = starterLayout();
  l3.items[0].gx = 50;
  assert.ok(validateLayout(l3, STARTER_ITEMS));
  assert.equal(canPlace(starterLayout(), 'rug_round', 1, 1), true, 'rugs may go under furniture');
});

test('stats stay gentle: a week alone never leaves the cat starving or miserable', () => {
  const p = randomPersonality(3);
  const s = advanceStats(freshStats(), p, 0, 7 * 86400_000, 'nest');
  assert.ok(s.hunger >= 30 && s.mood >= 25 && s.energy >= 5);
  const b = applyDelta(freshStats(), { bond: 5000 });
  assert.equal(b.bond, 1000);
  assert.equal(bondLevel(0).level, 1);
  assert.ok(bondLevel(700).level > bondLevel(100).level);
  assert.equal(ageOf(0, 0), 0.3);
  assert.equal(ageOf(0, 60 * 86400_000), 1);
});

test('wishes are deterministic per day and always well-formed', () => {
  for (let i = 0; i < 50; i++) {
    const cat = { id: 'c' + i, genes: randomGenes(i + 1), personality: randomPersonality(i + 1), discovered: [] } as unknown as CatRecord;
    const a = wishFor(cat, 20000 + i), b = wishFor(cat, 20000 + i);
    assert.deepEqual(a, b);
    assert.ok(a.text.length > 0 && a.need >= 1);
    if (a.kind === 'treat') assert.ok(ITEM_MAP[a.target!]?.food);
  }
});

test('fallback speech covers every context with a non-empty line', () => {
  const ctxs: SpeechCtx[] = ['idle', 'pet', 'feed', 'play', 'sleepy', 'wake', 'window', 'explore', 'place', 'find', 'meet', 'home', 'greet', 'hungry', 'night', 'rain', 'snow', 'box', 'sun', 'command_ok', 'command_confused', 'friend', 'bored', 'groom', 'scratch', 'dress', 'decor', 'lonely', 'goodnight', 'wish', 'grow', 'bond'];
  for (let i = 0; i < 8; i++) {
    const p = randomPersonality(i);
    for (const c of ctxs) {
      const line = fallbackLine(c, { name: '团子', p, place: '河边', item: '鹅卵石', other: '年糕', food: '罐罐' }, i * 31);
      assert.ok(line.length > 1, c);
      assert.ok(!line.includes('{'), `unfilled template in ${c}: ${line}`);
    }
  }
});

test('item catalog is consistent', () => {
  const ids = new Set<string>();
  for (const it of ITEMS) {
    assert.ok(!ids.has(it.id), `duplicate ${it.id}`);
    ids.add(it.id);
    if (it.cat === 'furniture') assert.ok((it.w ?? 1) >= 1 && (it.h ?? 1) >= 1);
    if (it.cat === 'wear') assert.ok(WEAR_SLOT[it.id], `${it.id} has no slot`);
    if (it.cat === 'collect') assert.ok(it.zones?.length && it.sell! > 0);
  }
});

test('weather is shared and the world clock follows the configured timezone', () => {
  const t = Date.UTC(2026, 9, 14, 12, 0, 0);
  assert.deepEqual(weatherAt(t), weatherAt(t));
  setWorldTz(8);
  assert.equal(Math.floor(clockAt(t).hour), 20);
  setWorldTz(2);
  assert.equal(Math.floor(clockAt(t).hour), 14);
});
