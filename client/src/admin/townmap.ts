// The sandbox's picture of the town, made from the game's own art: the ground and every prop are
// painted a chunk at a time, at the resolution the map is being looked at, and kept. Over them go
// the things that move (water, sails, smoke, cloud shadows, rain) and, after dusk, the dark with
// the town's lights cut out of it.
import { Pen } from '../engine/pen';
import { paintGround, GROUND } from '../art/ground';
import { drawProp, drawPropLive, propLights, propScale, BOUNDS, type PropCtx } from '../art/props';
import { getWorld, TILE, WW, WH, Ter, POIS, ZONE_NAME, type Prop } from '../../../shared/world';
import { hashf } from '../../../shared/rng';
import { daylight, sunset } from '../../../shared/time';

export const MAP_W = WW * TILE;
export const MAP_H = WH * TILE;
const CHUNK = 16; // tiles
const CPX = CHUNK * TILE;
const NCX = Math.ceil(WW / CHUNK), NCY = Math.ceil(WH / CHUNK);
/** Resolutions a chunk is painted at, in canvas pixels per world unit. */
const STEPS = [0.125, 0.25, 0.5, 1, 1.5];
/** Canvas pixels of chunk pictures kept, about 100 MB. */
const BUDGET = 25e6;
const PAD = 6;
const FLAT = new Set(['lily', 'picnic', 'sandbox', 'hotspring', 'stage']);
/** Props with moving parts worth drawing on the map. */
const LIVE = new Set(['windmill', 'fountain', 'hotspring', 'campfire', 'lighthouse', 'kite', 'house']);

/** Where the camera is: (cx, cy) in world units at the middle of a w × h css-pixel canvas, z css pixels per unit. */
export interface View {
  cx: number;
  cy: number;
  z: number;
  w: number;
  h: number;
  dpr: number;
}

export interface Sky {
  hour: number;
  season: number;
  kind: string;
  rain: number;
  snow: number;
  cloud: number;
  wind: number;
}

/** A glow at night: [x, y, radius, strength] in world units. */
export type Light = [number, number, number, number];

interface Pic {
  c: HTMLCanvasElement;
  ox: number; // offset of the picture from the prop's base, world units
  oy: number;
  w: number;
  h: number;
}

/** Big soft names for the parts of town, at the middle of their places. */
const ZONES: { name: string; x: number; y: number }[] = (() => {
  const acc = new Map<string, { x: number; y: number; n: number }>();
  for (const p of POIS) {
    if (p.room || !ZONE_NAME[p.zone]) continue;
    const a = acc.get(p.zone) ?? { x: 0, y: 0, n: 0 };
    a.x += p.x;
    a.y += p.y;
    a.n++;
    acc.set(p.zone, a);
  }
  return [...acc.entries()].map(([z, a]) => ({ name: ZONE_NAME[z], x: (a.x / a.n) * TILE, y: (a.y / a.n) * TILE }));
})();

export class TownMap {
  readonly world = getWorld();
  /** One pixel per tile: the minimap, and what shows while chunks are still being painted. */
  readonly overview: HTMLCanvasElement;
  private chunks = new Map<string, { c: HTMLCanvasElement; used: number }>();
  private sprites = new Map<string, Pic>();
  private byChunk: Prop[][] = Array.from({ length: NCX * NCY }, () => []);
  private live: Prop[];
  private lamps: Prop[];
  private dark: HTMLCanvasElement | null = null;
  private frame = 0;

  constructor() {
    for (const p of this.world.props) {
      const [x0, y0, x1, y1] = extent(p);
      for (let cy = Math.max(0, Math.floor(y0 / CPX)); cy <= Math.min(NCY - 1, Math.floor(y1 / CPX)); cy++)
        for (let cx = Math.max(0, Math.floor(x0 / CPX)); cx <= Math.min(NCX - 1, Math.floor(x1 / CPX)); cx++) this.byChunk[cy * NCX + cx].push(p);
    }
    for (const list of this.byChunk) list.sort((a, b) => depth(a) - depth(b));
    this.live = this.world.props.filter((p) => LIVE.has(p.k));
    this.lamps = this.world.props.filter((p) => propLights(p, false).length);
    this.overview = this.paintOverview(0);
  }

  terAt = (tx: number, ty: number): number => (tx < 0 || ty < 0 || tx >= WW || ty >= WH ? Ter.Deep : this.world.ter[ty * WW + tx]);

