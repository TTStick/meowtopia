import { Rng } from './rng';
import type { CatGenes, Pattern, Personality } from './types';

interface Coat {
  key: string;
  name: string;
  base: string;
  accent: string;
  accent2?: string;
  patterns: [Pattern, number][];
}

export const COATS: Coat[] = [
  { key: 'orange', name: '橘', base: '#f6b26b', accent: '#e38b3d', patterns: [['tabby', 5], ['mackerel', 3], ['solid', 1], ['bicolor', 3]] },
  { key: 'cream', name: '奶油', base: '#f7dfb6', accent: '#ebc08a', patterns: [['tabby', 3], ['solid', 3], ['bicolor', 2]] },
  { key: 'gray', name: '蓝灰', base: '#b8c0cb', accent: '#8b95a3', patterns: [['solid', 4], ['tabby', 2], ['bicolor', 2]] },
  { key: 'black', name: '黑', base: '#55504f', accent: '#3d3838', patterns: [['solid', 4], ['tuxedo', 5], ['bicolor', 1]] },
  { key: 'white', name: '白', base: '#fdfaf4', accent: '#ece6dc', patterns: [['solid', 1]] },
  { key: 'brown', name: '狸花', base: '#cfaa82', accent: '#7f5d45', patterns: [['tabby', 4], ['mackerel', 5], ['spotted', 2]] },
  { key: 'silver', name: '银渐层', base: '#dfe3e6', accent: '#8f969d', patterns: [['tabby', 3], ['mackerel', 2], ['spotted', 2]] },
  { key: 'calico', name: '三花', base: '#fdf8f0', accent: '#ef9f55', accent2: '#5a5352', patterns: [['calico', 1]] },
  { key: 'tortie', name: '玳瑁', base: '#5d5251', accent: '#dc8c48', accent2: '#a8683b', patterns: [['tortie', 1]] },
  { key: 'siamese', name: '暹罗', base: '#f5e8d3', accent: '#6e5446', patterns: [['pointed', 1]] },
  { key: 'lilac', name: '丁香', base: '#d8cbd0', accent: '#b4a3aa', patterns: [['solid', 2], ['pointed', 1], ['bicolor', 1]] },
  { key: 'choco', name: '巧克力', base: '#b18566', accent: '#835b43', patterns: [['solid', 2], ['tabby', 1], ['bicolor', 1]] },
];

const EYES = ['#e9b54a', '#8fc45a', '#79b2e8', '#d98c3b', '#b9a64a', '#a6d4e8', '#76c3a8'];

export function randomGenes(seed: number): CatGenes {
  const r = new Rng(seed);
  const coat = r.weighted(COATS.map((c) => [c, c.key === 'calico' || c.key === 'tortie' || c.key === 'siamese' ? 1.2 : 2] as const));
  const pattern = r.weighted(coat.patterns);
  const eye = coat.key === 'siamese' ? '#79b2e8' : r.pick(EYES);
  const hetero = coat.key === 'white' && r.chance(0.35) || r.chance(0.03);
  let white = 0;
  if (pattern === 'bicolor') white = r.range(0.45, 0.85);
  else if (pattern === 'tuxedo') white = r.range(0.4, 0.7);
  else if (pattern === 'calico') white = r.range(0.5, 0.8);
  else if (coat.key !== 'white' && r.chance(0.25)) white = r.range(0.15, 0.4);
  const dark = coat.key === 'black' || coat.key === 'tortie';
  return {
    seed,
    coat: coat.key,
    base: coat.base,
    accent: coat.accent,
    accent2: coat.accent2 ?? coat.accent,
    pattern,
    white,
    blaze: white > 0.35 && r.chance(0.45),
    eye,
    eye2: hetero ? r.pick(EYES.filter((e) => e !== eye)) : eye,
    nose: dark ? '#6b5556' : r.pick(['#f2a5a5', '#eb9a9f', '#f0b2a8', '#d98e8e']),
    earSize: r.range(0.88, 1.15),
    earFold: r.chance(0.06),
    tail: r.range(0.85, 1.2),
    fluff: r.chance(0.3) ? r.range(0.4, 1) : r.range(0, 0.25),
    chonk: r.range(0.92, 1.25),
    socks: white > 0 || r.chance(0.15),
  };
}

