import type { NestLayout, InventoryMap } from './types';
import { ITEM_MAP, ROOM_W, ROOM_H, WALL_SLOTS } from './items';

export function starterLayout(): NestLayout {
  return {
    wallpaper: 'wp_cream',
    floor: 'fl_wood',
    items: [
      { uid: 's1', item: 'bed_round', gx: 1, gy: 1 },
      { uid: 's2', item: 'bowl_food', gx: 6, gy: 1 },
      { uid: 's3', item: 'bowl_water', gx: 7, gy: 1 },
      { uid: 's4', item: 'box', gx: 2, gy: 4 },
      { uid: 's5', item: 'scratch_post', gx: 0, gy: 3 },
      { uid: 's6', item: 'cushion', gx: 6, gy: 4 },
      { uid: 's7', item: 'yarn', gx: 4, gy: 2 },
      { uid: 's8', item: 'plant', gx: 8, gy: 0 },
    ],
    wall: [
      { uid: 'w1', item: 'window', wx: 3 },
      { uid: 'w2', item: 'photo', wx: 6 },
    ],
  };
}

export const STARTER_ITEMS: InventoryMap = {
  bed_round: 1, bowl_food: 1, bowl_water: 1, box: 1, scratch_post: 1, cushion: 1, yarn: 1, plant: 1,
  window: 1, photo: 1, wp_cream: 1, fl_wood: 1,
  treat_fish: 6, treat_stick: 3, treat_can: 1,
};

export function placedCounts(l: NestLayout): InventoryMap {
  const m: InventoryMap = {};
  for (const it of l.items) m[it.item] = (m[it.item] ?? 0) + 1;
  for (const it of l.wall) m[it.item] = (m[it.item] ?? 0) + 1;
  return m;
}

/** Returns an error message or null if the layout is valid for the given inventory. */
export function validateLayout(l: NestLayout, inv: InventoryMap): string | null {
  if (!l || !Array.isArray(l.items) || !Array.isArray(l.wall)) return '布局格式不对';
  if (l.items.length > 60 || l.wall.length > 12) return '东西太多啦';
  const wp = ITEM_MAP[l.wallpaper];
  if (!wp || wp.cat !== 'wallpaper' || !(inv[l.wallpaper] > 0)) return '没有这种墙纸';
  const fl = ITEM_MAP[l.floor];
  if (!fl || fl.cat !== 'floor' || !(inv[l.floor] > 0)) return '没有这种地板';
  const counts = placedCounts(l);
  for (const [id, n] of Object.entries(counts)) {
    if ((inv[id] ?? 0) < n) return `「${ITEM_MAP[id]?.name ?? id}」不够啦`;
  }
  const occ = new Uint8Array(ROOM_W * ROOM_H);
  const uids = new Set<string>();
  for (const it of l.items) {
    const d = ITEM_MAP[it.item];
    if (!d || d.cat !== 'furniture') return '未知的家具';
    if (uids.has(it.uid)) return '重复的物品';
    uids.add(it.uid);
    const w = d.w ?? 1, h = d.h ?? 1;
    if (!Number.isInteger(it.gx) || !Number.isInteger(it.gy) || it.gx < 0 || it.gy < 0 || it.gx + w > ROOM_W || it.gy + h > ROOM_H) return `「${d.name}」放出房间了`;
    if (d.flat) continue;
    for (let y = it.gy; y < it.gy + h; y++)
      for (let x = it.gx; x < it.gx + w; x++) {
        if (occ[y * ROOM_W + x]) return '家具重叠了';
        occ[y * ROOM_W + x] = 1;
      }
  }
  const wallOcc = new Uint8Array(WALL_SLOTS);
  for (const it of l.wall) {
    const d = ITEM_MAP[it.item];
    if (!d || d.cat !== 'wall') return '未知的墙面装饰';
    if (uids.has(it.uid)) return '重复的物品';
    uids.add(it.uid);
    const w = d.w ?? 1;
    if (!Number.isInteger(it.wx) || it.wx < 0 || it.wx + w > WALL_SLOTS) return `「${d.name}」挂出墙外了`;
    for (let x = it.wx; x < it.wx + w; x++) {
      if (wallOcc[x]) return '墙上装饰重叠了';
      wallOcc[x] = 1;
    }
  }
  return null;
}

/** Can a furniture of def be placed at gx,gy ignoring item `skipUid`? */
export function canPlace(l: NestLayout, itemId: string, gx: number, gy: number, skipUid?: string): boolean {
  const d = ITEM_MAP[itemId];
  if (!d) return false;
  const w = d.w ?? 1, h = d.h ?? 1;
  if (gx < 0 || gy < 0 || gx + w > ROOM_W || gy + h > ROOM_H) return false;
  if (d.flat) return true;
  for (const it of l.items) {
    if (it.uid === skipUid) continue;
    const o = ITEM_MAP[it.item];
    if (!o || o.flat) continue;
    const ow = o.w ?? 1, oh = o.h ?? 1;
    if (gx < it.gx + ow && gx + w > it.gx && gy < it.gy + oh && gy + h > it.gy) return false;
  }
  return true;
}

export function canPlaceWall(l: NestLayout, itemId: string, wx: number, skipUid?: string): boolean {
  const d = ITEM_MAP[itemId];
  if (!d) return false;
  const w = d.w ?? 1;
  if (wx < 0 || wx + w > WALL_SLOTS) return false;
  for (const it of l.wall) {
    if (it.uid === skipUid) continue;
    const ow = ITEM_MAP[it.item]?.w ?? 1;
    if (wx < it.wx + ow && wx + w > it.wx) return false;
  }
  return true;
}
