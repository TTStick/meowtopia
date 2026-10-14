import { Store } from './store';
import type { MeResponse, NestLayout, CatRecord } from '../../../shared/types';

export type Panel =
  | null | 'shop' | 'wardrobe' | 'journal' | 'letters' | 'social' | 'settings' | 'map' | 'feed' | 'collection' | 'cat' | 'note' | 'coparent' | 'command' | 'help' | 'away' | 'photo';

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
  llm: boolean;
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
  llm: false,
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
