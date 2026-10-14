// Community safety: text filtering for anything other players can read, plus
// reports and bans. Operators can add words to data/blocklist.txt (one per line).
import { existsSync, readFileSync, watch } from 'node:fs';
import { join } from 'node:path';
import { HttpError } from './errors';
import { DATA_DIR } from './config';

// Phrases, not single characters: "打滚" and "笑死" are perfectly cute.
const BUILTIN = [
  // contact details & off-platform lures
  '微信', '威信', 'weixin', 'wechat', 'vx', 'v信', 'wx号', 'qq', '扣扣', '企鹅号', '手机号', '电话号', '加我', '私聊', '私信我', '联系我', 'telegram', 'whatsapp', '加群', '进群',
  // links
  'http', 'www.', '.com', '.cn', '.net', '.org', '.top', '.xyz', '点com', '网址',
  // insults
  '傻逼', '煞笔', '沙比', 'sb', '妈的', '他妈', '操你', '草泥马', 'cnm', 'nmsl', '尼玛', '贱人', '婊子', '去死', '死全家', '狗东西', '废物', '脑残', '弱智', 'fuck', 'shit', 'bitch',
  // adult / scams / gambling
  '色情', '约炮', '裸照', '做爱', '黄片', '一夜情', '援交', '赌博', '博彩', '代充', '刷单', '日结', '返利', '贷款', '外挂',
];

let extra: string[] = [];
const BLOCKLIST = join(DATA_DIR, 'blocklist.txt');
function loadExtra() {
  try {
    extra = existsSync(BLOCKLIST)
      ? readFileSync(BLOCKLIST, 'utf8')
          .split(/\r?\n/)
          .map((s) => normalize(s.trim()))
          .filter((s) => s && !s.startsWith('#'))
      : [];
  } catch {
    extra = [];
  }
}

const CN_DIGITS: Record<string, string> = { 零: '0', 〇: '0', 一: '1', 壹: '1', 二: '2', 贰: '2', 两: '2', 三: '3', 叁: '3', 四: '4', 肆: '4', 五: '5', 伍: '5', 六: '6', 陆: '6', 七: '7', 柒: '7', 八: '8', 捌: '8', 九: '9', 玖: '9' };

/** Lowercase, half-width, strip spaces/punctuation/zero-width tricks. */
export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[​-‏⁠﻿]/g, '')
    .replace(/[\s_\-·•。，、！!？?~～*#@&|/\\'"“”‘’()（）【】\[\]{}<>《》]/g, '');
}

function digitsOnly(s: string): string {
  return [...s].map((ch) => CN_DIGITS[ch] ?? ch).join('').replace(/[^0-9]/g, '');
}

loadExtra();
try {
  if (existsSync(DATA_DIR)) watch(DATA_DIR, (_e, f) => f === 'blocklist.txt' && loadExtra());
} catch {
  /* watching is best effort */
}

export function textProblem(raw: string): string | null {
  const t = normalize(raw);
  for (const w of BUILTIN) if (t.includes(normalize(w))) return w;
  for (const w of extra) if (t.includes(w)) return w;
  // phone numbers / QQ ids in any disguise: 5+ digits (also written in Chinese numerals)
  if (/\d{5,}/.test(digitsOnly(raw.replace(/\s/g, '')))) return 'digits';
  return null;
}

/** Throws a gentle error if the text isn't suitable for others to read. */
export function cleanText(s: string): string {
  if (textProblem(s)) throw new HttpError(400, '这句话不太适合猫猫小镇哦，换个说法吧');
  return s;
}
