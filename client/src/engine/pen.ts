import { hashs } from '../../../shared/rng';

export const INK = '#4a3a34';
export const INK_SOFT = 'rgba(74,58,52,0.55)';

const K = 1 / 6;

/**
 * Hand-drawn style pen. Every shape is a Catmull-Rom spline through jittered
 * points. The jitter is seeded by (boil seed, shape salt, index) so lines are
 * stable within a "boil frame" and gently shift between frames, which gives the
 * classic living-line look of hand-drawn animation.
 */
export class Pen {
  ctx: CanvasRenderingContext2D;
  seed = 1;
  salt = 0;
  wob = 0.55;
  lw = 1.8;
  ink = INK;
  private buf = new Float64Array(256);

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  begin(seed: number, wob = 0.55, lw = 1.8) {
    this.seed = seed;
    this.salt = 0;
    this.wob = wob;
    this.lw = lw;
    return this;
  }

  private jitter(pts: ArrayLike<number>, amp: number): Float64Array {
    const n = pts.length;
    if (this.buf.length < n) this.buf = new Float64Array(n * 2);
    const out = this.buf;
    const s = this.salt++;
    for (let i = 0; i < n; i++) out[i] = pts[i] + hashs(this.seed, s, i) * amp;
    return out;
  }

  /** Smooth path through flat [x,y,...] points. */
  path(pts: ArrayLike<number>, closed: boolean, wobMul = 1, tension = 1): Path2D {
    const n = pts.length >> 1;
    const p = this.jitter(pts, this.wob * wobMul);
    const path = new Path2D();
    if (n < 2) return path;
    path.moveTo(p[0], p[1]);
    if (n === 2 && !closed) {
      path.lineTo(p[2], p[3]);
      return path;
    }
    const segs = closed ? n : n - 1;
    const t = K * tension;
    for (let i = 0; i < segs; i++) {
      const i0 = closed ? (i - 1 + n) % n : Math.max(0, i - 1);
      const i1 = i;
      const i2 = closed ? (i + 1) % n : Math.min(n - 1, i + 1);
      const i3 = closed ? (i + 2) % n : Math.min(n - 1, i + 2);
      const x0 = p[i0 * 2], y0 = p[i0 * 2 + 1];
      const x1 = p[i1 * 2], y1 = p[i1 * 2 + 1];
      const x2 = p[i2 * 2], y2 = p[i2 * 2 + 1];
      const x3 = p[i3 * 2], y3 = p[i3 * 2 + 1];
      path.bezierCurveTo(x1 + (x2 - x0) * t, y1 + (y2 - y0) * t, x2 - (x3 - x1) * t, y2 - (y3 - y1) * t, x2, y2);
    }
    if (closed) path.closePath();
    return path;
  }

