import type { Viewport } from '../engine/view';
import type { InputHandler, PointerInfo } from '../engine/input';
import { Pen, rgba, mix, INK } from '../engine/pen';
import { CatActor } from './actor';
import { NestBrain, type NestHost, type SpotInst } from './nestBrain';
import { CELL, WALL_H, drawFurniture, drawWallItem, drawWallpaper, drawFloor, HAS_FRONT, wallpaperBase, type DrawCtx, type SkyInfo } from '../art/furniture';
import { drawBubble } from '../art/fx';
import { ITEM_MAP, ROOM_W, ROOM_H, WALL_SLOTS, type ItemDef } from '../../../shared/items';
import { canPlace, canPlaceWall } from '../../../shared/nest';
import { makeGrid, findPath, smoothPath, nearestOpen, isBlocked, type Grid } from '../../../shared/path';
import { daylight, skyColor, sunset } from '../../../shared/time';
import * as clock from './clock';
import { ageOf } from '../../../shared/stats';
import { Rng } from '../../../shared/rng';
import type { CatRecord, NestLayout, PlacedItem, WallItem } from '../../../shared/types';
import type { SpeechCtx } from '../../../shared/speech';

export interface NestEnv {
  say(cat: CatRecord, ctx: SpeechCtx, info?: Record<string, string>): Promise<string>;
  onPet(): void;
  onPlay(): void;
  onCatEvent?(kind: string): void;
  onBuildSelect?(uid: string | null): void;
  onLayoutChange?(l: NestLayout): void;
}

interface Placed {
  p: PlacedItem;
  def: ItemDef;
  x: number;
  y: number;
  w: number;
  h: number;
  bottom: number;
}

const W = ROOM_W * CELL;
const H = ROOM_H * CELL;

export class NestScene implements NestHost {
  W = W;
  H = H;
  rec: CatRecord;
  layout: NestLayout;
  readonly: boolean;
  cat: CatActor;
  brain: NestBrain;
  env: NestEnv;
  spots: SpotInst[] = [];
  private placed: Placed[] = [];
  private grid: Grid = makeGrid(ROOM_W, ROOM_H);
  private T = 0;
  private hoverCat = false;
  // interaction
  private stroking = false;
  private strokeT = 0;
  private strokeHearts = 0;
  play = false;
  private toy: { x: number; y: number; z: number; sx: number; sy: number; vx: number; vy: number } | null = null;
  // build
  build = false;
  selected: string | null = null;
  ghost: { item: string; gx: number; gy: number; wx: number; flip: boolean; ok: boolean; wall: boolean; uid?: string } | null = null;
  private dragFrom: { uid: string; gx: number; gy: number; wx: number } | null = null;
  private lookTimer = 0;
  private light: HTMLCanvasElement | null = null;
  /** Treasures shown in the collection cabinet (rarest first). */
  collect: string[] = [];

  constructor(rec: CatRecord, layout: NestLayout, env: NestEnv, readonly = false) {
    this.rec = rec;
    this.layout = structuredClone(layout);
    this.env = env;
    this.readonly = readonly;
    this.cat = new CatActor(rec.id, rec.name, rec.genes);
    this.cat.scale = 1.4;
    this.cat.speed = 34;
    this.cat.age = ageOf(rec.born);
    this.cat.outfit = rec.outfit;
    this.cat.energy = rec.stats.energy;
    this.cat.quirkCover = rec.personality.quirk.includes('捂住眼睛');
    this.brain = new NestBrain(this.cat, rec, this);
    this.rebuild();
    const [x, y] = this.openFloorNear(W / 2, H * 0.6);
    this.cat.x = x;
    this.cat.y = y;
  }

  /** The cat is out exploring the town: the nest is empty. */
  get away() {
    return this.rec.location === 'world';
  }

  setRecord(rec: CatRecord) {
    this.rec = rec;
    this.brain.rec = rec;
    this.cat.outfit = rec.outfit;
    this.cat.name = rec.name;
    this.cat.energy = rec.stats.energy;
    this.cat.age = ageOf(rec.born);
  }

  // ---------------- layout derived data ----------------
  rebuild() {
    this.placed = [];
    this.spots = [];
    this.grid = makeGrid(ROOM_W, ROOM_H);
    for (const p of this.layout.items) {
      const def = ITEM_MAP[p.item];
      if (!def) continue;
      const w = def.w ?? 1, h = def.h ?? 1;
      const pl: Placed = { p, def, x: p.gx * CELL, y: p.gy * CELL, w, h, bottom: (p.gy + h) * CELL };
      this.placed.push(pl);
      if (!def.flat) for (let y = p.gy; y < p.gy + h; y++) for (let x = p.gx; x < p.gx + w; x++) this.grid.blocked[y * ROOM_W + x] = 1;
      for (const s of def.spots ?? []) {
        const sx = p.flip ? (p.gx + w - s.x) * CELL : (p.gx + s.x) * CELL;
        const sy = (p.gy + s.y) * CELL;
        // spots in front of the footprint sort by their own depth; inside it, between the item's layers
        const sortY = s.y >= h ? sy + 1 : pl.bottom + 0.2;
        this.spots.push({ kind: s.kind, x: sx, y: sy, z: s.z, uid: p.uid, item: p.item, sortY, face: s.face ? ((p.flip ? -s.face : s.face) as 1 | -1) : undefined });
      }
    }
    for (const wi of this.layout.wall) {
      const def = ITEM_MAP[wi.item];
      for (const s of def?.spots ?? []) this.spots.push({ kind: s.kind, x: (wi.wx + s.x) * CELL, y: 4, z: s.z, uid: wi.uid, item: wi.item, sortY: 4 });
    }
  }