  /** The whole map, one pixel per tile, in the season's colours. */
  paintOverview(season: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = WW;
    c.height = WH;
    const x = c.getContext('2d')!;
    const col: Record<number, string> = {
      [Ter.Grass]: GROUND.grass[season], [Ter.Forest]: GROUND.forest[season], [Ter.Hill]: GROUND.hill[season], [Ter.Field]: GROUND.field[season],
      [Ter.Bamboo]: GROUND.bamboo[season], [Ter.Orchard]: GROUND.orchard[season], [Ter.Path]: '#ecdcc0', [Ter.Plaza]: '#efe4d2', [Ter.Sand]: '#f4e4bf',
      [Ter.Water]: '#a9d6ec', [Ter.Deep]: '#93c6e3', [Ter.Wood]: '#dcb58a', [Ter.Stone]: '#c9c6c0',
    };
    for (let ty = 0; ty < WH; ty++)
      for (let tx = 0; tx < WW; tx++) {
        x.fillStyle = col[this.terAt(tx, ty)] ?? col[Ter.Grass];
        x.fillRect(tx, ty, 1, 1);
      }
    // woods and houses as darker dots, so the minimap reads
    for (const p of this.world.props) {
      if (p.k !== 'tree' && p.k !== 'pine' && p.k !== 'bigtree' && p.k !== 'bamboo' && p.k !== 'house' && p.k !== 'shop' && p.k !== 'fruittree' && p.k !== 'sakura') continue;
      x.fillStyle = p.k === 'house' || p.k === 'shop' ? '#d9866a' : p.k === 'sakura' ? '#f2b8c8' : 'rgba(74,110,60,0.45)';
      const r = p.k === 'shop' ? 2 : 1;
      x.fillRect(Math.floor(p.x / TILE) - (r >> 1), Math.floor(p.y / TILE) - 1, r + (p.k === 'house' || p.k === 'shop' ? 1 : 0), r);
    }
    return c;
  }

  /** The step a view is painted at: the nearest to its own resolution. */
  stepFor(v: View): number {
    const want = v.z * v.dpr;
    let best = STEPS[0];
    for (const s of STEPS) if (Math.abs(Math.log(s / want)) < Math.abs(Math.log(best / want))) best = s;
    return best;
  }

