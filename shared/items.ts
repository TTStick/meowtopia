// Item catalog. Prices are in 小鱼干 (fish).

export type ItemCat = 'furniture' | 'wall' | 'wallpaper' | 'floor' | 'food' | 'wear' | 'collect' | 'toy';
export type SpotKind = 'sleep' | 'sit' | 'perch' | 'hide' | 'eat' | 'drink' | 'scratch' | 'play' | 'watch' | 'warm' | 'grass';

export interface Spot {
  kind: SpotKind;
  x: number; // cells, relative to footprint top-left
  y: number;
  z: number; // height in room units
  face?: 1 | -1;
}

export interface ItemDef {
  id: string;
  name: string;
  cat: ItemCat;
  price: number; // 0 = not sold / free
  desc: string;
  w?: number; // footprint cells
  h?: number;
  spots?: Spot[];
  flat?: boolean; // drawn under everything (rugs)
  light?: number; // emits light at night (radius in units)
  rarity?: 1 | 2 | 3 | 4; // collectibles
  zones?: string[]; // collectibles: where found
  seasons?: number[]; // 0 spring 1 summer 2 autumn 3 winter
  night?: boolean; // only found at night
  rain?: boolean; // only found in rain
  sell?: number;
  shop?: boolean; // shown in shop
  food?: { hunger: number; mood: number; bond: number };
}

const F = (o: ItemDef): ItemDef => ({ shop: o.price > 0, ...o });

