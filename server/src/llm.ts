// Cat language generation with Claude, with a procedural fallback.
//
// Enabled when ANTHROPIC_API_KEY is set. Lines are generated in small batches per
// (cat, context) and served from a pool so the game never waits on the model.
import Anthropic from '@anthropic-ai/sdk';
import type { CatRecord } from '../../shared/types';
import { coatName, traitWords } from '../../shared/genes';
import { fallbackLine, fallbackDialogue, fallbackJournal, type SpeechCtx, type SpeechInfo } from '../../shared/speech';
import { clockAt, phaseOf, PHASE_NAME, weatherAt, WEATHER_NAME, SEASON_NAME } from '../../shared/time';
import { ageOf } from '../../shared/stats';
import { POI_ALIASES } from '../../shared/world';

const MODEL = process.env.CAT_LLM_MODEL || 'claude-opus-5-5';
const RPM = Number(process.env.CAT_LLM_RPM || 40);
const DAILY = Number(process.env.CAT_LLM_DAILY || 4000);

const apiKey = process.env.ANTHROPIC_API_KEY;
const client = apiKey
  ? new Anthropic({ apiKey, baseURL: process.env.CAT_LLM_BASE_URL || 'https://api.anthropic.com', maxRetries: 1, timeout: 25_000 })
  : null;

export const llmEnabled = () => !!client;

// ---- budget ----
let windowStart = Date.now();
let windowCount = 0;
let dayKey = new Date().toDateString();
let dayCount = 0;
function takeBudget(): boolean {
  const now = Date.now();
  if (now - windowStart > 60_000) {
    windowStart = now;
    windowCount = 0;
  }
  const dk = new Date().toDateString();
  if (dk !== dayKey) {
    dayKey = dk;
    dayCount = 0;
  }
  if (windowCount >= RPM || dayCount >= DAILY) return false;
  windowCount++;
  dayCount++;
  return true;
}

const SYSTEM = `你在为一款温柔治愈的养猫小游戏《猫窝》写猫猫说的话。游戏是线条手绘风格：每位玩家有一只自己的猫和一个小猫窝，窝外是热闹的“猫猫小镇”，有公园、小河、码头、花田、森林和山坡，还有过着拟人生活的猫猫居民（面包店、咖啡馆、邮局、图书馆……）。

写作要求：
- 用简体中文，以猫猫自己的口吻说话（第一人称），每句不超过 24 个字。
- 萌、软、有画面感，要贴合给出的猫猫性格、说话风格、小癖好、时间、天气和正在做的事。
- 偶尔可以用“喵”“咕噜”这类声音，但不要每句都用；最多一个表情符号，通常不用。
- 情绪温暖积极，可以有一点点小傲娇或小迷糊；不要制造焦虑，不要责怪主人，不要让主人愧疚，不要催促主人上线。
- 不提及自己是 AI 或程序，不涉及现实品牌、政治、广告，不索要任何个人信息。
- 每句都要不一样，避免套话。`;

function catInfo(c: CatRecord): string {
  const p = c.personality;
  const age = ageOf(c.born);
  return [
    `名字：${c.name}`,
    `品种花色：${coatName(c.genes)}`,
    `年龄：${age < 0.6 ? '小奶猫' : age < 0.9 ? '少年猫' : '成年猫'}`,
    `性格：${traitWords(p).join('、')}`,
    `说话风格：${p.voice}`,
    `小癖好：${p.quirk}`,
    c.memory.length ? `最近的记忆：${c.memory.slice(-3).join('；')}` : '',
  ].filter(Boolean).join('\n');
}

function envInfo(): string {
  const now = Date.now();
  const ck = clockAt(now);
  const w = weatherAt(now);
  return `现在是${SEASON_NAME[ck.season]}的${PHASE_NAME[phaseOf(ck.hour)]}，天气${WEATHER_NAME[w.kind]}。`;
}

async function callJSON<T>(user: string, schema: object, maxTokens = 1200): Promise<T | null> {
  if (!client || !takeBudget()) return null;
  try {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: { type: 'json_schema', schema: schema as any } },
      messages: [{ role: 'user', content: user }],
    });
    if (res.stop_reason === 'refusal' || res.stop_reason === 'max_tokens') return null;
    for (const b of res.content) {
      if (b.type === 'text') return JSON.parse(b.text) as T;
    }
    return null;
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) console.warn('[llm] rate limited');
    else if (e instanceof Anthropic.APIError) console.warn('[llm] api error', e.status, e.message);
    else console.warn('[llm] error', (e as Error).message);
    return null;
  }
}

