// The shared outside world ("猫猫小镇"). Generated deterministically so client
// and server agree on terrain, props, walkability and points of interest.
import { hashf, noise2 } from './rng';
import { makeGrid, type Grid } from './path';

export const TILE = 32;
export const WW = 120;
export const WH = 90;

export const Ter = {
  Grass: 0,
  Path: 1,
  Plaza: 2,
  Water: 3,
  Sand: 4,
  Field: 5,
  Forest: 6,
  Wood: 7,
  Hill: 8,
  Deep: 9,
} as const;
export type Ter = (typeof Ter)[keyof typeof Ter];

export type PropKind =
  | 'tree' | 'pine' | 'sakura' | 'bush' | 'flower' | 'flowers' | 'rock' | 'mushroom' | 'stump' | 'reed' | 'lily'
  | 'lamp' | 'bench' | 'fence' | 'mailbox' | 'board' | 'sign' | 'fountain' | 'house' | 'shop' | 'slide' | 'swing'
  | 'sandbox' | 'windmill' | 'lighthouse' | 'boat' | 'picnic' | 'telescope' | 'bigtree' | 'table' | 'well' | 'crop'
  | 'post' | 'cart' | 'hive' | 'kite' | 'snowman' | 'flowerarch' | 'parasol' | 'pumpkins' | 'lanterns';

export interface Prop {
  id: number;
  k: PropKind;
  x: number; // base point (units)
  y: number;
  v: number; // variant
  s: number; // scale
  label?: string;
  block?: [number, number, number, number]; // tile rect blocked (x,y,w,h)
  season?: number; // only shown in this season (decorations)
}

export interface Poi {
  id: string;
  name: string;
  zone: string;
  x: number; // tiles
  y: number;
  r: number; // radius tiles
  acts: string[];
  night?: boolean;
  shop?: string; // opens a shop
  npcHome?: boolean;
}

