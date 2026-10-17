// The shared outside world ("猫猫小镇"). Generated deterministically so client
// and server agree on terrain, props, walkability and points of interest.
import { hashf, noise2 } from './rng';
import { makeGrid, findPath, smoothPath, isBlocked, type Grid } from './path';
import { ROOM_DEFS, ROOM_X0, ROOM_GAP, ROOM_Y0, type RoomDef } from './rooms';

export const TILE = 32;
// The first town was 120 x 90 tiles; the orchard, the hot spring, the bamboo grove and
// the island grew to the east, the creek and the campsite to the south. Old places
// kept their coordinates, so saved positions still land where they were.
export const WW = 172;
export const WH = 124;

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
  Stone: 10, // stepping stones over the creek (walkable)
  Bamboo: 11,
  Orchard: 12,
} as const;
export type Ter = (typeof Ter)[keyof typeof Ter];

export type PropKind =
  | 'tree' | 'pine' | 'sakura' | 'bush' | 'flower' | 'flowers' | 'rock' | 'mushroom' | 'stump' | 'reed' | 'lily'
  | 'lamp' | 'bench' | 'fence' | 'mailbox' | 'board' | 'sign' | 'fountain' | 'house' | 'shop' | 'slide' | 'swing'
  | 'sandbox' | 'windmill' | 'lighthouse' | 'boat' | 'picnic' | 'telescope' | 'bigtree' | 'table' | 'well' | 'crop'
  | 'post' | 'cart' | 'hive' | 'kite' | 'snowman' | 'flowerarch' | 'parasol' | 'pumpkins' | 'lanterns'
  | 'fruittree' | 'bamboo' | 'hotspring' | 'stonelamp' | 'tent' | 'campfire' | 'log' | 'palm' | 'gazebo' | 'fruitbasket'
  | 'stage' | 'stageback' | 'speaker' | 'stagelight';

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
  room?: string; // indoors: the room it is in
}

const OUTDOOR_POIS: Poi[] = [
  { id: 'fountain', name: '喷泉广场', zone: 'plaza', x: 60, y: 49.5, r: 3, acts: ['sit', 'watch', 'groom'] },
  { id: 'board', name: '公告栏', zone: 'plaza', x: 54, y: 42.5, r: 1.5, acts: ['sit', 'think'] },
  { id: 'bakery', name: '面包房门口', zone: 'town', x: 49, y: 39.5, r: 2, acts: ['sit', 'sniff', 'beg'], shop: 'bakery' },
  { id: 'cafe', name: '咖啡馆露台', zone: 'town', x: 72, y: 40.5, r: 2.5, acts: ['nap', 'sit', 'loaf'] },
  { id: 'library', name: '图书馆台阶', zone: 'town', x: 60, y: 37.5, r: 2, acts: ['sit', 'loaf', 'think'] },
  { id: 'store', name: '杂货铺门口', zone: 'town', x: 43, y: 46.5, r: 2, acts: ['sit', 'sniff'], shop: 'store' },
  { id: 'postoffice', name: '邮局门口', zone: 'town', x: 77, y: 46.5, r: 2, acts: ['sit', 'sniff'] },
  { id: 'flowershop', name: '花店门口', zone: 'town', x: 52.5, y: 60.5, r: 2, acts: ['sniff', 'sit'] },
  { id: 'tailor', name: '裁缝铺门口', zone: 'town', x: 67.5, y: 60.5, r: 2, acts: ['sit', 'groom'], shop: 'tailor' },
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
  // east
  { id: 'hotspring', name: '山间温泉', zone: 'spring', x: 150, y: 17, r: 2.5, acts: ['loaf', 'nap', 'watch', 'groom'] },
  { id: 'orchard', name: '果园', zone: 'orchard', x: 142, y: 44, r: 3.5, acts: ['sniff', 'pounce', 'sit', 'play'] },
  { id: 'bamboo', name: '竹林小径', zone: 'bamboo', x: 167, y: 40, r: 2, acts: ['sniff', 'watch', 'think'] },
  { id: 'island', name: '海上小岛', zone: 'island', x: 146, y: 103, r: 3, acts: ['watch', 'sit', 'roll', 'nap'] },
  // south
  { id: 'creek', name: '小溪踏石', zone: 'creek', x: 40, y: 98.5, r: 2, acts: ['watch', 'bat', 'sit'] },
  { id: 'camp', name: '露营地', zone: 'camp', x: 24, y: 111, r: 3, acts: ['loaf', 'sit', 'nap', 'watch'], night: true },
  { id: 'sakura_slope', name: '樱花坡', zone: 'meadow', x: 50, y: 114.5, r: 3, acts: ['roll', 'nap', 'sit', 'pounce'] },
  // the open-air stage on the lawn east of the river
  { id: 'stage', name: '露天舞台', zone: 'stage', x: 112, y: 57.8, r: 3, acts: ['watch', 'sit', 'roll'] },
];

