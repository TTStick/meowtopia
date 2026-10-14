import { Pen, mix, shade, rgba } from '../engine/pen';
import { Rng, hashf } from '../../../shared/rng';
import type { CatGenes } from '../../../shared/types';
import { drawHeadwear, drawNeckwear, drawFacewear } from './wear';

export type Eyes = 'open' | 'happy' | 'closed' | 'sleepy' | 'wide' | 'heart' | 'star' | 'blink' | 'squint' | 'half';
export type Mouth = 'w' | 'open' | 'blep' | 'yawn' | 'smile' | 'o' | 'flat' | 'chew' | 'tongue';
export type View = 'side' | 'front' | 'back' | 'curl' | 'belly' | 'lie';

export interface CatPose {
  view: View;
  eyes: Eyes;
  mouth: Mouth;
  lookX: number;
  lookY: number;
  ear: number;
  earL: number;
  earR: number;
  blush: number;
  headTilt: number;
  headDX: number;
  headDY: number;
  turn: number;
  breathe: number;
  tailUp: number;
  tailCurl: number;
  tailSwish: number;
  gait: number;
  phase: number;
  crouch: number;
  tilt: number;
  reach: number;
  air: number;
  standUp: number;
  pawLift: number;
  sitH: number;
  pawL: number;
  pawR: number;
  groom: number;
  beg: number;
  headDown: number;
  wiggle: number;
  coverEyes: number;
  t: number;
}

export function defaultPose(): CatPose {
  return {
    view: 'front', eyes: 'open', mouth: 'w',
    lookX: 0, lookY: 0, ear: 0, earL: 0, earR: 0, blush: 0, headTilt: 0, headDX: 0, headDY: 0, turn: 0.45,
    breathe: 0, tailUp: 0, tailCurl: 0.4, tailSwish: 0.3,
    gait: 0, phase: 0, crouch: 0, tilt: 0, reach: 0, air: 0, standUp: 0, pawLift: 0,
    sitH: 1, pawL: 0, pawR: 0, groom: 0, beg: 0, headDown: 0, wiggle: 0, coverEyes: 0, t: 0,
  };
}

export interface CatDrawOpts {
  age: number; // 0 kitten .. 1 adult
  outfit?: string[];
  shadow?: boolean;
  alpha?: number;
}

const R0 = 12;
const PUPIL = '#2f2729';
const EAR_PINK = '#f4b9b8';
const PAD_PINK = '#f29fa6';
const WHITE = '#fffdf8';

// ---------- palette helpers ----------
interface Pal {
  base: string;
  dark: string; // far limbs
  accent: string;
  accent2: string;
  white: string;
  belly: string;
  points: string | null; // siamese
  ink: string;
}

function palette(g: CatGenes): Pal {
  const pointed = g.pattern === 'pointed';
  return {
    base: g.base,
    dark: shade(g.base, -0.13),
    accent: g.accent,
    accent2: g.accent2,
    white: WHITE,
    belly: g.white > 0.12 ? WHITE : shade(g.base, 0.35),
    points: pointed ? g.accent : null,
    ink: '#4a3a34',
  };
}

// ---------- head ----------
interface HeadOpts {
  back?: boolean;
  scale?: number;
}

function headOutline(R: number, fluff: number, seed: number): number[] {
  const pts: number[] = [];
  const hw = R * 1.13, hh = R * 0.94;
  const n = fluff > 0.35 ? 20 : 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = Math.sin(a), c = Math.cos(a);
    let x = c * hw, y = s * hh;
    if (s > 0) {
      x *= 1 + 0.07 * s; // chubby cheeks
      y *= 0.9;
    } else y *= 0.96;
    if (fluff > 0.35 && s > -0.1 && Math.abs(c) > 0.45 && i % 2 === 0) {
      const k = 1 + 0.1 * fluff;
      x *= k;
      y *= 1 + 0.04 * fluff;
    }
    pts.push(x, y);
  }
  return pts;
}

/** Feature x position for a point at sphere angle phi (radians), with head turn. */
function fx(R: number, phi: number, turn: number) {
  const a = phi + turn * 0.62;
  return { x: Math.sin(a) * R * 1.05, k: Math.max(0.35, Math.cos(a)) };
}

function drawEar(pen: Pen, g: CatGenes, pal: Pal, R: number, side: number, pose: CatPose, back: boolean) {
  const turn = pose.turn;
  const hw = R * 1.13, hh = R * 0.94;
  const a0 = -Math.PI / 2 + side * 0.98;
  let bx = Math.cos(a0) * hw * 0.8 + turn * R * 0.16;
  const by = Math.sin(a0) * hh * 0.8;
  const far = (side < 0 && turn > 0.1) || (side > 0 && turn < -0.1);
  const wk = far ? 1 - Math.abs(turn) * 0.35 : 1;
  const E = R * 0.82 * g.earSize;
  const twitch = side < 0 ? pose.earL : pose.earR;
  let ang = -Math.PI / 2 + side * (0.42 - pose.ear * 0.16 + Math.max(0, -pose.ear) * 0.75) + side * twitch * 0.35;
  const fold = g.earFold;
  const len = fold ? E * 0.52 : E * (1 - Math.max(0, -pose.ear) * 0.18);
  if (fold) ang += side * 0.9;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  const px = -dy, py = dx; // perpendicular
  const bw = E * 0.5 * wk;
  const tipx = bx + dx * len, tipy = by + dy * len;
  const pts = [
    bx - px * bw, by - py * bw,
    bx - px * bw * 0.55 + dx * len * 0.55, by - py * bw * 0.55 + dy * len * 0.55,
    tipx - px * bw * 0.1, tipy - py * bw * 0.1,
    tipx + px * bw * 0.1, tipy + py * bw * 0.1,
    bx + px * bw * 0.55 + dx * len * 0.55, by + py * bw * 0.55 + dy * len * 0.55,
    bx + px * bw, by + py * bw,
    bx - dx * R * 0.2, by - dy * R * 0.2,
  ];
  const earColor = pal.points ?? (g.pattern === 'calico' || g.pattern === 'tortie' ? (side < 0 ? pal.accent : pal.accent2) : pal.base);
  pen.shape(pts, earColor);
  if (!back && !fold) {
    const k = 0.52;
    const ix = bx + dx * len * 0.12, iy = by + dy * len * 0.12;
    const inner = [
      ix - px * bw * k, iy - py * bw * k,
      ix + dx * len * 0.62, iy + dy * len * 0.62,
      ix + px * bw * k, iy + py * bw * k,
    ];
    pen.shape(inner, pal.points ? mix(pal.points, EAR_PINK, 0.35) : EAR_PINK, pen.lw * 0.6, rgba('#4a3a34', 0.5));
  }
}