  // ---------------- NestHost ----------------
  private cellOf(x: number, y: number): [number, number] {
    return [Math.max(0, Math.min(ROOM_W - 1, Math.floor(x / CELL))), Math.max(0, Math.min(ROOM_H - 1, Math.floor(y / CELL)))];
  }

  floorPath(x0: number, y0: number, x1: number, y1: number): [number, number][] {
    const [sx, sy] = this.cellOf(x0, y0), [tx, ty] = this.cellOf(x1, y1);
    const p = findPath(this.grid, sx, sy, tx, ty, 4000);
    if (!p) return [[x1, y1]];
    const s = smoothPath(this.grid, p);
    const pts: [number, number][] = s.slice(1).map(([x, y]) => [(x + 0.5) * CELL, (y + 0.5) * CELL]);
    const goalOpen = !isBlocked(this.grid, tx, ty);
    if (pts.length && goalOpen) pts[pts.length - 1] = [x1, y1];
    else if (!pts.length && goalOpen) pts.push([x1, y1]);
    return pts;
  }

  openFloorNear(x: number, y: number): [number, number] {
    const cx = Math.max(10, Math.min(W - 10, x)), cy = Math.max(10, Math.min(H - 8, y));
    const [gx, gy] = this.cellOf(cx, cy);
    if (!isBlocked(this.grid, gx, gy)) return [cx, cy];
    const n = nearestOpen(this.grid, gx, gy, 8);
    if (!n) return [cx, cy];
    return [(n[0] + 0.5) * CELL, (n[1] + 0.5) * CELL];
  }

  randomFloor(r: Rng): [number, number] {
    for (let i = 0; i < 20; i++) {
      const gx = r.int(0, ROOM_W - 1), gy = r.int(0, ROOM_H - 1);
      if (!isBlocked(this.grid, gx, gy)) return [(gx + r.range(0.25, 0.75)) * CELL, (gy + r.range(0.3, 0.8)) * CELL];
    }
    return [W / 2, H / 2];
  }

  hour() {
    return clock.localHour();
  }
  night() {
    return 1 - daylight(this.hour());
  }
  weather() {
    return clock.weather().kind;
  }
  season() {
    return clock.season();
  }

  private sayBusy = false;
  say(ctx: SpeechCtx, info?: Record<string, string>) {
    if (this.sayBusy) return;
    this.sayBusy = true;
    this.env
      .say(this.rec, ctx, info)
      .then((t) => this.cat.say(t, this.T))
      .catch(() => {})
      .finally(() => (this.sayBusy = false));
  }

  onCatEvent(kind: 'eat' | 'drink' | 'play' | 'groom') {
    const s = this.rec.stats;
    if (kind === 'eat') s.hunger = Math.min(100, s.hunger + 30);
    if (kind === 'groom') s.clean = Math.min(100, s.clean + 15);
    if (kind === 'play') {
      s.mood = Math.min(100, s.mood + 4);
      s.energy = Math.max(0, s.energy - 3);
      if (this.play) this.env.onPlay();
    }
    this.env.onCatEvent?.(kind);
  }

  toyPos() {
    return this.toy && this.play ? { x: this.toy.x, y: this.toy.y, z: this.toy.z } : null;
  }

  sunSpot(): SpotInst | null {
    const b = this.sunbeams()[0];
    if (!b) return null;
    const x = (b[0] + b[2] + b[4] + b[6]) / 4, y = (b[1] + b[3] + b[5] + b[7]) / 4;
    const [fx, fy] = this.openFloorNear(x, y);
    if (Math.hypot(fx - x, fy - y) > 30) return null;
    return { kind: 'sun', x: fx, y: fy, z: 0, uid: 'sun', item: 'sun', sortY: fy };
  }

  /** Sunbeam quads on the floor from windows (empty at night / bad weather). */
  sunbeams(): number[][] {
    const h = this.hour();
    const day = daylight(h);
    const w = clock.weather();
    if (day < 0.5 || w.kind === 'rain' || w.kind === 'snow') return [];
    const out: number[][] = [];
    const skew = (h - 12.5) * -22;
    const len = 90 + Math.abs(h - 12.5) * 18;
    for (const wi of this.layout.wall) {
      if (wi.item !== 'window') continue;
      const x0 = wi.wx * CELL + 14, x1 = (wi.wx + 2) * CELL - 14;
      out.push([x0, 2, x1, 2, Math.min(W, Math.max(0, x1 + skew)), Math.min(H, len), Math.min(W, Math.max(0, x0 + skew)), Math.min(H, len)]);
    }
    return out;
  }

  // ---------------- camera ----------------
  fit(v: Viewport) {
    const availH = v.h - v.insetTop - v.insetBottom;
    const z = Math.min((v.w - 12) / (W + 40), availH / (H + WALL_H + 60));
    v.zoom = Math.max(0.4, z);
    v.camX = W / 2;
    v.camY = (-WALL_H - 14 + H + 40) / 2;
  }