export const POIS: Poi[] = [
  { id: 'fountain', name: '喷泉广场', zone: 'plaza', x: 60, y: 49.5, r: 3, acts: ['sit', 'watch', 'groom'] },
  { id: 'board', name: '公告栏', zone: 'plaza', x: 54, y: 42.5, r: 1.5, acts: ['sit', 'think'] },
  { id: 'bakery', name: '面包房', zone: 'town', x: 49, y: 39.5, r: 2, acts: ['sit', 'sniff', 'beg'], shop: 'bakery' },
  { id: 'cafe', name: '咖啡馆露台', zone: 'town', x: 72, y: 40.5, r: 2.5, acts: ['nap', 'sit', 'loaf'] },
  { id: 'library', name: '图书馆', zone: 'town', x: 60, y: 37.5, r: 2, acts: ['sit', 'loaf', 'think'] },
  { id: 'store', name: '杂货铺', zone: 'town', x: 43, y: 46.5, r: 2, acts: ['sit', 'sniff'], shop: 'store' },
  { id: 'postoffice', name: '邮局', zone: 'town', x: 77, y: 46.5, r: 2, acts: ['sit', 'sniff'] },
  { id: 'flowershop', name: '花店', zone: 'town', x: 52.5, y: 60.5, r: 2, acts: ['sniff', 'sit'] },
  { id: 'tailor', name: '裁缝铺', zone: 'town', x: 67.5, y: 60.5, r: 2, acts: ['sit', 'groom'], shop: 'tailor' },
  { id: 'home_lane', name: '回家的小巷', zone: 'residential', x: 24, y: 47.5, r: 2, acts: ['sit', 'groom'] },
  { id: 'pond', name: '公园池塘', zone: 'park', x: 28, y: 22.5, r: 3, acts: ['watch', 'sit', 'bat'] },
  { id: 'playground', name: '游乐场', zone: 'park', x: 39, y: 24, r: 3, acts: ['play', 'run', 'roll'] },
  { id: 'park_tree', name: '公园大树下', zone: 'park', x: 20, y: 26, r: 2.5, acts: ['nap', 'sit', 'scratch'] },
  { id: 'bench_park', name: '湖边长椅', zone: 'park', x: 34, y: 13, r: 2, acts: ['loaf', 'nap', 'sit'] },
  { id: 'forest_stump', name: '森林树桩', zone: 'forest', x: 13, y: 13, r: 2.5, acts: ['sniff', 'sit', 'think'] },
  { id: 'mushroom', name: '蘑菇圈', zone: 'forest', x: 8, y: 27, r: 2.5, acts: ['sniff', 'watch', 'bat'] },
  { id: 'bridge_n', name: '小木桥', zone: 'river', x: 84.5, y: 20, r: 2, acts: ['watch', 'sit'] },
  { id: 'riverbank', name: '河边草地', zone: 'river', x: 82, y: 34, r: 2.5, acts: ['watch', 'groom', 'nap'] },
  { id: 'flowerfield', name: '花田', zone: 'meadow', x: 104, y: 33, r: 4, acts: ['play', 'roll', 'pounce', 'sniff'] },
  { id: 'windmill', name: '大风车', zone: 'meadow', x: 112, y: 31.5, r: 2, acts: ['watch', 'sit'] },
  { id: 'hilltop', name: '山顶大树', zone: 'hill', x: 106, y: 10, r: 3, acts: ['sit', 'watch', 'nap'], night: true },
  { id: 'meadow', name: '南边草地', zone: 'meadow', x: 30, y: 72, r: 5, acts: ['roll', 'play', 'nap', 'pounce'] },
  { id: 'picnic', name: '野餐垫', zone: 'meadow', x: 43, y: 76, r: 2, acts: ['loaf', 'sit', 'sniff'] },
  { id: 'pier', name: '码头尽头', zone: 'pier', x: 105, y: 86.5, r: 1.5, acts: ['watch', 'sit'] },
  { id: 'beach', name: '小沙滩', zone: 'pier', x: 97, y: 80.5, r: 3, acts: ['play', 'roll', 'sniff'] },
  { id: 'lighthouse', name: '灯塔下', zone: 'pier', x: 116, y: 74, r: 2, acts: ['sit', 'watch'] },
];

export const POI_MAP: Record<string, Poi> = Object.fromEntries(POIS.map((p) => [p.id, p]));

/** Everyday words people use for each place (for understanding commands without a model). */
export const POI_ALIASES: Record<string, string[]> = {
  fountain: ['喷泉', '广场'], board: ['公告栏', '布告'], bakery: ['面包', '烤'], cafe: ['咖啡'], library: ['图书馆', '看书', '书'],
  store: ['杂货', '商店', '买东西'], postoffice: ['邮局', '寄信', '信'], flowershop: ['花店', '买花'], tailor: ['裁缝', '衣服'],
  home_lane: ['小巷', '巷子', '门口'], pond: ['池塘', '看鱼', '锦鲤'], playground: ['游乐场', '滑梯', '秋千', '沙坑'],
  park_tree: ['公园', '大树下'], bench_park: ['长椅', '湖边'], forest_stump: ['森林', '树林', '树桩'], mushroom: ['蘑菇'],
  bridge_n: ['木桥', '桥'], riverbank: ['河边', '小河', '河'], flowerfield: ['花田', '蝴蝶', '花丛'], windmill: ['风车'],
  hilltop: ['山顶', '山坡', '看星星', '星星', '山'], meadow: ['草地', '草坪', '打滚'], picnic: ['野餐'],
  pier: ['码头', '海边', '大海', '海', '钓鱼', '渔夫'], beach: ['沙滩', '海滩', '贝壳'], lighthouse: ['灯塔'],
};
export const HOME_SPAWN: [number, number] = [24 * TILE, 47.6 * TILE];

// ---------- geometry helpers ----------
type V = [number, number];

function inPoly(x: number, y: number, poly: V[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function distSeg(px: number, py: number, a: V, b: V): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  let t = ((px - a[0]) * dx + (py - a[1]) * dy) / l2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), py - (a[1] + t * dy));
}

