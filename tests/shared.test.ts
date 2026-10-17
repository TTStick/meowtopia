import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NPCS, NPC_MAP, townBond, walkBusy } from '../shared/npcs';
import { roomOpen } from '../shared/rooms';
import { SHOWS, showOn, showAt, showRole, STAGE_SPOTS, AUDIENCE_SPOTS } from '../shared/shows';
import { getWorld, getRooms, HOUSES, MY_HOUSE, houseDoor, POIS, POI_MAP, HOME_SPAWN, TILE, WW, Ter, poiPoint, walkable, walkableAt, planRoute, roomAt, zoneAt, type Room } from '../shared/world';
import { findPath, makeGrid, smoothPath } from '../shared/path';
import { starterLayout, STARTER_ITEMS, validateLayout, canPlace } from '../shared/nest';
import { advanceStats, freshStats, applyDelta, bondLevel, ageOf } from '../shared/stats';
import { randomGenes, randomPersonality } from '../shared/genes';
import { wishFor } from '../shared/wish';
import { fallbackLine, type SpeechCtx } from '../shared/speech';
import { ITEMS, ITEM_MAP, WEAR_SLOT } from '../shared/items';
import { weatherAt, clockAt, setWorldTz, WORLD_TZ } from '../shared/time';
import type { CatRecord } from '../shared/types';

const world = getWorld();

test('every place in town is reachable from the home lane', () => {
  const [hx, hy] = HOME_SPAWN;
  for (const poi of POIS) {
    for (const seed of [1, 2, 3]) {
      const [px, py] = poiPoint(world, poi, seed);
      assert.ok(walkableAt(world, px, py), `${poi.id} target point is not walkable`);
      const legs = planRoute(world, hx, hy, px, py);
      assert.ok(legs, `cannot reach ${poi.id}`);
      assert.equal(legs.length, poi.room ? 2 : 1, `${poi.id}: going in takes one door`);
      const end = legs.at(-1)!.pts.at(-1)!;
      assert.ok(Math.hypot(end[0] - px, end[1] - py) < TILE * 1.5, `${poi.id}: the walk ends where it should`);
    }
  }
});

test('every shop has a room you can walk into, around and out of', () => {
  const rooms = getRooms();
  assert.equal(rooms.length, 7);
  for (const r of rooms) {
    assert.ok(walkable(world, ...r.outside), `${r.id}: the street in front of the door is open`);
    assert.ok(walkableAt(world, ...r.door), `${r.id}: the door is not blocked inside`);
    assert.equal(roomAt(...r.door), r);
    assert.equal(roomAt(...r.outside), null);
    const spots: [string, number, number][] = [['poi', r.poi.x, r.poi.y]];
    if (r.counter) spots.push(['counter', ...r.counter]);
    for (const [name, x, y] of spots) {
      const [ux, uy] = [r.ox + x * TILE, r.oy + y * TILE];
      assert.ok(walkableAt(world, ux, uy), `${r.id}: ${name} is blocked`);
      const p = findPath(r.grid, Math.floor((r.door[0] - r.ox) / TILE), Math.floor((r.door[1] - r.oy) / TILE), Math.floor(x), Math.floor(y));
      assert.ok(p && p.at(-1)![0] === Math.floor(x) && p.at(-1)![1] === Math.floor(y), `${r.id}: cannot walk from the door to the ${name}`);
    }
    // room to room goes out one door and in the other
    const other: Room = rooms[(r.index + 1) % rooms.length];
    const legs = planRoute(world, r.door[0], r.door[1], other.door[0], other.door[1])!;
    assert.equal(legs.length, 3);
    assert.deepEqual(legs[1].from, r.outside);
    assert.deepEqual(legs[2].from, other.door);
  }
});