  // ---------------- update ----------------
  update(dt: number, T: number) {
    this.T = T;
    if (this.away) return;
    if (this.build) {
      // stay calm while the owner decorates
      if (!this.cat.moving && !this.cat.jumping && this.brain.activity !== 'build') {
        this.brain.interrupt([], 'build');
        this.cat.play('sit');
      }
    } else this.brain.update(dt, T);
    if (this.lookTimer > 0) {
      this.lookTimer -= dt;
      if (this.lookTimer <= 0 && !this.play) this.cat.lookAt = null;
    }
    if (this.stroking) {
      this.strokeT += dt;
      this.cat.petting = 0.3;
      if (this.strokeT > 0.7) {
        this.strokeT = 0;
        this.cat.emote('heart', 1.3);
        this.strokeHearts++;
      }
    }
    // toy physics (feather wand dangling from the pointer)
    if (this.toy) {
      const t = this.toy;
      const k = 1 - Math.exp(-dt * 9);
      t.vx = (t.sx - t.x) * 9;
      t.vy = (t.sy - t.y) * 9;
      t.x += (t.sx - t.x) * k;
      t.y += (t.sy - t.y) * k;
    }
    if (this.feedItem) {
      this.feedItem.t -= dt;
      if (this.feedItem.t <= 0) this.feedItem = null;
    }
    this.cat.update(dt, T);
  }

  // ---------------- drawing ----------------
  draw(v: Viewport, T: number) {
    const ctx = v.ctx;
    const pen = v.pen;
    const night = this.night();
    const h = this.hour();
    const w = clock.weather();
    const sky: SkyInfo = { sky: skyColor(h, w), sun: daylight(h), rain: w.rain, snow: w.snow, hour: h };
    const boil = Math.floor(T * 7) % 3;
    // background
    v.screen();
    const bg = ctx.createLinearGradient(0, 0, 0, v.h);
    const bgTop = mix('#f6eedf', '#2e3150', night * 0.85);
    const bgBot = mix('#efe2cb', '#3c3a55', night * 0.85);
    bg.addColorStop(0, bgTop);
    bg.addColorStop(1, bgBot);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, v.w, v.h);
    ctx.fillStyle = rgba('#ffffff', 0.18 * (1 - night) + 0.05);
    for (let i = 0; i < 40; i++) {
      const x = ((i * 97.3) % v.w), y = ((i * 57.7 + Math.sin(T * 0.2 + i) * 6) % v.h);
      ctx.beginPath();
      ctx.arc(x, y, 1.6 + (i % 3), 0, 7);
      ctx.fill();
    }
    v.world();
    const lw = Math.max(1.3, 2.1 / Math.max(0.6, v.zoom));
    pen.begin(boil * 31 + 5, 0.45, lw);
    const d: DrawCtx = { pen, t: T, night, flip: false, collect: this.collect };