function distPolyline(x: number, y: number, pl: V[]): number {
  let d = Infinity;
  for (let i = 0; i < pl.length - 1; i++) d = Math.min(d, distSeg(x, y, pl[i], pl[i + 1]));
  return d;
}

// ---------- layout ----------
export const RIVER: V[] = [[86, -2], [84, 8], [84, 18], [86, 28], [88, 38], [88, 46], [91, 56], [95, 64], [101, 72], [106, 79]];
const LAKE: V[] = [[86, 92], [95, 85], [106, 79.5], [116, 76.5], [122, 75.5], [122, 92]];
const BEACH: V[] = [[80, 92], [88, 82], [100, 74], [112, 70], [122, 68], [122, 76], [116, 77], [106, 80], [95, 85], [86, 92]];
const FOREST: V[] = [[-1, -1], [44, -1], [40, 4], [24, 6], [12, 7], [7, 20], [12, 31], [9, 38], [-1, 40]];
const FOREST2: V[] = [[46, -1], [80, -1], [78, 4], [62, 6], [50, 5]];

export const PATHS: { pts: V[]; w: number }[] = [
  { pts: [[53, 46], [40, 47], [24, 47.5], [6, 47.5]], w: 1.4 }, // west road
  { pts: [[36.5, 47], [36.5, 56.5], [36, 64], [32, 70]], w: 1.1 }, // residential lane
  { pts: [[8, 56.5], [37, 56.5]], w: 1.1 }, // south lane
  { pts: [[54, 41], [46, 31], [40, 26.5], [30, 26.5], [21, 25], [17, 18], [22, 10.5], [34, 10.5], [40, 16], [40, 26.5]], w: 1.1 }, // park
  { pts: [[66, 41], [76, 29], [80.5, 20], [89, 20], [98, 14], [104, 11]], w: 1.1 }, // NE to hill
  { pts: [[67, 46], [84, 46.5], [93, 46], [100, 43], [104, 37], [104, 26]], w: 1.4 }, // east road to field
  { pts: [[60, 53], [60, 60.5]], w: 1.4 },
  { pts: [[48, 60.5], [73, 60.5]], w: 1.2 },
  { pts: [[60, 60.5], [56, 67], [46, 75], [36, 80]], w: 1.1 }, // south to meadow
  { pts: [[73, 60.5], [82, 67], [94, 68], [102, 68.5], [106, 73], [104, 79]], w: 1.1 }, // SE to beach
  { pts: [[22, 10.5], [13, 12], [9, 20], [8, 27]], w: 0.9 }, // forest trail
];

export const BRIDGES: [number, number, number, number][] = [
  [80.5, 18.8, 8, 2.6], // north wood bridge (x,y,w,h tiles)
  [84.5, 45.2, 8, 2.6], // east stone bridge
  [94.5, 67.2, 7.5, 2.6], // south bridge
];
export const PIER: [number, number, number, number] = [104, 78.5, 2.2, 9];

export interface Building {
  k: 'house' | 'shop';
  x: number; // tiles, top-left of footprint
  y: number;
  w: number;
  h: number;
  label?: string;
  v: number;
  shop?: string;
}

export const BUILDINGS: Building[] = [
  { k: 'shop', x: 46, y: 33, w: 6, h: 5, label: '面包房', v: 0, shop: 'bakery' },
  { k: 'shop', x: 56, y: 29, w: 8, h: 7, label: '图书馆', v: 1, shop: 'library' },
  { k: 'shop', x: 68, y: 33, w: 7, h: 5, label: '咖啡馆', v: 2, shop: 'cafe' },
  { k: 'shop', x: 40, y: 41, w: 6, h: 4.5, label: '杂货铺', v: 3, shop: 'store' },
  { k: 'shop', x: 74, y: 41, w: 6, h: 4.5, label: '邮局', v: 4, shop: 'post' },
  { k: 'shop', x: 50, y: 55, w: 5.5, h: 4.5, label: '花店', v: 5, shop: 'flowers' },
  { k: 'shop', x: 65, y: 55, w: 5.5, h: 4.5, label: '裁缝铺', v: 6, shop: 'tailor' },
  // houses north of west road
  ...[12, 18, 24, 30].map((x, i) => ({ k: 'house' as const, x, y: 41.5, w: 4.5, h: 4, v: i })),
  ...[10, 16, 22, 28].map((x, i) => ({ k: 'house' as const, x, y: 51, w: 4.5, h: 4.5, v: i + 4 })),
];