const LINES_SCHEMA = {
  type: 'object',
  properties: { lines: { type: 'array', items: { type: 'string' } } },
  required: ['lines'],
  additionalProperties: false,
};

const CTX_DESC: Record<SpeechCtx, string> = {
  idle: '在自己的窝里闲着，随便嘀咕几句',
  pet: '正在被主人摸摸，很舒服',
  feed: '主人喂了好吃的',
  play: '正在玩耍、扑来扑去',
  sleepy: '困了，准备睡觉',
  wake: '刚睡醒',
  window: '趴在窗边看外面',
  explore: '准备出门去小镇探险',
  place: '在小镇里探索，刚走到某个地方',
  find: '在外面捡到了一个小东西',
  meet: '在外面遇到了另一只猫',
  home: '探险结束回到家',
  greet: '主人刚打开游戏来看它',
  hungry: '有点饿了',
  night: '夜晚，很安静',
  rain: '外面在下雨',
  snow: '外面在下雪',
  box: '钻进了纸箱',
  sun: '在阳光里晒太阳',
  command_ok: '答应主人的请求',
  command_confused: '没听懂主人的话',
  friend: '想起了好朋友',
  bored: '有点无聊，想玩',
  groom: '在舔毛',
  scratch: '在磨爪子',
  dress: '主人给它换了新装扮',
  decor: '家里添了新家具',
  lonely: '想要主人陪陪',
  goodnight: '夜深了，主人在哄它睡觉，它窝在床上快睡着了，跟主人说晚安',
  wish: '主人刚刚实现了它今天的小心愿',
  grow: '它最近长大了一点',
  bond: '它和主人的感情又变深了',
};

// ---- pools ----
const pools = new Map<string, string[]>();
const MAX_POOLS = 5000;
/** Insert-ordered maps double as a crude LRU: drop the oldest keys past the cap. */
function capPools(m: Map<string, string[]>) {
  while (m.size > MAX_POOLS) m.delete(m.keys().next().value!);
}
const inflight = new Set<string>();

function poolKey(catId: string, ctx: SpeechCtx, extra: string) {
  return `${catId}|${ctx}|${extra}`;
}

async function refill(cat: CatRecord, ctx: SpeechCtx, info: SpeechInfo, key: string) {
  if (inflight.has(key)) return;
  inflight.add(key);
  try {
    const details = [
      info.place ? `地点：${info.place}` : '',
      info.item ? `物品：${info.item}` : '',
      info.other ? `对方：${info.other}` : '',
      info.food ? `食物：${info.food}` : '',
    ].filter(Boolean).join('\n');
    const user = `${catInfo(cat)}\n\n${envInfo()}\n场景：${CTX_DESC[ctx]}\n${details}\n\n请写 6 句这只猫此刻可能说的话，彼此不同。`;
    const r = await callJSON<{ lines: string[] }>(user, LINES_SCHEMA, 800);
    if (r?.lines?.length) {
      const clean = r.lines.map((s) => s.trim().slice(0, 40)).filter((s) => s.length > 0);
      const merged = [...(pools.get(key) ?? []), ...clean].slice(-12);
      pools.delete(key);
      pools.set(key, merged);
      capPools(pools);
    }
  } finally {
    inflight.delete(key);
  }
}

/** Get a line immediately (from pool or fallback) and top up the pool in the background. */
export function catLine(cat: CatRecord, ctx: SpeechCtx, info: Partial<SpeechInfo> = {}): string {
  const ck = clockAt(Date.now());
  const full: SpeechInfo = { name: cat.name, p: cat.personality, phase: phaseOf(ck.hour), weather: weatherAt(Date.now()).kind, season: ck.season, memory: cat.memory, ...info };
  const extra = `${info.place ?? ''}${info.item ?? ''}${info.other ?? ''}${info.food ?? ''}${ctx === 'idle' ? `${full.phase}${full.weather}` : ''}`;
  const key = poolKey(cat.id, ctx, extra);
  const pool = pools.get(key);
  let line: string | undefined;
  if (pool && pool.length) {
    line = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  }
  if (client && (!pool || pool.length < 2)) void refill(cat, ctx, full, key);
  return line ?? fallbackLine(ctx, full);
}

