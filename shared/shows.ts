// Evening shows at the open-air stage. Which nights have a show, and what's on, is
// worked out from the world clock alone, so the server (which moves the performers)
// and every client (which lights the stage) agree without saying a word.
import { hashf } from './rng';
import { clockAt, weatherAt } from './time';

export interface ShowDef {
  id: string;
  name: string;
  blurb: string;
  host: string; // the townsfolk who leads it
  cast: { id: string; act: string }[]; // on stage, host first
  crowd: string[]; // townsfolk who come to watch
  lines: string[]; // said from the stage, in order, round and round
  cheers: string[]; // from the audience
  notes?: boolean; // music notes float up from the stage
}

export const SHOW_GATHER = 19; // townsfolk start heading over
export const SHOW_START = 19.5;
export const SHOW_END = 21;

export const SHOWS: ShowDef[] = [
  {
    id: 'concert', name: '阿乐的星光音乐会', blurb: '阿乐抱着琴，唱几首软软的歌', host: 'npc_music',
    cast: [{ id: 'npc_music', act: 'music' }],
    crowd: ['npc_baker', 'npc_cafe', 'npc_kid1', 'npc_kid2', 'npc_granny', 'npc_florist', 'npc_travel', 'npc_lib'],
    lines: ['晚上好呀，小镇的大家', '第一首，《晒太阳》', '啦啦啦～喵喵喵～', '下一首送给今晚的月亮：《小鱼干之歌》', '跟着节奏摇尾巴吧', '这首叫《回家的小巷》，慢慢听', '谢谢大家，今晚的风真好'],
    cheers: ['好听！', '再来一首！', '喵——！', '阿乐最棒了', '我跟着摇尾巴了'],
    notes: true,
  },
  {
    id: 'chorus', name: '小镇合唱团', blurb: '阿花阿草和大家一起唱歌，偶尔唱错', host: 'npc_kid1',
    cast: [{ id: 'npc_kid1', act: 'play' }, { id: 'npc_kid2', act: 'play' }, { id: 'npc_florist', act: 'stand' }, { id: 'npc_post', act: 'stand' }],
    crowd: ['npc_music', 'npc_granny', 'npc_baker', 'npc_cafe', 'npc_store', 'npc_tailor', 'npc_travel'],
    lines: ['一、二、三，开始唱！', '星星眨眼睛～猫猫眯眼睛～', '弟弟又唱错了！', '月亮弯弯，小船弯弯～', '这一段要大声唱！', '谢谢大家来听我们唱歌！'],
    cheers: ['唱得真好', '阿草加油！', '（轻轻跟着哼）', '好可爱呀', '再唱一遍！'],
    notes: true,
  },
  {
    id: 'dance', name: '灯笼舞会', blurb: '针针领舞，阿乐伴奏，大家转圈圈', host: 'npc_tailor',
    cast: [{ id: 'npc_tailor', act: 'play' }, { id: 'npc_music', act: 'music' }, { id: 'npc_kid2', act: 'play' }, { id: 'npc_florist', act: 'play' }],
    crowd: ['npc_baker', 'npc_cafe', 'npc_kid1', 'npc_granny', 'npc_store', 'npc_lib', 'npc_travel'],
    lines: ['今晚的主题是：转圈圈！', '左边跳一跳，右边摇一摇～', '哼，跟上我的节奏', '所有猫猫一起来！', '尾巴要翘起来才优雅', '舞会结束啦，大家都很美'],
    cheers: ['转起来啦！', '针针好会跳', '我也想上去跳', '喵哈哈哈', '灯笼好漂亮'],
    notes: true,
  },
  {
    id: 'story', name: '星空故事会', blurb: '墨墨和阿旅在舞台上讲故事', host: 'npc_lib',
    cast: [{ id: 'npc_lib', act: 'read' }, { id: 'npc_travel', act: 'stand' }],
    crowd: ['npc_kid1', 'npc_kid2', 'npc_granny', 'npc_baker', 'npc_cafe', 'npc_music', 'npc_florist'],
    lines: ['今晚讲一个关于星星的故事', '从前，有一颗星星不小心掉进了小河', '它变成了一条会发光的小鱼', '我在远方也见过这样的光', '所以呀，河里亮晶晶的，都是星星', '故事讲完啦，抬头看看天吧'],
    cheers: ['然后呢然后呢', '（安静地听着）', '好想看那条小鱼', '再讲一个嘛', '哇——'],
  },
  {
    id: 'magic', name: '阿旅的魔术秀', blurb: '旅行家阿旅从远方学来的小魔术', host: 'npc_travel',
    cast: [{ id: 'npc_travel', act: 'stand' }, { id: 'npc_kid2', act: 'stand' }],
    crowd: ['npc_kid1', 'npc_granny', 'npc_baker', 'npc_music', 'npc_florist', 'npc_store', 'npc_tailor'],
    lines: ['各位，请看这顶帽子', '变——！一条小鱼干！', '下面需要一位小助手……阿草！', '这张牌，记住了吗？', '它从你的耳朵后面出来了！', '谢谢大家，魔术的秘密，要保密哦'],
    cheers: ['哇！怎么做到的', '好厉害！', '我看到了！……没看到', '再变一个！', '喵？！'],
  },
];

