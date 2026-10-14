// Procedural cat speech: used offline and as a fallback when the language model
// is unavailable. Lines are assembled from fragments and flavoured by the cat's
// voice so even the fallback feels varied.
import { Rng } from './rng';
import type { Personality } from './types';
import type { Phase, WeatherKind } from './time';

export type SpeechCtx =
  | 'idle' | 'pet' | 'feed' | 'play' | 'sleepy' | 'wake' | 'window' | 'explore' | 'place' | 'find' | 'meet'
  | 'home' | 'greet' | 'hungry' | 'night' | 'rain' | 'snow' | 'box' | 'sun' | 'command_ok' | 'command_confused'
  | 'friend' | 'bored' | 'groom' | 'scratch' | 'dress' | 'decor' | 'lonely';

export interface SpeechInfo {
  name: string;
  p: Personality;
  phase?: Phase;
  weather?: WeatherKind;
  season?: number;
  place?: string; // place display name
  item?: string; // item display name
  other?: string; // other cat / npc name
  food?: string;
  owner?: string;
}

const L: Record<SpeechCtx, string[]> = {
  idle: [
    '今天的空气闻起来软软的', '我在想一件很重要的事……忘了', '尾巴自己在动，不是我', '这里是本喵的地盘',
    '要不要一起发呆呀', '刚刚好像听到了小鸟', '肚子圆圆，心情也圆圆', '想被摸摸头，但不说',
    '地板凉凉的，好舒服', '我数了数，今天打了三个哈欠', '你在看我吗？我也在看你', '窝里的味道最安心了',
    '世界好大，但我只要这一小块', '闭上眼睛也能找到你', '今天也是被爱着的一天', '如果时间可以暂停，就停在现在',
  ],
  pet: [
    '咕噜咕噜……再往左一点', '这里这里，下巴也要', '呼噜声停不下来了', '你的手是暖暖的', '好吧，允许你多摸一会儿',
    '眯起眼睛就是喜欢你的意思', '被摸摸的时候，世界都变软了', '再摸一下下……就一下', '耳朵后面最舒服了',
    '咕噜～我把幸福都给你听', '尾巴竖起来了，你懂的', '我才没有很开心呢（呼噜）',
  ],
  feed: [
    '是{food}！是{food}的味道！', '吃饱饱，长胖胖', '嚼嚼嚼……人间美味', '谢谢投喂，本喵记住你了',
    '这一口，是幸福的形状', '再来一口好不好嘛', '舔舔嘴巴，回味无穷', '{food}最高！',
  ],
  play: [
    '看我飞扑！', '抓到啦！……咦，没抓到', '再来再来！', '我是丛林里最快的小老虎', '尾巴，别跑！',
    '这个东西会动！必须抓住！', '屁股扭一扭，准备——冲！', '玩累了，但还能再玩五分钟',
  ],
  sleepy: [
    '眼皮好重……', '呼……就睡五分钟', '晚安，梦里见', '把自己团成一颗团子', '今天辛苦啦，我先睡了',
    '梦里有很多很多小鱼干', '嘘，我在充电', '软软的窝，软软的我',
  ],
  wake: ['伸——懒——腰——', '刚刚梦到在天上飞', '睡饱啦，满血复活', '咦，天怎么亮了', '早安！今天也要元气满满'],
  window: [
    '窗外的世界在发光', '那只小鸟在跟我打招呼吗', '风吹过的时候，叶子在跳舞', '我在看云变成鱼的形状',
    '外面好热闹呀', '如果我会飞，就去那朵云上睡觉', '咔咔咔……是小鸟！',
  ],
  explore: [
    '我出发啦，等我带好东西回来', '外面的世界在召唤本喵', '今天要去哪里冒险呢', '鼻子告诉我，那边有好玩的',
    '小爪爪，冲鸭！', '探险家{name}，出发！',
  ],
  place: [
    '{place}到了！', '{place}今天也很好看', '在{place}闻到了新鲜的味道', '我要在{place}待一会儿',
    '{place}的风，是甜的', '原来{place}长这样呀',
  ],
  find: [
    '捡到了{item}！要带回家', '看！{item}！亮晶晶的', '这个{item}送给你', '{item}，收藏+1',
    '我发现了宝贝：{item}', '{item}……好像很重要的样子',
  ],
  meet: [
    '你好呀{other}！', '{other}，一起玩吗', '碰碰鼻子，就是好朋友', '{other}身上有阳光的味道',
    '又见面啦{other}', '{other}，你今天也很可爱', '嗨{other}，要不要一起晒太阳',
  ],
  friend: ['和{other}在一起好开心', '{other}是我的好朋友', '下次还要和{other}一起玩'],
  home: ['我回来啦！', '还是窝里最舒服', '带了外面的故事回来给你听', '冒险结束，开饭！', '想你了，所以回来了'],
  greet: ['你来啦！', '我一直在等你哦', '今天过得好吗？我很想你', '欢迎回家～', '蹭蹭，充电完毕'],
  hungry: ['肚子在唱歌了', '是不是到了开饭时间呀', '饭饭……饭饭……', '我闻到了罐罐的气息（幻觉）'],
  night: ['星星出来了', '夜晚是猫猫的时间', '月亮像一块小饼干', '晚上的风凉凉的', '陪我看一会儿月亮吧'],
  rain: ['下雨啦，滴答滴答', '雨声是最好的催眠曲', '今天适合窝在家里', '外面湿漉漉的，我不出去了'],
  snow: ['下雪了！白白软软的', '雪花落在鼻子上，凉凉的', '外面像撒了一层糖霜'],
  box: ['箱子！我的！', '这里是秘密基地', '只要钻进箱子，就没有烦恼', '你看不见我，你看不见我'],
  sun: ['太阳晒得肚皮暖暖的', '我是一块正在烤的面包', '阳光有味道，是甜的', '翻个面，再晒一晒'],
  command_ok: ['好哒！', '收到，马上去', '交给本喵吧', '喵！这就出发', '好呀好呀'],
  command_confused: ['喵？没听懂……', '你说的是小鱼干吗？', '歪头……', '嗯……要不我们去晒太阳吧'],
  bored: ['好无聊呀，陪我玩嘛', '想找点事情做', '我要开始推东西了哦'],
  groom: ['舔舔毛，美美哒', '今天也要做一只干净的猫', '洗洗脸，洗洗爪'],
  scratch: ['磨爪爪，咔咔咔', '爪子要保持锋利才行', '这根柱子手感真不错'],
  dress: ['好看吗好看吗', '我是今天最靓的猫', '新衣服！转个圈给你看'],
  decor: ['家里变好看了！', '新东西！我要先闻闻', '这里我要了'],
  lonely: ['想要人陪陪', '你会一直在吗', '蹭蹭你的手，就不孤单了'],
};

