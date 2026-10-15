// Cat sprites as PNG, drawn with the game's own line-art code. Used where there
// is no browser to draw in: the Apple Watch app and the Mac menu bar icon.
import { createHash } from 'node:crypto';
import type { CatGenes } from '../../shared/types';
import { Pen } from '../../client/src/engine/pen';
import { drawCat, defaultPose, type CatPose } from '../../client/src/art/cat';

export const FRAMES: Record<string, (p: CatPose) => void> = {
  sit: (p) => ((p.tailUp = 1), (p.tailCurl = 0.3)),
  sit2: (p) => ((p.tailUp = 1), (p.tailCurl = 0.9), (p.headTilt = 0.06)),
  blink: (p) => ((p.eyes = 'closed'), (p.tailUp = 1), (p.tailCurl = 0.3)),
  happy: (p) => ((p.eyes = 'happy'), (p.mouth = 'open'), (p.blush = 1), (p.headTilt = -0.1), (p.tailUp = 1)),
  meow: (p) => ((p.mouth = 'open'), (p.headTilt = 0.12), (p.ear = 0.2), (p.tailUp = 1)),
  groom: (p) => ((p.groom = 1), (p.eyes = 'closed'), (p.mouth = 'tongue'), (p.headTilt = 0.2)),
  loaf: (p) => ((p.sitH = 0), (p.eyes = 'half')),
  yawn: (p) => ((p.eyes = 'closed'), (p.mouth = 'yawn'), (p.headTilt = -0.1)),
  beg: (p) => ((p.beg = 1), (p.eyes = 'wide'), (p.lookY = -1)),
  eat: (p) => ((p.sitH = 0.6), (p.headDown = 0.55), (p.eyes = 'closed'), (p.mouth = 'chew')),
  sleep1: (p) => ((p.view = 'curl'), (p.eyes = 'closed'), (p.breathe = -1)),
  sleep2: (p) => ((p.view = 'curl'), (p.eyes = 'closed'), (p.breathe = 1)),
};

const SIZES = [32, 44, 64, 96, 128, 160, 200, 256, 320];
export function snapSize(n: number): number {
  return SIZES.find((s) => s >= n) ?? SIZES[SIZES.length - 1];
}

export interface SpriteSpec {
  genes: CatGenes;
  outfit: string[];
  age: number;
  frame: string;
  size: number;
  outline: boolean; // white sticker border so the cat reads on dark backgrounds
}

export function spriteKey(s: SpriteSpec): string {
  const raw = JSON.stringify([s.genes, [...s.outfit].sort(), Math.round(s.age * 20) / 20, s.frame, s.size, s.outline]);
  return createHash('sha1').update(raw).digest('base64url').slice(0, 20);
}

type Canvas = { getContext(t: '2d'): any; toBuffer(t: 'image/png'): Buffer };
let canvasMod: { createCanvas(w: number, h: number): Canvas } | null | undefined;
async function canvasLib() {
  if (canvasMod !== undefined) return canvasMod;
  try {
    const m = await import('@napi-rs/canvas');
    (globalThis as { Path2D?: unknown }).Path2D ??= m.Path2D; // the pen draws with Path2D
    canvasMod = m as never;
  } catch (e) {
    console.warn('[sprites] canvas unavailable:', (e as Error).message);
    canvasMod = null;
  }
  return canvasMod;
}

const cache = new Map<string, Buffer>();
const CACHE_MAX = 800;

export async function renderSprite(s: SpriteSpec): Promise<Buffer | null> {
  const key = spriteKey(s);
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key); // keep recently used ones at the end
    cache.set(key, hit);
    return hit;
  }
  const lib = await canvasLib();
  if (!lib) return null;
  const S = s.size;
  const cat = lib.createCanvas(S, S);
  const ctx = cat.getContext('2d');
  const pose = defaultPose();
  pose.view = 'front';
  FRAMES[s.frame]?.(pose);
  // thin lines vanish at small sizes, so thicken them a little there
  const lw = 1.7 * Math.max(1, Math.sqrt(96 / S));
  const pen = new Pen(ctx).begin(7, 0.22, lw);
  ctx.save();
  const k = (S / 52) * (s.outline ? 0.9 : 1);
  ctx.translate(S / 2, S * (s.outline ? 0.9 : 0.94));
  ctx.scale(k, k);
  drawCat(pen, s.genes, pose, { age: s.age, outfit: s.outfit, shadow: false });
  ctx.restore();

  let out = cat;
  if (s.outline) {
    // a cream silhouette, stamped around the cat, then the cat on top
    const sil = lib.createCanvas(S, S);
    const sc = sil.getContext('2d');
    sc.drawImage(cat, 0, 0);
    sc.globalCompositeOperation = 'source-in';
    sc.fillStyle = '#fff8ec';
    sc.fillRect(0, 0, S, S);
    out = lib.createCanvas(S, S);
    const oc = out.getContext('2d');
    const r = Math.max(1.5, S / 40);
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      oc.drawImage(sil, Math.cos(a) * r, Math.sin(a) * r);
    }
    oc.drawImage(cat, 0, 0);
  }
  const png = out.toBuffer('image/png');
  cache.set(key, png);
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value!);
  return png;
}