export const ITEMS: ItemDef[] = [
  // ---- furniture ----
  F({ id: 'box', name: '纸箱', cat: 'furniture', price: 20, w: 1, h: 1, desc: '平平无奇的纸箱，却是猫猫心中的五星级酒店。', spots: [{ kind: 'hide', x: 0.5, y: 0.6, z: 0 }] }),
  F({ id: 'bed_round', name: '圆圆猫窝', cat: 'furniture', price: 120, w: 1, h: 1, desc: '软乎乎的甜甜圈窝，适合把自己团成一颗团子。', spots: [{ kind: 'sleep', x: 0.5, y: 0.6, z: 5 }] }),
  F({ id: 'cushion', name: '格子软垫', cat: 'furniture', price: 60, w: 1, h: 1, desc: '晒过太阳的软垫，有阳光的味道。', spots: [{ kind: 'sleep', x: 0.5, y: 0.6, z: 3 }] }),
  F({ id: 'bowl_food', name: '小鱼食盆', cat: 'furniture', price: 30, w: 1, h: 1, desc: '自动补满的食盆，猫猫永远不会饿肚子。', spots: [{ kind: 'eat', x: 0.5, y: 0.35, z: 0 }] }),
  F({ id: 'bowl_water', name: '水碗', cat: 'furniture', price: 20, w: 1, h: 1, desc: '清清凉凉的水，偶尔会被拿来照镜子。', spots: [{ kind: 'drink', x: 0.5, y: 0.35, z: 0 }] }),
  F({ id: 'scratch_post', name: '剑麻抓柱', cat: 'furniture', price: 80, w: 1, h: 1, desc: '磨爪爪专用，保护沙发从这里开始。', spots: [{ kind: 'scratch', x: 0.15, y: 0.7, z: 0, face: 1 }] }),
  F({ id: 'tree_small', name: '小猫爬架', cat: 'furniture', price: 260, w: 1, h: 1, desc: '可以登高望远的小塔。', spots: [{ kind: 'perch', x: 0.5, y: 0.55, z: 62 }, { kind: 'scratch', x: 0.05, y: 0.75, z: 0, face: 1 }] }),
  F({ id: 'tree_big', name: '城堡爬架', cat: 'furniture', price: 520, w: 2, h: 1, desc: '有小屋、有平台、有吊球的猫猫城堡。', spots: [{ kind: 'perch', x: 0.45, y: 0.55, z: 92 }, { kind: 'perch', x: 1.5, y: 0.55, z: 52 }, { kind: 'hide', x: 0.45, y: 0.62, z: 0 }] }),
  F({ id: 'sofa', name: '小沙发', cat: 'furniture', price: 360, w: 2, h: 1, desc: '名义上是你的沙发。', spots: [{ kind: 'sleep', x: 0.6, y: 0.6, z: 20 }, { kind: 'sit', x: 1.4, y: 0.6, z: 20 }] }),
  F({ id: 'rug_round', name: '圆地毯', cat: 'furniture', price: 150, w: 2, h: 2, flat: true, desc: '毛茸茸的地毯，打滚专用。', spots: [{ kind: 'play', x: 1, y: 1, z: 0 }] }),
  F({ id: 'plant', name: '龟背竹', cat: 'furniture', price: 90, w: 1, h: 1, desc: '大大的叶子，偶尔会被好奇地闻一闻。' }),
  F({ id: 'cat_grass', name: '猫草盆', cat: 'furniture', price: 50, w: 1, h: 1, desc: '嚼嚼嚼，帮助消化的小草。', spots: [{ kind: 'grass', x: 0.5, y: 0.25, z: 0 }] }),
  F({ id: 'lamp', name: '落地灯', cat: 'furniture', price: 140, w: 1, h: 1, light: 150, desc: '夜里亮起暖黄色的光。' }),
  F({ id: 'bookshelf', name: '小书架', cat: 'furniture', price: 220, w: 1, h: 1, desc: '书架顶上是绝佳的观察哨。', spots: [{ kind: 'perch', x: 0.5, y: 0.5, z: 78 }] }),
  F({ id: 'fish_tank', name: '小鱼缸', cat: 'furniture', price: 300, w: 1, h: 1, desc: '可以看一整天的猫猫电视。', spots: [{ kind: 'watch', x: 0.5, y: 1.05, z: 0 }] }),
  F({ id: 'hammock', name: '猫吊床', cat: 'furniture', price: 280, w: 2, h: 1, desc: '摇啊摇，摇到外婆桥。', spots: [{ kind: 'sleep', x: 1, y: 0.55, z: 24 }] }),
  F({ id: 'tunnel', name: '猫隧道', cat: 'furniture', price: 120, w: 2, h: 1, desc: '钻进去就是另一个世界。', spots: [{ kind: 'hide', x: 1, y: 0.6, z: 0 }, { kind: 'play', x: 0.1, y: 0.6, z: 0 }] }),
  F({ id: 'kotatsu', name: '暖桌', cat: 'furniture', price: 420, w: 2, h: 2, light: 40, desc: '冬天的终极答案，进去了就不想出来。', spots: [{ kind: 'warm', x: 1.1, y: 2.12, z: 0 }, { kind: 'perch', x: 1, y: 0.9, z: 30 }] }),
  F({ id: 'teepee', name: '小帐篷', cat: 'furniture', price: 200, w: 1, h: 1, desc: '秘密基地，闲猫免进。', spots: [{ kind: 'hide', x: 0.5, y: 0.65, z: 0 }] }),
  F({ id: 'radio', name: '收音机', cat: 'furniture', price: 160, w: 1, h: 1, desc: '放着软软的音乐，猫猫会跟着摇尾巴。', spots: [{ kind: 'sit', x: 0.5, y: 0.95, z: 0 }] }),
  F({ id: 'table', name: '小圆桌', cat: 'furniture', price: 150, w: 1, h: 1, desc: '桌上的杯子危在旦夕。', spots: [{ kind: 'perch', x: 0.5, y: 0.55, z: 34 }] }),
  F({ id: 'basket', name: '藤编篮', cat: 'furniture', price: 140, w: 1, h: 1, desc: '刚刚好能装下一只猫。', spots: [{ kind: 'sleep', x: 0.5, y: 0.6, z: 8 }] }),
  F({ id: 'heater', name: '小暖炉', cat: 'furniture', price: 220, w: 1, h: 1, light: 70, desc: '烤得暖烘烘的，猫猫会眯起眼睛。', spots: [{ kind: 'warm', x: 0.5, y: 1.05, z: 0 }] }),
  F({ id: 'yarn', name: '毛线球', cat: 'furniture', price: 30, w: 1, h: 1, desc: '滚来滚去的快乐。', spots: [{ kind: 'play', x: 0.5, y: 0.5, z: 0 }] }),
  F({ id: 'mouse_toy', name: '玩具老鼠', cat: 'furniture', price: 25, w: 1, h: 1, desc: '一只永远抓不完的老鼠。', spots: [{ kind: 'play', x: 0.5, y: 0.5, z: 0 }] }),
  F({ id: 'piano', name: '小钢琴', cat: 'furniture', price: 680, w: 2, h: 1, desc: '猫猫踩过琴键时会发出奇妙的旋律。', spots: [{ kind: 'perch', x: 1, y: 0.4, z: 46 }] }),
  F({ id: 'collection_shelf', name: '收藏柜', cat: 'furniture', price: 240, w: 1, h: 1, desc: '摆放猫猫从外面带回来的宝贝。', spots: [{ kind: 'perch', x: 0.5, y: 0.5, z: 70 }] }),

  // ---- wall ----
  F({ id: 'window', name: '窗户', cat: 'wall', price: 180, w: 2, desc: '有阳光照进来的窗户，猫猫最爱的窗台。', spots: [{ kind: 'watch', x: 1, y: 0, z: 44 }] }),
  F({ id: 'painting', name: '小鱼挂画', cat: 'wall', price: 80, w: 1, desc: '一条看起来很好吃的鱼。' }),
  F({ id: 'clock', name: '猫咪挂钟', cat: 'wall', price: 120, w: 1, desc: '尾巴会左右摆的钟。' }),
  F({ id: 'shelf', name: '墙上隔板', cat: 'wall', price: 150, w: 2, desc: '空中步道，适合俯瞰众生。', spots: [{ kind: 'perch', x: 1, y: 0, z: 74 }] }),
  F({ id: 'fairy_lights', name: '星星灯串', cat: 'wall', price: 100, w: 3, light: 60, desc: '夜里一闪一闪亮晶晶。' }),
  F({ id: 'photo', name: '合照', cat: 'wall', price: 40, w: 1, desc: '你和猫猫的合照。' }),
  F({ id: 'wreath', name: '花环', cat: 'wall', price: 60, w: 1, desc: '野花编成的小花环。' }),

  // ---- wallpaper / floor ----
  F({ id: 'wp_cream', name: '奶油白墙', cat: 'wallpaper', price: 0, desc: '干干净净的墙。', shop: false }),
  F({ id: 'wp_stripe', name: '糖果条纹', cat: 'wallpaper', price: 80, desc: '粉粉的竖条纹。' }),
  F({ id: 'wp_dots', name: '小波点', cat: 'wallpaper', price: 80, desc: '圆滚滚的波点。' }),
  F({ id: 'wp_fish', name: '小鱼墙纸', cat: 'wallpaper', price: 120, desc: '满墙都是小鱼，猫猫看了会流口水。' }),
  F({ id: 'wp_night', name: '星空墙纸', cat: 'wallpaper', price: 160, desc: '把夜空贴在墙上。' }),
  F({ id: 'wp_wood', name: '木纹墙', cat: 'wallpaper', price: 120, desc: '像小木屋一样温暖。' }),
  F({ id: 'wp_mint', name: '薄荷格子', cat: 'wallpaper', price: 100, desc: '清清爽爽的格子。' }),
  F({ id: 'wp_sakura', name: '樱花墙纸', cat: 'wallpaper', price: 160, desc: '春天住在墙上。' }),
  F({ id: 'fl_wood', name: '木地板', cat: 'floor', price: 0, desc: '踩上去有咚咚声。', shop: false }),
  F({ id: 'fl_tatami', name: '榻榻米', cat: 'floor', price: 120, desc: '适合躺平。' }),
  F({ id: 'fl_tile', name: '格子地砖', cat: 'floor', price: 100, desc: '夏天趴上去凉凉的。' }),
  F({ id: 'fl_carpet', name: '软地毯', cat: 'floor', price: 140, desc: '整个房间都是软的！' }),
  F({ id: 'fl_herring', name: '人字拼地板', cat: 'floor', price: 160, desc: '精致的人字拼。' }),

  // ---- food ----
  F({ id: 'treat_fish', name: '小鱼干', cat: 'food', price: 8, desc: '香香脆脆。', food: { hunger: 15, mood: 10, bond: 1 } }),
  F({ id: 'treat_stick', name: '猫条', cat: 'food', price: 15, desc: '一舔就停不下来，亲手喂更香。', food: { hunger: 10, mood: 22, bond: 3 } }),
  F({ id: 'treat_can', name: '罐罐', cat: 'food', price: 25, desc: '开罐的声音是世界上最好听的声音。', food: { hunger: 45, mood: 18, bond: 2 } }),
  F({ id: 'treat_chicken', name: '鸡胸肉', cat: 'food', price: 18, desc: '水煮的，健康又好吃。', food: { hunger: 30, mood: 12, bond: 2 } }),
  F({ id: 'treat_milk', name: '羊奶', cat: 'food', price: 12, desc: '温温的羊奶，喝完会有白胡子。', food: { hunger: 12, mood: 15, bond: 2 } }),

  // ---- wear ----
  F({ id: 'bell_collar', name: '铃铛项圈', cat: 'wear', price: 50, desc: '叮铃叮铃，走到哪都知道。' }),
  F({ id: 'bow_tie', name: '小领结', cat: 'wear', price: 60, desc: '绅士猫猫必备。' }),
  F({ id: 'scarf', name: '毛线围巾', cat: 'wear', price: 80, desc: '暖暖的条纹围巾。' }),
  F({ id: 'bandana', name: '小方巾', cat: 'wear', price: 50, desc: '波点小方巾，很有精神。' }),
  F({ id: 'flower_crown', name: '花冠', cat: 'wear', price: 100, desc: '春天的花编成的王冠。' }),
  F({ id: 'beret', name: '贝雷帽', cat: 'wear', price: 90, desc: '艺术家猫猫。' }),
  F({ id: 'straw_hat', name: '小草帽', cat: 'wear', price: 90, desc: '夏天的味道。' }),
  F({ id: 'knit_hat', name: '毛线帽', cat: 'wear', price: 90, desc: '有一个毛球球。' }),
  F({ id: 'bow', name: '蝴蝶结', cat: 'wear', price: 40, desc: '粉粉的蝴蝶结。' }),
  F({ id: 'glasses', name: '圆眼镜', cat: 'wear', price: 70, desc: '看起来很有学问。' }),
  F({ id: 'witch_hat', name: '小巫师帽', cat: 'wear', price: 120, desc: '喵喵咒语，变变变。' }),
  F({ id: 'crown', name: '小皇冠', cat: 'wear', price: 400, desc: '猫猫本来就是主子。' }),
  F({ id: 'leaf', name: '头顶小叶子', cat: 'wear', price: 0, desc: '探险时落在头上的叶子，舍不得拿下来。', shop: false }),

  // ---- collectibles (found while exploring) ----
  C('ginkgo', '银杏叶', 1, ['park', 'town'], '金黄色的小扇子。', [2]),
  C('maple', '红枫叶', 1, ['forest', 'hill'], '红红的，像小手掌。', [2]),
  C('clover', '四叶草', 3, ['meadow', 'park'], '据说会带来好运。'),
  C('pebble', '圆鹅卵石', 1, ['river', 'pier'], '被河水磨得圆圆的。'),
  C('shell', '小贝壳', 1, ['pier'], '贴在耳边能听见风。'),
  C('feather', '小羽毛', 1, ['park', 'hill', 'meadow'], '不知道是哪只小鸟掉的。'),
  C('pinecone', '松果', 1, ['forest'], '滚起来咕噜咕噜。'),
  C('bottlecap', '汽水瓶盖', 1, ['town', 'plaza'], '上面印着一颗星星。'),
  C('marble', '玻璃弹珠', 2, ['town', 'plaza', 'park'], '里面藏着一小片彩虹。'),
  C('dandelion', '蒲公英', 1, ['meadow'], '吹一口气就会飞走。', [0, 1]),
  C('petal', '樱花瓣', 1, ['park', 'plaza'], '粉粉的，软软的。', [0]),
  C('acorn', '橡果', 1, ['forest', 'park'], '戴着小帽子的果子。', [2, 3]),
  C('snail_shell', '蜗牛壳', 2, ['forest', 'meadow'], '下雨天才能找到。', undefined, false, true),
  C('chalk', '彩色粉笔', 1, ['plaza', 'town'], '小镇的孩子们留下的。'),
  C('yarn_bit', '毛线头', 1, ['town'], '从裁缝铺飘出来的。'),
  C('stamp', '旧邮票', 3, ['town', 'plaza'], '印着一只戴帽子的猫。'),
  C('button', '小纽扣', 1, ['town', 'plaza'], '四个小孔，像一张脸。'),
  C('star_candy', '星星糖', 2, ['plaza', 'town'], '面包店老板给的。'),
  C('fish_scale', '亮晶晶鱼鳞', 2, ['pier', 'river'], '在阳光下会闪光。'),
  C('mushroom', '小红蘑菇', 2, ['forest'], '只能看，不能吃。', undefined, false, true),
  C('ice_crystal', '冰晶', 3, ['hill', 'river'], '捧在手心里很快就会化掉。', [3]),
  C('sunflower_seed', '葵花籽', 1, ['meadow'], '夏天的小零食。', [1]),
  C('firefly_jar', '一小瓶萤光', 3, ['river', 'meadow', 'forest'], '夏夜的萤火虫借给猫猫的光。', [1], true),
  C('tiny_bell', '小铃铛', 2, ['town', 'plaza'], '叮铃叮铃。'),
  C('ribbon', '丝带', 1, ['town', 'plaza'], '粉色的丝带。'),
  C('old_key', '旧钥匙', 3, ['forest', 'hill', 'town'], '也许能打开某个秘密。'),
  C('postcard', '明信片', 3, ['plaza', 'town', 'pier'], '上面写着“见字如面”。'),
  C('sea_glass', '海玻璃', 3, ['pier'], '被海浪打磨了很多年。'),
  C('moonstone', '月光石', 4, ['hill'], '只有晴朗的夜晚才能在山顶找到。', undefined, true),
  C('rain_drop', '一颗雨珠', 2, ['park', 'meadow', 'forest'], '挂在叶尖上，圆滚滚的。', undefined, false, true),
  C('lotus_leaf', '小荷叶', 1, ['park', 'river'], '可以当小伞。', [1]),
  C('snow_globe', '小雪球', 2, ['hill', 'park', 'plaza'], '冬天才有的雪捏成的小球。', [3]),
];

function C(id: string, name: string, rarity: 1 | 2 | 3 | 4, zones: string[], desc: string, seasons?: number[], night = false, rain = false): ItemDef {
  return { id, name, cat: 'collect', price: 0, rarity, zones, desc, seasons, night, rain, sell: [0, 3, 8, 20, 50][rarity], shop: false };
}

export const ITEM_MAP: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export function item(id: string): ItemDef {
  return ITEM_MAP[id];
}

/** Starter kit for a new user's nest. */
export const STARTER_INVENTORY: Record<string, number> = {
  treat_fish: 5,
  treat_stick: 2,
};

export const ROOM_W = 9; // floor cells
export const ROOM_H = 6;
export const WALL_SLOTS = 9;

export const WEAR_SLOT: Record<string, 'head' | 'neck' | 'face'> = {
  flower_crown: 'head', beret: 'head', straw_hat: 'head', knit_hat: 'head', bow: 'head', leaf: 'head', witch_hat: 'head', crown: 'head',
  bell_collar: 'neck', bow_tie: 'neck', scarf: 'neck', bandana: 'neck',
  glasses: 'face',
};
