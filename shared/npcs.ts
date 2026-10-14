// Townsfolk: anthropomorphic cats living their daily lives in the town.
import type { CatGenes } from './types';
import { randomGenes } from './genes';

export type NpcOutfit = 'chef' | 'apron' | 'postman' | 'cardigan' | 'fisher' | 'florist' | 'merchant' | 'kid' | 'musician' | 'granny' | 'scholar' | 'tailor';

export interface ScheduleEntry {
  from: number; // hour
  to: number;
  poi: string; // where
  act: 'stand' | 'sit' | 'walk' | 'work' | 'play' | 'fish' | 'music' | 'read' | 'sleep' | 'patrol' | 'knit' | 'gaze';
  route?: string[]; // patrol between pois
}

export interface NpcDef {
  id: string;
  name: string;
  role: string;
  desc: string;
  voice: string;
  genes: CatGenes;
  outfit: NpcOutfit;
  schedule: ScheduleEntry[];
  lines: string[]; // fallback chatter
  gift?: { item: string; chance: number; text: string };
  shop?: string;
}

function g(seed: number, patch: Partial<CatGenes>): CatGenes {
  return { ...randomGenes(seed), ...patch };
}

export const NPCS: NpcDef[] = [
  {
    id: 'npc_baker', name: '麦麦', role: '面包房老板娘', desc: '每天天不亮就开始揉面团，围裙上总有面粉。', voice: '热情爽朗，爱招呼人',
    genes: g(101, { base: '#f7dfb6', accent: '#ebc08a', pattern: 'tabby', white: 0.3, eye: '#8fc45a', chonk: 1.2 }),
    outfit: 'chef',
    schedule: [
      { from: 5.5, to: 13, poi: 'bakery', act: 'work' },
      { from: 13, to: 15, poi: 'fountain', act: 'sit' },
      { from: 15, to: 19.5, poi: 'bakery', act: 'work' },
      { from: 19.5, to: 22, poi: 'cafe', act: 'sit' },
    ],
    lines: ['刚出炉的鱼形面包，香不香呀', '早起的猫猫有面包吃', '今天的可颂烤得特别成功', '尝尝看，不要钱的', '面团要揉三百下才会软'],
    gift: { item: 'treat_fish', chance: 0.35, text: '麦麦塞给你一块小鱼干' },
  },
  {
    id: 'npc_cafe', name: '拿铁婆婆', role: '咖啡馆主人', desc: '戴着老花镜的灰猫奶奶，记得每位客人的口味。', voice: '温柔慢悠悠，像奶奶一样',
    genes: g(102, { base: '#b8c0cb', accent: '#8b95a3', pattern: 'solid', white: 0.2, eye: '#e9b54a' }),
    outfit: 'cardigan',
    schedule: [
      { from: 8, to: 20, poi: 'cafe', act: 'work' },
      { from: 20, to: 22, poi: 'cafe', act: 'sit' },
    ],
    lines: ['慢慢喝，不着急', '今天想来点什么呀，孩子', '下雨天最适合来一杯热牛奶', '坐一会儿吧，外面风大', '你和你家铲屎官都要好好吃饭'],
  },
  {
    id: 'npc_post', name: '阿信', role: '邮递员', desc: '背着大邮包的橘猫，跑遍小镇每一条小路。', voice: '元气满满，说话很快',
    genes: g(103, { base: '#f6b26b', accent: '#e38b3d', pattern: 'mackerel', white: 0.15, eye: '#79b2e8' }),
    outfit: 'postman',
    schedule: [
      { from: 7.5, to: 12, poi: 'postoffice', act: 'patrol', route: ['postoffice', 'home_lane', 'store', 'bakery', 'library', 'cafe', 'fountain'] },
      { from: 12, to: 13.5, poi: 'cafe', act: 'sit' },
      { from: 13.5, to: 18, poi: 'postoffice', act: 'patrol', route: ['postoffice', 'flowershop', 'tailor', 'riverbank', 'bridge_n', 'fountain', 'home_lane'] },
      { from: 18, to: 20, poi: 'postoffice', act: 'work' },
    ],
    lines: ['有你的信——啊不对，是隔壁的', '今天要送四十二封信！', '小镇的每条路我都认识', '跑起来风都是甜的', '慢递也是一种浪漫哦'],
  },
  {
    id: 'npc_lib', name: '墨墨', role: '图书管理员', desc: '戴圆眼镜的黑猫，说话轻轻的，知道很多故事。', voice: '安静斯文，偶尔冒出冷知识',
    genes: g(104, { base: '#55504f', accent: '#3d3838', pattern: 'solid', white: 0, eye: '#e9b54a' }),
    outfit: 'scholar',
    schedule: [
      { from: 9, to: 17, poi: 'library', act: 'read' },
      { from: 17, to: 19, poi: 'bench_park', act: 'read' },
      { from: 20.5, to: 23.5, poi: 'hilltop', act: 'gaze' },
    ],
    lines: ['嘘——这里是图书馆', '你知道吗，猫一天要睡十几个小时', '这本书讲的是一只会飞的鱼', '星星的光，走了很久才到这里', '读书和晒太阳可以同时进行'],
  },
  {
    id: 'npc_fisher', name: '海伯', role: '老渔夫', desc: '戴草帽的老虎斑，在码头钓了一辈子鱼，其实很少钓到。', voice: '慢条斯理，爱讲大道理',
    genes: g(105, { base: '#cfaa82', accent: '#7f5d45', pattern: 'mackerel', white: 0.25, eye: '#b9a64a', chonk: 1.15 }),
    outfit: 'fisher',
    schedule: [
      { from: 5, to: 11, poi: 'pier', act: 'fish' },
      { from: 11, to: 14, poi: 'beach', act: 'sleep' },
      { from: 14, to: 19, poi: 'pier', act: 'fish' },
    ],
    lines: ['钓鱼啊，钓的是心情', '今天的鱼都在睡午觉', '年轻的时候，我钓到过这——么大的鱼', '海风会把烦恼吹走', '坐下来，陪老头子看看海'],
    gift: { item: 'treat_fish', chance: 0.25, text: '海伯分了你一条小鱼干' },
  },
  {
    id: 'npc_florist', name: '小葵', role: '花店店员', desc: '戴花冠的三花猫，能叫出每一种花的名字。', voice: '甜甜的，爱夸人',
    genes: g(106, { base: '#fdf8f0', accent: '#ef9f55', accent2: '#5a5352', pattern: 'calico', white: 0.6, eye: '#8fc45a' }),
    outfit: 'florist',
    schedule: [
      { from: 8, to: 11, poi: 'flowerfield', act: 'work' },
      { from: 11, to: 18, poi: 'flowershop', act: 'work' },
      { from: 18, to: 20, poi: 'fountain', act: 'sit' },
    ],
    lines: ['这朵花和你很配', '向日葵会一直看着太阳', '今天的风里有花香', '送你一朵，不用谢', '花和猫猫一样，都需要阳光'],
  },
  {
    id: 'npc_store', name: '豆豆老板', role: '杂货铺老板', desc: '系着小领结的胖猫，店里什么都有，就是找不到。', voice: '憨厚精明，爱推销',
    genes: g(107, { base: '#b18566', accent: '#835b43', pattern: 'bicolor', white: 0.55, eye: '#d98c3b', chonk: 1.3 }),
    outfit: 'merchant', shop: 'store',
    schedule: [{ from: 8, to: 21, poi: 'store', act: 'work' }],
    lines: ['新到的纸箱，要不要看看', '本店童叟无欺，猫猫无欺', '这个沙发，坐过的猫都说好', '买家具找豆豆，准没错', '今天打九五折……开玩笑的'],
  },
  {
    id: 'npc_kid1', name: '阿花', role: '小镇的小孩', desc: '和弟弟阿草形影不离的小奶猫，最喜欢游乐场。', voice: '奶声奶气，什么都好奇',
    genes: g(108, { base: '#fdfaf4', accent: '#ece6dc', pattern: 'solid', eye: '#79b2e8', eye2: '#e9b54a' }),
    outfit: 'kid',
    schedule: [
      { from: 9, to: 12, poi: 'playground', act: 'play' },
      { from: 14, to: 17.5, poi: 'meadow', act: 'play' },
      { from: 17.5, to: 19, poi: 'fountain', act: 'play' },
    ],
    lines: ['你也来玩吗！', '我们在玩捉迷藏', '滑梯好高好高', '弟弟又跑去哪里了', '你的尾巴好好看'],
  },
  {
    id: 'npc_kid2', name: '阿草', role: '小镇的小孩', desc: '阿花的弟弟，跑得飞快，经常摔跤。', voice: '调皮爱笑',
    genes: g(109, { base: '#55504f', accent: '#3d3838', pattern: 'tuxedo', white: 0.55, eye: '#8fc45a' }),
    outfit: 'kid',
    schedule: [
      { from: 9, to: 12, poi: 'playground', act: 'play' },
      { from: 14, to: 17.5, poi: 'meadow', act: 'play' },
      { from: 17.5, to: 19, poi: 'fountain', act: 'play' },
    ],
    lines: ['抓不到我～', '姐姐快来！', '我刚刚看到一只青蛙', '今天我是猫猫大王', '嘿嘿嘿'],
  },
  {
    id: 'npc_music', name: '阿乐', role: '街头音乐家', desc: '围着围巾的奶牛猫，傍晚会在喷泉边弹琴。', voice: '随性浪漫，爱哼歌',
    genes: g(110, { base: '#55504f', accent: '#3d3838', pattern: 'tuxedo', white: 0.45, eye: '#e9b54a' }),
    outfit: 'musician',
    schedule: [
      { from: 10, to: 14, poi: 'riverbank', act: 'sit' },
      { from: 16, to: 23.5, poi: 'fountain', act: 'music' },
    ],
    lines: ['这首歌叫《晒太阳》', '啦啦啦～喵喵喵～', '想听什么，我都会一点点', '音乐是看不见的小鱼干', '跟着节奏摇尾巴吧'],
  },
  {
    id: 'npc_granny', name: '棉花奶奶', role: '住在巷口的奶奶', desc: '总在门口织毛线的白猫奶奶，毛线球是猫猫们的最爱。', voice: '慈祥唠叨',
    genes: g(111, { base: '#fdfaf4', accent: '#ece6dc', pattern: 'solid', eye: '#79b2e8', chonk: 1.1 }),
    outfit: 'granny',
    schedule: [
      { from: 7, to: 11.5, poi: 'home_lane', act: 'knit' },
      { from: 14, to: 18.5, poi: 'home_lane', act: 'knit' },
    ],
    lines: ['又长大啦', '天凉了，奶奶给你织条围巾', '回家路上慢点走', '吃饭了没有呀', '毛线球不能吃哦'],
  },
  {
    id: 'npc_tailor', name: '针针', role: '裁缝', desc: '眼光挑剔的暹罗猫，做的小衣服全镇最时髦。', voice: '有点傲娇的时尚达人',
    genes: g(112, { base: '#f5e8d3', accent: '#6e5446', pattern: 'pointed', eye: '#79b2e8' }),
    outfit: 'tailor', shop: 'tailor',
    schedule: [{ from: 9, to: 20, poi: 'tailor', act: 'work' }],
    lines: ['这个颜色，很衬你', '时尚就是要有一点点不一样', '哼，我的手艺可是全镇第一', '试试这顶帽子？', '美丽的猫猫值得美丽的衣服'],
  },
  {
    id: 'npc_night', name: '阿月', role: '深夜热奶摊', desc: '只在夜里出摊的灰白猫，给晚归的猫猫温一杯热羊奶，话不多但很会听。', voice: '轻声细语，像在说悄悄话',
    genes: g(113, { base: '#dfe3e6', accent: '#8f969d', pattern: 'bicolor', white: 0.5, eye: '#e9b54a', chonk: 1.05 }),
    outfit: 'apron',
    schedule: [
      { from: 20.5, to: 24, poi: 'board', act: 'work' },
      { from: 0, to: 1.5, poi: 'board', act: 'work' },
    ],
    lines: ['夜里风凉，喝口热的吧', '今天辛苦了', '月亮今晚很圆呢', '慢慢来，不着急', '睡不着的话，坐一会儿再走', '星星都出来陪你啦'],
    gift: { item: 'treat_milk', chance: 0.4, text: '阿月递给你一小杯温羊奶' },
  },
];

export const NPC_MAP: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export function scheduleAt(n: NpcDef, hour: number): ScheduleEntry | null {
  for (const s of n.schedule) if (hour >= s.from && hour < s.to) return s;
  return null;
}
