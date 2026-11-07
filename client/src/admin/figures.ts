// Everyone in town on the sandbox map. Close in they are drawn as the game draws them; further out
// as round portraits on little pins. Positions glide between the server's snapshots.
import { Pen } from '../engine/pen';
import { CatActor, ANIM_MAP, type AnimName } from '../game/actor';
import { drawCat, defaultPose } from '../art/cat';
import { drawNpc } from '../art/npc';
import { NPC_MAP } from '../../../shared/npcs';
import type { WorldEnt } from './api';

/** How often the town is asked for, ms. */
export const POLL = 2000;
/** A leg is walked a little slower than the poll, so a walking cat is still walking when the next one comes. */
const LAG = 1.12;
const TRAIL = 40;

/** What a figure's pin and list dot look like. */
export type Tone = 'cat' | 'ctl' | 'home' | 'town' | 'npc';
export const TONE: Record<Tone, { ring: string; fill: string; name: string }> = {
  cat: { ring: '#e0714a', fill: '#fde3d3', name: '玩家的猫' },
  ctl: { ring: '#e8b43a', fill: '#fff1c4', name: '被主人带着走' },
  home: { ring: '#d99a86', fill: '#fbe6dd', name: '正在回家' },
  town: { ring: '#a8957d', fill: '#f1e8db', name: '小镇的猫' },
  npc: { ring: '#5d8db3', fill: '#e1eef8', name: '居民' },
};
export function toneOf(e: WorldEnt): Tone {
  if (e.kind === 'npc') return 'npc';
  if (e.kind === 'town') return 'town';
  return e.controlled ? 'ctl' : e.trip?.goingHome ? 'home' : 'cat';
}

export class Figure {
  e: WorldEnt;
  x: number;
  y: number;
  dir: 1 | -1;
  moving = false;
  /** Where it has been, oldest first (world units). */
  trail: [number, number][] = [];
  private fx: number;
  private fy: number;
  private t0 = 0;
  private phase = 0;
  private blinkAt = Math.random() * 4;
  private actor: CatActor | null = null;
  private pics = new Map<string, HTMLCanvasElement>();

  constructor(e: WorldEnt, now: number) {
    this.e = e;
    this.x = this.fx = e.x;
    this.y = this.fy = e.y;
    this.t0 = now;
    this.dir = e.dir ?? 1;
    if (e.kind !== 'npc' && e.genes) {
      const a = (this.actor = new CatActor(e.id, e.name, e.genes));
      a.age = e.age ?? 1;
      a.outfit = e.outfit ?? [];
      a.scale = 0.95;
      a.x = e.x;
      a.y = e.y;
      a.dir = this.dir;
      a.play(animOf(e.anim));
    }
  }

  /** A new snapshot from the server. */
  update(e: WorldEnt, now: number) {
    const outfit = (e.outfit ?? []).join(',');
    if (outfit !== (this.e.outfit ?? []).join(',')) this.pics.clear();
    this.e = e;
    const d = Math.hypot(e.x - this.x, e.y - this.y);
    if (d > 8 && (!this.trail.length || Math.hypot(this.x - this.trail.at(-1)![0], this.y - this.trail.at(-1)![1]) > 12)) {
      this.trail.push([this.x, this.y]);
      if (this.trail.length > TRAIL) this.trail.shift();
    }
    // a long way in one go: through a door or home and back out; no walking across the map
    if (d > 900) {
      this.x = e.x;
      this.y = e.y;
      this.trail = [];
    }
    this.fx = this.x;
    this.fy = this.y;
    this.t0 = now;
    this.moving = d > 3 && d <= 900;
    if (this.moving && Math.abs(e.x - this.x) > 1) this.dir = e.x > this.x ? 1 : -1;
    else if (!this.moving && e.dir) this.dir = e.dir;
    const a = this.actor;
    if (a) {
      a.outfit = e.outfit ?? a.outfit;
      if (d > 900) {
        a.x = e.x;
        a.y = e.y;
      }
      if (this.moving) {
        a.speed = d / ((POLL * LAG) / 1000) / a.scale;
        a.setPath([[e.x, e.y]], false);
      } else {
        a.stop();
        a.dir = this.dir;
        a.play(animOf(e.anim));
      }
    }
  }