    // room shell shadow
    ctx.fillStyle = 'rgba(74,58,52,0.12)';
    ctx.beginPath();
    ctx.ellipse(W / 2, H + 26, W * 0.56, 18, 0, 0, 7);
    ctx.fill();
    // wall
    drawWallpaper(this.layout.wallpaper, pen, 0, -WALL_H, W, WALL_H);
    const wallShade = ctx.createLinearGradient(0, -WALL_H, 0, 0);
    wallShade.addColorStop(0, 'rgba(74,58,52,0.14)');
    wallShade.addColorStop(0.25, 'rgba(74,58,52,0)');
    wallShade.addColorStop(1, 'rgba(74,58,52,0.06)');
    ctx.fillStyle = wallShade;
    ctx.fillRect(0, -WALL_H, W, WALL_H);
    // baseboard
    ctx.fillStyle = mix(wallpaperBase(this.layout.wallpaper), '#b98d61', 0.55);
    ctx.fillRect(0, -9, W, 9);
    pen.line([0, -9, W, -9], lw * 0.8);
    // floor
    drawFloor(this.layout.floor, pen, 0, 0, W, H);
    const fs = ctx.createLinearGradient(0, 0, 0, H);
    fs.addColorStop(0, 'rgba(74,58,52,0.12)');
    fs.addColorStop(0.18, 'rgba(74,58,52,0)');
    ctx.fillStyle = fs;
    ctx.fillRect(0, 0, W, H);
    // sunbeams
    for (const b of this.sunbeams()) {
      const g = ctx.createLinearGradient(0, 0, 0, b[5]);
      const warm = sunset(h);
      g.addColorStop(0, `rgba(255,${236 - warm * 40},${170 - warm * 60},0.42)`);
      g.addColorStop(1, 'rgba(255,236,170,0.06)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(b[0], b[1]);
      ctx.lineTo(b[2], b[3]);
      ctx.lineTo(b[4], b[5]);
      ctx.lineTo(b[6], b[7]);
      ctx.closePath();
      ctx.fill();
      // dust motes
      ctx.fillStyle = 'rgba(255,250,220,0.8)';
      for (let i = 0; i < 6; i++) {
        const k = (T * 0.05 + i * 0.17) % 1;
        const mx = b[0] + (b[2] - b[0]) * ((i * 0.37) % 1) + (b[6] - b[0]) * k, my = b[1] + (b[7] - b[1]) * k - 20 * Math.sin(k * 3);
        ctx.beginPath();
        ctx.arc(mx, my, 1, 0, 7);
        ctx.fill();
      }
    }
    // wall items
    for (const wi of [...this.layout.wall].sort((a, b) => a.wx - b.wx)) {
      const def = ITEM_MAP[wi.item];
      if (!def) continue;
      if (this.build && this.dragFrom?.uid === wi.uid) ctx.globalAlpha = 0.35;
      drawWallItem(wi.item, d, wi.wx * CELL, def.w ?? 1, sky);
      ctx.globalAlpha = 1;
      if (this.build && this.selected === wi.uid) this.drawSelect(ctx, wi.wx * CELL + 2, -WALL_H + 14, (def.w ?? 1) * CELL - 4, WALL_H - 24);
    }
    // build grid
    if (this.build) this.drawGrid(ctx, lw);
    // flat items (rugs)
    for (const pl of this.placed) if (pl.def.flat) this.drawPlaced(pl, d, 'back');

    // depth sorted
    const list: { y: number; f: () => void }[] = [];
    for (const pl of this.placed) {
      if (pl.def.flat) continue;
      list.push({ y: pl.bottom - 0.5, f: () => this.drawPlaced(pl, d, 'back') });
      if (HAS_FRONT.has(pl.p.item)) list.push({ y: pl.bottom + 0.6, f: () => this.drawPlaced(pl, d, 'front') });
    }
    const spot = this.brain.spot;
    const catY = spot ? spot.sortY : this.cat.y;
    if (this.away) {
      // a little note left on the floor
      list.push({
        y: H - 40,
        f: () => {
          const nx = W / 2, ny = H - 46;
          ctx.save();
          ctx.translate(nx, ny);
          ctx.rotate(-0.06);
          pen.poly([-46, -18, 46, -18, 46, 18, -46, 18], '#fffdf5', lw);
          ctx.fillStyle = INK;
          ctx.font = '12px "PingFang SC","Microsoft YaHei",system-ui';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`出去玩啦～ ${this.rec.name}`, 0, -2);
          ctx.fillStyle = 'rgba(74,58,52,0.55)';
          ctx.fillText('🐾', 32, 10);
          ctx.restore();
        },
      });
    } else list.push({
      y: catY,
      f: () => {
        if (this.cat.z > 2) this.cat.drawShadowAtGround(ctx);
        pen.begin(boil * 17 + 3, 0.5, lw);
        this.cat.draw(pen);
      },
    });
    if (this.feedItem) {
      const fi = this.feedItem;
      list.push({
        y: fi.y - 1,
        f: () => {
          pen.ellipse(fi.x, fi.y, 13, 4.5, '#ffffff');
          const left = Math.min(1, fi.t / 4);
          if (left > 0.1) {
            const c = fi.item === 'treat_can' ? '#f2b48a' : fi.item === 'treat_milk' ? '#fffaf0' : fi.item === 'treat_stick' ? '#f6c56b' : fi.item === 'treat_chicken' ? '#f7e3cf' : '#e6a15c';
            pen.ellipse(fi.x, fi.y - 2, 8 * left, 3 * left, c, lw * 0.6);
          }
        },
      });
    }
    // wand toy
    if (this.toy && this.play) list.push({ y: this.toy.y, f: () => this.drawToy(pen, lw) });
    list.sort((a, b) => a.y - b.y);
    for (const it of list) it.f();
    // ghost while placing
    if (this.build && this.ghost) this.drawGhost(d, lw);

    // room frame: front slab & outline
    ctx.fillStyle = '#c99a6b';
    ctx.fillRect(-4, H, W + 8, 14);
    pen.line([-4, H, W + 4, H], lw * 1.2);
    pen.line([-4, H + 14, W + 4, H + 14], lw * 1.2);
    pen.line([-4, H, -4, H + 14], lw * 1.2);
    pen.line([W + 4, H, W + 4, H + 14], lw * 1.2);
    ctx.fillStyle = 'rgba(74,58,52,0.25)';
    for (let i = 1; i < 12; i++) ctx.fillRect((W / 12) * i, H + 4, 1.2, 6);
    ctx.strokeStyle = INK;
    ctx.lineWidth = lw * 1.4;
    ctx.lineJoin = 'round';
    ctx.strokeRect(0, -WALL_H, W, WALL_H + H);
    pen.line([0, 0, W, 0], lw);

    // lighting
    this.drawLighting(v, night, T);