export function coatName(g: CatGenes): string {
  const c = COATS.find((c) => c.key === g.coat);
  const n = c ? c.name : '小';
  const suffix: Record<Pattern, string> = {
    solid: '猫', tabby: '虎斑', mackerel: '鲭鱼斑', calico: '猫', tortie: '猫', tuxedo: '奶牛猫',
    bicolor: '白', pointed: '色', spotted: '点斑',
  };
  if (g.pattern === 'tuxedo') return '奶牛猫';
  if (g.pattern === 'bicolor') return `${n}白猫`;
  if (g.pattern === 'calico' || g.pattern === 'tortie') return `${n}猫`;
  if (g.pattern === 'pointed') return g.coat === 'siamese' ? '暹罗猫' : `${n}重点色`;
  return `${n}${suffix[g.pattern]}${g.pattern === 'solid' ? '' : '猫'}`;
}

export const QUIRKS = [
  '看到纸箱就走不动路',
  '睡觉时会用爪爪捂住眼睛',
  '喜欢听雨声发呆',
  '对蝴蝶毫无抵抗力',
  '吃饭前要先绕着碗转一圈',
  '坚信自己是一只小老虎',
  '喜欢坐在高高的地方思考猫生',
  '会对着窗外的小鸟咔咔咔',
  '喜欢收集亮晶晶的小东西',
  '每天傍晚准时开始跑酷',
  '喜欢把桌上的东西推下去',
  '爱蹭人的脚踝',
  '睡着了会打小呼噜',
  '踩奶踩着踩着就睡着了',
  '是个晒太阳专家',
  '喜欢钻进被窝里只露尾巴',
  '自认为是美食评论家',
  '第一次见面会害羞，熟了就很黏人',
  '喜欢在花丛里打滚',
  '尾巴会不自觉地勾住喜欢的东西',
  '总想知道河对岸有什么',
  '对自己的倒影很好奇',
  '会给好朋友带小礼物',
  '喜欢偷偷观察别的猫猫',
];

export const VOICES = [
  '软糯撒娇，句尾爱加“喵～”',
  '有点傲娇，嘴硬心软',
  '元气满满，总是很兴奋',
  '慢吞吞的，说话像在打哈欠',
  '文艺小诗人，喜欢用比喻',
  '好奇宝宝，总在问问题',
  '小大人，一本正经地说可爱的话',
  '憨憨的，容易被自己逗笑',
];

export function randomPersonality(seed: number): Personality {
  const r = new Rng(seed ^ 0x5bd1e995);
  const t = () => Math.round(r.range(0.15, 0.95) * 100) / 100;
  return {
    curious: t(),
    playful: t(),
    lazy: t(),
    social: t(),
    foodie: t(),
    brave: t(),
    quirk: r.pick(QUIRKS),
    voice: r.pick(VOICES),
  };
}

export const CAT_NAMES = [
  '团子', '年糕', '芝麻', '豆包', '布丁', '奶茶', '汤圆', '麻薯', '可乐', '雪球', '花卷', '糯米',
  '大福', '馒头', '栗子', '煤球', '奶盖', '柚子', '七七', '豆豆', '球球', '毛毛', '皮蛋', '酥酥',
  '饭团', '椰子', '拿铁', '桃桃', '橙子', '小满', '阿福', '咕噜', '蛋挞', '包子', '米粒', '云朵',
  '奶糖', '芋圆', '可颂', '松饼', '橘子', '豆花', '泡芙', '核桃', '星星', '月饼', '小鱼', '奥利奥',
];

export function traitWords(p: Personality): string[] {
  const out: string[] = [];
  if (p.curious > 0.7) out.push('好奇心旺盛');
  if (p.playful > 0.7) out.push('爱玩');
  if (p.lazy > 0.7) out.push('爱睡懒觉');
  if (p.social > 0.7) out.push('自来熟');
  if (p.social < 0.3) out.push('有点怕生');
  if (p.foodie > 0.7) out.push('小吃货');
  if (p.brave > 0.7) out.push('胆子大');
  if (p.brave < 0.3) out.push('胆小');
  if (out.length === 0) out.push('性格温和');
  return out;
}