  /** Points around an ellipse. */
  static ellipsePts(cx: number, cy: number, rx: number, ry: number, rot = 0, n = 8, out: number[] = []): number[] {
    const c = Math.cos(rot), s = Math.sin(rot);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const x = Math.cos(a) * rx, y = Math.sin(a) * ry;
      out.push(cx + x * c - y * s, cy + x * s + y * c);
    }
    return out;
  }

  fillStroke(path: Path2D, fill: string | CanvasGradient | CanvasPattern | null, lw = this.lw, stroke: string | null = this.ink) {
    const ctx = this.ctx;
    if (fill) {
      ctx.fillStyle = fill;
      ctx.fill(path);
    }
    if (stroke && lw > 0) {
      ctx.lineWidth = lw;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.strokeStyle = stroke;
      ctx.stroke(path);
    }
  }

  shape(pts: ArrayLike<number>, fill: string | CanvasGradient | CanvasPattern | null, lw = this.lw, stroke: string | null = this.ink, wobMul = 1): Path2D {
    const path = this.path(pts, true, wobMul);
    this.fillStroke(path, fill, lw, stroke);
    return path;
  }

  /** Polygon with (mostly) crisp corners, still hand-wobbled. */
  poly(pts: ArrayLike<number>, fill: string | CanvasGradient | CanvasPattern | null, lw = this.lw, stroke: string | null = this.ink, tension = 0.2): Path2D {
    const path = this.path(pts, true, 0.8, tension);
    this.fillStroke(path, fill, lw, stroke);
    return path;
  }

  ellipse(cx: number, cy: number, rx: number, ry: number, fill: string | CanvasGradient | null, lw = this.lw, stroke: string | null = this.ink, rot = 0, n = 8): Path2D {
    return this.shape(Pen.ellipsePts(cx, cy, rx, ry, rot, n), fill, lw, stroke);
  }

  /** Open smooth stroke. */
  line(pts: ArrayLike<number>, lw = this.lw, color: string = this.ink, wobMul = 1): Path2D {
    const path = this.path(pts, false, wobMul);
    const ctx = this.ctx;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = color;
    ctx.stroke(path);
    return path;
  }

  /** Outlined thick tube (legs, tails, arms). */
  tube(pts: ArrayLike<number>, w: number, color: string, lw = this.lw, wobMul = 0.6): Path2D {
    const path = this.path(pts, false, wobMul);
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = this.ink;
    ctx.lineWidth = w + lw * 2;
    ctx.stroke(path);
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.stroke(path);
    return path;
  }

  /** Re-stroke a tube's interior with another color (e.g. stripes via dashes). */
  tubeOverlay(path: Path2D, w: number, color: string, dash?: number[], offset = 0) {
    const ctx = this.ctx;
    ctx.save();
    ctx.lineCap = dash ? 'butt' : 'round';
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    if (dash) {
      ctx.setLineDash(dash);
      ctx.lineDashOffset = offset;
    }
    ctx.stroke(path);
    ctx.restore();
  }

  clip(path: Path2D, fn: () => void) {
    const ctx = this.ctx;
    ctx.save();
    ctx.clip(path);
    fn();
    ctx.restore();
  }

  /** A few short parallel strokes for shading / texture. */
  hatch(x: number, y: number, w: number, h: number, n: number, angle: number, color = INK_SOFT, lw = this.lw * 0.6) {
    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    const dx = Math.cos(angle), dy = Math.sin(angle);
    for (let i = 0; i < n; i++) {
      const t = n === 1 ? 0.5 : i / (n - 1);
      const cx = x + (t - 0.5) * w + hashs(this.seed, this.salt, i) * 0.4;
      const cy = y + (t - 0.5) * h * 0.2;
      ctx.beginPath();
      ctx.moveTo(cx - dx * h * 0.5, cy - dy * h * 0.5);
      ctx.lineTo(cx + dx * h * 0.5, cy + dy * h * 0.5);
      ctx.stroke();
    }
    this.salt++;
  }
}

/** Mix two hex colors. */
export function mix(a: string, b: string, t: number): string {
  const pa = parseHex(a), pb = parseHex(b);
  const r = Math.round(pa[0] + (pb[0] - pa[0]) * t);
  const g = Math.round(pa[1] + (pb[1] - pa[1]) * t);
  const bl = Math.round(pa[2] + (pb[2] - pa[2]) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}

const hexCache = new Map<string, [number, number, number]>();
export function parseHex(h: string): [number, number, number] {
  let v = hexCache.get(h);
  if (v) return v;
  let s = h.replace('#', '');
  if (s.length === 3) s = s.split('').map((c) => c + c).join('');
  const n = parseInt(s, 16);
  v = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  hexCache.set(h, v);
  return v;
}

export function shade(h: string, amt: number): string {
  return amt < 0 ? mix(h, '#2a2230', -amt) : mix(h, '#ffffff', amt);
}

export function rgba(h: string, a: number): string {
  const [r, g, b] = parseHex(h);
  return `rgba(${r},${g},${b},${a})`;
}