function terrainAt(tx: number, ty: number): Ter {
  const x = tx + 0.5, y = ty + 0.5;
  // water bodies
  for (const [bx, by, bw, bh] of BRIDGES) if (x >= bx && x <= bx + bw && y >= by && y <= by + bh) return Ter.Wood;
  const [px, py, pw, ph] = PIER;
  if (x >= px && x <= px + pw && y >= py && y <= py + ph) return Ter.Wood;
  if (inPoly(x, y, LAKE)) {
    const shore = Math.min(...LAKE.slice(0, 5).map((_, i) => (i < 4 ? distSeg(x, y, LAKE[i], LAKE[i + 1]) : Infinity)));
    return shore > 3 ? Ter.Deep : Ter.Water;
  }
  const rw = 1.9 + noise2(x * 0.15, y * 0.15, 3) * 0.8;
  if (distPolyline(x, y, RIVER) < rw) return Ter.Water;
  const pond = ((x - 28) / 6.2) ** 2 + ((y - 17) / 4.2) ** 2;
  if (pond < 1) return Ter.Water;
  // paths
  for (const p of PATHS) if (distPolyline(x, y, p.pts) < p.w) return Ter.Path;
  if (Math.hypot(x - 60, (y - 46.5) * 1.15) < 8) return Ter.Plaza;
  if (inPoly(x, y, BEACH)) return Ter.Sand;
  if (inPoly(x, y, FOREST) || inPoly(x, y, FOREST2)) return Ter.Forest;
  if (((x - 106) / 14) ** 2 + ((y - 9) / 8) ** 2 < 1) return Ter.Hill;
  if (x >= 94 && x <= 118 && y >= 23 && y <= 42) return Ter.Field;
  return Ter.Grass;
}

export interface World {
  ter: Uint8Array;
  grid: Grid; // walkability (tile resolution)
  props: Prop[];
}

let cached: World | null = null;

