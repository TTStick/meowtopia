// Inside the shops. Each room is a small floor of tiles laid out far east of the
// town in world units, so movement, meetings and "who is nearby" work exactly as
// they do outdoors; a door joins each room to its building on the street.
//
// Furniture is either an item from the nest catalog (drawn with the nest's art)
// or one of the shop pieces below. Positions are in tiles from the back wall's
// left corner; the door is always at the middle of the front edge.

export type ShopPiece =
  | 'oven' | 'bread_counter' | 'bread_rack' | 'bread_basket' | 'cafe_table' | 'coffee_bar' | 'bookwall' | 'desk' | 'armchair'
  | 'globe' | 'store_shelf' | 'counter' | 'crates' | 'barrel' | 'mail_counter' | 'mail_slots' | 'parcels' | 'postbox'
  | 'bench_in' | 'flower_stand' | 'flower_buckets' | 'flower_counter' | 'mannequin' | 'fabric_rolls' | 'sewing_table'
  | 'mirror' | 'doormat';

export type ShopWallPiece = 'menu' | 'hatrack' | 'stamps' | 'notice';

export interface RoomItem {
  k: ShopPiece | string; // a shop piece, or a nest furniture id
  x: number;
  y: number;
  w: number;
  h: number;
  v?: number;
  flip?: boolean;
  walk?: boolean; // cats walk over it (mats, rugs)
}

export interface RoomWallItem {
  k: ShopWallPiece | string; // a shop wall piece, or a nest wall item id
  x: number;
  w: number;
  v?: number;
}

export interface RoomDef {
  id: string;
  name: string;
  shop: string; // matches BUILDINGS[].shop
  desc: string;
  w: number;
  h: number;
  wallpaper: string;
  floor: string;
  items: RoomItem[];
  wall: RoomWallItem[];
  keeper?: string; // the townsfolk who works here
  counter?: [number, number]; // where the keeper stands
  poi: { id: string; acts: string[]; x: number; y: number; r: number };
  night?: 'closed' | 'open'; // closed rooms send late visitors back out
}

export const ROOM_X0 = 240; // tiles: first room, well past the town's east edge
export const ROOM_GAP = 60; // tiles between rooms (further than any chatter carries)
export const ROOM_Y0 = 24;

const doormat = (w: number, h: number): RoomItem => ({ k: 'doormat', x: w / 2 - 1, y: h - 1, w: 2, h: 1, walk: true });