  /** Moves on by dt seconds. */
  step(now: number, dt: number, T: number) {
    const a = this.actor;
    if (a) {
      a.update(dt, T);
      this.x = a.x;
      this.y = a.y;
      this.dir = a.dir;
      this.moving = a.moving;
      return;
    }
    const k = Math.min(1, (now - this.t0) / (POLL * LAG));
    const nx = this.fx + (this.e.x - this.fx) * k, ny = this.fy + (this.e.y - this.fy) * k;
    const d = Math.hypot(nx - this.x, ny - this.y);
    this.phase += d * 0.18;
    this.x = nx;
    this.y = ny;
    this.moving = k < 1 && Math.hypot(this.e.x - this.fx, this.e.y - this.fy) > 3;
  }

  /** The figure itself, as in the game; ctx in world units. */
  draw(pen: Pen, T: number) {
    const e = this.e;
    pen.begin((Math.floor(T * 7) % 3) * 19 + (e.genes?.seed ?? 0) % 97, 0.5, 1.7);
    if (this.actor) {
      this.actor.draw(pen);
      return;
    }
    const npc = NPC_MAP[e.id];
    if (!npc) return;
    if (T > this.blinkAt + 0.14) this.blinkAt = T + 2 + Math.random() * 4;
    pen.ctx.save();
    pen.ctx.translate(this.x, this.y);
    drawNpc(pen, npc.genes, npc.outfit, { anim: this.moving ? 'walk' : e.anim, t: T + npc.genes.seed, beat: T, phase: this.phase, moving: this.moving, dir: this.dir, blink: T > this.blinkAt, talking: false });
    pen.ctx.restore();
  }

  /** How tall the figure stands, world units (for name tags and hit tests). */
  height() {
    return this.e.kind === 'npc' ? 74 : 54;
  }

  /** A round portrait, `size` canvas pixels across, ring included; cached. */
  portrait(size: number, tone = toneOf(this.e)): HTMLCanvasElement {
    const k = `${size}|${tone}`;
    const hit = this.pics.get(k);
    if (hit) return hit;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const x = c.getContext('2d')!;
    const r = size / 2;
    const ring = Math.max(1.5, size * 0.07);
    const t = TONE[tone];
    x.fillStyle = t.fill;
    x.beginPath();
    x.arc(r, r, r - ring / 2, 0, 7);
    x.fill();
    x.save();
    x.beginPath();
    x.arc(r, r, r - ring, 0, 7);
    x.clip();
    const pen = new Pen(x).begin(3, 0.25, 1.6);
    const e = this.e;
    const npc = e.kind === 'npc' ? NPC_MAP[e.id] : null;
    if (npc) {
      const s = (r * 0.62) / 11;
      x.translate(r, r + 47 * s);
      x.scale(s, s);
      drawNpc(pen, npc.genes, npc.outfit, { anim: 'stand', t: 0, phase: 0, moving: false, dir: 1, blink: false, talking: false });
    } else if (e.genes) {
      const s = (r * 0.72) / 16;
      x.translate(r, r + 31 * s);
      x.scale(s, s);
      const p = defaultPose();
      p.view = 'front';
      p.tailUp = 0;
      drawCat(pen, e.genes, p, { age: e.age ?? 1, outfit: e.outfit ?? [], shadow: false });
    }
    x.restore();
    x.strokeStyle = t.ring;
    x.lineWidth = ring;
    x.beginPath();
    x.arc(r, r, r - ring / 2, 0, 7);
    x.stroke();
    this.pics.set(k, c);
    return c;
  }

  /** A larger picture for the side panel: the whole figure standing or sitting. */
  card(w: number, h: number): HTMLCanvasElement {
    const k = `card|${w}x${h}`;
    const hit = this.pics.get(k);
    if (hit) return hit;
    const c = document.createElement('canvas');
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = w * dpr;
    c.height = h * dpr;
    const x = c.getContext('2d')!;
    x.scale(dpr, dpr);
    const pen = new Pen(x).begin(5, 0.3, 1.7);
    const e = this.e;
    const npc = e.kind === 'npc' ? NPC_MAP[e.id] : null;
    const s = (h * 0.8) / (npc ? 72 : 50);
    x.translate(w / 2, h * 0.92);
    x.scale(s, s);
    if (npc) drawNpc(pen, npc.genes, npc.outfit, { anim: 'stand', t: 0, phase: 0, moving: false, dir: 1, blink: false, talking: false });
    else if (e.genes) {
      const p = defaultPose();
      p.view = 'front';
      p.tailUp = 1;
      p.eyes = 'happy';
      p.blush = 0.6;
      drawCat(pen, e.genes, p, { age: e.age ?? 1, outfit: e.outfit ?? [], shadow: true });
    }
    this.pics.set(k, c);
    return c;
  }
}

function animOf(a: string): AnimName {
  return (ANIM_MAP[a] ?? 'sit') as AnimName;
}
