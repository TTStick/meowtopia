// A small daily wish. Gentle by design: no streaks, no penalties, it simply
// becomes a happy moment when fulfilled.
import { Rng, hash3 } from './rng';
import type { CatRecord } from './types';
import { POIS } from './world';
import { ITEM_MAP } from './items';

export type WishKind = 'treat' | 'pet' | 'play' | 'visit' | 'friend' | 'outfit' | 'goodnight';

export interface Wish {
  kind: WishKind;
  target?: string; // item id or poi id
  need: number;
  text: string;
}

const TREATS = ['treat_can', 'treat_fish', 'treat_stick', 'treat_chicken', 'treat_milk'];

export function wishFor(cat: CatRecord, day: number): Wish {
  const r = new Rng(hash3(cat.genes.seed, day, 9137));
  const p = cat.personality;
  const kinds: [WishKind, number][] = [
    ['treat', 1 + p.foodie * 2],
    ['pet', 1 + (1 - p.social) * 0.5 + p.social],
    ['play', 0.5 + p.playful * 2],
    ['visit', 0.5 + p.curious * 2],
    ['friend', 0.3 + p.social * 1.5],
    ['outfit', 0.5],
    ['goodnight', 1],
  ];
  const kind = r.weighted(kinds);
  switch (kind) {
    case 'treat': {
      const item = r.pick(TREATS);
      return { kind, target: item, need: 1, text: r.pick([`想吃${ITEM_MAP[item].name}`, `今天馋${ITEM_MAP[item].name}了`, `梦到了${ITEM_MAP[item].name}`]) };
    }
    case 'pet':
      return { kind, need: 6, text: r.pick(['想被摸摸头', '想被顺顺毛', '想要很多很多摸摸']) };
    case 'play':
      return { kind, need: 3, text: r.pick(['想玩逗猫棒', '想抓那根羽毛', '想跳得高高的']) };
    case 'visit': {
      const known = POIS.filter((x) => x.id !== 'home_lane');
      const unseen = known.filter((x) => !cat.discovered.includes(x.id));
      const poi = r.pick(unseen.length && r.chance(0.6) ? unseen : known);
      return { kind, target: poi.id, need: 1, text: r.pick([`想去${poi.name}看看`, `听说${poi.name}很好玩`, `想带你去${poi.name}`]) };
    }
    case 'friend':
      return { kind, need: 1, text: r.pick(['想在外面遇见一个朋友', '想和别的猫猫碰碰鼻子']) };
    case 'outfit':
      return { kind, need: 1, text: r.pick(['想换一身新打扮', '想变得美美的']) };
    default:
      return { kind: 'goodnight', need: 1, text: r.pick(['今晚想听你说晚安', '想被你哄睡觉']) };
  }
}
