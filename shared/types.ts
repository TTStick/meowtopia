// Core data types shared by client & server.

export type Pattern =
  | 'solid'
  | 'tabby'
  | 'mackerel'
  | 'calico'
  | 'tortie'
  | 'tuxedo'
  | 'bicolor'
  | 'pointed'
  | 'spotted';

export interface CatGenes {
  seed: number;
  coat: string; // coat preset key (for naming/description)
  base: string; // main fur color
  accent: string; // stripes / patches / points
  accent2: string; // third color (calico/tortie)
  pattern: Pattern;
  white: number; // 0..1 amount of white (chest, paws, muzzle)
  blaze: boolean; // white stripe down the face
  eye: string;
  eye2: string; // = eye unless heterochromia
  nose: string;
  earSize: number; // 0.85..1.2
  earFold: boolean;
  tail: number; // length multiplier 0.8..1.25
  fluff: number; // 0..1 long-hair tufts
  chonk: number; // 0.9..1.3 body roundness
  socks: boolean; // white paws
}

export type Trait = 'curious' | 'playful' | 'lazy' | 'social' | 'foodie' | 'brave';

export interface Personality {
  curious: number;
  playful: number;
  lazy: number;
  social: number;
  foodie: number;
  brave: number;
  quirk: string;
  voice: string;
}

export interface CatStats {
  hunger: number; // 0 starving .. 100 full
  energy: number; // 0 exhausted .. 100 rested
  mood: number; // 0 grumpy .. 100 blissful
  clean: number; // grooming
  social: number; // need for company satisfied
  bond: number; // relationship with owner, grows slowly, never decays below floor
}

export type CatLocation = 'nest' | 'world';

export interface CatRecord {
  id: string;
  ownerId: string;
  coOwnerId: string | null;
  name: string;
  genes: CatGenes;
  personality: Personality;
  stats: CatStats;
  statsAt: number; // ms timestamp when stats last computed
  born: number;
  location: CatLocation;
  outfit: string[]; // accessory item ids worn
  discovered: string[]; // POI ids found
  memory: string[]; // short notable memories (most recent last)
  wx: number; // last world position
  wy: number;
  stage?: number; // 0 kitten, 1 young, 2 adult (last announced)
}

export interface PlacedItem {
  uid: string;
  item: string;
  gx: number; // grid cell of footprint top-left
  gy: number;
  flip?: boolean;
}

export interface WallItem {
  uid: string;
  item: string;
  wx: number; // wall slot x (cells)
}

export interface NestLayout {
  wallpaper: string;
  floor: string;
  items: PlacedItem[];
  wall: WallItem[];
}

export interface UserPublic {
  id: string;
  nickname: string;
}

export interface UserSettings {
  push: boolean;
  quietStart: number; // hour local
  quietEnd: number;
  tzOffset: number; // minutes, from Date.getTimezoneOffset()
  sound: boolean;
  music: boolean;
}

export interface JournalEntry {
  id: number;
  catId: string;
  ts: number;
  kind: 'explore' | 'find' | 'friend' | 'home' | 'mood' | 'note' | 'care' | 'letter';
  text: string;
  data?: any;
}

export interface InventoryMap {
  [itemId: string]: number;
}

export interface MeResponse {
  user: UserPublic & { fish: number; settings: UserSettings; secured: boolean };
  cats: CatRecord[];
  activeCatId: string | null;
  inventory: InventoryMap;
  away?: { since: number; entries: JournalEntry[] };
}