    // emotes and speech bubbles
    v.world();
    pen.begin(boil * 13 + 1, 0.4, lw);
    if (!this.away) this.cat.drawEmotes(pen, T);
    v.screen();
    if (this.cat.bubble && !this.away) {
      const b = this.cat.bubble;
      const [sx, sy] = v.toScreen(this.cat.x, this.cat.headTop() - 4);
      const a = Math.min(1, (T - b.start) * 5, (b.until - T) * 2);
      drawBubble(ctx, sx, sy, b.text, Math.max(0, a));
    }
  }

  private drawPlaced(pl: Placed, d: DrawCtx, layer: 'back' | 'front') {
    const ctx = d.pen.ctx;
    const dragging = this.build && this.dragFrom?.uid === pl.p.uid;
    if (dragging) ctx.globalAlpha = 0.35;
    drawFurniture(pl.p.item, { ...d, flip: !!pl.p.flip }, pl.x, pl.y, pl.w, pl.h, layer);
    ctx.globalAlpha = 1;
    if (this.build && layer === 'back' && this.selected === pl.p.uid) this.drawSelect(ctx, pl.x + 2, pl.y - 30, pl.w * CELL - 4, pl.h * CELL + 26);
  }

  private drawSelect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.save();
    ctx.setLineDash([5, 4]);
    ctx.lineDashOffset = -this.T * 12;
    ctx.strokeStyle = '#f08a5d';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  private drawGrid(ctx: CanvasRenderingContext2D, lw: number) {
    ctx.save();
    ctx.strokeStyle = 'rgba(240,138,93,0.7)';
    ctx.lineWidth = lw * 0.5;
    ctx.setLineDash([3, 4]);
    for (let x = 0; x <= ROOM_W; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, 0);
      ctx.lineTo(x * CELL, H);
      ctx.stroke();
    }
    for (let y = 0; y <= ROOM_H; y++) {
      ctx.beginPath();
      ctx.moveTo(0, y * CELL);
      ctx.lineTo(W, y * CELL);
      ctx.stroke();
    }
    for (let x = 0; x <= WALL_SLOTS; x++) {
      ctx.beginPath();
      ctx.moveTo(x * CELL, -WALL_H + 10);
      ctx.lineTo(x * CELL, -14);
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawGhost(d: DrawCtx, lw: number) {
    const g = this.ghost!;
    const def = ITEM_MAP[g.item];
    const ctx = d.pen.ctx;
    ctx.save();
    ctx.globalAlpha = 0.75;
    if (g.wall) {
      ctx.fillStyle = g.ok ? 'rgba(140,210,150,0.3)' : 'rgba(240,120,110,0.3)';
      ctx.fillRect(g.wx * CELL, -WALL_H + 10, (def.w ?? 1) * CELL, WALL_H - 24);
      const w = clock.weather();
      drawWallItem(g.item, d, g.wx * CELL, def.w ?? 1, { sky: skyColor(this.hour(), w), sun: 1, rain: 0, snow: 0, hour: 12 });
    } else {
      const w = def.w ?? 1, h = def.h ?? 1;
      ctx.fillStyle = g.ok ? 'rgba(140,210,150,0.35)' : 'rgba(240,120,110,0.35)';
      ctx.fillRect(g.gx * CELL, g.gy * CELL, w * CELL, h * CELL);
      drawFurniture(g.item, { ...d, flip: g.flip }, g.gx * CELL, g.gy * CELL, w, h, 'back');
      if (HAS_FRONT.has(g.item)) drawFurniture(g.item, { ...d, flip: g.flip }, g.gx * CELL, g.gy * CELL, w, h, 'front');
    }
    ctx.restore();
    void lw;
  }

  private drawToy(pen: Pen, lw: number) {
    const t = this.toy!;
    const ctx = pen.ctx;
    // stick from above
    const tipX = t.sx + 30, tipY = t.sy - t.z - 140;
    pen.line([tipX + 40, tipY - 60, tipX, tipY], lw * 1.6, '#b98d61');
    const sway = Math.max(-1, Math.min(1, t.vx / 300));
    pen.line([tipX, tipY, tipX - 10 - sway * 20, (tipY + t.y - t.z) / 2, t.x, t.y - t.z], lw * 0.6, rgba('#4a3a34', 0.7));
    // shadow
    ctx.fillStyle = 'rgba(74,58,52,0.12)';
    ctx.beginPath();
    ctx.ellipse(t.x, t.y, 8, 3, 0, 0, 7);
    ctx.fill();
    // feather
    const fx = t.x, fy = t.y - t.z;
    const a = Math.sin(this.T * 6) * 0.3 + sway * 0.6;
    for (const [col, off] of [['#f58aa0', -0.5], ['#ffd45e', 0], ['#8fc3e8', 0.5]] as [string, number][]) {
      const aa = Math.PI / 2 + a + off;
      pen.shape(Pen.ellipsePts(fx + Math.cos(aa) * 7, fy + Math.sin(aa) * 7, 9, 3.2, aa, 6), col, lw * 0.6);
    }
    pen.ellipse(fx, fy, 2.5, 2.5, '#fff', lw * 0.6);
  }

  private drawLighting(v: Viewport, night: number, T: number) {
    const dusk = sunset(this.hour());
    if (night < 0.05 && dusk < 0.05) return;
    const ctx = v.ctx;
    if (!this.light) this.light = document.createElement('canvas');
    const L = this.light;
    if (L.width !== v.canvas.width || L.height !== v.canvas.height) {
      L.width = v.canvas.width;
      L.height = v.canvas.height;
    }
    const lc = L.getContext('2d')!;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, L.width, L.height);
    lc.fillStyle = night > 0.05 ? `rgba(30,30,70,${0.44 * night})` : `rgba(255,150,80,${0.12 * dusk})`;
    lc.fillRect(0, 0, L.width, L.height);
    const z = v.zoom * v.dpr;
    lc.setTransform(z, 0, 0, z, v.dpr * (v.w / 2 - v.camX * v.zoom), v.dpr * (v.midY - v.camY * v.zoom));
    lc.globalCompositeOperation = 'destination-out';
    const lights: [number, number, number, number][] = [];
    for (const pl of this.placed) {
      if (pl.def.light) {
        const cx = pl.x + (pl.w * CELL) / 2;
        const cy = pl.p.item === 'lamp' ? pl.bottom - 92 : pl.bottom - 20;
        lights.push([cx, cy, pl.def.light, 1]);
      }
    }
    for (const wi of this.layout.wall) {
      const def = ITEM_MAP[wi.item];
      if (wi.item === 'window') lights.push([(wi.wx + 1) * CELL, -WALL_H / 2, 70, 0.55]);
      else if (def?.light) lights.push([(wi.wx + (def.w ?? 1) / 2) * CELL, -WALL_H + 30, def.light * (0.9 + Math.sin(T * 2) * 0.1), 0.8]);
    }
    // the cat glows a tiny bit so it never disappears
    if (!this.away) lights.push([this.cat.x, this.cat.y - this.cat.z - 20, 46, 0.5]);
    for (const [x, y, r, a] of lights) {
      const g = lc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(L, 0, 0);
    // warm glow
    if (night > 0.2) {
      v.world();
      ctx.globalCompositeOperation = 'lighter';
      for (const [x, y, r, a] of lights) {
        if (a < 0.7) continue;
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.8);
        g.addColorStop(0, `rgba(255,190,110,${0.18 * night})`);
        g.addColorStop(1, 'rgba(255,190,110,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // ---------------- input ----------------
  private world(v: Viewport, p: PointerInfo) {
    return v.toWorld(p.x, p.y);
  }

  makeInput(v: Viewport): InputHandler {
    return {
      onTap: (p) => {
        const [x, y] = this.world(v, p);
        if (this.build) return this.buildTap(x, y);
        if (this.play) {
          this.moveToy(x, y);
          return;
        }
        if (this.cat.hit(x, y)) this.petTap();
        else this.lookAtPoint(x, y);
      },
      onHover: (p) => {
        const [x, y] = this.world(v, p);
        if (this.play) this.moveToy(x, y);
        else if (this.build && this.ghost && !this.dragFrom) this.updateGhost(x, y);
        this.hoverCat = this.cat.hit(x, y);
        v.canvas.style.cursor = this.play ? 'none' : this.hoverCat && !this.build ? 'pointer' : 'default';
      },
      onDragStart: (p) => {
        const [x, y] = this.world(v, p);
        if (this.play) {
          this.moveToy(x, y);
          return true;
        }
        if (this.build) return this.buildDragStart(x, y);
        if (this.cat.hit(x, y)) {
          this.stroking = true;
          this.strokeT = 0;
          this.strokeHearts = 0;
          if (!this.brain.sleeping) this.brain.interrupt([{ k: 'anim', anim: 'purr', dur: 2.5 }], 'pet');
          return true;
        }
        return true;
      },
      onDrag: (p) => {
        const [x, y] = this.world(v, p);
        if (this.play) this.moveToy(x, y);
        else if (this.build) this.buildDrag(x, y);
        else if (this.stroking && !this.brain.sleeping) {
          this.brain.interrupt([{ k: 'anim', anim: 'purr', dur: 2.5 }], 'pet');
        }
      },
      onDragEnd: () => {
        if (this.build) this.buildDragEnd();
        if (this.stroking) {
          this.stroking = false;
          if (this.strokeHearts > 0) {
            this.env.onPet();
            if (Math.random() < 0.5) this.say('pet');
          }
          this.brain.interrupt([{ k: 'anim', anim: Math.random() < 0.4 ? 'belly' : 'sit_happy', dur: 3 }], 'pet');
        }
      },
      onLongPress: (p) => {
        const [x, y] = this.world(v, p);
        if (!this.build && this.cat.hit(x, y)) this.petTap(true);
      },
    };
  }

  petTap(long = false) {
    if (this.readonly) {
      this.cat.emote('heart');
      this.cat.petting = 1;
      return;
    }
    this.cat.petting = long ? 2.5 : 1.4;
    this.cat.emote('heart');
    if (this.brain.sleeping) {
      // sleepy purr, maybe a slow blink
      if (Math.random() < 0.25) this.brain.interrupt([{ k: 'anim', anim: 'slowblink', dur: 3.5 }, { k: 'anim', anim: 'sleep', dur: 40, emote: 'zzz', emoteEvery: 5 }], 'pet');
    } else {
      this.brain.interrupt([{ k: 'anim', anim: 'purr', dur: long ? 4 : 2.6, emote: 'heart', emoteEvery: 1.2 }], 'pet');
      if (Math.random() < 0.45) this.say('pet');
    }
    this.env.onPet();
  }

  lookAtPoint(x: number, y: number) {
    this.cat.lookAt = { x, y };
    this.lookTimer = 2.5;
    if (!this.brain.sleeping && Math.random() < 0.3 + this.rec.personality.curious * 0.4 && y > 0 && y < H) {
      const [fx, fy] = this.openFloorNear(x, y);
      this.brain.interrupt([{ k: 'goto', x: fx, y: fy, z: 0 }, { k: 'anim', anim: 'sit', dur: 3 }, { k: 'anim', anim: 'think', dur: 2, emote: 'question' }], 'curious');
    }
  }

  /** Call the cat to the front of the room. */
  callCat() {
    const r = this.openFloorNear(W / 2, H - 26);
    this.brain.interrupt([{ k: 'goto', x: r[0], y: r[1], z: 0, run: true }, { k: 'anim', anim: 'meow', dur: 1.4 }, { k: 'anim', anim: 'sit_happy', dur: 6 }], 'called');
    setTimeout(() => this.say('greet'), 1200);
  }

  feed(food: string, foodName: string) {
    const [fx, fy] = this.openFloorNear(W / 2, H - 30);
    this.brain.interrupt(
      [
        { k: 'goto', x: fx, y: fy, z: 0, run: true },
        { k: 'anim', anim: 'beg', dur: 1.2, emote: 'exclaim' },
        { k: 'anim', anim: 'eat', dur: 4, emote: 'heart', emoteEvery: 1.4 },
        { k: 'anim', anim: 'sit_happy', dur: 3 },
        { k: 'anim', anim: 'groom', dur: 3 },
      ],
      'feed',
    );
    this.feedItem = { item: food, x: fx + 2, y: fy + 6, t: 5.2 };
    setTimeout(() => this.say('feed', { food: foodName }), 1500);
  }
  feedItem: { item: string; x: number; y: number; t: number } | null = null;

  /** Bedtime: the cat goes to its favourite bed, kneads, curls up and drifts off. */
  goodnight() {
    const beds = this.spots.filter((s) => s.kind === 'sleep' || s.kind === 'warm');
    const bed = beds.sort((a, b) => (a.item === 'bed_round' ? -1 : 0) - (b.item === 'bed_round' ? -1 : 0))[0];
    const tasks: any[] = [];
    if (bed) tasks.push({ k: 'goto', x: bed.x, y: bed.y, z: bed.z, spot: bed });
    else {
      const [x, y] = this.openFloorNear(W / 2, H - 40);
      tasks.push({ k: 'goto', x, y, z: 0 });
    }
    tasks.push({ k: 'anim', anim: 'knead', dur: 3.5, emote: 'heart', emoteEvery: 1.6 });
    tasks.push({ k: 'anim', anim: 'yawn', dur: 1.6 });
    tasks.push({ k: 'call', fn: () => this.say('goodnight') });
    tasks.push({ k: 'anim', anim: 'sleep', dur: 600, emote: 'zzz', emoteEvery: 4 });
    this.brain.interrupt(tasks, 'goodnight');
  }

  /** Simple text-command reactions inside the nest. */
  command(action: string) {
    const b = this.brain;
    const one = (k: string) => this.spots.filter((s) => s.kind === k)[0];
    switch (action) {
      case 'sleep': {
        const s = one('sleep') ?? one('hide');
        b.interrupt([...(s ? [{ k: 'goto' as const, x: s.x, y: s.y, z: s.z, spot: s }] : []), { k: 'anim', anim: 'sleep', dur: 60, emote: 'zzz', emoteEvery: 4 }], 'cmd');
        break;
      }
      case 'eat': {
        const s = one('eat');
        if (s) b.interrupt([{ k: 'goto', x: s.x, y: s.y, z: 0, spot: s, run: true }, { k: 'anim', anim: 'eat', dur: 6, emote: 'heart', emoteEvery: 2 }], 'cmd');
        break;
      }
      case 'play': {
        const s = one('play');
        if (s) b.interrupt([{ k: 'goto', x: s.x + 40, y: s.y, z: 0, sneak: true }, { k: 'anim', anim: 'pounce', dur: 1.5, face: -1 }, { k: 'goto', x: s.x + 8, y: s.y, z: 0, run: true }, { k: 'anim', anim: 'bat', dur: 3 }], 'cmd');
        else b.interrupt([{ k: 'anim', anim: 'belly', dur: 4 }], 'cmd');
        break;
      }
      case 'sit':
      case 'stop':
        b.interrupt([{ k: 'anim', anim: 'sit', dur: 8 }], 'cmd');
        break;
      case 'meow':
        b.interrupt([{ k: 'anim', anim: 'meow', dur: 2 }, { k: 'anim', anim: 'sit_happy', dur: 3 }], 'cmd');
        break;
      case 'groom':
        b.interrupt([{ k: 'anim', anim: 'groom', dur: 6 }], 'cmd');
        break;
      case 'roll':
        b.interrupt([{ k: 'anim', anim: 'belly', dur: 5, emote: 'heart', emoteEvery: 1.5 }], 'cmd');
        break;
      case 'stretch':
        b.interrupt([{ k: 'anim', anim: 'stretch', dur: 2.5 }, { k: 'anim', anim: 'yawn', dur: 1.6 }], 'cmd');
        break;
      default:
        b.interrupt([{ k: 'anim', anim: 'think', dur: 2.5, emote: 'question' }], 'cmd');
    }
  }

  setPlay(on: boolean) {
    this.play = on;
    if (on) {
      this.toy = { x: W / 2, y: H / 2, z: 40, sx: W / 2, sy: H / 2, vx: 0, vy: 0 };
      this.brain.startChase();
    } else {
      this.toy = null;
      this.brain.stopChase();
    }
  }

  private moveToy(x: number, y: number) {
    if (!this.toy) return;
    // pointer above the floor lifts the feather into the air
    const fy = Math.max(10, Math.min(H - 6, y));
    this.toy.sx = Math.max(8, Math.min(W - 8, x));
    this.toy.sy = fy;
    this.toy.z = y < 10 ? Math.min(120, 10 - y) : 6;
  }

  // ---------------- build mode ----------------
  setBuild(on: boolean) {
    this.build = on;
    this.selected = null;
    this.ghost = null;
    this.dragFrom = null;
    if (!on) this.brain.reset();
  }

  private pickAt(x: number, y: number): { kind: 'floor'; pl: Placed } | { kind: 'wall'; wi: WallItem } | null {
    if (y < -14) {
      for (const wi of this.layout.wall) {
        const w = ITEM_MAP[wi.item]?.w ?? 1;
        if (x >= wi.wx * CELL && x < (wi.wx + w) * CELL) return { kind: 'wall', wi };
      }
      return null;
    }
    // front-most first
    const cands = [...this.placed].sort((a, b) => b.bottom - a.bottom || (a.def.flat ? 1 : -1));
    for (const pl of cands) {
      const top = pl.def.flat ? pl.y : pl.y - 34;
      if (x >= pl.x && x < pl.x + pl.w * CELL && y >= top && y < pl.bottom) return { kind: 'floor', pl };
    }
    return null;
  }

  private buildTap(x: number, y: number) {
    if (this.ghost && !this.ghost.uid) {
      this.updateGhost(x, y);
      this.placeGhost();
      return;
    }
    const hit = this.pickAt(x, y);
    this.selected = hit ? (hit.kind === 'floor' ? hit.pl.p.uid : hit.wi.uid) : null;
    this.env.onBuildSelect?.(this.selected);
  }

  private buildDragStart(x: number, y: number): boolean {
    const hit = this.pickAt(x, y);
    if (!hit) return false;
    if (hit.kind === 'floor') {
      this.dragFrom = { uid: hit.pl.p.uid, gx: hit.pl.p.gx, gy: hit.pl.p.gy, wx: 0 };
      this.ghost = { item: hit.pl.p.item, gx: hit.pl.p.gx, gy: hit.pl.p.gy, wx: 0, flip: !!hit.pl.p.flip, ok: true, wall: false, uid: hit.pl.p.uid };
      this.selected = hit.pl.p.uid;
    } else {
      this.dragFrom = { uid: hit.wi.uid, gx: 0, gy: 0, wx: hit.wi.wx };
      this.ghost = { item: hit.wi.item, gx: 0, gy: 0, wx: hit.wi.wx, flip: false, ok: true, wall: true, uid: hit.wi.uid };
      this.selected = hit.wi.uid;
    }
    this.env.onBuildSelect?.(this.selected);
    return true;
  }

  private buildDrag(x: number, y: number) {
    if (this.ghost) this.updateGhost(x, y);
  }

  private buildDragEnd() {
    if (this.ghost && this.dragFrom) {
      if (this.ghost.ok) this.placeGhost();
      this.ghost = null;
      this.dragFrom = null;
    }
  }

  updateGhost(x: number, y: number) {
    const g = this.ghost;
    if (!g) return;
    const def = ITEM_MAP[g.item];
    if (g.wall) {
      g.wx = Math.max(0, Math.min(WALL_SLOTS - (def.w ?? 1), Math.round(x / CELL - (def.w ?? 1) / 2)));
      g.ok = canPlaceWall(this.layout, g.item, g.wx, g.uid);
    } else {
      const w = def.w ?? 1, h = def.h ?? 1;
      g.gx = Math.max(0, Math.min(ROOM_W - w, Math.round(x / CELL - w / 2)));
      g.gy = Math.max(0, Math.min(ROOM_H - h, Math.round(y / CELL - h / 2)));
      g.ok = canPlace(this.layout, g.item, g.gx, g.gy, g.uid);
    }
  }

  /** Begin placing a new item from the inventory tray. */
  startPlacing(item: string) {
    const def = ITEM_MAP[item];
    if (!def) return;
    this.selected = null;
    this.ghost = { item, gx: Math.floor(ROOM_W / 2), gy: Math.floor(ROOM_H / 2), wx: 3, flip: false, ok: false, wall: def.cat === 'wall' };
    this.updateGhost(W / 2, def.cat === 'wall' ? -WALL_H / 2 : H / 2);
  }

  cancelPlacing() {
    this.ghost = null;
  }

  private placeGhost() {
    const g = this.ghost;
    if (!g || !g.ok) return;
    if (g.wall) {
      if (g.uid) {
        const wi = this.layout.wall.find((w) => w.uid === g.uid);
        if (wi) wi.wx = g.wx;
      } else this.layout.wall.push({ uid: 'w' + Math.random().toString(36).slice(2, 9), item: g.item, wx: g.wx });
    } else {
      if (g.uid) {
        const it = this.layout.items.find((i) => i.uid === g.uid);
        if (it) {
          it.gx = g.gx;
          it.gy = g.gy;
        }
      } else this.layout.items.push({ uid: 'f' + Math.random().toString(36).slice(2, 9), item: g.item, gx: g.gx, gy: g.gy, flip: g.flip });
    }
    this.ghost = null;
    this.rebuild();
    this.env.onLayoutChange?.(this.layout);
  }

  flipSelected() {
    const it = this.layout.items.find((i) => i.uid === this.selected);
    if (it) {
      it.flip = !it.flip;
      this.rebuild();
      this.env.onLayoutChange?.(this.layout);
    }
  }

  storeSelected() {
    const n0 = this.layout.items.length + this.layout.wall.length;
    this.layout.items = this.layout.items.filter((i) => i.uid !== this.selected);
    this.layout.wall = this.layout.wall.filter((i) => i.uid !== this.selected);
    if (this.layout.items.length + this.layout.wall.length !== n0) {
      this.selected = null;
      this.rebuild();
      this.env.onLayoutChange?.(this.layout);
    }
  }

  setSurface(kind: 'wallpaper' | 'floor', id: string) {
    this.layout[kind] = id;
    this.env.onLayoutChange?.(this.layout);
  }

  setLayout(l: NestLayout) {
    this.layout = structuredClone(l);
    this.rebuild();
    this.brain.reset();
  }
}