function drawEye(pen: Pen, x: number, y: number, rx: number, ry: number, color: string, pose: CatPose, base: string, side: number) {
  const ctx = pen.ctx;
  const lw = pen.lw * 0.9;
  const e = pose.eyes;
  switch (e) {
    case 'happy':
      pen.line([x - rx, y + ry * 0.25, x, y - ry * 0.55, x + rx, y + ry * 0.25], lw * 1.1);
      return;
    case 'closed':
      pen.line([x - rx, y - ry * 0.05, x, y + ry * 0.45, x + rx, y - ry * 0.05], lw * 1.1);
      return;
    case 'blink':
      pen.line([x - rx, y + ry * 0.05, x, y + ry * 0.2, x + rx, y + ry * 0.05], lw * 1.1);
      return;
    case 'squint': {
      const s = side;
      pen.line([x - rx * s, y - ry * 0.45, x + rx * 0.7 * s, y, x - rx * s, y + ry * 0.45], lw * 1.1);
      return;
    }
    case 'heart': {
      const h = ry * 1.05;
      const pts = [x, y + h * 0.75, x - h * 0.95, y - h * 0.05, x - h * 0.55, y - h * 0.65, x, y - h * 0.25, x + h * 0.55, y - h * 0.65, x + h * 0.95, y - h * 0.05];
      pen.shape(pts, '#f27d8f', lw * 0.8);
      return;
    }
    case 'star': {
      const pts: number[] = [];
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? ry * 1.1 : ry * 0.38;
        pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
      }
      pen.shape(pts, '#ffd45e', lw * 0.8);
      return;
    }
  }
  // open-ish eyes
  const wide = e === 'wide';
  const er = wide ? 1.12 : 1;
  const path = pen.ellipse(x, y, rx * er, ry * er, color, lw, pen.ink, 0, 10);
  const lx = pose.lookX * rx * 0.28, ly = pose.lookY * ry * 0.25;
  const pr = wide ? 0.82 : 0.58;
  pen.ctx.fillStyle = PUPIL;
  ctx.beginPath();
  ctx.ellipse(x + lx, y + ly + ry * 0.05, rx * pr * er, ry * (wide ? 0.85 : 0.78) * er, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(x + lx - rx * 0.3, y + ly - ry * 0.32, rx * (wide ? 0.42 : 0.36), 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + lx + rx * 0.32, y + ly + ry * 0.38, rx * 0.17, 0, Math.PI * 2);
  ctx.fill();
  if (e === 'half' || e === 'sleepy') {
    const lid = e === 'sleepy' ? 0.62 : 0.4;
    pen.clip(path, () => {
      ctx.fillStyle = base;
      ctx.fillRect(x - rx * 1.5, y - ry * 1.5, rx * 3, ry * (0.5 + lid * 2));
    });
    const ly2 = y - ry + ry * 2 * lid;
    pen.line([x - rx * 1.05, ly2 + ry * 0.1, x, ly2 - ry * 0.05, x + rx * 1.05, ly2 + ry * 0.1], lw);
  }
}