const DIALOGUE_SCHEMA = {
  type: 'object',
  properties: {
    lines: {
      type: 'array',
      items: {
        type: 'object',
        properties: { who: { type: 'integer', enum: [0, 1] }, text: { type: 'string' } },
        required: ['who', 'text'],
        additionalProperties: false,
      },
    },
  },
  required: ['lines'],
  additionalProperties: false,
};

export async function catDialogue(a: CatRecord | NpcPersona, b: CatRecord | NpcPersona, place: string): Promise<{ who: 0 | 1; text: string }[]> {
  const infoA = personaInfo(a), infoB = personaInfo(b);
  if (client) {
    const user = `两只猫在小镇的「${place}」相遇了。\n\n猫A：\n${infoA.desc}\n\n猫B：\n${infoB.desc}\n\n${envInfo()}\n请写一段 2~4 句的简短对话（who=0 表示猫A，who=1 表示猫B），轻松可爱，符合各自性格。`;
    const r = await callJSON<{ lines: { who: 0 | 1; text: string }[] }>(user, DIALOGUE_SCHEMA, 900);
    if (r?.lines?.length) return r.lines.slice(0, 4).map((l) => ({ who: l.who === 1 ? 1 : 0, text: l.text.slice(0, 40) }));
  }
  return fallbackDialogue(infoA.speech, infoB.speech, place);
}

export interface NpcPersona {
  npc: true;
  name: string;
  role: string;
  desc: string;
  voice: string;
}

function personaInfo(x: CatRecord | NpcPersona): { desc: string; speech: SpeechInfo } {
  if ('npc' in x) {
    const p = { curious: 0.5, playful: 0.5, lazy: 0.5, social: 0.8, foodie: 0.5, brave: 0.5, quirk: '', voice: x.voice };
    return { desc: `名字：${x.name}\n身份：小镇居民，${x.role}\n${x.desc}\n说话风格：${x.voice}`, speech: { name: x.name, p } };
  }
  return { desc: catInfo(x), speech: { name: x.name, p: x.personality } };
}

const NPC_LINES_SCHEMA = LINES_SCHEMA;
const npcPools = new Map<string, string[]>();
export function npcLine(n: NpcPersona, situation: string, fallback: string[]): string {
  const key = `${n.name}|${situation}`;
  const pool = npcPools.get(key);
  let line: string | undefined;
  if (pool?.length) line = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
  if (client && (!pool || pool.length < 2) && !inflight.has(key)) {
    inflight.add(key);
    const user = `这次请为小镇的猫猫居民写话（不是玩家的猫）。\n名字：${n.name}\n身份：${n.role}\n${n.desc}\n说话风格：${n.voice}\n\n${envInfo()}\n情境：${situation}\n请写 6 句它可能说的话，像在过日子的拟人小猫，每句不超过 24 字。`;
    void callJSON<{ lines: string[] }>(user, NPC_LINES_SCHEMA, 800)
      .then((r) => {
        if (r?.lines?.length) {
          npcPools.set(key, [...(npcPools.get(key) ?? []), ...r.lines.map((s) => s.slice(0, 40))].slice(-12));
          capPools(npcPools);
        }
      })
      .finally(() => inflight.delete(key));
  }
  return line ?? fallback[Math.floor(Math.random() * fallback.length)];
}

// ---- commands ----
export const COMMAND_ACTIONS = ['goto', 'home', 'explore', 'sleep', 'play', 'eat', 'sit', 'meow', 'groom', 'roll', 'stretch', 'follow', 'stop', 'unknown'] as const;
export type CommandAction = (typeof COMMAND_ACTIONS)[number];
export interface CommandResult {
  action: CommandAction;
  place: string | null;
  reply: string;
}

