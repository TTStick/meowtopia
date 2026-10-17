// Townsfolk: anthropomorphic cats living their daily lives in the town.
import type { CatGenes } from './types';
import { randomGenes } from './genes';

export type NpcOutfit = 'chef' | 'apron' | 'postman' | 'cardigan' | 'fisher' | 'florist' | 'merchant' | 'kid' | 'musician' | 'granny' | 'scholar' | 'tailor' | 'farmer' | 'onsen' | 'traveler';

export interface ScheduleEntry {
  from: number; // hour
  to: number;
  poi: string; // where
  act: 'stand' | 'sit' | 'walk' | 'work' | 'play' | 'fish' | 'music' | 'read' | 'sleep' | 'patrol' | 'knit' | 'gaze';
  route?: string[]; // patrol between pois
}

/** Each resident's own little thing to do together, once a day. */
export interface NpcSpecial {
  label: string; // the button
  done: string; // what happened, for the toast and the diary
  anim: string; // what the cat does meanwhile
  npcAnim?: string; // what the resident does meanwhile
  secs: number;
  effect: { hunger?: number; mood?: number; energy?: number; clean?: number; social?: number };
  gift?: { item: string; chance: number; minLevel?: number; once?: boolean; text: string };
  story?: string; // the resident tells a story about this
  errand?: boolean; // asks the cat to carry a letter to someone
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
  special?: NpcSpecial;
  busy?: string[]; // schedule acts in which they can't go for a walk (default: work, read, patrol)
  bye?: string[]; // goodbye lines after a walk
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
      { from: 5.5, to: 13, poi: 'bakery_in', act: 'work' },
      { from: 13, to: 15, poi: 'fountain', act: 'sit' },
      { from: 15, to: 16.5, poi: 'bakery', act: 'work' }, // selling from the cart outside
      { from: 16.5, to: 20, poi: 'bakery_in', act: 'work' },
      { from: 19.5, to: 22, poi: 'cafe', act: 'sit' },
    ],
    lines: ['刚出炉的鱼形面包，香不香呀', '早起的猫猫有面包吃', '今天的可颂烤得特别成功', '尝尝看，不要钱的', '面团要揉三百下才会软'],
    special: { label: '尝尝面包', done: '麦麦掰了一小块刚出炉的鱼形面包给它，热乎乎的', anim: 'beg', npcAnim: 'work', secs: 8, effect: { hunger: 18, mood: 8 } },
    bye: ['我得回去看着烤箱啦', '面团在等我呢，下次见～', '记得来吃面包哦'],
    gift: { item: 'treat_fish', chance: 0.35, text: '麦麦塞给你一块小鱼干' },
  },
  {
    id: 'npc_cafe', name: '拿铁婆婆', role: '咖啡馆主人', desc: '戴着老花镜的灰猫奶奶，记得每位客人的口味。', voice: '温柔慢悠悠，像奶奶一样',
    genes: g(102, { base: '#b8c0cb', accent: '#8b95a3', pattern: 'solid', white: 0.2, eye: '#e9b54a' }),
    outfit: 'cardigan',
    schedule: [
      { from: 8, to: 16, poi: 'cafe_in', act: 'work' },
      { from: 16, to: 17, poi: 'cafe', act: 'sit' }, // a breather on the terrace
      { from: 17, to: 22.5, poi: 'cafe_in', act: 'work' },
    ],
    lines: ['慢慢喝，不着急', '今天想来点什么呀，孩子', '下雨天最适合来一杯热牛奶', '坐一会儿吧，外面风大', '你和你家铲屎官都要好好吃饭'],
    special: { label: '喝杯热牛奶', done: '拿铁婆婆温了一小碟热牛奶，它喝出了白胡子', anim: 'loaf', npcAnim: 'work', secs: 10, effect: { hunger: 10, mood: 12, energy: 6 } },
    bye: ['婆婆走累了，回店里歇歇', '慢慢走，孩子', '下次来，热牛奶还给你留着'],
  },
  {
    id: 'npc_post', name: '阿信', role: '邮递员', desc: '背着大邮包的橘猫，跑遍小镇每一条小路。', voice: '元气满满，说话很快',
    genes: g(103, { base: '#f6b26b', accent: '#e38b3d', pattern: 'mackerel', white: 0.15, eye: '#79b2e8' }),
    outfit: 'postman',
    schedule: [
      { from: 7.5, to: 12, poi: 'postoffice', act: 'patrol', route: ['postoffice', 'home_lane', 'store', 'bakery', 'library', 'cafe', 'fountain'] },
      { from: 12, to: 13.5, poi: 'cafe', act: 'sit' },
      { from: 13.5, to: 18, poi: 'postoffice', act: 'patrol', route: ['postoffice', 'flowershop', 'tailor', 'riverbank', 'bridge_n', 'fountain', 'home_lane'] },
      { from: 18, to: 20.5, poi: 'post_in', act: 'work' },
    ],
    lines: ['有你的信——啊不对，是隔壁的', '今天要送四十二封信！', '小镇的每条路我都认识', '跑起来风都是甜的', '慢递也是一种浪漫哦'],
    special: { label: '帮忙送信', done: '阿信托它把一封信送给小镇的一位居民', anim: 'sit_happy', secs: 4, effect: { mood: 6, social: 6 }, errand: true },
    bye: ['我还有好多信要送呢！', '跑起来啦，下次再一起！', '谢谢陪我，回见～'],
  },
  {
    id: 'npc_lib', name: '墨墨', role: '图书管理员', desc: '戴圆眼镜的黑猫，说话轻轻的，知道很多故事。', voice: '安静斯文，偶尔冒出冷知识',
    genes: g(104, { base: '#55504f', accent: '#3d3838', pattern: 'solid', white: 0, eye: '#e9b54a' }),
    outfit: 'scholar',
    schedule: [
      { from: 9, to: 17, poi: 'library_in', act: 'read' },
      { from: 17, to: 19, poi: 'bench_park', act: 'read' },
      { from: 20.5, to: 23.5, poi: 'hilltop', act: 'gaze' },
    ],
    lines: ['嘘——这里是图书馆', '你知道吗，猫一天要睡十几个小时', '这本书讲的是一只会飞的鱼', '星星的光，走了很久才到这里', '读书和晒太阳可以同时进行'],
    special: { label: '听个故事', done: '墨墨轻轻地讲了一个故事', anim: 'loaf', npcAnim: 'read', secs: 16, effect: { mood: 10, energy: 4 }, story: '一个温柔又有点奇妙的小故事' },
    bye: ['书还没看完，我先回去啦', '安静地走走，也很好', '下次再给你讲故事'],
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
    special: { label: '陪他钓鱼', done: '它在海伯身边看了好一会儿浮漂', anim: 'watch', npcAnim: 'fish', secs: 16, effect: { mood: 10, energy: 4 }, gift: { item: 'treat_fish', chance: 0.6, text: '浮漂动了！海伯把钓到的小鱼干分给了它' } },
    bye: ['老头子要回码头喽', '海风吹够了，回去钓鱼', '年轻真好啊，下次再走'],
    gift: { item: 'treat_fish', chance: 0.25, text: '海伯分了你一条小鱼干' },
  },
  {
    id: 'npc_florist', name: '小葵', role: '花店店员', desc: '戴花冠的三花猫，能叫出每一种花的名字。', voice: '甜甜的，爱夸人',
    genes: g(106, { base: '#fdf8f0', accent: '#ef9f55', accent2: '#5a5352', pattern: 'calico', white: 0.6, eye: '#8fc45a' }),
    outfit: 'florist',
    schedule: [
      { from: 8, to: 11, poi: 'flowerfield', act: 'work' },
      { from: 11, to: 18, poi: 'flowers_in', act: 'work' },
      { from: 18, to: 20, poi: 'fountain', act: 'sit' },
    ],
    lines: ['这朵花和你很配', '向日葵会一直看着太阳', '今天的风里有花香', '送你一朵，不用谢', '花和猫猫一样，都需要阳光'],
    special: { label: '闻闻花', done: '小葵捧来一束刚到的花，它认真地闻了闻', anim: 'sniff', npcAnim: 'work', secs: 8, effect: { mood: 12 }, gift: { item: 'flower_crown', chance: 1, minLevel: 2, once: true, text: '小葵给它编了一顶小花冠' } },
    bye: ['花还没浇水呢，我先回去啦', '今天的风真香，谢谢你', '下次一起去花田吧'],
  },
  {
    id: 'npc_store', name: '豆豆老板', role: '杂货铺老板', desc: '系着小领结的胖猫，店里什么都有，就是找不到。', voice: '憨厚精明，爱推销',
    genes: g(107, { base: '#b18566', accent: '#835b43', pattern: 'bicolor', white: 0.55, eye: '#d98c3b', chonk: 1.3 }),
    outfit: 'merchant', shop: 'store',
    schedule: [{ from: 8, to: 20.5, poi: 'store_in', act: 'work' }],
    lines: ['新到的纸箱，要不要看看', '本店童叟无欺，猫猫无欺', '这个沙发，坐过的猫都说好', '买家具找豆豆，准没错', '今天打九五折……开玩笑的'],
    bye: ['店里没人看着，我得回去啦', '有空来逛逛哦', '下次给你打折……开玩笑的'],
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
    special: { label: '一起玩', done: '它和阿花玩了一会儿捉迷藏', anim: 'pounce', npcAnim: 'play', secs: 12, effect: { mood: 14, social: 10, energy: -6 } },
    busy: [],
    bye: ['妈妈叫我回家啦', '明天还要一起玩！', '我去找弟弟啦'],
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
    special: { label: '一起玩', done: '它和阿草比赛跑，谁也没赢', anim: 'run', npcAnim: 'play', secs: 12, effect: { mood: 14, social: 10, energy: -8 } },
    busy: [],
    bye: ['我要去找姐姐啦', '下次我一定跑赢你！', '嘿嘿，拜拜～'],
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
    special: { label: '点一首歌', done: '阿乐为它弹了一首软软的歌', anim: 'sit_happy', npcAnim: 'music', secs: 14, effect: { mood: 12 } },
    busy: [],
    bye: ['我去找个地方练琴啦', '这一路的风声，可以写成歌', '下次给你弹新歌'],
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
    special: { label: '陪奶奶坐会儿', done: '它在棉花奶奶脚边趴了一会儿，看奶奶织毛线', anim: 'loaf', npcAnim: 'knit', secs: 14, effect: { mood: 8, energy: 8 }, gift: { item: 'scarf', chance: 1, minLevel: 2, once: true, text: '棉花奶奶给它织好了一条小围巾' } },
    busy: [],
    bye: ['奶奶腿脚慢，先回去喽', '走了这么多路，奶奶高兴', '回家路上慢点走'],
  },
  {
    id: 'npc_tailor', name: '针针', role: '裁缝', desc: '眼光挑剔的暹罗猫，做的小衣服全镇最时髦。', voice: '有点傲娇的时尚达人',
    genes: g(112, { base: '#f5e8d3', accent: '#6e5446', pattern: 'pointed', eye: '#79b2e8' }),
    outfit: 'tailor', shop: 'tailor',
    schedule: [{ from: 9, to: 20, poi: 'tailor_in', act: 'work' }],
    lines: ['这个颜色，很衬你', '时尚就是要有一点点不一样', '哼，我的手艺可是全镇第一', '试试这顶帽子？', '美丽的猫猫值得美丽的衣服'],
    bye: ['哼，我还有一件新衣服要做', '走路的姿势也要优雅哦', '下次来试新衣服'],
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
    special: { label: '喝杯热羊奶', done: '阿月递来一小杯温羊奶，夜里也暖暖的', anim: 'loaf', npcAnim: 'work', secs: 10, effect: { hunger: 12, mood: 12 } },
    bye: ['摊子还开着，我回去啦', '夜深了，早点回家', '谢谢你陪我看月亮'],
    gift: { item: 'treat_milk', chance: 0.4, text: '阿月递给你一小杯温羊奶' },
  },
  {
    id: 'npc_orchard', name: '果果爷爷', role: '果园的老爷爷', desc: '守着东边果园的老橘猫，会把熟透的果子分给路过的小猫。', voice: '乐呵呵的，说话慢吞吞',
    genes: g(114, { base: '#f2c58a', accent: '#d9944f', pattern: 'tabby', white: 0.35, eye: '#b9a64a', chonk: 1.15 }),
    outfit: 'farmer',
    schedule: [
      { from: 6, to: 11.5, poi: 'orchard', act: 'work' },
      { from: 11.5, to: 13, poi: 'orchard', act: 'sit' },
      { from: 13, to: 18.5, poi: 'orchard', act: 'work' },
    ],
    lines: ['今年的果子甜着呢', '慢慢长，急不得', '树也会累，要让它歇歇', '摘果子要摘最高的那颗', '果园的风，是甜的'],
    special: { label: '摘个果子', done: '果果爷爷把它举高高，让它碰到了树梢的果子', anim: 'pounce', npcAnim: 'work', secs: 10, effect: { mood: 12, hunger: 6 }, gift: { item: 'apple', chance: 0.6, text: '果果爷爷塞给它一个小红苹果' } },
    bye: ['爷爷要回果园看看树啦', '走了一圈，腿脚都活络了', '下次来，果子更甜'],
  },
  {
    id: 'npc_onsen', name: '汤汤', role: '温泉的看守', desc: '住在山间温泉小屋的白猫，总是暖烘烘、湿漉漉的。', voice: '懒洋洋的，带着热气',
    genes: g(115, { base: '#fdfaf4', accent: '#efe6da', pattern: 'bicolor', white: 0.7, eye: '#8fc45a', chonk: 1.2 }),
    outfit: 'onsen',
    schedule: [
      { from: 7, to: 12, poi: 'hotspring', act: 'sit' },
      { from: 12, to: 14, poi: 'hotspring', act: 'sleep' },
      { from: 14, to: 21.5, poi: 'hotspring', act: 'sit' },
    ],
    lines: ['泡一泡，什么烦恼都化开了', '嗯……好暖……', '温泉蛋马上就好', '山里的星星特别亮', '别着急，水是热的'],
    special: { label: '泡个温泉', done: '它在温泉边泡了泡爪子，整只猫都软了', anim: 'nap', npcAnim: 'sleep', secs: 18, effect: { energy: 20, mood: 10, clean: 14 }, gift: { item: 'onsen_egg', chance: 0.4, text: '汤汤捞出一个温泉蛋给它' } },
    busy: [],
    bye: ['我要回去泡着啦', '走路好累……温泉在召唤我', '下次来泡温泉哦'],
  },
  {
    id: 'npc_travel', name: '阿旅', role: '路过的旅行家', desc: '背着小背包的虎斑猫，走过很多很多地方，暂时在露营地歇脚。', voice: '爽朗又有点神秘，爱讲远方',
    genes: g(116, { base: '#c9a782', accent: '#7f5d45', pattern: 'mackerel', white: 0.2, eye: '#79b2e8' }),
    outfit: 'traveler',
    schedule: [
      { from: 7, to: 10, poi: 'camp', act: 'sit' },
      { from: 10, to: 15, poi: 'island', act: 'sit' },
      { from: 15, to: 17.5, poi: 'sakura_slope', act: 'walk' },
      { from: 17.5, to: 23.5, poi: 'camp', act: 'sit' },
    ],
    lines: ['我见过会唱歌的雪山', '路上最好的东西，是遇见', '这个小镇，让我想多住几天', '你知道海的另一边有什么吗', '篝火旁边最适合讲故事'],
    special: { label: '听旅行故事', done: '阿旅讲了一段远方的旅行', anim: 'loaf', npcAnim: 'sit', secs: 16, effect: { mood: 10, social: 6 }, story: '一段远方旅行里遇见的奇妙小事', gift: { item: 'postcard', chance: 1, minLevel: 1, once: true, text: '阿旅送了它一张远方寄来的明信片' } },
    busy: [],
    bye: ['我回营地看看篝火', '旅行家要继续赶路啦', '下次见，小旅伴'],
  },
];