export const SHOW_MAP: Record<string, ShowDef> = Object.fromEntries(SHOWS.map((s) => [s.id, s]));

/** The stage, in tiles: performers stand on it, the audience sits on the lawn in front. */
export const STAGE = { x: 112, back: 50.4, front: 54.4 };
export const STAGE_SPOTS: [number, number][] = [[112, 52.4], [109.6, 52.8], [114.4, 52.8], [110.8, 53.7], [113.2, 53.7]];
export const AUDIENCE_SPOTS: [number, number][] = (() => {
  const out: [number, number][] = [];
  for (const [y, n] of [[56.6, 5], [58.2, 6], [59.8, 5]] as [number, number][])
    for (let i = 0; i < n; i++) out.push([112 - ((n - 1) / 2) * 1.9 + i * 1.9, y + (i % 2) * 0.2]);
  return out;
})();

/** What's on a given world day (about four nights a week), or null. */
export function showOn(day: number): ShowDef | null {
  if (hashf(day, 77) > 0.58) return null;
  return SHOWS[Math.floor(hashf(day, 78) * SHOWS.length)];
}

export interface ShowNow {
  show: ShowDef;
  day: number;
  live: boolean; // false while everyone gathers before it starts
  progress: number; // 0..1 through the show
}

/** The show tonight, while it's on (or while everyone gathers for it). Rain calls it off. */
export function showAt(ms: number): ShowNow | null {
  const ck = clockAt(ms);
  if (ck.hour < SHOW_GATHER || ck.hour >= SHOW_END) return null;
  const show = showOn(ck.day);
  if (!show || weatherAt(ms).kind === 'rain') return null;
  return { show, day: ck.day, live: ck.hour >= SHOW_START, progress: Math.max(0, (ck.hour - SHOW_START) / (SHOW_END - SHOW_START)) };
}

/** A townsfolk's part tonight: on stage, in the crowd, or none. */
export function showRole(npc: string, now: ShowNow | null): { stage: boolean; act: string; spot: [number, number] } | null {
  if (!now) return null;
  const s = now.show;
  const c = s.cast.findIndex((x) => x.id === npc);
  if (c >= 0) return { stage: true, act: s.cast[c].act, spot: STAGE_SPOTS[c % STAGE_SPOTS.length] };
  const a = s.crowd.indexOf(npc);
  if (a >= 0) return { stage: false, act: 'sit', spot: AUDIENCE_SPOTS[(a * 3 + now.day) % AUDIENCE_SPOTS.length] };
  return null;
}