export const ROOM_DEFS: RoomDef[] = [
  {
    id: 'bakery', name: '面包房', shop: 'bakery', desc: '麦麦的面包房，鱼形面包每天清早出炉。', w: 12, h: 6, wallpaper: 'wp_cream', floor: 'fl_tile',
    keeper: 'npc_baker', counter: [3, 0.55],
    items: [
      { k: 'oven', x: 0, y: 0, w: 1, h: 1 },
      { k: 'bread_counter', x: 1.2, y: 1, w: 3.6, h: 1 },
      { k: 'bread_rack', x: 8.6, y: 0, w: 2, h: 1 },
      { k: 'plant', x: 11, y: 0, w: 1, h: 1 },
      { k: 'cafe_table', x: 7.2, y: 2.6, w: 1, h: 1 },
      { k: 'cafe_table', x: 10.2, y: 4, w: 1, h: 1, v: 1 },
      { k: 'bread_basket', x: 0.4, y: 3.6, w: 1, h: 1 },
      { k: 'cushion', x: 2, y: 4.2, w: 1, h: 1 },
      doormat(12, 6),
    ],
    wall: [{ k: 'window', x: 1.6, w: 2 }, { k: 'menu', x: 5.2, w: 3 }],
    poi: { id: 'bakery_in', acts: ['sniff', 'beg', 'sit', 'loaf'], x: 6, y: 3.6, r: 2 },
    night: 'closed',
  },
  {
    id: 'library', name: '图书馆', shop: 'library', desc: '墨墨守着的图书馆，安静、暖和，有很多故事。', w: 14, h: 8, wallpaper: 'wp_wood', floor: 'fl_herring',
    keeper: 'npc_lib', counter: [11, 1.5],
    items: [
      { k: 'bookwall', x: 0, y: 0, w: 3, h: 1 },
      { k: 'bookwall', x: 3, y: 0, w: 3, h: 1, v: 1 },
      { k: 'bookwall', x: 9, y: 0, w: 3, h: 1, v: 2 },
      { k: 'plant', x: 13, y: 0, w: 1, h: 1 },
      { k: 'desk', x: 9.5, y: 2.2, w: 3, h: 1 },
      { k: 'rug_round', x: 4, y: 3.5, w: 2, h: 2, walk: true },
      { k: 'sofa', x: 0.5, y: 4, w: 2, h: 1 },
      { k: 'lamp', x: 0, y: 2.5, w: 1, h: 1 },
      { k: 'armchair', x: 7, y: 4.4, w: 1, h: 1 },
      { k: 'globe', x: 12.8, y: 5.2, w: 1, h: 1 },
      { k: 'bookshelf', x: 12.8, y: 3, w: 1, h: 1 },
      { k: 'cushion', x: 4.5, y: 6.3, w: 1, h: 1 },
      doormat(14, 8),
    ],
    wall: [{ k: 'window', x: 6.5, w: 2 }, { k: 'clock', x: 12.2, w: 1 }],
    poi: { id: 'library_in', acts: ['loaf', 'sit', 'think', 'nap'], x: 5, y: 4.6, r: 2.2 },
    night: 'closed',
  },
  {
    id: 'cafe', name: '咖啡馆', shop: 'cafe', desc: '拿铁婆婆的咖啡馆，热牛奶永远是温的。', w: 12, h: 7, wallpaper: 'wp_mint', floor: 'fl_wood',
    keeper: 'npc_cafe', counter: [9, 0.55],
    items: [
      { k: 'coffee_bar', x: 7, y: 1, w: 4, h: 1 },
      { k: 'heater', x: 11, y: 0.2, w: 1, h: 1 },
      { k: 'cafe_table', x: 1.5, y: 2, w: 1, h: 1 },
      { k: 'cushion', x: 0.4, y: 2.2, w: 1, h: 1 },
      { k: 'cafe_table', x: 4, y: 3.6, w: 1, h: 1, v: 1 },
      { k: 'cafe_table', x: 8, y: 4.4, w: 1, h: 1 },
      { k: 'sofa', x: 0.3, y: 5.2, w: 2, h: 1 },
      { k: 'radio', x: 11, y: 4, w: 1, h: 1 },
      { k: 'plant', x: 11, y: 5.8, w: 1, h: 1 },
      doormat(12, 7),
    ],
    wall: [{ k: 'window', x: 0.5, w: 2 }, { k: 'window', x: 3.5, w: 2 }, { k: 'menu', x: 7.5, w: 3, v: 1 }],
    poi: { id: 'cafe_in', acts: ['nap', 'loaf', 'sit'], x: 5.5, y: 5.4, r: 1.8 },
    night: 'open',
  },
  {
    id: 'store', name: '杂货铺', shop: 'store', desc: '豆豆老板的杂货铺，什么都有，就是不好找。', w: 11, h: 6, wallpaper: 'wp_dots', floor: 'fl_wood',
    keeper: 'npc_store', counter: [6.5, 0.55],
    items: [
      { k: 'store_shelf', x: 0, y: 0, w: 2, h: 1 },
      { k: 'store_shelf', x: 2, y: 0, w: 2, h: 1, v: 1 },
      { k: 'counter', x: 5, y: 1, w: 3, h: 1 },
      { k: 'store_shelf', x: 8.5, y: 0, w: 2, h: 1, v: 2 },
      { k: 'crates', x: 0.3, y: 3.4, w: 1, h: 1 },
      { k: 'barrel', x: 10, y: 2.6, w: 1, h: 1 },
      { k: 'box', x: 9.4, y: 4.4, w: 1, h: 1 },
      { k: 'yarn', x: 3.6, y: 4.2, w: 1, h: 1 },
      { k: 'basket', x: 1.5, y: 4.4, w: 1, h: 1 },
      doormat(11, 6),
    ],
    wall: [{ k: 'notice', x: 4.2, w: 1 }, { k: 'clock', x: 7.6, w: 1 }],
    poi: { id: 'store_in', acts: ['sniff', 'sit', 'loaf'], x: 5.5, y: 3.6, r: 1.8 },
    night: 'closed',
  },
  {
    id: 'post', name: '邮局', shop: 'post', desc: '阿信的邮局，信和明信片从这里出发。', w: 11, h: 6, wallpaper: 'wp_cream', floor: 'fl_tile',
    keeper: 'npc_post', counter: [5, 0.55],
    items: [
      { k: 'parcels', x: 0.3, y: 0, w: 2, h: 1 },
      { k: 'mail_counter', x: 3, y: 1, w: 4, h: 1 },
      { k: 'mail_slots', x: 8, y: 0, w: 3, h: 1 },
      { k: 'postbox', x: 0.4, y: 3.6, w: 1, h: 1 },
      { k: 'bench_in', x: 7.6, y: 4.3, w: 2, h: 1 },
      { k: 'plant', x: 10, y: 3, w: 1, h: 1 },
      doormat(11, 6),
    ],
    wall: [{ k: 'window', x: 0.4, w: 2 }, { k: 'stamps', x: 3.6, w: 2 }, { k: 'clock', x: 6.3, w: 1 }],
    poi: { id: 'post_in', acts: ['sit', 'sniff', 'loaf'], x: 5.5, y: 3.6, r: 1.8 },
    night: 'closed',
  },
  {
    id: 'flowers', name: '花店', shop: 'flowers', desc: '小葵的花店，一年四季都有花开。', w: 10, h: 6, wallpaper: 'wp_sakura', floor: 'fl_tile',
    keeper: 'npc_florist', counter: [4.5, 0.55],
    items: [
      { k: 'flower_stand', x: 0, y: 0, w: 3, h: 1 },
      { k: 'flower_counter', x: 3.5, y: 1, w: 2.5, h: 1 },
      { k: 'flower_buckets', x: 7, y: 0, w: 3, h: 1 },
      { k: 'flower_buckets', x: 0.3, y: 4, w: 2, h: 1, v: 1 },
      { k: 'cat_grass', x: 7.6, y: 4.4, w: 1, h: 1 },
      { k: 'plant', x: 9, y: 3, w: 1, h: 1 },
      doormat(10, 6),
    ],
    wall: [{ k: 'wreath', x: 1, w: 1 }, { k: 'fairy_lights', x: 3.5, w: 3 }, { k: 'window', x: 7.2, w: 2 }],
    poi: { id: 'flowers_in', acts: ['sniff', 'sit', 'loaf'], x: 5, y: 3.6, r: 1.8 },
    night: 'closed',
  },
  {
    id: 'tailor', name: '裁缝铺', shop: 'tailor', desc: '针针的裁缝铺，全镇最时髦的小衣服。', w: 10, h: 6, wallpaper: 'wp_stripe', floor: 'fl_carpet',
    keeper: 'npc_tailor', counter: [4.5, 0.55],
    items: [
      { k: 'mannequin', x: 0.2, y: 0, w: 1, h: 1 },
      { k: 'mannequin', x: 1.5, y: 0, w: 1, h: 1, v: 1 },
      { k: 'sewing_table', x: 3.5, y: 1, w: 2.5, h: 1 },
      { k: 'fabric_rolls', x: 7, y: 0, w: 3, h: 1 },
      { k: 'mirror', x: 9, y: 3, w: 1, h: 1 },
      { k: 'basket', x: 0.3, y: 4.2, w: 1, h: 1 },
      { k: 'yarn', x: 2, y: 4.4, w: 1, h: 1 },
      doormat(10, 6),
    ],
    wall: [{ k: 'hatrack', x: 0.4, w: 2 }, { k: 'window', x: 4, w: 2 }, { k: 'clock', x: 7.6, w: 1 }],
    poi: { id: 'tailor_in', acts: ['sit', 'groom', 'loaf'], x: 5, y: 3.6, r: 1.8 },
    night: 'closed',
  },
];

/** Shops keep daytime hours; the cafe stays open late. */
export function roomOpen(r: Pick<RoomDef, 'night'>, hour: number): boolean {
  return r.night === 'open' ? hour >= 6 && hour < 23 : hour >= 6.5 && hour < 21;
}