export async function interpretCommand(cat: CatRecord, text: string, places: { id: string; name: string }[], where: 'nest' | 'world'): Promise<CommandResult> {
  const fb = keywordCommand(text, places);
  if (!client) return { ...fb, reply: fallbackLine(fb.action === 'unknown' ? 'command_confused' : 'command_ok', { name: cat.name, p: cat.personality }) };
  const schema = {
    type: 'object',
    properties: {
      action: { type: 'string', enum: [...COMMAND_ACTIONS] },
      place: { type: ['string', 'null'], enum: [...places.map((p) => p.id), null] },
      reply: { type: 'string' },
    },
    required: ['action', 'place', 'reply'],
    additionalProperties: false,
  };
  const user = `${catInfo(cat)}\n\n${envInfo()}\n猫猫现在在${where === 'nest' ? '自己的窝里' : '小镇里'}。主人对它说：「${text.slice(0, 80)}」\n\n请判断主人想让猫猫做什么，从 action 里选一个：goto(去某个地点，需填 place)、home(回家)、explore(出门自由探险)、sleep、play、eat、sit、meow、groom(舔毛)、roll(打滚)、stretch(伸懒腰)、follow(去找附近的朋友)、stop(停下/别动)、unknown(听不懂或做不到)。\n可去的地点：${places.map((p) => `${p.id}=${p.name}`).join('，')}\n再用猫猫的口吻写一句回应 reply（不超过 20 字）。如果主人只是在聊天，action 选 unknown，reply 照常可爱地回应。`;
  const r = await callJSON<CommandResult>(user, schema, 600);
  if (r && COMMAND_ACTIONS.includes(r.action)) return { action: r.action, place: r.place ?? null, reply: r.reply.slice(0, 40) };
  return { ...fb, reply: fallbackLine(fb.action === 'unknown' ? 'command_confused' : 'command_ok', { name: cat.name, p: cat.personality }) };
}

function keywordCommand(text: string, places: { id: string; name: string }[]): Omit<CommandResult, 'reply'> {
  const t = text.toLowerCase();
  if (!/回家|回窝/.test(t)) {
    // longest matching alias wins ("去码头看看大海" → pier, not the generic "海")
    let best: { id: string; len: number } | null = null;
    for (const p of places) {
      for (const w of [p.name, ...(POI_ALIASES[p.id] ?? [])]) {
        if (t.includes(w) && (!best || w.length > best.len)) best = { id: p.id, len: w.length };
      }
    }
    if (best) return { action: 'goto', place: best.id };
  }
  const rules: [RegExp, CommandAction][] = [
    [/回家|回窝|回来/, 'home'],
    [/探险|出门|出去|逛/, 'explore'],
    [/睡|休息|困/, 'sleep'],
    [/玩|抓|扑/, 'play'],
    [/吃|饭|饿/, 'eat'],
    [/坐/, 'sit'],
    [/叫|喵|说话/, 'meow'],
    [/舔|洗/, 'groom'],
    [/滚|翻/, 'roll'],
    [/懒腰|伸/, 'stretch'],
    [/朋友|找.*猫|跟着/, 'follow'],
    [/停|别动|等/, 'stop'],
  ];
  for (const [re, a] of rules) if (re.test(t)) return { action: a, place: null };
  return { action: 'unknown', place: null };
}

// ---- journal / letters ----
export async function journalEntry(cat: CatRecord, places: string[], finds: string[], friends: string[]): Promise<string> {
  if (client) {
    const user = `${catInfo(cat)}\n\n${envInfo()}\n今天出门探险的经历：去过 ${places.join('、') || '附近随便走走'}；${finds.length ? `捡到了 ${finds.join('、')}；` : ''}${friends.length ? `遇到了 ${friends.join('、')}；` : ''}\n请用猫猫的口吻写一则探险日记（40~70 字，一段话），写给主人看。`;
    const r = await callJSON<{ lines: string[] }>(user, LINES_SCHEMA, 700);
    if (r?.lines?.[0]) return r.lines[0].slice(0, 120);
  }
  return fallbackJournal(cat.name, places, finds, friends);
}

const LETTER_SCHEMA = {
  type: 'object',
  properties: { title: { type: 'string' }, body: { type: 'string' } },
  required: ['title', 'body'],
  additionalProperties: false,
};

/** Short notification text from the cat. `event` describes what happened. */
export async function catLetter(cat: CatRecord, event: string, fb: { title: string; body: string }): Promise<{ title: string; body: string }> {
  if (client) {
    const user = `${catInfo(cat)}\n\n${envInfo()}\n刚刚发生的事：${event}\n请写一条手机通知，像猫猫给主人的小纸条：title 不超过 12 字，body 不超过 30 字。语气温柔可爱，不催促、不让主人愧疚。`;
    const r = await callJSON<{ title: string; body: string }>(user, LETTER_SCHEMA, 500);
    if (r?.title && r.body) return { title: r.title.slice(0, 20), body: r.body.slice(0, 60) };
  }
  return fb;
}