  /**
   * Draws the town as seen by v: ground, props and the moving bits, but not the people or the dark.
   * Chunks not painted yet are painted while `ms` lasts; until then a coarser one, or the overview, stands in.
   * Answers how much of the view is painted at its own resolution, 0..1.
   */
  drawGround(ctx: CanvasRenderingContext2D, v: View, sky: Sky, T: number, ms = 14): number {
    this.frame++;
    const t0 = performance.now();
    const step = this.stepFor(v);
    const night = daylight(sky.hour) < 0.6 ? 1 : 0;
    const season = sky.season;
    const [x0, y0, x1, y1] = bounds(v, 0);
    // the sea all round, and the overview under everything
    ctx.fillStyle = '#93c6e3';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.overview, 0, 0, MAP_W, MAP_H);
    const cx0 = Math.max(0, Math.floor(x0 / CPX)), cy0 = Math.max(0, Math.floor(y0 / CPX));
    const cx1 = Math.min(NCX - 1, Math.floor(x1 / CPX)), cy1 = Math.min(NCY - 1, Math.floor(y1 / CPX));
    // nearest the middle first, so what is looked at fills in first
    const order: [number, number, number][] = [];
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) order.push([cx, cy, Math.hypot((cx + 0.5) * CPX - v.cx, (cy + 0.5) * CPX - v.cy)]);
    order.sort((a, b) => a[2] - b[2]);
    let done = 0;
    for (const [cx, cy] of order) {
      let c = this.chunks.get(key(step, season, night, cx, cy));
      if (!c && performance.now() - t0 < ms) c = this.paintChunk(cx, cy, step, season, night);
      if (c) done++;
      const pic = c ?? this.standIn(cx, cy, season, night);
      if (!pic) continue;
      pic.used = this.frame;
      ctx.drawImage(pic.c, cx * CPX, cy * CPX, CPX, CPX);
    }
    this.trim();
    if (v.z > 0.12) this.drawWater(ctx, v, T);
    if (v.z > 0.18) {
      const n = daylight(sky.hour);
      for (const p of this.live) {
        const [px0, py0, px1, py1] = extent(p);
        if (px1 < x0 || px0 > x1 || py1 < y0 || py0 > y1) continue;
        drawPropLive(new Pen(ctx).begin(p.id, 0.3, 1.7), p, propScale(p), T, { night: 1 - n, hour: sky.hour, show: false });
      }
    }
    this.drawClouds(ctx, v, sky, T);
    return order.length ? done / order.length : 1;
  }

  private standIn(cx: number, cy: number, season: number, night: number) {
    let best: { c: HTMLCanvasElement; used: number } | undefined;
    for (const n of [night, 1 - night])
      for (let i = STEPS.length - 1; i >= 0 && !best; i--) best = this.chunks.get(key(STEPS[i], season, n, cx, cy));
    return best;
  }

  private paintChunk(cx: number, cy: number, step: number, season: number, night: number) {
    const c = document.createElement('canvas');
    c.width = c.height = Math.ceil(CPX * step);
    const ctx = c.getContext('2d')!;
    ctx.scale(c.width / CPX, c.height / CPX);
    ctx.translate(-cx * CPX, -cy * CPX);
    paintGround(ctx, this.terAt, cx, cy, CHUNK, season);
    const pc: PropCtx = { season, night, t: 0 };
    for (const p of this.byChunk[cy * NCX + cx]) {
      if (p.season !== undefined && p.season !== season) continue;
      const sp = this.sprite(p, step, pc);
      ctx.drawImage(sp.c, p.x + sp.ox, p.y + sp.oy, sp.w, sp.h);
    }
    const entry = { c, used: this.frame };
    this.chunks.set(key(step, season, night, cx, cy), entry);
    return entry;
  }

  private sprite(p: Prop, step: number, pc: PropCtx): Pic {
    const s = propScale(p);
    const k = `${p.k}|${p.v}|${pc.season}|${pc.night}|${p.label ?? ''}|${s.toFixed(3)}|${step}`;
    let sp = this.sprites.get(k);
    if (sp) return sp;
    const b = BOUNDS[p.k] ?? [-40, -80, 40, 10];
    const bw = b[2] - b[0] + PAD * 2, bh = b[3] - b[1] + PAD * 2;
    const r = step * s; // canvas pixels per prop unit
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.ceil(bw * r));
    c.height = Math.max(1, Math.ceil(bh * r));
    const ctx = c.getContext('2d')!;
    ctx.scale(r, r);
    ctx.translate(-b[0] + PAD, -b[1] + PAD);
    drawProp(new Pen(ctx).begin(p.k.length * 7 + p.v * 13, 0.45, 1.7), p.k, p.v, { ...pc, label: p.label });
    sp = { c, ox: (b[0] - PAD) * s, oy: (b[1] - PAD) * s, w: (c.width / r) * s, h: (c.height / r) * s };
    this.sprites.set(k, sp);
    return sp;
  }

  /** Lets go of the chunk pictures not looked at for longest once over budget. */
  private trim() {
    let px = 0;
    for (const ch of this.chunks.values()) px += ch.c.width * ch.c.height;
    if (px <= BUDGET) return;
    for (const [k, ch] of [...this.chunks.entries()].sort((a, b) => a[1].used - b[1].used)) {
      if (px <= BUDGET || ch.used >= this.frame) break;
      px -= ch.c.width * ch.c.height;
      ch.c.width = ch.c.height = 0;
      this.chunks.delete(k);
    }
    // sprites at resolutions no longer used
    if (this.sprites.size > 1500) this.sprites.clear();
  }

  private drawWater(ctx: CanvasRenderingContext2D, v: View, T: number) {
    const [x0, y0, x1, y1] = bounds(v, 1);
    const tx0 = Math.max(0, Math.floor(x0 / TILE)), ty0 = Math.max(0, Math.floor(y0 / TILE));
    const tx1 = Math.min(WW - 1, Math.floor(x1 / TILE)), ty1 = Math.min(WH - 1, Math.floor(y1 / TILE));
    // far out, only some of the glints
    const every = v.z < 0.3 ? 3 : 1;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = Math.max(1.3, 1 / v.z);
    ctx.lineCap = 'round';
    for (let ty = ty0; ty <= ty1; ty += 1)
      for (let tx = tx0; tx <= tx1; tx += 1) {
        const t = this.world.ter[ty * WW + tx];
        if (t !== Ter.Water && t !== Ter.Deep) continue;
        const h = hashf(tx, ty, 200);
        if (h > 0.35 / every) continue;
        const ph = (T * 0.35 + h * 10) % 1;
        ctx.globalAlpha = Math.sin(ph * Math.PI) * 0.8;
        const x = (tx + hashf(tx, ty, 201)) * TILE + ph * 8, y = (ty + hashf(tx, ty, 202)) * TILE;
        ctx.beginPath();
        ctx.moveTo(x - 6, y);
        ctx.quadraticCurveTo(x - 3, y - 2.5, x, y);
        ctx.quadraticCurveTo(x + 3, y + 2.5, x + 6, y);
        ctx.stroke();
      }
    ctx.globalAlpha = 1;
  }

  private drawClouds(ctx: CanvasRenderingContext2D, v: View, sky: Sky, T: number) {
    if (daylight(sky.hour) < 0.3) return;
    const [x0, y0, x1, y1] = bounds(v, 300);
    ctx.fillStyle = `rgba(60,80,90,${0.05 + sky.cloud * 0.05})`;
    const n = 6 + Math.round(sky.cloud * 10);
    for (let i = 0; i < n; i++) {
      const x = ((T * (6 + sky.wind * 6) + i * 900) % (MAP_W + 800)) - 400, y = hashf(i, 3) * MAP_H;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      ctx.beginPath();
      ctx.ellipse(x, y, 220, 90, 0, 0, 7);
      ctx.ellipse(x + 120, y + 30, 140, 70, 0, 0, 7);
      ctx.fill();
    }
  }

  /** Rain or snow over the whole canvas, in screen space. */
  drawWeather(ctx: CanvasRenderingContext2D, v: View, sky: Sky, T: number) {
    if (sky.rain > 0) {
      ctx.strokeStyle = 'rgba(120,150,190,0.45)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const n = Math.round(90 * sky.rain * (v.w * v.h) / 1e6) + 20;
      for (let i = 0; i < n; i++) {
        const x = (hashf(i, 1) * v.w + T * 60) % v.w, y = (hashf(i, 2) * v.h + T * (480 + hashf(i, 3) * 200)) % v.h;
        ctx.moveTo(x, y);
        ctx.lineTo(x - 3, y + 11);
      }
      ctx.stroke();
    }
    if (sky.snow > 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      const n = Math.round(120 * sky.snow * (v.w * v.h) / 1e6) + 20;
      for (let i = 0; i < n; i++) {
        const x = (hashf(i, 1) * v.w + Math.sin(T + i) * 12 + T * 10) % v.w, y = (hashf(i, 2) * v.h + T * (30 + hashf(i, 3) * 30)) % v.h;
        ctx.beginPath();
        ctx.arc(x, y, 1.2 + hashf(i, 4) * 1.4, 0, 7);
        ctx.fill();
      }
    }
  }

  /**
   * Dusk and night, in screen space: a warm wash at sunset, then the dark with the town's lamps,
   * windows and the people in it (`extra`, world units) cut out, and a warm glow round the brightest.
   */
  drawLight(ctx: CanvasRenderingContext2D, v: View, sky: Sky, extra: Light[]) {
    const night = 1 - daylight(sky.hour);
    const dusk = sunset(sky.hour);
    if (night < 0.05) {
      if (dusk > 0.05) {
        ctx.fillStyle = `rgba(255,140,70,${0.14 * dusk})`;
        ctx.fillRect(0, 0, v.w, v.h);
      }
      return;
    }
    const R = 0.5;
    const L = (this.dark ??= document.createElement('canvas'));
    const lw = Math.max(1, Math.ceil(v.w * v.dpr * R)), lh = Math.max(1, Math.ceil(v.h * v.dpr * R));
    if (L.width !== lw || L.height !== lh) {
      L.width = lw;
      L.height = lh;
    }
    const lc = L.getContext('2d')!;
    lc.setTransform(1, 0, 0, 1, 0, 0);
    lc.globalCompositeOperation = 'source-over';
    lc.clearRect(0, 0, lw, lh);
    lc.fillStyle = `rgba(18,26,78,${0.62 * night})`;
    lc.fillRect(0, 0, lw, lh);
    const k = v.z * v.dpr * R;
    lc.setTransform(k, 0, 0, k, (v.w / 2 - v.cx * v.z) * v.dpr * R, (v.h / 2 - v.cy * v.z) * v.dpr * R);
    lc.globalCompositeOperation = 'destination-out';
    const [x0, y0, x1, y1] = bounds(v, 250);
    const lights: Light[] = [];
    for (const p of this.lamps) {
      if (p.x < x0 || p.x > x1 || p.y < y0 || p.y > y1) continue;
      if (p.season !== undefined && p.season !== sky.season) continue;
      lights.push(...propLights(p, false));
    }
    lights.push(...extra);
    // far out a light would be a speck: keep each at least a few pixels across
    const minR = 10 / v.z;
    for (const [x, y, r0, a] of lights) {
      const r = Math.max(r0, minR * a);
      const g = lc.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(0,0,0,${a})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      lc.fillStyle = g;
      lc.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(L, 0, 0, v.w * v.dpr, v.h * v.dpr);
    ctx.restore();
    ctx.save();
    ctx.setTransform(v.dpr * v.z, 0, 0, v.dpr * v.z, (v.w / 2 - v.cx * v.z) * v.dpr, (v.h / 2 - v.cy * v.z) * v.dpr);
    ctx.globalCompositeOperation = 'lighter';
    for (const [x, y, r0, a] of lights) {
      if (a < 0.75) continue;
      const r = Math.max(r0, minR);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 0.7);
      g.addColorStop(0, `rgba(255,190,110,${0.16 * night})`);
      g.addColorStop(1, 'rgba(255,190,110,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    ctx.restore();
  }

  /** Names on the map, in screen space: parts of town from far out, places closer in. */
  drawNames(ctx: CanvasRenderingContext2D, v: View, toScreen: (x: number, y: number) => [number, number], night: number) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const ink = night > 0.5 ? '#fff6e4' : '#5b4a41';
    const halo = night > 0.5 ? 'rgba(30,30,70,0.7)' : 'rgba(255,250,240,0.9)';
    if (v.z < 0.42) {
      const fs = Math.round(Math.max(13, Math.min(19, v.z * 70)));
      ctx.font = `700 ${fs}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
      const placed: [number, number, number, number][] = [];
      for (const zn of ZONES) {
        const [sx, sy] = toScreen(zn.x, zn.y);
        if (sx < -80 || sy < -20 || sx > v.w + 80 || sy > v.h + 20) continue;
        // where two names would run into each other, the first one listed stays
        const w = ctx.measureText(zn.name).width * 1.15 + 8, h = fs + 6;
        if (placed.some(([x, y, pw, ph]) => Math.abs(x - sx) * 2 < w + pw && Math.abs(y - sy) * 2 < h + ph)) continue;
        placed.push([sx, sy, w, h]);
        const label = zn.name.split('').join(' ');
        ctx.lineWidth = 4;
        ctx.strokeStyle = halo;
        ctx.strokeText(label, sx, sy);
        ctx.fillStyle = ink;
        ctx.globalAlpha = 0.85;
        ctx.fillText(label, sx, sy);
        ctx.globalAlpha = 1;
      }
      return;
    }
    if (v.z > 1.1) return; // close in, the shop signs say it
    ctx.font = `600 12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
    const placed: [number, number, number, number][] = [];
    for (const p of POIS) {
      if (p.room) continue;
      const [sx, sy] = toScreen(p.x * TILE, p.y * TILE);
      if (sx < -60 || sy < -20 || sx > v.w + 60 || sy > v.h + 20) continue;
      const w = ctx.measureText(p.name).width + 6;
      if (placed.some(([x, y, pw]) => Math.abs(x - sx) * 2 < w + pw && Math.abs(y - sy) < 16)) continue;
      placed.push([sx, sy, w, 16]);
      ctx.lineWidth = 3;
      ctx.strokeStyle = halo;
      ctx.strokeText(p.name, sx, sy);
      ctx.fillStyle = ink;
      ctx.fillText(p.name, sx, sy);
    }
  }
}

function key(step: number, season: number, night: number, cx: number, cy: number) {
  return `${step}|${season}|${night}|${cx},${cy}`;
}

/** What a prop covers, padding included, in world units: [x0, y0, x1, y1]. */
function extent(p: Prop): [number, number, number, number] {
  const b = BOUNDS[p.k] ?? [-40, -80, 40, 10];
  const s = propScale(p);
  return [p.x + (b[0] - PAD) * s, p.y + (b[1] - PAD) * s, p.x + (b[2] + PAD) * s, p.y + (b[3] + PAD) * s];
}

function depth(p: Prop) {
  return FLAT.has(p.k) ? p.y - 200 : p.y;
}

/** The part of the world v shows, grown by `pad` units: [x0, y0, x1, y1]. */
export function bounds(v: View, pad: number): [number, number, number, number] {
  const hw = v.w / 2 / v.z, hh = v.h / 2 / v.z;
  return [v.cx - hw - pad, v.cy - hh - pad, v.cx + hw + pad, v.cy + hh + pad];
}