export function getWorld(): World {
  if (cached) return cached;
  const ter = new Uint8Array(WW * WH);
  for (let y = 0; y < WH; y++) for (let x = 0; x < WW; x++) ter[y * WW + x] = terrainAt(x, y);
  const grid = makeGrid(WW, WH);
  for (let i = 0; i < ter.length; i++) if (ter[i] === Ter.Water || ter[i] === Ter.Deep) grid.blocked[i] = 1;
  for (let x = 0; x < WW; x++) {
    grid.blocked[x] = 1;
    grid.blocked[(WH - 1) * WW + x] = 1;
  }
  for (let y = 0; y < WH; y++) {
    grid.blocked[y * WW] = 1;
    grid.blocked[y * WW + WW - 1] = 1;
  }
  const props: Prop[] = [];
  let id = 1;
  const T = TILE;
  const add = (k: PropKind, tx: number, ty: number, v = 0, s = 1, block?: [number, number, number, number], label?: string) => {
    props.push({ id: id++, k, x: tx * T, y: ty * T, v, s, block, label });
    if (block) {
      const [bx, by, bw, bh] = block;
      for (let yy = Math.floor(by); yy < Math.ceil(by + bh); yy++)
        for (let xx = Math.floor(bx); xx < Math.ceil(bx + bw); xx++) if (xx >= 0 && yy >= 0 && xx < WW && yy < WH) grid.blocked[yy * WW + xx] = 1;
    }
  };
  const terAt = (x: number, y: number) => {
    const tx = Math.floor(x), ty = Math.floor(y);
    if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) return Ter.Deep;
    return ter[ty * WW + tx] as Ter;
  };
  const nearPoi = (x: number, y: number, pad = 1.5) => POIS.some((p) => Math.hypot(p.x - x, p.y - y) < p.r + pad);

  // buildings
  for (const b of BUILDINGS) {
    add(b.k, b.x + b.w / 2, b.y + b.h, b.v, b.w / 5, [b.x, b.y, b.w, b.h - 0.2], b.label);
  }
  // plaza furniture
  add('fountain', 60, 47.2, 0, 1, [58.5, 45.2, 3, 2]);
  add('board', 54, 42, 0, 1, [53.5, 41.4, 1, 0.6]);
  for (const [lx, ly] of [[53.5, 40.5], [66.5, 40.5], [53.5, 52.5], [66.5, 52.5], [40, 48.8], [30, 48.8], [18, 48.8], [76, 48], [86, 44.5], [92, 48], [60, 58.6], [46, 30], [79, 22]] as V[]) add('lamp', lx, ly, 0, 1, [lx - 0.3, ly - 0.4, 0.6, 0.4]);
  for (const [bx, by] of [[56, 51.8], [64, 51.8], [33.5, 12], [21, 27.5], [107.5, 11.2], [80.5, 35.5]] as V[]) add('bench', bx, by, 0, 1, [bx - 1, by - 0.5, 2, 0.5]);
  add('mailbox', 79.5, 46, 0, 1, [79.2, 45.5, 0.6, 0.5]);
  for (const [tx, ty] of [[71, 40.6], [74.5, 40.6]] as V[]) add('table', tx, ty, 0, 1, [tx - 0.6, ty - 0.5, 1.2, 0.5]);
  add('cart', 52.5, 40, 0, 1, [51.6, 39.4, 1.8, 0.6]);
  // park
  add('slide', 41, 22.5, 0, 1, [40, 21.2, 2.4, 1.3]);
  add('swing', 37, 21.5, 0, 1, [35.6, 20.8, 2.8, 0.7]);
  add('sandbox', 38.5, 25.5, 0, 1);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    add('lily', 28 + Math.cos(a) * 3.4 + hashf(i, 1) * 0.6, 17 + Math.sin(a) * 2.1, i % 3, 1);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.3;
    add('reed', 28 + Math.cos(a) * 6.6, 17.3 + Math.sin(a) * 4.6, i % 2, 1);
  }
  // signposts
  add('sign', 51.5, 44.5, 0, 1, undefined, '← 住宅区');
  add('sign', 68.5, 44.5, 1, 1, undefined, '花田 →');
  add('sign', 62.5, 55.5, 2, 1, undefined, '↓ 草地 · 码头');
  add('sign', 44.5, 30, 3, 1, undefined, '↖ 公园');
  // hill
  add('bigtree', 106, 8.5, 0, 1.3, [105.4, 7.7, 1.4, 0.8]);
  add('telescope', 109.5, 10.5, 0, 1, [109.2, 10, 0.6, 0.5]);
  add('bigtree', 20, 24.6, 1, 1.15, [19.4, 23.8, 1.3, 0.8]);
  // field
  add('windmill', 112, 30, 0, 1, [110.6, 27.6, 3, 2.4]);
  for (let fy = 24; fy <= 41; fy += 2.2) {
    for (let fx = 95; fx <= 117; fx += 1.4) {
      const t = terAt(fx, fy);
      if (t !== Ter.Field || nearPoi(fx, fy, 0.2) || Math.hypot(fx - 112, fy - 29) < 3.5) continue;
      add('crop', fx, fy, Math.floor(fy / 2.2) % 4, 1);
    }
  }
  add('hive', 98, 25, 0, 1, [97.6, 24.5, 0.8, 0.5]);
  add('kite', 34, 70, 0, 1);
  // pier & beach
  add('lighthouse', 117.5, 72.5, 0, 1, [116.4, 70.6, 2.2, 1.9]);
  add('boat', 109.5, 84, 0, 1);
  add('boat', 100, 88, 1, 1);
  add('post', 104, 87.5, 0, 1);
  add('post', 106.2, 87.5, 0, 1);
  add('picnic', 43, 76.8, 0, 1);
  add('well', 33, 61.5, 0, 1, [32.4, 60.9, 1.2, 0.6]);
  add('stump', 13, 13.2, 0, 1.2, [12.4, 12.6, 1.2, 0.6]);
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    add('mushroom', 8 + Math.cos(a) * 1.8, 27 + Math.sin(a) * 1.2, i % 3, 1);
  }
  // fences around residential gardens
  for (const b of BUILDINGS.filter((b) => b.k === 'house')) {
    add('fence', b.x - 0.2, b.y + b.h + 0.3, 0, 1);
    add('fence', b.x + b.w - 0.6, b.y + b.h + 0.3, 1, 1);
    add('flowers', b.x + 0.4, b.y + b.h + 0.1, b.v % 4, 0.8);
  }
  add('mailbox', 34.6, 46.2, 1, 1, [34.3, 45.7, 0.6, 0.5]);

  // scattered nature
  const occupied = (x: number, y: number) => {
    const tx = Math.floor(x), ty = Math.floor(y);
    return grid.blocked[ty * WW + tx] === 1;
  };
  for (let ty = 1; ty < WH - 1; ty++)
    for (let tx = 1; tx < WW - 1; tx++) {
      const h = hashf(tx, ty, 11);
      const t = terAt(tx + 0.5, ty + 0.5);
      const jx = tx + 0.2 + hashf(tx, ty, 12) * 0.6, jy = ty + 0.3 + hashf(tx, ty, 13) * 0.6;
      if (nearPoi(jx, jy) || occupied(jx, jy)) continue;
      const nearPath = [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => {
        const tt = terAt(jx + dx * 0.9, jy + dy * 0.9);
        return tt === Ter.Path || tt === Ter.Plaza || tt === Ter.Water || tt === Ter.Wood;
      }));
      if (t === Ter.Forest && !nearPath) {
        if (h < 0.34 && (tx + ty) % 2 === 0) {
          const k: PropKind = hashf(tx, ty, 14) < 0.55 ? 'pine' : 'tree';
          add(k, jx, jy, Math.floor(hashf(tx, ty, 15) * 3), 0.9 + hashf(tx, ty, 16) * 0.35, [Math.floor(jx), Math.floor(jy) - 0.0, 1, 0.6]);
        } else if (h > 0.93) add('mushroom', jx, jy, Math.floor(hashf(tx, ty, 17) * 3), 1);
        else if (h > 0.86) add('bush', jx, jy, 1, 0.9);
      } else if (t === Ter.Grass && !nearPath) {
        const park = jx > 13 && jx < 46 && jy > 6 && jy < 30;
        const meadow = jy > 62 && jx < 70;
        const residential = jx < 38 && jy > 38 && jy < 62;
        const town = jx > 38 && jx < 82 && jy > 28 && jy < 64;
        let pTree = park ? 0.05 : meadow ? 0.012 : residential ? 0.03 : town ? 0.012 : 0.03;
        if (jx > 82 && jx < 96 && jy < 70) pTree = 0.05; // riverside
        if (h < pTree) {
          const sak = park && hashf(tx, ty, 18) < 0.4;
          add(sak ? 'sakura' : 'tree', jx, jy, Math.floor(hashf(tx, ty, 15) * 3), 0.95 + hashf(tx, ty, 16) * 0.3, [Math.floor(jx), Math.floor(jy), 1, 0.6]);
        } else if (h < pTree + 0.03) add('bush', jx, jy, Math.floor(hashf(tx, ty, 19) * 3), 0.8 + hashf(tx, ty, 20) * 0.4);
        else if (h > (meadow ? 0.82 : 0.95)) add('flower', jx, jy, Math.floor(hashf(tx, ty, 21) * 5), 1);
        else if (h > 0.93 && h < 0.935) add('rock', jx, jy, Math.floor(hashf(tx, ty, 22) * 3), 0.8);
      } else if (t === Ter.Hill && !nearPath) {
        if (h > 0.9) add('flower', jx, jy, Math.floor(hashf(tx, ty, 21) * 5), 1);
        else if (h < 0.02) add('rock', jx, jy, 1, 1, [Math.floor(jx), Math.floor(jy), 1, 0.5]);
      } else if (t === Ter.Sand && !nearPath) {
        if (h < 0.025) add('rock', jx, jy, 2, 0.7);
      }
    }
  // seasonal decorations (never block walking)
  const deco = (k: PropKind, tx: number, ty: number, season: number, v = 0) => props.push({ id: id++, k, x: tx * T, y: ty * T, v, s: 1, season });
  deco('flowerarch', 60, 54.2, 0);
  deco('flowerarch', 52.6, 46.6, 0, 1);
  deco('parasol', 96, 79, 1);
  deco('parasol', 100.5, 77.5, 1, 1);
  deco('parasol', 93, 82, 1, 2);
  deco('pumpkins', 51.2, 39.6, 2);
  deco('pumpkins', 69.4, 39.8, 2, 1);
  deco('pumpkins', 46.2, 46.4, 2, 2);
  deco('lanterns', 60, 41.2, 2);
  deco('lanterns', 60, 41.2, 3, 1);
  deco('snowman', 56.2, 50.6, 3);
  deco('snowman', 64.2, 50.8, 3, 1);
  deco('snowman', 26, 49.2, 3, 2);
  props.sort((a, b) => a.y - b.y);
  cached = { ter, grid, props };
  return cached;
}