test('the new east and south are in the right zones', () => {
  const z = (x: number, y: number) => zoneAt(world, x * TILE, y * TILE);
  assert.equal(z(150, 17), 'spring');
  assert.equal(z(142, 50), 'orchard');
  assert.equal(z(167.5, 40), 'bamboo');
  assert.equal(z(146, 103), 'island');
  assert.equal(z(40, 101), 'creek');
  assert.equal(z(24, 111), 'camp');
  assert.equal(z(130, 71), 'beach');
  assert.equal(z(97, 80.5), 'pier');
  assert.equal(world.ter[101 * WW + 40], Ter.Stone);
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

test('proof-of-work sha256 matches node crypto', async () => {
  const { createHash } = await import('node:crypto');
  const { sha256Word0, zeroBits } = await import('../client/src/game/sha256');
  for (const msg of ['abc', '0123456789abcdef0123456789abcdef:0', 'f00d:123456789']) {
    const bytes = new TextEncoder().encode(msg);
    const buf = new Uint8Array(64);
    buf.set(bytes);
    const [w0, w1] = sha256Word0(buf, bytes.length);
    const ref = createHash('sha256').update(msg).digest();
    assert.equal(w0, ref.readUInt32BE(0));
    assert.equal(w1, ref.readUInt32BE(4));
    assert.ok(zeroBits(w0, w1) >= 0);
  }
});

test('residents: familiarity levels and when they can go for a walk', () => {
  assert.deepEqual([0, 2, 3, 9, 10, 25, 99].map((p) => townBond(p).level), [0, 0, 1, 1, 2, 3, 3]);
  assert.equal(townBond(3).next, 10);
  assert.equal(townBond(30).next, null);
  const lib = NPC_MAP.npc_lib;
  assert.match(walkBusy(lib, 10)!, /20点半以后有空/, 'busy at the library until the evening');
  assert.equal(walkBusy(lib, 21), null);
  assert.equal(walkBusy(lib, 3), '已经回家休息了');
  assert.equal(walkBusy(NPC_MAP.npc_kid1, 10), null, 'kids are always up for a walk');
  for (const n of NPCS) {
    for (const s of n.schedule) assert.ok(POI_MAP[s.poi], `${n.id}: unknown place ${s.poi}`);
    if (n.special?.gift) assert.ok(ITEM_MAP[n.special.gift.item], `${n.id}: unknown gift`);
  }
  // every shop's keeper actually works in it
  for (const r of getRooms()) if (r.keeper) assert.ok(NPC_MAP[r.keeper].schedule.some((s) => POI_MAP[s.poi]?.room === r.id), `${r.keeper} never works in ${r.id}`);
});

test('shops keep daytime hours; the cafe stays open late', () => {
  const room = (id: string) => getRooms().find((r) => r.id === id)!;
  assert.equal(roomOpen(room('bakery'), 10), true);
  assert.equal(roomOpen(room('bakery'), 22), false);
  assert.equal(roomOpen(room('cafe'), 22), true);
  assert.equal(roomOpen(room('cafe'), 23.5), false);
  assert.equal(roomOpen(room('library'), 5), false);
});

test('shows: about four nights a week, 19:30 to 21:00, everyone has a reachable place', () => {
  let nights = 0;
  for (let d = 20000; d < 20700; d++) if (showOn(d)) nights++;
  assert.ok(nights > 330 && nights < 480, `${nights} show nights in 700 days`);
  const day = [...Array(60).keys()].map((i) => 20000 + i).find((d) => showOn(d))!;
  const at = (h: number) => (day * 24 + h - WORLD_TZ) * 3600_000;
  const hour = (h: number) => {
    const ms = at(h);
    return weatherAt(ms).kind === 'rain' ? 'rain' : showAt(ms);
  };
  if (hour(19.7) !== 'rain') {
    assert.equal(showAt(at(18.9)), null);
    assert.equal(showAt(at(19.2))?.live, false, 'townsfolk gather first');
    assert.equal(showAt(at(19.6))?.live, true);
    assert.equal(showAt(at(21.01)), null);
  }
  const [hx, hy] = HOME_SPAWN;
  for (const [x, y] of [...STAGE_SPOTS, ...AUDIENCE_SPOTS]) {
    assert.ok(walkable(world, x * TILE, y * TILE), `spot ${x},${y} is blocked`);
    assert.ok(planRoute(world, hx, hy, x * TILE, y * TILE), `spot ${x},${y} can't be reached`);
  }
  for (const show of SHOWS) {
    for (const id of [show.host, ...show.cast.map((c) => c.id), ...show.crowd]) assert.ok(NPC_MAP[id], `${show.id}: unknown ${id}`);
    const now = { show, day, live: true, progress: 0.5 };
    const spots = [...show.cast.map((c) => c.id), ...show.crowd].map((id) => showRole(id, now)!.spot.join(','));
    assert.equal(new Set(spots).size, spots.length, `${show.id}: two townsfolk share a spot`);
  }
});

test('the neighbourhood: fifteen houses, every door on a path you can reach, mine by the home lane', () => {
  assert.equal(HOUSES.length, 15);
  assert.ok(MY_HOUSE >= 0);
  const [hx, hy] = HOME_SPAWN;
  for (const b of HOUSES) {
    const [dx, dy] = houseDoor(b);
    assert.ok(walkable(world, dx, dy), `door of the house at ${b.x},${b.y} is blocked`);
    assert.ok(planRoute(world, hx, hy, dx, dy), `can't walk to the house at ${b.x},${b.y}`);
    assert.equal(zoneAt(world, dx, dy), 'residential');
  }
  const [mx, my] = houseDoor(HOUSES[MY_HOUSE]);
  assert.ok(Math.hypot(mx - hx, my - hy) < 3 * TILE, 'my door is right by the home lane');
});
