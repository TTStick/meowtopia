// WebSocket protocol between client and server for the shared world.
import type { CatGenes } from './types';
import type { NpcOutfit } from './npcs';

export type EntKind = 'cat' | 'npc';

export interface EntState {
  id: string;
  kind: EntKind;
  name: string;
  genes: CatGenes;
  outfit: string[];
  npcOutfit?: NpcOutfit;
  age: number;
  owner?: string; // owner nickname
  ownerId?: string;
  x: number;
  y: number;
  dir: 1 | -1;
  anim: string; // current activity animation
  path?: [number, number][]; // remaining path (units)
  speed?: number;
  run?: boolean;
  t0?: number; // server ms when path started
  controlled?: boolean;
  zone?: string;
}

export type ServerMsg =
  | { t: 'welcome'; you: string | null; ents: EntState[]; now: number; online: number }
  | { t: 'spawn'; e: EntState }
  | { t: 'despawn'; id: string; how?: 'home' | 'leave' }
  | { t: 'move'; id: string; path: [number, number][]; speed: number; run?: boolean; t0: number; x: number; y: number }
  | { t: 'act'; id: string; anim: string; x: number; y: number; dir?: 1 | -1 }
  | { t: 'pos'; id: string; x: number; y: number; dir: 1 | -1; anim: string }
  | { t: 'say'; id: string; text: string; to?: string }
  | { t: 'emote'; id: string; kind: string }
  | { t: 'event'; kind: string; text: string; item?: string; catId?: string }
  | { t: 'online'; n: number }
  | { t: 'cmd'; reply: string; action: string }
  | { t: 'error'; text: string };

export type ClientMsg =
  | { t: 'enter'; catId: string; x?: number; y?: number } // bring my cat into the world
  | { t: 'leave'; catId: string } // take my cat home
  | { t: 'watch' } // just observe the world
  | { t: 'control'; catId: string; on: boolean }
  | { t: 'pos'; catId: string; x: number; y: number; dir: 1 | -1; anim: string }
  | { t: 'goto'; catId: string; x: number; y: number; run?: boolean }
  | { t: 'emote'; catId: string; kind: string }
  | { t: 'act'; catId: string; anim: string }
  | { t: 'interact'; catId: string; target: string }
  | { t: 'explore'; catId: string }
  | { t: 'ping' };