export function terAtUnits(w: World, x: number, y: number): Ter {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) return Ter.Deep;
  return w.ter[ty * WW + tx] as Ter;
}

export function walkable(w: World, x: number, y: number): boolean {
  const tx = Math.floor(x / TILE), ty = Math.floor(y / TILE);
  if (tx < 0 || ty < 0 || tx >= WW || ty >= WH) return false;
  return w.grid.blocked[ty * WW + tx] === 0;
}

export function zoneAt(w: World, x: number, y: number): string {
  const tx = x / TILE, ty = y / TILE;
  const t = terAtUnits(w, x, y);
  if (Math.hypot(tx - 60, ty - 46.5) < 9) return 'plaza';
  if (t === Ter.Forest) return 'forest';
  if (t === Ter.Hill) return 'hill';
  if (t === Ter.Sand || t === Ter.Wood && ty > 70) return 'pier';
  if (distPolyline(tx, ty, RIVER) < 4.5) return 'river';
  if (t === Ter.Field) return 'field';
  if (ty > 62 && tx < 70) return 'meadow';
  if (tx > 13 && tx < 46 && ty > 5 && ty < 30) return 'park';
  if (tx < 38 && ty > 37 && ty < 64) return 'residential';
  return 'town';
}

export const ZONE_NAME: Record<string, string> = {
  plaza: '喷泉广场', town: '小镇街道', residential: '住宅区', park: '公园', forest: '森林', river: '河边', meadow: '草地', field: '花田', hill: '小山坡', pier: '码头',
};

/** Random walkable point within radius r (tiles) of a POI. */
export function poiPoint(w: World, poi: Poi, seed: number): [number, number] {
  for (let i = 0; i < 12; i++) {
    const a = hashf(seed, i, 1) * Math.PI * 2;
    const d = Math.sqrt(hashf(seed, i, 2)) * poi.r * 0.8;
    const x = (poi.x + Math.cos(a) * d) * TILE, y = (poi.y + Math.sin(a) * d * 0.7) * TILE;
    if (walkable(w, x, y)) return [x, y];
  }
  return [poi.x * TILE, poi.y * TILE];
}