const PHASE_IDLE: Partial<Record<Phase, string[]>> = {
  dawn: ['天快亮了，跑两圈！', '清晨的光是粉色的'],
  morning: ['早上好呀', '上午适合晒太阳和发呆'],
  noon: ['中午了，该睡午觉了', '太阳暖烘烘的，好困'],
  afternoon: ['下午茶时间到了吗', '午后的风懒洋洋的'],
  evening: ['夕阳把我的毛染成了金色', '傍晚是跑酷的时间！'],
  night: ['晚上好，今天也辛苦啦', '夜深了，要早点睡哦'],
  late: ['嘘……大家都睡着了', '深夜的月光好安静'],
};

function voice(text: string, p: Personality, r: Rng): string {
  const v = p.voice;
  const end = /[！？。～…]$/.test(text);
  if (v.startsWith('软糯')) return text + (end ? '' : r.pick(['喵～', '～', '嘛～', '呀']));
  if (v.startsWith('有点傲娇')) return (r.chance(0.4) ? r.pick(['哼，', '才不是……', '勉强，']) : '') + text + (end ? '' : r.pick(['。', '，哼', '']));
  if (v.startsWith('元气')) return text + (end ? '' : r.pick(['！', '！！', '，冲呀！']));
  if (v.startsWith('慢吞吞')) return (r.chance(0.5) ? r.pick(['嗯……', '呼……', '唔……']) : '') + text + (end ? '' : '……');
  if (v.startsWith('文艺')) return (r.chance(0.35) ? r.pick(['你听，', '悄悄地，', '风说，']) : '') + text + (end ? '' : r.pick(['。', '～', '']));
  if (v.startsWith('好奇')) return text + (end ? '' : r.pick(['？', '，为什么呢？', '！']));
  if (v.startsWith('小大人')) return (r.chance(0.35) ? '本喵认为，' : '') + text + (end ? '' : '。');
  if (v.startsWith('憨憨')) return text + (end ? '' : r.pick(['，嘿嘿', '！', '～嘿']));
  return text;
}