/** Where each room's floor starts, in tiles. */
function roomOrigin(i: number): [number, number] {
  return [ROOM_X0 + i * ROOM_GAP, ROOM_Y0];
}

const INDOOR_POIS: Poi[] = ROOM_DEFS.map((r, i) => {
  const [ox, oy] = roomOrigin(i);
  return { id: r.poi.id, name: r.name, zone: 'indoor', x: ox + r.poi.x, y: oy + r.poi.y, r: r.poi.r, acts: r.poi.acts, room: r.id };
});

export const POIS: Poi[] = [...OUTDOOR_POIS, ...INDOOR_POIS];
export const POI_MAP: Record<string, Poi> = Object.fromEntries(POIS.map((p) => [p.id, p]));

/** Everyday words people use for each place (for understanding commands without a model). */
export const POI_ALIASES: Record<string, string[]> = {
  fountain: ['喷泉', '广场'], board: ['公告栏', '布告'], bakery: ['面包房门口'], cafe: ['露台'], library: ['图书馆门口', '台阶'],
  store: ['杂货铺门口'], postoffice: ['邮局门口'], flowershop: ['花店门口'], tailor: ['裁缝铺门口'],
  home_lane: ['小巷', '巷子', '门口'], pond: ['池塘', '看鱼', '锦鲤'], playground: ['游乐场', '滑梯', '秋千', '沙坑'],
  park_tree: ['公园', '大树下'], bench_park: ['长椅', '湖边'], forest_stump: ['森林', '树林', '树桩'], mushroom: ['蘑菇'],
  bridge_n: ['木桥', '桥'], riverbank: ['河边', '小河', '河'], flowerfield: ['花田', '蝴蝶', '花丛'], windmill: ['风车'],
  hilltop: ['山顶', '山坡', '看星星', '星星', '山'], meadow: ['草地', '草坪', '打滚'], picnic: ['野餐'],
  pier: ['码头', '大海', '钓鱼', '渔夫'], beach: ['沙滩', '海滩', '贝壳'], lighthouse: ['灯塔'],
  hotspring: ['温泉', '泡澡', '泡温泉'], orchard: ['果园', '果树', '苹果', '摘果子'], bamboo: ['竹林', '竹子'], island: ['小岛', '岛'],
  creek: ['小溪', '溪边', '踏石'], camp: ['露营', '帐篷', '篝火'], sakura_slope: ['樱花', '樱花坡'], stage: ['舞台', '演出', '音乐会', '看表演', '舞会'],
  bakery_in: ['面包', '烤'], library_in: ['图书馆', '看书', '书', '讲故事'], cafe_in: ['咖啡', '牛奶'], store_in: ['杂货', '商店', '买东西'],
  post_in: ['邮局', '寄信', '信'], flowers_in: ['花店', '买花'], tailor_in: ['裁缝', '衣服'],
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
// the sea wraps the south-east corner; the coastline runs from the south edge up past the lighthouse
const COAST: V[] = [[52, 125], [58, 118], [66, 111], [76, 104], [86, 96], [95, 85], [106, 79.5], [116, 76.5], [126, 75.2], [140, 74.6], [156, 74], [173, 73.6]];
const SEA: V[] = [...COAST, [173, 125]];
const BEACH: V[] = [
  [48, 125], [54, 116], [62, 108], [72, 100], [80, 94], [88, 82], [100, 74], [112, 70], [124, 69.2], [140, 68.6], [156, 68.2], [173, 67.8],
  ...[...COAST].reverse(),
];
const FOREST: V[] = [[-1, -1], [44, -1], [40, 4], [24, 6], [12, 7], [7, 20], [12, 31], [9, 38], [-1, 40]];
const FOREST2: V[] = [[46, -1], [80, -1], [78, 4], [62, 6], [50, 5]];
// the highlands in the north-east, with the hot spring
const MOUNT: V[] = [[118, -1], [173, -1], [173, 24], [162, 23], [150, 22.5], [136, 21.5], [126, 19.5], [119, 14]];
// a creek runs from the hot spring past the orchard to the sea; another crosses the south
export const CREEK_E: V[] = [[153.5, 14], [155.5, 20], [157.5, 28], [158.5, 38], [158, 48], [157, 58], [156, 66], [155.5, 78]];
export const CREEK_S: V[] = [[-2, 97], [10, 99], [22, 96.5], [34, 99], [46, 103], [56, 104], [64, 108], [73, 112]];
const STONES: [number, number, number, number] = [39.2, 98.4, 1.6, 5.4]; // stepping stones across the south creek
const ORCHARD: [number, number, number, number] = [125, 36.5, 32, 22]; // x, y, w, h
const BAMBOO: [number, number, number, number] = [161, 23, 12, 43];
export const ISLAND = { x: 146, y: 101, rx: 9, ry: 6 };
export const CAMP: V = [24, 111];
const islandK = (x: number, y: number) => ((x - ISLAND.x) / ISLAND.rx) ** 2 + ((y - ISLAND.y) / ISLAND.ry) ** 2;
const inRect = (x: number, y: number, [rx, ry, rw, rh]: readonly number[]) => x >= rx && x <= rx + rw && y >= ry && y <= ry + rh;

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
  // east
  { pts: [[104, 37], [112, 40], [120, 42.5], [126, 44]], w: 1.1 }, // east road to the orchard gate
  { pts: [[126, 44], [168, 44]], w: 0.9 }, // orchard lane, on to the bamboo
  { pts: [[142, 36.5], [142, 57.5]], w: 0.9 },
  { pts: [[104, 11], [114, 12.5], [124, 14.5], [136, 15.5], [145, 17.5]], w: 1 }, // hilltop to the hot spring
  { pts: [[138.5, 15.4], [139.3, 11.2]], w: 0.8 }, // to the spring hut
  { pts: [[145, 17.5], [150, 18.8], [157, 19], [163, 20], [167.5, 28], [167.5, 45], [167.5, 60], [165, 67], [160, 70.6]], w: 0.9 }, // bamboo trail down to the sea
  { pts: [[105, 74], [118, 72], [132, 71], [146, 71], [160, 70.6]], w: 1 }, // coast path
  { pts: [[146, 71], [146, 74]], w: 1 },
  { pts: [[129.3, 35.8], [129.5, 44]], w: 0.8 }, // orchard hut
  { pts: [[100, 43.2], [105.6, 48.5], [106, 56.5], [112, 60], [118, 56.5], [118.4, 49]], w: 1 }, // round the stage lawn
  { pts: [[102, 68.5], [107, 64], [112, 60]], w: 1 },
  // south
  { pts: [[36, 80], [29, 88], [21.5, 93], [21.3, 100], [23, 107.5]], w: 1 }, // meadow to the campsite
  { pts: [[23, 108], [34, 110], [45, 112.5], [53, 114.5]], w: 0.9 }, // campsite to the sakura slope
  { pts: [[43, 77], [42, 88], [40, 97.8]], w: 0.9 }, // picnic down to the stepping stones
  { pts: [[40, 104.2], [43.5, 111.5]], w: 0.8 },
];