function drawMouth(pen: Pen, nx: number, ny: number, R: number, k: number, pose: CatPose) {
  const lw = pen.lw * 0.85;
  const m = pose.mouth === 'chew' ? (Math.sin(pose.t * 14) > 0 ? 'w' : 'o') : pose.mouth;
  const w = R * 0.22 * k;
  const top = ny + R * 0.07;
  const drawW = (wide = 1) => {
    pen.line([nx, top - R * 0.02, nx - w * 0.45 * wide, top + R * 0.11, nx - w * wide, top + R * 0.04], lw);
    pen.line([nx, top - R * 0.02, nx + w * 0.45 * wide, top + R * 0.11, nx + w * wide, top + R * 0.04], lw);
  };
  switch (m) {
    case 'w':
      drawW();
      break;
    case 'smile':
      drawW(1.3);
      break;
    case 'flat':
      pen.line([nx - w * 0.6, top + R * 0.1, nx + w * 0.6, top + R * 0.1], lw);
      break;
    case 'o':
      pen.ellipse(nx, top + R * 0.13, R * 0.08, R * 0.09, '#d9737f', lw);
      break;
    case 'blep':
    case 'tongue': {
      const tl = m === 'tongue' ? 0.2 : 0.12;
      pen.ellipse(nx + w * 0.15, top + R * (0.1 + tl * 0.6), R * 0.09, R * tl, '#f0909b', lw * 0.8);
      drawW();
      break;
    }
    case 'open': {
      const pts = [nx - w * 0.75, top + R * 0.06, nx, top + R * 0.02, nx + w * 0.75, top + R * 0.06, nx + w * 0.4, top + R * 0.27, nx - w * 0.4, top + R * 0.27];
      pen.shape(pts, '#c9606e', lw);
      const ctx = pen.ctx;
      ctx.fillStyle = '#f29aa4';
      ctx.beginPath();
      ctx.ellipse(nx, top + R * 0.21, w * 0.35, R * 0.05, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'yawn': {
      const h = R * 0.42;
      const p = pen.ellipse(nx, top + h * 0.55, w * 1.05, h * 0.62, '#b9525f', lw, pen.ink, 0, 10);
      pen.clip(p, () => {
        const ctx = pen.ctx;
        ctx.fillStyle = '#f29aa4';
        ctx.beginPath();
        ctx.ellipse(nx, top + h * 1.0, w * 0.8, h * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
      });
      pen.shape([nx - w * 0.75, top + h * 0.12, nx - w * 0.6, top + h * 0.45, nx - w * 0.45, top + h * 0.12], WHITE, lw * 0.6);
      pen.shape([nx + w * 0.75, top + h * 0.12, nx + w * 0.6, top + h * 0.45, nx + w * 0.45, top + h * 0.12], WHITE, lw * 0.6);
      break;
    }
  }
}

export function drawHead(pen: Pen, g: CatGenes, pal: Pal, R: number, pose: CatPose, opts: HeadOpts = {}) {
  const ctx = pen.ctx;
  const back = !!opts.back;
  const turn = back ? 0 : pose.turn;
  const p2: CatPose = turn === pose.turn ? pose : { ...pose, turn };
  drawEar(pen, g, pal, R, -1, p2, back);
  drawEar(pen, g, pal, R, 1, p2, back);

  const outline = headOutline(R, g.fluff, g.seed);
  const headPath = pen.path(outline, true);
  ctx.fillStyle = pal.base;
  ctx.fill(headPath);
  const rng = new Rng(g.seed * 7 + 3);

  // markings
  pen.clip(headPath, () => {
    const mid = fx(R, 0, turn);
    if (g.pattern === 'calico' || g.pattern === 'tortie') {
      const side = rng.next() < 0.5 ? -1 : 1;
      ctx.fillStyle = side < 0 ? pal.accent2 : pal.accent;
      ctx.fill(pen.path(Pen.ellipsePts(side * R * 0.75 + mid.x * 0.3, -R * 0.55, R * 0.8, R * 0.62, side * 0.4, 7), true, 2));
      if (g.pattern === 'tortie') {
        ctx.fillStyle = pal.accent2;
        ctx.fill(pen.path(Pen.ellipsePts(-side * R * 0.7, R * 0.1, R * 0.45, R * 0.35, 0.3, 7), true, 2));
      }
    }
    if (pal.points && !back) {
      const grd = ctx.createRadialGradient(mid.x, R * 0.25, R * 0.1, mid.x, R * 0.25, R * 0.95);
      grd.addColorStop(0, rgba(pal.points, 0.95));
      grd.addColorStop(0.55, rgba(pal.points, 0.6));
      grd.addColorStop(1, rgba(pal.points, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(-R * 2, -R * 2, R * 4, R * 4);
    }
    if (g.pattern === 'tabby' || g.pattern === 'mackerel' || g.pattern === 'spotted') {
      const c = pal.accent;
      if (g.pattern === 'spotted') {
        for (let i = 0; i < 3; i++) pen.ellipse(mid.x + (i - 1) * R * 0.28, -R * 0.68 + Math.abs(i - 1) * R * 0.08, R * 0.08, R * 0.1, c, 0, null);
      } else if (!back) {
        // forehead "M"
        const w2 = R * 0.12;
        for (let i = -1; i <= 1; i++) {
          const x = mid.x + i * R * 0.26;
          pen.line([x, -R * 0.95, x - i * R * 0.04, -R * (i === 0 ? 0.5 : 0.58)], w2, c, 0.5);
        }
        // cheek stripes
        for (const s of [-1, 1]) {
          const ex = s * R * 1.15 + turn * R * 0.1;
          pen.line([ex, R * 0.02, ex - s * R * 0.32, R * 0.1], R * 0.09, c, 0.5);
          pen.line([ex, R * 0.26, ex - s * R * 0.28, R * 0.3], R * 0.08, c, 0.5);
        }
      } else {
        for (let i = -2; i <= 2; i++) {
          pen.line([i * R * 0.3, -R * 1.0, i * R * 0.28, -R * 0.2 + Math.abs(i) * R * 0.15], R * 0.13, c, 0.5);
        }
      }
    }
    if (!back) {
      if (g.blaze) {
        ctx.fillStyle = pal.white;
        const bx = fx(R, 0, turn).x;
        ctx.fill(pen.path([bx - R * 0.1, -R * 1.0, bx + R * 0.1, -R * 1.0, bx + R * 0.24, R * 0.15, bx, R * 0.4, bx - R * 0.24, R * 0.15], true, 1));
      }
      if (g.white > 0.3 || g.pattern === 'tuxedo') {
        const m = fx(R, 0, turn);
        ctx.fillStyle = pal.white;
        ctx.fill(pen.path(Pen.ellipsePts(m.x, R * 0.55, R * 0.52 * (0.6 + m.k * 0.4), R * 0.42, 0, 8), true, 1));
      }
    }
  });
  pen.fillStroke(headPath, null);

  if (back) return;

  // face
  const eyeY = R * 0.04 + pose.lookY * R * 0.03;
  const el = fx(R, -0.52, turn), er = fx(R, 0.52, turn), no = fx(R, 0, turn);
  const erx = R * 0.2, ery = R * 0.25;
  // blush
  ctx.fillStyle = `rgba(242,135,150,${0.22 + pose.blush * 0.38})`;
  for (const e of [el, er]) {
    ctx.beginPath();
    ctx.ellipse(e.x + (e === el ? -1 : 1) * R * 0.08, R * 0.36, R * 0.17 * e.k, R * 0.085, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (pose.coverEyes > 0.5) {
    // paws over eyes (sleep quirk)
    pen.ellipse(no.x, eyeY + R * 0.05, R * 0.62, R * 0.26, g.socks ? WHITE : pal.base);
    pen.line([no.x - R * 0.2, eyeY - R * 0.05, no.x - R * 0.2, eyeY + R * 0.12], pen.lw * 0.6);
    pen.line([no.x + R * 0.2, eyeY - R * 0.05, no.x + R * 0.2, eyeY + R * 0.12], pen.lw * 0.6);
  } else {
    drawEye(pen, el.x, eyeY, erx * el.k, ery, g.eye, pose, pal.points ? mix(pal.base, pal.points, 0.7) : pal.base, -1);
    drawEye(pen, er.x, eyeY, erx * er.k, ery, g.eye2, pose, pal.points ? mix(pal.base, pal.points, 0.7) : pal.base, 1);
  }
  // nose
  const ny = R * 0.3;
  const nw = R * 0.1 * (0.7 + no.k * 0.3);
  pen.shape([no.x - nw, ny - R * 0.03, no.x + nw, ny - R * 0.03, no.x, ny + R * 0.08], g.nose, pen.lw * 0.75, pen.ink, 0.3);
  drawMouth(pen, no.x, ny, R, no.k, pose);
  // whiskers
  const wc = rgba('#4a3a34', 0.45);
  for (const s of [-1, 1]) {
    const far = (s < 0 && turn > 0.15) || (s > 0 && turn < -0.15);
    const L = R * (far ? 0.38 : 0.6);
    const sx = no.x + s * R * 0.42 * (s < 0 ? el.k : er.k);
    for (let i = 0; i < 3; i++) {
      const yy = ny + R * (0.02 + i * 0.09);
      pen.line([sx, yy, sx + s * L * 0.55, yy - R * 0.02 + i * R * 0.03, sx + s * L, yy + (i - 1) * R * 0.08], pen.lw * 0.5, wc, 0.4);
    }
  }
}

// ---------- body patterns ----------
function bodyMarkings(pen: Pen, g: CatGenes, pal: Pal, path: Path2D, bx: number, by: number, bw: number, bh: number, mode: 'side' | 'front' | 'back' | 'curl') {
  const ctx = pen.ctx;
  const rng = new Rng(g.seed * 13 + 1);
  pen.clip(path, () => {
    if (g.pattern === 'calico' || g.pattern === 'tortie') {
      const n = g.pattern === 'tortie' ? 7 : 4;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i % 2 === 0 ? pal.accent : pal.accent2;
        const px = bx + rng.range(-0.5, 0.5) * bw * 1.6;
        const py = by + rng.range(-0.6, 0.3) * bh;
        const r = rng.range(0.25, 0.45) * Math.min(bw, bh) * (g.pattern === 'tortie' ? 0.8 : 1.2);
        ctx.fill(pen.path(Pen.ellipsePts(px, py, r * rng.range(1, 1.6), r, rng.range(0, 3), 7), true, 2));
      }
    }
    if (g.pattern === 'tabby' || g.pattern === 'mackerel') {
      const n = g.pattern === 'mackerel' ? 7 : 5;
      const w = g.pattern === 'mackerel' ? bw * 0.07 : bw * 0.11;
      for (let i = 0; i < n; i++) {
        const t = (i + 0.5) / n;
        if (mode === 'side' || mode === 'curl') {
          const x = bx - bw + t * bw * 2;
          pen.line([x + bw * 0.04, by - bh * 1.1, x, by - bh * 0.55, x - bw * 0.08, by - bh * 0.05], w, pal.accent, 0.6);
        } else {
          const y = by - bh + t * bh * 1.6;
          for (const s of [-1, 1]) {
            pen.line([bx + s * bw * 1.1, y, bx + s * bw * 0.72, y + bh * 0.04, bx + s * bw * 0.5, y + bh * 0.12], w, pal.accent, 0.6);
          }
          if (mode === 'back') pen.line([bx - bw * 0.25, y - bh * 0.05, bx, y + bh * 0.03, bx + bw * 0.25, y - bh * 0.05], w * 0.9, pal.accent, 0.6);
        }
      }
    }
    if (g.pattern === 'spotted') {
      for (let i = 0; i < 9; i++) {
        const px = bx + rng.range(-1, 1) * bw * 0.9;
        const py = by + rng.range(-1, 0.4) * bh;
        pen.ellipse(px, py, bw * 0.08, bw * 0.065, pal.accent, 0, null, rng.range(0, 3), 6);
      }
    }
    if (pal.points && mode !== 'front') {
      const grd = ctx.createLinearGradient(bx - bw, 0, bx + bw, 0);
      grd.addColorStop(0, rgba(pal.points, mode === 'side' ? 0.35 : 0.15));
      grd.addColorStop(0.5, rgba(pal.points, 0));
      ctx.fillStyle = grd;
      ctx.fillRect(bx - bw * 1.5, by - bh * 2, bw * 3, bh * 3);
    }
  });
}

// ---------- tail ----------
function tailPoints(base: [number, number], ang0: number, segLen: number, curl: number, swish: number, t: number, n = 7, phaseOff = 0): number[] {
  const pts: number[] = [base[0], base[1]];
  let x = base[0], y = base[1], a = ang0;
  for (let i = 1; i < n; i++) {
    const k = i / (n - 1);
    a += curl * 0.32 * k + Math.sin(t * 2.2 - i * 0.55 + phaseOff) * swish * 0.22 * k;
    x += Math.cos(a) * segLen;
    y += Math.sin(a) * segLen;
    pts.push(x, y);
  }
  return pts;
}

function drawTail(pen: Pen, g: CatGenes, pal: Pal, pts: number[], R: number) {
  const fluff = 1 + g.fluff * 0.5;
  const w0 = R * 0.4 * fluff, w1 = R * 0.26 * fluff;
  const patched = g.pattern === 'calico' || g.pattern === 'tortie';
  const color = pal.points ?? (patched ? ((g.seed & 1) ? pal.accent : pal.accent2) : pal.base);
  const striped = g.pattern === 'tabby' || g.pattern === 'mackerel' || g.pattern === 'spotted';
  pen.taperTube(pts, w0, w1, color, {
    stripe: striped
      ? { color: pal.accent, on: R * 0.2, off: R * 0.26, phase: R * 0.1 }
      : patched
        ? { color: (g.seed & 1) ? pal.accent2 : pal.accent, on: R * 0.8, off: R * 1.5, phase: R * 0.6 }
        : undefined,
    tip: g.white > 0.6 ? { color: WHITE, len: R * 0.6 } : striped ? { color: pal.accent, len: R * 0.3 } : undefined,
  });
}

function paw(pen: Pen, x: number, y: number, R: number, color: string, toes = true, rot = 0) {
  pen.ellipse(x, y, R * 0.25, R * 0.16, color, pen.lw * 0.95, pen.ink, rot, 8);
  if (toes) {
    const c = rgba('#4a3a34', 0.6);
    for (const s of [-1, 1]) pen.line([x + s * R * 0.07, y - R * 0.09, x + s * R * 0.07, y - R * 0.01], pen.lw * 0.55, c, 0.2);
  }
}

// ---------- views ----------
function drawFront(pen: Pen, g: CatGenes, pal: Pal, pose: CatPose, R: number, bodyK: number, back: boolean, outfit: string[]) {
  const ctx = pen.ctx;
  const c = g.chonk;
  const sit = pose.sitH;
  const beg = pose.beg;
  const breathe = 1 + pose.breathe * 0.03;
  const bw = R * (0.98 + 0.32 * (1 - sit)) * c * bodyK * breathe;
  const bh = R * (1.0 + 0.85 * sit + 0.7 * beg) * bodyK;
  const nw = R * (0.6 + 0.3 * (1 - sit)) * c * bodyK;
  const legX = R * 0.34 * bodyK;
  const t = pose.t;
  const tailColor = pal.points ?? pal.base;

  // tail behind (up)
  const tailUp = pose.tailUp > 0.5;
  const side = back ? -1 : 1;
  if (tailUp && !back) {
    const pts = tailPoints([bw * 0.55 * side, -bh * 0.25], -Math.PI / 2 + 0.35 * side, R * 0.35 * g.tail, -pose.tailCurl * side, pose.tailSwish, t);
    drawTail(pen, g, pal, pts, R);
  }

  // rear feet for beg pose
  if (beg > 0.3) {
    paw(pen, -bw * 0.55, -R * 0.08, R, g.socks ? WHITE : (pal.points ?? pal.base), true);
    paw(pen, bw * 0.55, -R * 0.08, R, g.socks ? WHITE : (pal.points ?? pal.base), true);
  }

  // body
  const lift = beg * R * 0.15;
  const pts = [
    0, lift + R * 0.02,
    bw * 0.88, lift,
    bw * 1.06, -bh * 0.2,
    bw * (0.98 - beg * 0.2), -bh * 0.52,
    nw * 1.08, -bh * 0.84,
    nw * 0.55, -bh,
    -nw * 0.55, -bh,
    -nw * 1.08, -bh * 0.84,
    -bw * (0.98 - beg * 0.2), -bh * 0.52,
    -bw * 1.06, -bh * 0.2,
    -bw * 0.88, lift,
  ];
  if (g.fluff > 0.4 && !back) {
    // chest ruff
    pts.splice(10, 0, nw * 0.3, -bh * 0.98);
  }
  const body = pen.path(pts, true);
  ctx.fillStyle = pal.base;
  ctx.fill(body);
  bodyMarkings(pen, g, pal, body, 0, -bh * 0.5, bw, bh * 0.5, back ? 'back' : 'front');
  if (!back && (g.white > 0.12 || pal.points)) {
    pen.clip(body, () => {
      ctx.fillStyle = pal.points ? shade(pal.base, 0.15) : pal.white;
      const ww = bw * Math.min(0.95, 0.32 + g.white * 0.75);
      ctx.fill(pen.path(Pen.ellipsePts(0, -bh * 0.48 + R * 0.1, ww, bh * (0.42 + g.white * 0.3), 0, 8), true, 1.5));
    });
  }
  pen.fillStroke(body, null);
  // haunch lines
  if (sit > 0.45 && beg < 0.3) {
    const hc = rgba('#4a3a34', 0.55);
    for (const s of [-1, 1]) {
      pen.line([s * bw * 0.9, -bh * 0.48, s * bw * 0.58, -bh * 0.2, s * bw * 0.55, -R * 0.04], pen.lw * 0.75, hc, 0.6);
    }
  }
  // belly/back texture
  if (back) {
    pen.line([0, -bh * 0.92, 0, -bh * 0.35], pen.lw * 0.5, rgba('#4a3a34', 0.25), 0.6);
  }

  // front legs
  if (!back) {
    const legColor = pal.points ?? (g.white > 0.35 ? pal.white : pal.base);
    const pawColor = g.socks ? WHITE : legColor;
    const legW = R * 0.4 * bodyK;
    const topY = -bh * 0.6;
    for (const s of [-1, 1]) {
      const raise = s < 0 ? pose.pawL : pose.pawR;
      const groomSide = s > 0 ? pose.groom : 0;
      let fx2 = s * legX, fy = -R * 0.1 - raise * R * 0.55 + lift;
      if (sit < 0.4) fy = -R * 0.08; // loaf: paws peek out
      if (beg > 0.3) {
        fx2 = s * R * 0.3 * bodyK;
        fy = -bh * 0.7 - raise * R * 0.2;
      }
      if (groomSide > 0.01) {
        const hx = pose.headDX * R, hy = -bh - R * 0.55 + pose.headDY * R;
        fx2 = fx2 + (hx + R * 0.15 - fx2) * groomSide;
        fy = fy + (hy + R * 0.6 - fy) * groomSide;
      }
      const showLeg = (sit >= 0.4 && beg <= 0.3) || groomSide > 0.01;
      if (showLeg) {
        const tx = s * legX * 1.05;
        const dx = fx2 - tx, dy = fy - topY;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;
        const hw = legW / 2;
        ctx.fillStyle = legColor;
        ctx.fill(pen.path([tx - nx * hw, topY - ny * hw, tx + nx * hw, topY + ny * hw, fx2 + nx * hw, fy + ny * hw, fx2 - nx * hw, fy - ny * hw], true, 0.2, 0));
        if (g.socks && !pal.points) {
          ctx.fillStyle = WHITE;
          const k = 0.62;
          const mx = tx + dx * k, my = topY + dy * k;
          ctx.fill(pen.path([mx - nx * hw, my - ny * hw, mx + nx * hw, my + ny * hw, fx2 + nx * hw, fy + ny * hw, fx2 - nx * hw, fy - ny * hw], true, 0.2, 0));
        }
        for (const e of [-1, 1]) {
          const ox = nx * e * hw, oy = ny * e * hw;
          const outer = ox * s > 0;
          const st = groomSide > 0.01 ? 0.25 : outer ? 0.38 : 0.1;
          pen.line([tx + ox + dx * st, topY + oy + dy * st, tx + ox + dx * 0.97, topY + oy + dy * 0.97], pen.lw * 0.95, pen.ink, 0.4);
        }
      }
      if (beg > 0.3) {
        pen.tube([s * R * 0.6 * bodyK, -bh * 0.8, s * R * 0.45 * bodyK, -bh * 0.74, fx2, fy], legW * 0.9, legColor);
        pen.ellipse(fx2, fy + R * 0.04, R * 0.2, R * 0.17, pawColor, pen.lw * 0.9, pen.ink, 0, 8);
      } else {
        paw(pen, fx2, fy, R * bodyK, pawColor, true);
      }
    }
  }

  // tail wrapped in front / or lying on floor behind (back view)
  if (!tailUp || back) {
    const sw = Math.sin(t * 1.6) * pose.tailSwish;
    const baseX = bw * 0.8 * side;
    const pts2 = back
      ? [0, -R * 0.15, bw * 0.6, R * 0.05, bw * 1.3, R * 0.02 - sw * R * 0.15, bw * 1.7 + sw * R * 0.2, -R * 0.35 - Math.abs(sw) * R * 0.4]
      : [baseX, -R * 0.25, bw * 0.75, R * 0.04, bw * 0.15, R * 0.12, -bw * 0.45, R * 0.05, -bw * 0.75 + sw * R * 0.15, -R * 0.2 - Math.abs(sw) * R * 0.2];
    drawTail(pen, g, pal, pts2.map((v) => v), R);
  }

  // neckwear under head
  const hx = pose.headDX * R;
  const hy = -bh - R * 0.55 + pose.headDY * R + pose.headDown * R * 0.95;
  if (!back) drawNeckwear(pen, outfit, 0, -bh + R * 0.05, R * bodyK, 0);

  ctx.save();
  ctx.translate(hx, hy);
  ctx.rotate(pose.headTilt);
  drawHead(pen, g, pal, R, { ...pose, turn: back ? 0 : pose.turn }, { back });
  drawHeadwear(pen, outfit, R, back);
  if (!back) drawFacewear(pen, outfit, R, pose.turn);
  ctx.restore();
}

function drawSide(pen: Pen, g: CatGenes, pal: Pal, pose: CatPose, R: number, bodyK: number, outfit: string[]) {
  const ctx = pen.ctx;
  const c = g.chonk;
  const t = pose.t;
  const run = pose.gait > 1.5;
  const L = R * bodyK;
  const legLen = L * (0.78 - pose.crouch * 0.45);
  const T = R * 0.7 * c * bodyK * (1 + pose.breathe * 0.02);
  const air = pose.air * R;
  const by = -(legLen + T * 0.62) - air;
  const moving = Math.min(1, pose.gait);
  // gallop: the body stretches and bunches; walk: a gentle rocking
  const halfLen = L * 0.92 * (run ? 1.1 + Math.sin(pose.phase) * 0.07 : 1);
  const tilt = pose.tilt + pose.standUp * 1.15 + Math.sin(pose.phase * 2) * 0.03 * moving * (run ? 2 : 1);
  const ct = Math.cos(tilt), st = Math.sin(tilt);
  // body local -> world (pivot at hip when standing up, center otherwise)
  const pivotX = -halfLen * pose.standUp, pivotY = by;
  const tr = (lx: number, ly: number): [number, number] => {
    const x = lx - pivotX, y = ly;
    return [pivotX + x * ct + y * st, pivotY + (-x * st + y * ct)];
  };
  const bounce = pose.gait > 0.5 ? Math.abs(Math.sin(pose.phase)) * R * (run ? 0.12 : 0.05) : 0;
  const B = (lx: number, ly: number) => {
    const p = tr(lx, ly);
    p[1] -= bounce;
    return p;
  };
  const S = B(halfLen * 0.72, -pose.reach * T * 0.3);
  const H = B(-halfLen * 0.82, 0);

  const stride = pose.gait > 1.5 ? R * 0.85 : R * 0.42;
  const liftH = pose.gait > 1.5 ? R * 0.42 : R * 0.26;
  const ph = pose.phase;
  const legs = [
    { front: true, near: false, off: Math.PI },
    { front: false, near: false, off: 0 },
    { front: true, near: true, off: 0 },
    { front: false, near: true, off: Math.PI },
  ];
  if (run) {
    legs[0].off = 0.5; legs[2].off = 0; legs[1].off = Math.PI; legs[3].off = Math.PI + 0.5;
  }
  const footOf = (front: boolean, off: number): [number, number] => {
    const j = front ? S : H;
    let x = j[0] + (front ? L * 0.08 + pose.reach * L * 1.1 : L * 0.05);
    let y = -air;
    if (pose.gait > 0.05) {
      const a = ph + off;
      x += Math.sin(a) * stride * Math.min(1, pose.gait);
      y -= Math.max(0, Math.cos(a)) * liftH * Math.min(1, pose.gait);
    }
    if (pose.air > 0.2) {
      x += front ? L * 0.5 : -L * 0.5;
      y = j[1] + legLen * 0.75;
    }
    if (front && pose.standUp > 0.05) {
      const up = pose.standUp;
      const sw = pose.pawLift * Math.sin(t * 9 + off) * L * 0.25;
      x = x + (j[0] + L * 0.55 - x) * up;
      y = y + (j[1] - L * 0.5 + sw - y) * up;
    }
    if (!front && pose.wiggle > 0) x += Math.sin(t * 16) * pose.wiggle * L * 0.06;
    return [x, y];
  };

  // tail (behind body)
  const tailBase = B(-halfLen * 1.02, -T * 0.35);
  const tUp = pose.tailUp;
  const ang0 = Math.PI * (0.9 + tUp * 0.5) - tilt;
  const tpts = tailPoints(tailBase, ang0 + Math.PI * 0, L * 0.33 * g.tail, pose.tailCurl * (tUp > 0.4 ? 1 : -0.4), pose.tailSwish + (pose.gait > 0.5 ? 0.25 : 0), t);
  drawTail(pen, g, pal, tpts, R);

  const legColor = pal.points ?? pal.base;
  const farColor = shade(legColor, -0.14);
  const legW = R * 0.38 * bodyK * (0.95 + c * 0.05);
  const drawLeg = (leg: (typeof legs)[number]) => {
    const j = leg.front ? S : H;
    const jx = j[0] + (leg.near ? 0 : (leg.front ? -L * 0.12 : L * 0.1));
    const jy = j[1] + T * 0.25;
    const f = footOf(leg.front, leg.off);
    const fxp = f[0] + (leg.near ? 0 : (leg.front ? -L * 0.1 : L * 0.08));
    const fyp = f[1] - R * 0.1;
    // knees: rear legs bend backwards at the hock, front legs bend a little forward while lifting
    const lift = Math.max(0, -(fyp + R * 0.1)) / (R * 0.4);
    const mx = (jx + fxp) / 2 + (leg.front ? L * (0.02 + lift * 0.12) : -L * 0.17);
    const my = (jy + fyp) / 2;
    const col = leg.near ? legColor : farColor;
    const pc = g.socks ? (leg.near ? WHITE : shade(WHITE, -0.1)) : col;
    const legLenNow = Math.hypot(mx - jx, my - jy) + Math.hypot(fxp - mx, fyp - my);
    pen.taperTube([jx, jy, mx, my, fxp, fyp], legW * 1.12, legW * 0.8, col, { tip: g.socks ? { color: pc, len: legLenNow * 0.4 } : undefined });
    pen.ellipse(fxp + R * 0.08, fyp + R * 0.03, R * 0.24, R * 0.14, pc, pen.lw * 0.9);
  };
  drawLeg(legs[0]);
  drawLeg(legs[1]);

  // body
  const rear = B(-halfLen * 1.05, 0);
  const pts: number[] = [];
  const P = (lx: number, ly: number) => {
    const p = B(lx, ly);
    pts.push(p[0], p[1]);
  };
  P(-halfLen * 1.12, -T * 0.25);
  P(-halfLen * 0.75, -T * 0.92);
  P(0, -T * (1.0 - pose.reach * 0.2));
  P(halfLen * 0.75, -T * 0.92);
  P(halfLen * 1.05, -T * 0.1);
  P(halfLen * 0.75, T * 0.85);
  P(0, T * 0.98);
  P(-halfLen * 0.6, T * 0.92);
  P(-halfLen * 1.05, T * 0.45);
  void rear;
  const body = pen.path(pts, true);
  ctx.fillStyle = pal.base;
  ctx.fill(body);
  const mid = B(0, 0);
  bodyMarkings(pen, g, pal, body, mid[0], mid[1], halfLen, T, 'side');
  if (g.white > 0.12) {
    pen.clip(body, () => {
      ctx.fillStyle = pal.white;
      const wpts: number[] = [];
      const hgt = T * Math.min(1.6, 0.4 + g.white * 1.4);
      for (const [lx, ly] of [[halfLen * 1.2, T * 1.2], [halfLen * 1.1, T - hgt * 0.9], [0, T - hgt], [-halfLen * 0.9, T - hgt * 0.7], [-halfLen * 1.2, T * 1.2]] as const) {
        const p = B(lx, ly);
        wpts.push(p[0], p[1]);
      }
      ctx.fill(pen.path(wpts, true, 1.5));
    });
  }
  pen.fillStroke(body, null);
  // haunch line
  pen.line([...B(-halfLen * 0.25, T * 0.75), ...B(-halfLen * 0.45, -T * 0.2), ...B(-halfLen * 0.85, -T * 0.35)], pen.lw * 0.7, rgba('#4a3a34', 0.45), 0.5);

  drawLeg(legs[2]);
  drawLeg(legs[3]);

  // head
  const hx0 = S[0] + L * 0.55 + pose.headDX * R;
  // head bobs on every step, a beat after the body
  const bob = Math.sin(pose.phase * 2 + 0.6) * R * (run ? 0.07 : 0.045) * moving;
  const hy0 = S[1] - T * 0.65 - R * 0.42 + pose.headDY * R + pose.crouch * R * 0.35 + pose.reach * R * 0.5 + bob;
  drawNeckwear(pen, outfit, S[0] + L * 0.3, S[1] - T * 0.55, R * bodyK, 0.6);
  ctx.save();
  ctx.translate(hx0, hy0);
  ctx.rotate(pose.headTilt - tilt * 0.4 + Math.sin(pose.phase * 2) * 0.03 * moving);
  drawHead(pen, g, pal, R, pose);
  drawHeadwear(pen, outfit, R, false);
  drawFacewear(pen, outfit, R, pose.turn);
  ctx.restore();
}

function drawCurl(pen: Pen, g: CatGenes, pal: Pal, pose: CatPose, R: number, bodyK: number, outfit: string[]) {
  const ctx = pen.ctx;
  const b = 1 + pose.breathe * 0.04;
  const rx = R * 1.55 * g.chonk * bodyK, ry = R * 0.95 * bodyK * b;
  const cy = -ry;
  const pts = [
    -rx, cy + ry * 0.15,
    -rx * 0.75, cy - ry * 0.75,
    0, cy - ry * 1.02,
    rx * 0.75, cy - ry * 0.8,
    rx * 1.02, cy + ry * 0.1,
    rx * 0.7, cy + ry * 0.95,
    0, cy + ry,
    -rx * 0.75, cy + ry * 0.92,
  ];
  const body = pen.path(pts, true);
  ctx.fillStyle = pal.base;
  ctx.fill(body);
  bodyMarkings(pen, g, pal, body, 0, cy + ry * 0.2, rx, ry, 'curl');
  pen.fillStroke(body, null);
  // spine curl hint
  pen.line([rx * 0.55, cy - ry * 0.35, rx * 0.15, cy - ry * 0.55, -rx * 0.35, cy - ry * 0.45], pen.lw * 0.55, rgba('#4a3a34', 0.3), 0.6);
  // head tucked
  ctx.save();
  ctx.translate(-rx * 0.42, cy + ry * 0.22);
  ctx.rotate(0.28 + Math.sin(pose.t * 0.8) * 0.02);
  drawHead(pen, g, pal, R * 0.95, { ...pose, turn: -0.1 });
  drawHeadwear(pen, outfit, R * 0.95, false);
  ctx.restore();
  // tail wrapping the front
  const sw = Math.sin(pose.t * 0.9) * pose.tailSwish * R * 0.15;
  drawTail(pen, g, pal, [rx * 0.95, cy + ry * 0.35, rx * 0.65, cy + ry * 0.92, 0, cy + ry * 1.05, -rx * 0.55, cy + ry * 0.95, -rx * 0.95 + sw, cy + ry * 0.55], R);
}

function drawBelly(pen: Pen, g: CatGenes, pal: Pal, pose: CatPose, R: number, bodyK: number, outfit: string[]) {
  const ctx = pen.ctx;
  const t = pose.t;
  const w = pose.wiggle;
  const rx = R * 1.45 * g.chonk * bodyK, ry = R * 0.78 * bodyK * (1 + pose.breathe * 0.03);
  const cy = -ry;
  const roll = Math.sin(t * 3) * w * 0.08;
  ctx.save();
  ctx.rotate(roll);
  // tail
  drawTail(pen, g, pal, tailPoints([-rx * 0.95, cy + ry * 0.2], Math.PI * 0.98, R * 0.35 * g.tail, -0.6, pose.tailSwish + 0.2, t), R);
  // far paws
  const legColor = pal.points ?? pal.base;
  const padC = g.socks ? WHITE : legColor;
  const pawUp = (x0: number, ang: number, i: number) => {
    const wig = Math.sin(t * 5 + i * 1.7) * w * 0.25;
    const len = R * 0.75;
    const a = ang + wig;
    const ex = x0 + Math.cos(a) * len, ey = cy - ry * 0.55 + Math.sin(a) * len;
    pen.tube([x0, cy - ry * 0.2, (x0 + ex) / 2, (cy - ry * 0.2 + ey) / 2 - R * 0.05, ex, ey], R * 0.38, i < 2 ? shade(legColor, -0.1) : legColor);
    pen.ellipse(ex, ey - R * 0.02, R * 0.21, R * 0.19, padC, pen.lw * 0.9);
    ctx.fillStyle = PAD_PINK;
    ctx.beginPath();
    ctx.ellipse(ex, ey - R * 0.0, R * 0.09, R * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();
  };
  pawUp(rx * 0.25, -Math.PI / 2 - 0.15, 0);
  pawUp(-rx * 0.62, -Math.PI / 2 + 0.25, 1);
  const pts = Pen.ellipsePts(0, cy, rx, ry, 0, 10);
  const body = pen.path(pts, true);
  ctx.fillStyle = pal.base;
  ctx.fill(body);
  bodyMarkings(pen, g, pal, body, 0, cy + ry * 0.5, rx, ry, 'side');
  pen.clip(body, () => {
    ctx.fillStyle = pal.belly;
    ctx.fill(pen.path(Pen.ellipsePts(-rx * 0.05, cy - ry * 0.55, rx * 0.78, ry * 0.62, 0, 8), true, 1.5));
  });
  pen.fillStroke(body, null);
  pawUp(rx * 0.48, -Math.PI / 2 + 0.2, 2);
  pawUp(-rx * 0.38, -Math.PI / 2 - 0.25, 3);
  // head upside-down-ish
  ctx.save();
  ctx.translate(rx * 1.02, cy + ry * 0.05);
  ctx.rotate(Math.PI * 0.62 + Math.sin(t * 2) * w * 0.1);
  drawHead(pen, g, pal, R, { ...pose, turn: 0 });
  drawHeadwear(pen, outfit, R, false);
  ctx.restore();
  ctx.restore();
}

function drawLie(pen: Pen, g: CatGenes, pal: Pal, pose: CatPose, R: number, bodyK: number, outfit: string[]) {
  const ctx = pen.ctx;
  const t = pose.t;
  const rx = R * 1.6 * g.chonk * bodyK, ry = R * 0.62 * bodyK * (1 + pose.breathe * 0.04);
  const cy = -ry - R * 0.05;
  const legColor = pal.points ?? pal.base;
  const far = shade(legColor, -0.14);
  const pawC = g.socks ? WHITE : legColor;
  drawTail(pen, g, pal, tailPoints([-rx * 0.95, cy + ry * 0.4], Math.PI * 0.96, R * 0.36 * g.tail, -0.5, pose.tailSwish, t, 7), R);
  // far legs
  pen.tube([rx * 0.55, cy + ry * 0.3, rx * 1.05, cy + ry * 0.7, rx * 1.35, cy + ry * 0.85], R * 0.36, far);
  pen.tube([-rx * 0.55, cy + ry * 0.3, -rx * 1.0, cy + ry * 0.75, -rx * 1.3, cy + ry * 0.9], R * 0.38, far);
  const pts = [
    -rx * 1.05, cy + ry * 0.2,
    -rx * 0.6, cy - ry * 0.95,
    rx * 0.2, cy - ry * 1.0,
    rx * 0.95, cy - ry * 0.55,
    rx * 1.05, cy + ry * 0.4,
    rx * 0.3, cy + ry * 1.0,
    -rx * 0.6, cy + ry * 0.98,
  ];
  const body = pen.path(pts, true);
  ctx.fillStyle = pal.base;
  ctx.fill(body);
  bodyMarkings(pen, g, pal, body, 0, cy + ry * 0.3, rx, ry, 'side');
  if (g.white > 0.12) {
    pen.clip(body, () => {
      ctx.fillStyle = pal.white;
      ctx.fill(pen.path(Pen.ellipsePts(rx * 0.1, cy + ry * 0.95, rx * 0.85, ry * (0.3 + g.white * 0.5), 0, 8), true, 1.5));
    });
  }
  pen.fillStroke(body, null);
  // near legs
  pen.tube([rx * 0.45, cy + ry * 0.45, rx * 0.95, cy + ry * 0.85, rx * 1.3, cy + ry * 1.0], R * 0.38, legColor);
  pen.ellipse(rx * 1.32, cy + ry * 1.02, R * 0.22, R * 0.15, pawC);
  pen.tube([-rx * 0.45, cy + ry * 0.5, -rx * 0.95, cy + ry * 0.92, -rx * 1.25, cy + ry * 1.02], R * 0.4, legColor);
  pen.ellipse(-rx * 1.28, cy + ry * 1.05, R * 0.22, R * 0.15, pawC);
  ctx.save();
  ctx.translate(rx * 1.05, cy - ry * 0.25 + Math.sin(t * 0.7) * R * 0.02);
  ctx.rotate(0.35 + pose.headTilt);
  drawHead(pen, g, pal, R, { ...pose, turn: 0.15 });
  drawHeadwear(pen, outfit, R, false);
  ctx.restore();
}

/**
 * Draw a cat with its feet at (0,0). Caller sets translate / flip / scale.
 */
export function drawCat(pen: Pen, g: CatGenes, pose: CatPose, opts: CatDrawOpts) {
  const ctx = pen.ctx;
  const pal = palette(g);
  const age = opts.age;
  const R = R0 * (1.1 - 0.1 * age);
  const bodyK = 0.74 + 0.26 * age;
  const outfit = opts.outfit ?? [];
  if (opts.alpha !== undefined && opts.alpha < 1) ctx.globalAlpha = opts.alpha;
  if (opts.shadow !== false) {
    const sw = pose.view === 'side' ? R * 1.9 : pose.view === 'front' || pose.view === 'back' ? R * 1.35 : R * 1.85;
    const k = 1 / (1 + pose.air * 0.4);
    ctx.fillStyle = 'rgba(74,58,52,0.14)';
    ctx.beginPath();
    ctx.ellipse(pose.view === 'side' ? 0 : 0, R * 0.05, sw * g.chonk * k, R * 0.32 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  switch (pose.view) {
    case 'front':
      drawFront(pen, g, pal, pose, R, bodyK, false, outfit);
      break;
    case 'back':
      drawFront(pen, g, pal, pose, R, bodyK, true, outfit);
      break;
    case 'side':
      drawSide(pen, g, pal, pose, R, bodyK, outfit);
      break;
    case 'curl':
      drawCurl(pen, g, pal, pose, R, bodyK, outfit);
      break;
    case 'belly':
      drawBelly(pen, g, pal, pose, R, bodyK, outfit);
      break;
    case 'lie':
      drawLie(pen, g, pal, pose, R, bodyK, outfit);
      break;
  }
  ctx.globalAlpha = 1;
}

/** Draw just a cat head (used for townsfolk and portraits). Head center at (0,0). */
export function drawCatHead(pen: Pen, g: CatGenes, R: number, pose: CatPose, back = false) {
  drawHead(pen, g, palette(g), R, pose, { back });
}

export function catPalette(g: CatGenes) {
  return palette(g);
}

/** Approximate visual height (for bubbles / hit boxes) in cat units. */
export function catHeight(pose: CatPose, age: number): number {
  const R = R0 * (1.1 - 0.1 * age);
  const k = 0.74 + 0.26 * age;
  switch (pose.view) {
    case 'front':
    case 'back':
      return R * (1.0 + 0.85 * pose.sitH + 0.7 * pose.beg) * k + R * 2.0;
    case 'side':
      return R * 3.2 * k;
    case 'curl':
      return R * 2.3 * k;
    default:
      return R * 2.2 * k;
  }
}

export { hashf };