export function fallbackLine(ctx: SpeechCtx, info: SpeechInfo, seed = Math.random() * 1e9): string {
  const r = new Rng(seed);
  let pool = L[ctx] ?? L.idle;
  if (ctx === 'idle') {
    const extra = info.phase ? PHASE_IDLE[info.phase] ?? [] : [];
    pool = [...pool, ...extra, ...extra];
    if (info.weather === 'rain') pool = [...pool, ...L.rain];
    if (info.weather === 'snow') pool = [...pool, ...L.snow];
  }
  let t = r.pick(pool);
  t = t
    .replaceAll('{name}', info.name)
    .replaceAll('{place}', info.place ?? '这里')
    .replaceAll('{item}', info.item ?? '小东西')
    .replaceAll('{other}', info.other ?? '小伙伴')
    .replaceAll('{food}', info.food ?? '小鱼干');
  return voice(t, info.p, r);
}

export function fallbackDialogue(a: SpeechInfo, b: SpeechInfo, place: string, seed = Math.random() * 1e9): { who: 0 | 1; text: string }[] {
  const r = new Rng(seed);
  const openers = [
    [`${b.name}！你也在${place}呀`, `是${a.name}！好巧`],
    [`你闻起来像${r.pick(['小鱼干', '阳光', '青草', '面包'])}`, `嘿嘿，刚刚在那边打了个滚`],
    [`今天的${place}好热闹`, `嗯！我们一起逛逛吧`],
    [`要不要比赛谁先跑到那棵树`, `好呀，输的请吃小鱼干`],
    [`你看那朵云，像不像一条鱼`, `像！好想吃掉它`],
    [`我刚捡到一片叶子`, `给我看看！哇，好漂亮`],
    [`碰碰鼻子？`, `碰碰！`],
    [`今天心情怎么样`, `晒了太阳，心情满分`],
  ];
  const [x, y] = r.pick(openers);
  const out: { who: 0 | 1; text: string }[] = [
    { who: 0, text: voice(x, a.p, r) },
    { who: 1, text: voice(y, b.p, r) },
  ];
  if (r.chance(0.5)) out.push({ who: 0, text: voice(r.pick(['那我们说好了', '嘿嘿', '下次还在这里见', '你真好']), a.p, r) });
  return out;
}

export function fallbackJournal(name: string, places: string[], finds: string[], friends: string[], seed = Math.random() * 1e9): string {
  const r = new Rng(seed);
  const parts: string[] = [];
  if (places.length) parts.push(r.pick([`今天去了${places.join('、')}`, `我走过了${places.join('和')}`, `${places[0]}的风很好闻`]));
  if (friends.length) parts.push(r.pick([`遇到了${friends.join('和')}，我们碰了碰鼻子`, `和${friends[0]}一起玩了一会儿`]));
  if (finds.length) parts.push(r.pick([`还捡到了${finds.join('、')}，要送给你`, `口袋里装着${finds[0]}回家`]));
  if (!parts.length) parts.push('今天在外面慢慢地走了一圈，什么也没做，也很好');
  parts.push(r.pick(['想快点回家。', '是很棒的一天！', '明天还要去。', '有点累，但很开心。']));
  return `${parts.join('，')}`;
}