export const NPC_MAP: Record<string, NpcDef> = Object.fromEntries(NPCS.map((n) => [n.id, n]));

export function scheduleAt(n: NpcDef, hour: number): ScheduleEntry | null {
  for (const s of n.schedule) if (hour >= s.from && hour < s.to) return s;
  return null;
}

/** Familiarity between a cat and a resident. */
export const BOND_LEVELS: [number, string][] = [[0, '刚认识'], [3, '面熟'], [10, '熟悉'], [25, '好朋友']];
export function townBond(points: number): { level: number; name: string; next: number | null } {
  let level = 0;
  for (let i = 0; i < BOND_LEVELS.length; i++) if (points >= BOND_LEVELS[i][0]) level = i;
  return { level, name: BOND_LEVELS[level][1], next: BOND_LEVELS[level + 1]?.[0] ?? null };
}

/** Can this resident go for a walk right now? Returns why not, or null. */
export function walkBusy(n: NpcDef, hour: number): string | null {
  const s = scheduleAt(n, hour);
  if (!s) return '已经回家休息了';
  const busy = n.busy ?? ['work', 'read', 'patrol'];
  if (!busy.includes(s.act)) return null;
  const free = n.schedule.find((e) => e.from >= s.to && !busy.includes(e.act));
  return free ? `正忙着呢，${Math.floor(free.from)}点${free.from % 1 ? '半' : ''}以后有空` : '今天一直在忙';
}
