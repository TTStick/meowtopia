// Small item icons rendered to data URLs (cached) for the UI.
import { Pen, rgba } from '../engine/pen';
import { ITEM_MAP } from '../../../shared/items';
import { drawFurniture, drawWallItem, drawWallpaper, drawFloor, CELL, HAS_FRONT } from './furniture';
import { drawCat, defaultPose } from './cat';
import { randomGenes } from '../../../shared/genes';
import { collectIcon } from './collect';
import type { CatGenes } from '../../../shared/types';

const cache = new Map<string, string>();
const INK = '#4a3a34';

function foodIcon(pen: Pen, id: string) {
  switch (id) {
    case 'treat_fish':
      pen.ellipse(-2, 0, 11, 6, '#e6a15c');
      pen.shape([8, 0, 15, -6, 15, 6], '#e6a15c');
      pen.ellipse(-8, -1, 1.4, 1.4, '#4a3a34', 0, null);
      break;
    case 'treat_stick':
      pen.shape([-12, 8, 8, -12, 12, -8, -8, 12], '#f6c56b');
      pen.shape([8, -12, 12, -16, 16, -12, 12, -8], '#f2a29a', 1);
      break;
    case 'treat_can':
      pen.shape([-11, -6, 11, -6, 11, 10, -11, 10], '#8fc3e8');
      pen.ellipse(0, -6, 11, 4, '#d8d2c8');
      pen.ellipse(-1, 3, 5, 3, '#ffffff', 0.8);
      break;
    case 'treat_chicken':
      pen.ellipse(0, 0, 12, 8, '#f7e3cf');
      pen.line([-6, -2, 6, -4], 1, 'rgba(74,58,52,0.4)');
      pen.line([-6, 3, 6, 1], 1, 'rgba(74,58,52,0.4)');
      break;
    case 'treat_milk':
      pen.shape([-8, -6, 8, -6, 9, 12, -9, 12], '#ffffff');
      pen.shape([-8, -6, -4, -14, 4, -14, 8, -6], '#8fc3e8');
      break;
  }
}

export function itemIcon(id: string, size = 56): string {
  const key = `${id}|${size}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const def = ITEM_MAP[id];
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = size * dpr;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const pen = new Pen(ctx).begin(7, 0.3, 1.5);
  if (!def) return '';
  if (def.cat === 'furniture') {
    const w = def.w ?? 1, h = def.h ?? 1;
    const tall: Record<string, number> = { lamp: 112, bookshelf: 90, tree_small: 76, tree_big: 104, scratch_post: 82, collection_shelf: 84, teepee: 70, piano: 62, fish_tank: 58, hammock: 52, sofa: 56, kotatsu: 80 };
    const span = Math.max(w * CELL, (tall[id] ?? 0) + 8, h * CELL * 0.8);
    const s = (size * 0.86) / Math.max(span, 60);
    ctx.translate(size / 2, size * 0.86);
    ctx.scale(s, s);
    const d = { pen, t: 0, night: 0, flip: false };
    drawFurniture(id, d, -(w * CELL) / 2, -h * CELL, w, h, 'back');
    if (HAS_FRONT.has(id)) drawFurniture(id, d, -(w * CELL) / 2, -h * CELL, w, h, 'front');
  } else if (def.cat === 'wall') {
    const w = def.w ?? 1;
    const s = (size * 0.9) / Math.max(w * CELL, 120);
    ctx.translate(size / 2, size * 0.98);
    ctx.scale(s, s);
    drawWallItem(id, { pen, t: 0, night: 0, flip: false }, -(w * CELL) / 2, w, { sky: '#a8d6f0', sun: 1, rain: 0, snow: 0, hour: 12 });
  } else if (def.cat === 'wallpaper' || def.cat === 'floor') {
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(4, 4, size - 8, size - 8, 10);
    ctx.clip();
    if (def.cat === 'wallpaper') drawWallpaper(id, pen, 4, 4, size - 8, size - 8);
    else drawFloor(id, pen, 4, 4, size - 8, size - 8);
    ctx.restore();
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.roundRect(4, 4, size - 8, size - 8, 10);
    ctx.stroke();
  } else if (def.cat === 'wear') {
    ctx.translate(size / 2, size * 0.98);
    const s = size / 44;
    ctx.scale(s, s);
    const p = defaultPose();
    p.eyes = 'happy';
    drawCat(pen, ICON_CAT, p, { age: 1, outfit: [id], shadow: false });
  } else {
    ctx.translate(size / 2, size / 2);
    const s = size / 36;
    ctx.scale(s, s);
    if (def.cat === 'food') foodIcon(pen, id);
    else collectIcon(pen, id);
  }
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}

const ICON_CAT: CatGenes = { ...randomGenes(31), base: '#fdfaf4', accent: '#ece6dc', accent2: '#ece6dc', pattern: 'solid', white: 0, blaze: false, eye: '#8fc45a', eye2: '#8fc45a', earFold: false, fluff: 0, chonk: 1 };

/** Portrait of a cat for UI lists (front sitting). */
export function catPortrait(g: CatGenes, outfit: string[] = [], size = 64, age = 1, eyes: 'open' | 'happy' = 'open'): string {
  const key = `cat|${g.seed}|${g.base}|${outfit.join(',')}|${size}|${age.toFixed(2)}|${eyes}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = c.height = size * dpr;
  const ctx = c.getContext('2d')!;
  ctx.scale(dpr, dpr);
  const pen = new Pen(ctx).begin(3, 0.3, 1.6);
  ctx.translate(size / 2, size * 0.94);
  const s = size / 52;
  ctx.scale(s, s);
  const p = defaultPose();
  p.eyes = eyes;
  p.tailUp = 0;
  drawCat(pen, g, p, { age, outfit, shadow: false });
  const url = c.toDataURL();
  cache.set(key, url);
  return url;
}
