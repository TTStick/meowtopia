import { Store } from './store';
import type { MeResponse, NestLayout, CatRecord, CatGenes, DoorSetting } from '../../../shared/types';

export type Panel =
  | null | 'shop' | 'wardrobe' | 'journal' | 'letters' | 'social' | 'settings' | 'map' | 'feed' | 'collection' | 'cat' | 'note' | 'coparent' | 'command' | 'help' | 'away' | 'photo' | 'protect' | 'privacy' | 'playdate' | 'moveout';

/** 猫窝小区: who lives in which house, as this player sees it. */
export interface HoodCat {
  id: string;
  name: string;
  genes: CatGenes;
  outfit: string[];
  born: number;
  out: boolean;
  away: string | null; // visiting someone's house
}
export interface HoodHouse {
  n: number;
  uid: string;
  name: string;
  cats: HoodCat[];
  door: DoorSetting;
  close: boolean;
}
export interface Hood {
  mine: number;
  me: HoodHouse;
  houses: HoodHouse[];
}

export interface Toast {
  id: number;
  text: string;
  icon?: string;
}

export interface VisitInfo {
  catId: string;
  cat: CatRecord;
  layout: NestLayout;
  ownerName: string;
}

export interface UIState {
  phase: 'loading' | 'welcome' | 'adopt' | 'game';
  me: MeResponse | null;
  scene: 'nest' | 'world';
  panel: Panel;
  shopKind: 'store' | 'tailor' | 'bakery';
  toasts: Toast[];
  nest: NestLayout | null;
  visiting: VisitInfo | null;
  build: boolean;
  play: boolean;
  online: number;
  connected: boolean;
  catOut: boolean; // active cat is out in the world
  controlling: boolean;
  follow: boolean;
  unread: number;
  hint: string | null;
  worldTarget: { id: string; name: string; kind: 'cat' | 'npc'; owner?: string; shop?: string } | null;
  worldShop: string | null; // a shop building tapped in town (room id)
  room: string | null; // the room the town camera is looking into
  myRoom: string | null; // the room my cat is in
  companion: { id: string; name: string } | null; // a resident walking along with my cat
  hood: Hood | null;
  worldHouse: number | null; // a house tapped in town
  playdateTo: { uid: string; name: string; cat: string } | null; // whom the invitation sheet is for
  llm: boolean;
  trial: boolean; // a trial server (体验服): players are asked to open their own town
  busy: boolean;
  photo: string | null;
  wish: { text: string; kind: string; target?: string; need: number; progress: number; done: boolean } | null;
  goodnight: number; // timestamp of last goodnight overlay
}

export const ui = new Store<UIState>({
  phase: 'loading',
  me: null,
  scene: 'nest',
  panel: null,
  shopKind: 'store',
  toasts: [],
  nest: null,
  visiting: null,
  build: false,
  play: false,
  online: 0,
  connected: false,
  catOut: false,
  controlling: false,
  follow: true,
  unread: 0,
  hint: null,
  worldTarget: null,
  worldShop: null,
  room: null,
  myRoom: null,
  companion: null,
  hood: null,
  worldHouse: null,
  playdateTo: null,
  llm: false,
  trial: false,
  busy: false,
  photo: null,
  wish: null,
  goodnight: 0,
});

let toastId = 1;
export function toast(text: string, icon?: string, ms = 3200) {
  const t = { id: toastId++, text, icon };
  ui.set((s) => ({ toasts: [...s.toasts.slice(-2), t] }));
  setTimeout(() => ui.set((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) })), ms);
}

export function activeCat(): CatRecord | null {
  const me = ui.state.me;
  if (!me) return null;
  return me.cats.find((c) => c.id === me.activeCatId) ?? me.cats[0] ?? null;
}

export function patchCat(id: string, patch: Partial<CatRecord>) {
  ui.set((s) => {
    if (!s.me) return {};
    return { me: { ...s.me, cats: s.me.cats.map((c) => (c.id === id ? { ...c, ...patch } : c)) } };
  });
}