export const BRIDGES: [number, number, number, number][] = [
  [80.5, 18.8, 8, 2.6], // north wood bridge (x,y,w,h tiles)
  [84.5, 45.2, 8, 2.6], // east stone bridge
  [94.5, 67.2, 7.5, 2.6], // south bridge
  [153.3, 17.6, 3.6, 2.6], // over the spring creek
  [156.4, 42.7, 3.6, 2.6], // orchard to the bamboo
  [154, 69.4, 3.6, 2.6], // coast path over the creek mouth
  [20, 94.4, 2.6, 4.6], // south creek, on the way to the campsite
];
export const PIER: [number, number, number, number] = [104, 78.5, 2.2, 9];
export const BOARDWALK: [number, number, number, number] = [145, 73.4, 2.2, 22.4]; // out to the island

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
  { k: 'house', x: 137, y: 6.5, w: 4.5, h: 4, v: 6, label: '温泉小屋' },
  { k: 'house', x: 127, y: 31.5, w: 4.5, h: 4, v: 4, label: '果园小屋' },
];

function terrainAt(tx: number, ty: number): Ter {
  const x = tx + 0.5, y = ty + 0.5;
  // walkways over water
  for (const b of BRIDGES) if (inRect(x, y, b)) return Ter.Wood;
  if (inRect(x, y, PIER) || inRect(x, y, BOARDWALK)) return Ter.Wood;
  // the island, then the sea around it
  const isl = islandK(x, y);
  if (isl < 1) return isl > 0.55 ? Ter.Sand : Ter.Grass;
  if (inPoly(x, y, SEA)) {
    const shore = distPolyline(x, y, COAST);
    return shore > 3.5 && isl > 1.8 ? Ter.Deep : Ter.Water;
  }
  // rivers, creeks, the pond
  const rw = 1.9 + noise2(x * 0.15, y * 0.15, 3) * 0.8;
  if (distPolyline(x, y, RIVER) < rw) return Ter.Water;
  const cw = 1.1 + noise2(x * 0.2, y * 0.2, 7) * 0.5;
  if (distPolyline(x, y, CREEK_E) < cw || distPolyline(x, y, CREEK_S) < cw + 0.2) return inRect(x, y, STONES) ? Ter.Stone : Ter.Water;
  const pond = ((x - 28) / 6.2) ** 2 + ((y - 17) / 4.2) ** 2;
  if (pond < 1) return Ter.Water;
  // paths
  for (const p of PATHS) if (distPolyline(x, y, p.pts) < p.w) return Ter.Path;
  if (Math.hypot(x - 60, (y - 46.5) * 1.15) < 8) return Ter.Plaza;
  if (inPoly(x, y, BEACH)) return Ter.Sand;
  if (inPoly(x, y, FOREST) || inPoly(x, y, FOREST2)) return Ter.Forest;
  if (inPoly(x, y, MOUNT)) return y < 4.5 + noise2(x * 0.3, 1, 9) * 2.5 ? Ter.Forest : Ter.Hill;
  if (inRect(x, y, BAMBOO)) return Ter.Bamboo;
  if (((x - 106) / 14) ** 2 + ((y - 9) / 8) ** 2 < 1) return Ter.Hill;
  if (x >= 94 && x <= 118 && y >= 23 && y <= 42) return Ter.Field;
  if (inRect(x, y, ORCHARD)) return Ter.Orchard;
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

  // ---- the east ----
  // hot spring in the highlands
  add('hotspring', 150, 14.6, 0, 1, [146.6, 10.6, 6.8, 3.6]);
  for (const [lx, ly] of [[145.6, 13.8], [155, 12.2]] as V[]) add('stonelamp', lx, ly, 0, 1, [lx - 0.3, ly - 0.3, 0.6, 0.4]);
  add('sign', 112, 10.6, 4, 1, undefined, '温泉 →');
  // orchard: rows of fruit trees inside a low fence
  for (const fx of [131, 135, 138.5, 145.5, 149, 153])
    for (const fy of [38.6, 41.6, 47.6, 50.6, 53.6, 56.6]) {
      if (terAt(fx, fy) !== Ter.Orchard) continue;
      add('fruittree', fx, fy, Math.floor(hashf(fx, fy, 31) * 3), 0.95 + hashf(fx, fy, 32) * 0.15, [Math.floor(fx), Math.floor(fy), 1, 0.6]);
    }
  add('fruitbasket', 140, 46, 0, 1);
  add('fruitbasket', 144.2, 42.4, 1, 1);
  for (const ey of [36.2, 58.9])
    for (let fx = 125.2; fx < 156.5; fx += 1.15) if (!(fx > 140.6 && fx < 143.2) && !(ey < 40 && fx > 128.2 && fx < 130.6)) add('fence', fx, ey, 0, 1);
  add('sign', 119.5, 41, 5, 1, undefined, '果园 →');
  // the island and the boardwalk out to it
  for (const [px, py] of [[140.5, 101.6], [153.6, 102], [141.8, 105.6]] as V[]) add('palm', px, py, Math.floor(hashf(px, py, 33) * 2), 1, [Math.floor(px), Math.floor(py), 1, 0.5]);
  add('gazebo', 150.2, 100, 0, 1, [149.2, 99.4, 2, 0.6]);
  add('rock', 138.6, 103, 2, 0.9);
  add('rock', 153.2, 103.4, 1, 0.8);
  for (const ly of [80, 89]) add('lamp', 145.2, ly, 0, 1, [144.9, ly - 0.4, 0.6, 0.4]);
  add('sign', 148, 70.2, 6, 1, undefined, '↓ 小岛');
  // the open-air stage: a backdrop, a low wooden platform, speakers, spotlights and a lawn to sit on
  add('stageback', 112, 50.6, 0, 1, [106.6, 49.6, 10.8, 1]);
  props.push({ id: id++, k: 'stage', x: 112 * T, y: 54.4 * T, v: 0, s: 1 });
  for (const sx of [106.9, 117.1]) add('speaker', sx, 54.3, 0, 1, [sx - 0.5, 53.7, 1, 0.6]);
  for (const lx of [104.9, 119.1]) add('stagelight', lx, 57.6, lx < 112 ? 0 : 1, 1, [lx - 0.3, 57.2, 0.6, 0.4]);
  for (const bx of [108.4, 115.6]) add('bench', bx, 61.8, 0, 1, [bx - 1, 61.3, 2, 0.5]);
  props.push({ id: id++, k: 'lanterns', x: 112 * T, y: 62.6 * T, v: 1, s: 1 });
  add('sign', 101.4, 45.8, 8, 1, undefined, '舞台 →');

  // ---- the south ----
  add('tent', 19.6, 108.8, 0, 1, [17.9, 107.6, 3.4, 1.2]);
  add('tent', 29, 106.6, 1, 1, [27.3, 105.4, 3.4, 1.2]);
  add('campfire', 24, 112.2, 0, 1, [23.5, 111.8, 1, 0.5]);
  add('log', 21.8, 113.8, 0, 1);
  add('log', 26.2, 114, 1, 1);
  add('sign', 33.5, 86, 7, 1, undefined, '↓ 露营地');
  add('bigtree', 50, 111.6, 1, 1.15, [49.4, 110.8, 1.4, 0.8]);
  for (const [sx, sy] of [[45.5, 110.2], [55, 112.2], [46, 117], [51.5, 118.5]] as V[]) add('sakura', sx, sy, Math.floor(hashf(sx, sy, 34) * 3), 1, [Math.floor(sx), Math.floor(sy), 1, 0.6]);
  add('bench', 50.5, 116, 0, 1, [49.5, 115.5, 2, 0.5]);
  for (const [rx, ry] of [[30, 97.6], [52, 101.4], [60, 104.6], [12, 100.6], [157, 33], [160.4, 52]] as V[]) add('reed', rx, ry, 0, 1);

  // scattered nature, leaving room around the campsite and the island's landing
  const inClearing = (x: number, y: number) => Math.hypot(x - 24, (y - 109.5) * 1.3) < 8 || Math.hypot(x - 146, y - 97.5) < 2.5 || (x > 102 && x < 122 && y > 46 && y < 65);
  const occupied = (x: number, y: number) => {
    const tx = Math.floor(x), ty = Math.floor(y);
    return grid.blocked[ty * WW + tx] === 1;
  };
  for (let ty = 1; ty < WH - 1; ty++)
    for (let tx = 1; tx < WW - 1; tx++) {
      const h = hashf(tx, ty, 11);
      const t = terAt(tx + 0.5, ty + 0.5);
      const jx = tx + 0.2 + hashf(tx, ty, 12) * 0.6, jy = ty + 0.3 + hashf(tx, ty, 13) * 0.6;
      if (nearPoi(jx, jy) || occupied(jx, jy) || inClearing(jx, jy)) continue;
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
        if (jy > 90 && jx < 60) pTree = 0.035; // the woods along the south creek
        if (islandK(jx, jy) < 1) pTree = 0;
        if (h < pTree) {
          const sak = (park || jy > 104) && hashf(tx, ty, 18) < 0.4;
          add(sak ? 'sakura' : 'tree', jx, jy, Math.floor(hashf(tx, ty, 15) * 3), 0.95 + hashf(tx, ty, 16) * 0.3, [Math.floor(jx), Math.floor(jy), 1, 0.6]);
        } else if (h < pTree + 0.03) add('bush', jx, jy, Math.floor(hashf(tx, ty, 19) * 3), 0.8 + hashf(tx, ty, 20) * 0.4);
        else if (h > (meadow ? 0.82 : 0.95)) add('flower', jx, jy, Math.floor(hashf(tx, ty, 21) * 5), 1);
        else if (h > 0.93 && h < 0.935) add('rock', jx, jy, Math.floor(hashf(tx, ty, 22) * 3), 0.8);
      } else if (t === Ter.Hill && !nearPath) {
        if (h > 0.9) add('flower', jx, jy, Math.floor(hashf(tx, ty, 21) * 5), 1);
        else if (h < 0.02) add('rock', jx, jy, 1, 1, [Math.floor(jx), Math.floor(jy), 1, 0.5]);
        else if (jx > 118 && h < 0.07) add('pine', jx, jy, Math.floor(hashf(tx, ty, 15) * 3), 0.85 + hashf(tx, ty, 16) * 0.3, [Math.floor(jx), Math.floor(jy), 1, 0.6]);
      } else if (t === Ter.Bamboo && !nearPath) {
        if (h < 0.5) add('bamboo', jx, jy, Math.floor(hashf(tx, ty, 23) * 3), 0.9 + hashf(tx, ty, 24) * 0.25, [Math.floor(jx), Math.floor(jy), 1, 0.5]);
        else if (h > 0.94) add('stump', jx, jy, 0, 0.7);
      } else if (t === Ter.Orchard && !nearPath) {
        if (h > 0.93) add('flower', jx, jy, Math.floor(hashf(tx, ty, 21) * 5), 1);
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
  deco('parasol', 128, 72.4, 1, 1);
  deco('snowman', 141, 18.6, 3, 1);
  deco('lanterns', 24, 106.4, 2, 1);
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
  if (roomAt(x, y)) return 'indoor';
  const tx = x / TILE, ty = y / TILE;
  const t = terAtUnits(w, x, y);
  if (Math.hypot(tx - 60, ty - 46.5) < 9) return 'plaza';
  if (islandK(tx, ty) < 1.1 || inRect(tx, ty, BOARDWALK)) return 'island';
  if (tx > 118 && ty < 24 && t !== Ter.Bamboo) return 'spring';
  if (t === Ter.Forest) return 'forest';
  if (t === Ter.Hill) return 'hill';
  if (t === Ter.Bamboo || inRect(tx, ty, BAMBOO)) return 'bamboo';
  if (t === Ter.Orchard || inRect(tx, ty, [124, 35, 34, 25])) return 'orchard';
  if (t === Ter.Sand || inPoly(tx, ty, BEACH) || (t === Ter.Wood && ty > 66 && tx > 90)) return tx < 112 ? 'pier' : 'beach';
  if (Math.hypot(tx - 112, (ty - 56) * 1.2) < 9) return 'stage';
  if (distPolyline(tx, ty, RIVER) < 4.5) return 'river';
  if (distPolyline(tx, ty, CREEK_E) < 3.5 || distPolyline(tx, ty, CREEK_S) < 4) return 'creek';
  if (Math.hypot(tx - CAMP[0], ty - CAMP[1]) < 8) return 'camp';
  if (t === Ter.Field) return 'field';
  if (ty > 62 && tx < 70) return 'meadow';
  if (tx > 13 && tx < 46 && ty > 5 && ty < 30) return 'park';
  if (tx < 38 && ty > 37 && ty < 64) return 'residential';
  return 'town';
}

export const ZONE_NAME: Record<string, string> = {
  plaza: '喷泉广场', town: '小镇街道', residential: '住宅区', park: '公园', forest: '森林', river: '河边', meadow: '草地', field: '花田', hill: '小山坡', pier: '码头',
  spring: '温泉山谷', orchard: '果园', bamboo: '竹林', island: '海上小岛', creek: '小溪边', camp: '露营地', beach: '海边', indoor: '屋里', stage: '露天舞台',
};

/** Random walkable point within radius r (tiles) of a POI. */
export function poiPoint(w: World, poi: Poi, seed: number): [number, number] {
  for (let i = 0; i < 12; i++) {
    const a = hashf(seed, i, 1) * Math.PI * 2;
    const d = Math.sqrt(hashf(seed, i, 2)) * poi.r * 0.8;
    const x = (poi.x + Math.cos(a) * d) * TILE, y = (poi.y + Math.sin(a) * d * 0.7) * TILE;
    if (walkableAt(w, x, y)) return [x, y];
  }
  return [poi.x * TILE, poi.y * TILE];
}

// ---------- rooms ----------
export interface Room extends RoomDef {
  index: number;
  ox: number; // the floor's top-left corner, units
  oy: number;
  grid: Grid;
  door: [number, number]; // just inside the door, units
  outside: [number, number]; // on the street in front of the building, units
  building: Building;
}

let roomsCache: Room[] | null = null;

/** Furniture tiles a room item covers. */
export function itemTiles(it: { x: number; y: number; w: number; h: number }): [number, number, number, number] {
  return [Math.floor(it.x), Math.floor(it.y), Math.ceil(it.x + it.w) - 1, Math.ceil(it.y + it.h) - 1];
}

export function getRooms(): Room[] {
  if (roomsCache) return roomsCache;
  roomsCache = ROOM_DEFS.map((def, index) => {
    const [tx, ty] = roomOrigin(index);
    const grid = makeGrid(def.w, def.h);
    for (const it of def.items) {
      if (it.walk) continue;
      const [x0, y0, x1, y1] = itemTiles(it);
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (x >= 0 && y >= 0 && x < def.w && y < def.h) grid.blocked[y * def.w + x] = 1;
    }
    const b = BUILDINGS.find((bb) => bb.shop === def.shop)!;
    const ox = tx * TILE, oy = ty * TILE;
    return {
      ...def, index, ox, oy, grid, building: b,
      door: [ox + (def.w / 2) * TILE, oy + (def.h - 0.4) * TILE],
      outside: [(b.x + b.w / 2) * TILE, (b.y + b.h + 0.7) * TILE],
    };
  });
  return roomsCache;
}

export const roomById = (id: string) => getRooms().find((r) => r.id === id) ?? null;

/** The room a point is in, or null outdoors. */
export function roomAt(x: number, y: number): Room | null {
  if (x < (WW + 20) * TILE) return null;
  for (const r of getRooms()) if (x >= r.ox - 10 * TILE && x <= r.ox + (r.w + 10) * TILE && y >= r.oy - 12 * TILE && y <= r.oy + (r.h + 10) * TILE) return r;
  return null;
}

/** Walkable anywhere: in town or on a room's floor. */
export function walkableAt(w: World, x: number, y: number): boolean {
  const r = roomAt(x, y);
  if (!r) return walkable(w, x, y);
  const tx = Math.floor((x - r.ox) / TILE), ty = Math.floor((y - r.oy) / TILE);
  return !isBlocked(r.grid, tx, ty);
}

function gridPath(grid: Grid, ox: number, oy: number, fx: number, fy: number, tx: number, ty: number): [number, number][] | null {
  const cx = Math.floor((tx - ox) / TILE), cy = Math.floor((ty - oy) / TILE);
  const p = findPath(grid, Math.floor((fx - ox) / TILE), Math.floor((fy - oy) / TILE), cx, cy, 80000);
  if (!p) return null;
  const s = smoothPath(grid, p);
  const pts: [number, number][] = s.slice(1).map(([x, y]) => [ox + (x + 0.5) * TILE, oy + (y + 0.5) * TILE]);
  const open = !isBlocked(grid, cx, cy);
  if (pts.length) {
    if (open) pts[pts.length - 1] = [tx, ty];
  } else pts.push(open ? [tx, ty] : [ox + (s[0][0] + 0.5) * TILE, oy + (s[0][1] + 0.5) * TILE]);
  return pts;
}

/** One stretch of walking; `from` is where it starts (a door's other side after the first). */
export interface Leg {
  from: [number, number];
  pts: [number, number][];
}

/** Walking from one point to another, through doors when it goes in or out of a room. */
export function planRoute(w: World, fx: number, fy: number, tx: number, ty: number): Leg[] | null {
  const a = roomAt(fx, fy), b = roomAt(tx, ty);
  const walk = (r: Room | null, x0: number, y0: number, x1: number, y1: number) => (r ? gridPath(r.grid, r.ox, r.oy, x0, y0, x1, y1) : gridPath(w.grid, 0, 0, x0, y0, x1, y1));
  if (a === b) {
    const p = walk(a, fx, fy, tx, ty);
    return p ? [{ from: [fx, fy], pts: p }] : null;
  }
  const legs: Leg[] = [];
  let from: [number, number] = [fx, fy];
  if (a) {
    const p = walk(a, fx, fy, a.door[0], a.door[1]);
    if (!p) return null;
    legs.push({ from, pts: p });
    from = a.outside;
  }
  if (b) {
    const p = walk(null, from[0], from[1], b.outside[0], b.outside[1]);
    if (!p) return null;
    legs.push({ from, pts: p });
    const q = walk(b, b.door[0], b.door[1], tx, ty);
    if (!q) return null;
    legs.push({ from: b.door, pts: q });
  } else {
    const p = walk(null, from[0], from[1], tx, ty);
    if (!p) return null;
    legs.push({ from, pts: p });
  }
  return legs;
}
