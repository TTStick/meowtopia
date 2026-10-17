// Shop furniture for the rooms inside the town's buildings, in the nest's line-art
// style and the nest's units: x,y is the footprint's top-left corner in CELLs, and
// things stand on the footprint's bottom edge.
import { Pen, shade, rgba } from '../engine/pen';
import { hashf } from '../../../shared/rng';
import { CELL, WALL_H, type DrawCtx } from './furniture';

const INK = '#4a3a34';
const WOOD = '#dcb58a';
const WOOD_D = '#b98d61';
const CREAM = '#fbf3e3';
const BREAD = '#e9b46a';

type PDraw = (d: DrawCtx, x: number, y: number, w: number, h: number, v: number) => void;

/** A box seen from the front: front face plus a slanted top. */
function box(pen: Pen, x: number, top: number, w: number, bottom: number, depth: number, front: string, lid: string) {
  pen.poly([x, top, x + w, top, x + w, bottom, x, bottom], front, undefined, undefined, 0.25);
  pen.poly([x, top, x + depth * 0.3, top - depth, x + w - depth * 0.3, top - depth, x + w, top], lid, undefined, undefined, 0.25);
}

function loaf(pen: Pen, x: number, y: number, kind: number) {
  if (kind === 0) {
    pen.ellipse(x, y, 9, 5.5, BREAD, 1.1);
    pen.line([x - 3, y - 4, x - 1, y + 1], 1, rgba(INK, 0.5));
    pen.line([x + 2, y - 4, x + 4, y + 1], 1, rgba(INK, 0.5));
  } else if (kind === 1) {
    // croissant
    pen.shape([x - 9, y + 2, x - 5, y - 4, x, y - 6, x + 5, y - 4, x + 9, y + 2, x, y], '#efc27a', 1.1);
    pen.line([x - 3, y - 4, x - 2, y], 0.9, rgba(INK, 0.5));
    pen.line([x + 3, y - 4, x + 2, y], 0.9, rgba(INK, 0.5));
  } else {
    // a fish-shaped bun, the house special
    pen.shape([x - 9, y, x - 4, y - 5, x + 4, y - 4, x + 7, y - 1, x + 11, y - 5, x + 11, y + 4, x + 7, y + 1, x + 4, y + 4, x - 4, y + 5], '#e4a55c', 1.1);
    pen.ellipse(x - 5, y - 1, 1, 1, INK, 0.5);
  }
}

function bottle(pen: Pen, x: number, y: number, col: string) {
  pen.shape([x - 4, y, x - 4, y - 10, x - 2, y - 13, x - 2, y - 16, x + 2, y - 16, x + 2, y - 13, x + 4, y - 10, x + 4, y], col, 1);
}

function bouquet(pen: Pen, x: number, y: number, seed: number, cols: string[]) {
  for (let i = 0; i < 6; i++) {
    const fx = x + (hashf(seed, i, 1) - 0.5) * 16, fy = y - 6 - hashf(seed, i, 2) * 12;
    pen.line([x, y + 4, fx, fy], 1, '#6faa5d');
    pen.ellipse(fx, fy, 3.6, 3.4, cols[i % cols.length], 0.9);
  }
}

const draws: Record<string, PDraw> = {
  oven(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 4;
    pen.tube([cx + 9, by - 66, cx + 9, by - 118], 7, '#8a8c94');
    pen.poly([cx - 21, by, cx + 21, by, cx + 21, by - 28, cx - 21, by - 28], '#c98e74');
    pen.shape([cx - 23, by - 28, cx - 21, by - 56, cx - 8, by - 72, cx + 8, by - 72, cx + 21, by - 56, cx + 23, by - 28], '#e7b48d');
    for (const [a, b] of [[-16, -40], [6, -40], [-6, -54], [12, -56], [-14, -60]]) pen.line([cx + a, by + b, cx + a + 8, by + b], 1, rgba(INK, 0.35));
    const glow = 0.75 + Math.sin(d.t * 5) * 0.12;
    pen.shape([cx - 10, by - 30, cx - 10, by - 42, cx, by - 48, cx + 10, by - 42, cx + 10, by - 30], `rgba(255,${150 + glow * 40},90,${glow})`, 1.4);
    pen.line([cx - 16, by - 12, cx + 16, by - 12], 1.4, rgba(INK, 0.5));
  },
  bread_counter(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 54;
    box(pen, x0, top, x1 - x0, by, 12, WOOD, shade(WOOD, 0.14));
    pen.poly([x0 + 6, top + 6, x1 - 6, top + 6, x1 - 6, top + 30, x0 + 6, top + 30], 'rgba(222,240,250,0.9)', 1.3);
    let i = 0;
    for (let bx = x0 + 18; bx < x1 - 12; bx += 22) loaf(pen, bx, top + 22, i++ % 3);
    pen.line([x0 + 10, top + 10, x0 + 24, top + 26], 1, 'rgba(255,255,255,0.8)');
    // a tray of buns and the till on top
    pen.ellipse(x0 + 30, top - 7, 18, 4, '#d8d2c8', 1.1);
    loaf(pen, x0 + 24, top - 11, 0);
    loaf(pen, x0 + 37, top - 11, 2);
    pen.poly([x1 - 34, top - 6, x1 - 10, top - 6, x1 - 12, top - 22, x1 - 32, top - 22], '#e8b65e', 1.3);
    pen.poly([x1 - 30, top - 22, x1 - 14, top - 22, x1 - 16, top - 30, x1 - 28, top - 30], '#fff8e8', 1.1);
  },
  bread_rack(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 104;
    box(pen, x0, top, x1 - x0, by, 8, WOOD, shade(WOOD, 0.12));
    const shelves = [top + 32, top + 64, by - 4];
    for (const s of shelves.slice(0, 2)) pen.line([x0 + 2, s, x1 - 2, s], 1.3);
    shelves.forEach((s, r) => {
      let k = r;
      for (let bx = x0 + 14; bx < x1 - 8; bx += 20) loaf(pen, bx, s - 7, k++ % 3);
    });
    // baguettes leaning in a crock
    pen.poly([x1 - 20, by, x1 - 4, by, x1 - 6, by - 18, x1 - 18, by - 18], '#c9d4dc', 1.1);
  },
  bread_basket(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 8;
    for (const [dx, a] of [[-6, -0.35], [0, -0.08], [7, 0.25]]) pen.tube([cx + dx, by - 14, cx + dx + Math.sin(a) * 40, by - 14 - Math.cos(a) * 40], 6, BREAD, 1.1);
    const p = pen.shape([cx - 18, by - 20, cx + 18, by - 20, cx + 14, by, cx - 14, by], '#d9ab70');
    pen.clip(p, () => {
      for (let i = 0; i < 7; i++) pen.line([cx - 20 + i * 6, by - 22, cx - 16 + i * 6, by + 2], 1, rgba('#8a6440', 0.5), 0.3);
    });
  },
  cafe_table(d, x, y, w, h, v) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    pen.tube([cx, by - 2, cx, by - 28], 3, '#6f7480');
    pen.ellipse(cx, by, 10, 3, '#6f7480', 1.1);
    pen.ellipse(cx, by - 30, 21, 7, '#ffffff');
    pen.shape([cx - 21, by - 30, cx - 18, by - 22, cx + 18, by - 22, cx + 21, by - 30], '#f4a3a0', 1.1);
    if (v === 1) {
      pen.ellipse(cx - 2, by - 34, 9, 3, '#ffffff', 1);
      pen.shape([cx - 8, by - 35, cx - 7, by - 44, cx + 4, by - 44, cx + 5, by - 35], '#f6d8c4', 1);
      pen.ellipse(cx - 1, by - 46, 2.5, 2.5, '#e05d6f', 0.8);
    } else {
      pen.shape([cx + 2, by - 38, cx + 11, by - 38, cx + 10, by - 32, cx + 3, by - 32], '#ffffff', 1.1);
      pen.line([cx + 11, by - 37, cx + 14, by - 35, cx + 11, by - 33], 1);
      const st = Math.sin(d.t * 2) * 1.5;
      pen.line([cx + 6 + st, by - 42, cx + 7 - st, by - 47, cx + 6 + st, by - 52], 1, rgba(INK, 0.35));
    }
  },
  coffee_bar(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 52;
    box(pen, x0, top, x1 - x0, by, 12, '#c79a73', shade('#c79a73', 0.14));
    for (let px = x0 + 20; px < x1 - 10; px += 26) pen.poly([px - 8, top + 10, px + 8, top + 10, px + 8, top + 40, px - 8, top + 40], null, 1, rgba(INK, 0.35));
    // espresso machine
    pen.poly([x0 + 14, top - 6, x0 + 52, top - 6, x0 + 52, top - 40, x0 + 14, top - 40], '#d6dbe0', 1.5);
    pen.ellipse(x0 + 24, top - 30, 4, 4, '#8a8c94', 1);
    pen.ellipse(x0 + 42, top - 30, 4, 4, '#8a8c94', 1);
    pen.poly([x0 + 28, top - 14, x0 + 38, top - 14, x0 + 37, top - 7, x0 + 29, top - 7], '#ffffff', 1);
    const st = Math.sin(d.t * 2.4) * 2;
    pen.line([x0 + 33 + st, top - 44, x0 + 34 - st, top - 52, x0 + 33 + st, top - 60], 1.1, rgba(INK, 0.3));
    // cups and a cake under a dome
    for (let i = 0; i < 3; i++) pen.shape([x0 + 64 + i * 13, top - 6, x0 + 73 + i * 13, top - 6, x0 + 72 + i * 13, top - 14, x0 + 65 + i * 13, top - 14], ['#ffffff', '#fde3e3', '#e1f1d6'][i], 1);
    pen.ellipse(x1 - 26, top - 7, 16, 4, '#ffffff', 1);
    pen.shape([x1 - 36, top - 8, x1 - 36, top - 18, x1 - 16, top - 18, x1 - 16, top - 8], '#f6d8c4', 1);
    pen.shape([x1 - 40, top - 8, x1 - 38, top - 26, x1 - 26, top - 32, x1 - 14, top - 26, x1 - 12, top - 8], 'rgba(230,245,250,0.5)', 1.1);
  },
  bookwall(d, x, y, w, h, v) {
    const { pen } = d;
    const x0 = x + 3, x1 = x + w * CELL - 3, by = y + h * CELL - 6, top = by - 136;
    box(pen, x0, top, x1 - x0, by, 8, WOOD_D, shade(WOOD_D, 0.15));
    const rows = 4;
    const colors = ['#e58f84', '#86b6d9', '#f2cf74', '#9ccf86', '#c8a2d8', '#f4a76c', '#8fc3b8'];
    for (let r = 0; r < rows; r++) {
      const base = top + 34 * (r + 1) - 2;
      if (r < rows - 1) pen.line([x0 + 2, base + 2, x1 - 2, base + 2], 1.3);
      let bx = x0 + 5, i = 0;
      while (bx < x1 - 8) {
        const bw = 4 + hashf(r, i, 7 + v) * 4, bh = 18 + hashf(r, i, 3 + v) * 9;
        if (hashf(r, i, 11 + v) < 0.08) {
          // a book lying down
          pen.poly([bx, base, bx + 18, base, bx + 18, base - 5, bx, base - 5], colors[(i + r) % colors.length], 1);
          bx += 20;
        } else {
          pen.poly([bx, base, bx, base - bh, bx + bw, base - bh, bx + bw, base], colors[(r * 3 + i + v) % colors.length], 1);
          bx += bw + 0.6;
        }
        i++;
      }
    }
    if (v === 1) {
      // a rolling ladder
      pen.line([x1 - 30, by, x1 - 14, top + 6], 2.2, WOOD);
      pen.line([x1 - 14, by, x1 + 2, top + 6], 2.2, WOOD);
      for (let k = 1; k < 7; k++) {
        const t = k / 7;
        pen.line([x1 - 30 + 16 * t, by - (by - top - 6) * t, x1 - 14 + 16 * t, by - (by - top - 6) * t], 1.6, WOOD);
      }
    }
  },
  desk(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 44;
    box(pen, x0, top, x1 - x0, by, 12, WOOD, shade(WOOD, 0.14));
    pen.poly([x0 + 10, top + 8, x0 + 40, top + 8, x0 + 40, top + 22, x0 + 10, top + 22], shade(WOOD, -0.06), 1);
    pen.ellipse(x0 + 25, top + 15, 2, 2, INK, 0.5);
    // a stack of books, a reading lamp and the date stamp
    for (let i = 0; i < 4; i++) pen.poly([x0 + 18 - i, top - 4 - i * 6, x0 + 46 + i, top - 4 - i * 6, x0 + 46 + i, top - 10 - i * 6, x0 + 18 - i, top - 10 - i * 6], ['#86b6d9', '#e58f84', '#f2cf74', '#9ccf86'][i], 1);
    const lit = d.night > 0.3;
    pen.line([x1 - 30, top - 4, x1 - 30, top - 30], 1.6, '#8a7a5a');
    pen.shape([x1 - 44, top - 28, x1 - 16, top - 28, x1 - 22, top - 38, x1 - 38, top - 38], lit ? '#ffe39a' : '#7fb38a', 1.2);
    pen.poly([x1 - 64, top - 4, x1 - 52, top - 4, x1 - 54, top - 14, x1 - 62, top - 14], '#c98e74', 1);
  },
  armchair(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    const col = '#e8a39b';
    pen.shape([cx - 18, by - 58, cx + 18, by - 58, cx + 20, by - 24, cx - 20, by - 24], shade(col, -0.06));
    pen.shape([cx - 22, by - 26, cx + 22, by - 26, cx + 22, by - 6, cx - 22, by - 6], col);
    pen.shape([cx - 26, by - 36, cx - 18, by - 38, cx - 17, by - 6, cx - 25, by - 6], shade(col, -0.1));
    pen.shape([cx + 18, by - 38, cx + 26, by - 36, cx + 25, by - 6, cx + 17, by - 6], shade(col, -0.1));
    pen.shape([cx - 12, by - 30, cx + 12, by - 30, cx + 10, by - 22, cx - 10, by - 22], '#fbe9d6', 1);
    pen.tube([cx - 18, by - 6, cx - 18, by + 1], 3, WOOD_D);
    pen.tube([cx + 18, by - 6, cx + 18, by + 1], 3, WOOD_D);
  },
  globe(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    pen.ellipse(cx, by, 12, 4, WOOD_D, 1.1);
    pen.tube([cx, by, cx, by - 20], 3, WOOD_D);
    pen.line([cx - 16, by - 38, cx - 12, by - 22, cx, by - 18], 1.6, '#c9a25a');
    pen.ellipse(cx, by - 38, 15, 15, '#a9d6ec');
    pen.shape([cx - 8, by - 46, cx - 1, by - 49, cx + 2, by - 42, cx - 4, by - 36, cx - 10, by - 38], '#9ccf86', 1);
    pen.shape([cx + 5, by - 34, cx + 11, by - 36, cx + 10, by - 28, cx + 5, by - 28], '#9ccf86', 1);
  },
  store_shelf(d, x, y, w, h, v) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 100;
    box(pen, x0, top, x1 - x0, by, 8, '#e9c99e', shade('#e9c99e', 0.12));
    const shelves = [top + 33, top + 66, by - 3];
    for (const s of shelves.slice(0, 2)) pen.line([x0 + 2, s, x1 - 2, s], 1.3);
    shelves.forEach((s, r) => {
      let i = 0;
      for (let bx = x0 + 10; bx < x1 - 8; bx += 14, i++) {
        const k = (r + i + v) % 4;
        if (k === 0) bottle(pen, bx, s, ['#9ccf86', '#86b6d9', '#f4a76c'][(i + v) % 3]);
        else if (k === 1) {
          pen.poly([bx - 6, s, bx + 6, s, bx + 6, s - 12, bx - 6, s - 12], ['#e58f84', '#f2cf74', '#c8a2d8'][(i + r) % 3], 1);
          pen.line([bx - 6, s - 6, bx + 6, s - 6], 0.8, rgba('#ffffff', 0.8));
        } else if (k === 2) {
          pen.poly([bx - 6, s, bx + 6, s, bx + 6, s - 16, bx - 6, s - 16], '#dcae74', 1);
          pen.line([bx - 6, s - 12, bx + 6, s - 12], 0.8, rgba(INK, 0.4));
        } else {
          pen.ellipse(bx, s - 7, 6, 7, 'rgba(230,245,250,0.85)', 1);
          for (let j = 0; j < 3; j++) pen.ellipse(bx - 2 + j * 2, s - 5 - (j % 2) * 3, 1.6, 1.6, ['#f49ab0', '#ffd45e', '#8fc3e8'][j], 0.5);
        }
      }
    });
  },
  counter(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 50;
    box(pen, x0, top, x1 - x0, by, 12, WOOD, shade(WOOD, 0.14));
    for (let px = x0 + 14; px < x1 - 6; px += 24) pen.poly([px, top + 10, px + 16, top + 10, px + 16, top + 40, px, top + 40], null, 1, rgba(INK, 0.3));
    pen.poly([x1 - 40, top - 6, x1 - 12, top - 6, x1 - 14, top - 24, x1 - 38, top - 24], '#8fb6d9', 1.3);
    pen.poly([x1 - 34, top - 24, x1 - 18, top - 24, x1 - 20, top - 32, x1 - 32, top - 32], '#fff8e8', 1.1);
    for (let i = 0; i < 3; i++) {
      const jx = x0 + 18 + i * 18;
      pen.ellipse(jx, top - 14, 7, 9, 'rgba(230,245,250,0.85)', 1.1);
      pen.ellipse(jx, top - 24, 5, 2, '#e9b46a', 1);
      for (let j = 0; j < 3; j++) pen.ellipse(jx - 3 + j * 3, top - 11 + (j % 2) * 3, 1.8, 1.8, ['#f49ab0', '#ffd45e', '#9ccf86'][(i + j) % 3], 0.5);
    }
  },
  crates(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    for (const [ox, oy] of [[-11, 0], [11, 0], [0, -24]]) {
      pen.poly([cx + ox - 12, by + oy, cx + ox + 12, by + oy, cx + ox + 12, by + oy - 24, cx + ox - 12, by + oy - 24], '#e0b483', 1.3);
      pen.line([cx + ox - 12, by + oy - 12, cx + ox + 12, by + oy - 12], 1, rgba(INK, 0.4));
    }
    for (let i = 0; i < 3; i++) pen.ellipse(cx - 6 + i * 6, by - 49, 4, 4, '#e9574f', 1);
  },
  barrel(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    pen.shape([cx - 15, by, cx - 18, by - 22, cx - 15, by - 44, cx + 15, by - 44, cx + 18, by - 22, cx + 15, by], '#c99a6b');
    for (const yy of [-10, -34]) pen.line([cx - 17, by + yy, cx + 17, by + yy], 2, '#8a8c94');
    pen.ellipse(cx, by - 44, 15, 4, '#e0b483', 1.2);
  },
  mail_counter(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 50;
    box(pen, x0, top, x1 - x0, by, 12, '#9fc7a8', shade('#9fc7a8', 0.14));
    pen.poly([(x0 + x1) / 2 - 22, top + 12, (x0 + x1) / 2 + 22, top + 12, (x0 + x1) / 2 + 22, top + 30, (x0 + x1) / 2 - 22, top + 30], '#fffaf0', 1);
    pen.shape([(x0 + x1) / 2 - 14, top + 16, (x0 + x1) / 2 + 14, top + 16, (x0 + x1) / 2 + 14, top + 26, (x0 + x1) / 2 - 14, top + 26], '#ffffff', 0.9);
    pen.line([(x0 + x1) / 2 - 14, top + 16, (x0 + x1) / 2, top + 22, (x0 + x1) / 2 + 14, top + 16], 0.9);
    // a scale, a tray of letters and the bell
    pen.poly([x0 + 14, top - 6, x0 + 40, top - 6, x0 + 38, top - 14, x0 + 16, top - 14], '#d6dbe0', 1.2);
    pen.ellipse(x0 + 27, top - 18, 12, 3, '#d6dbe0', 1.1);
    pen.poly([x0 + 54, top - 6, x0 + 86, top - 6, x0 + 86, top - 14, x0 + 54, top - 14], WOOD, 1.1);
    for (let i = 0; i < 3; i++) pen.poly([x0 + 58 + i * 8, top - 12, x0 + 70 + i * 8, top - 14, x0 + 71 + i * 8, top - 22, x0 + 59 + i * 8, top - 20], ['#ffffff', '#fde3e3', '#e9f0f4'][i], 0.9);
    pen.shape([x1 - 26, top - 6, x1 - 26, top - 12, x1 - 20, top - 18, x1 - 14, top - 12, x1 - 14, top - 6], '#ffd45e', 1.1);
  },
  mail_slots(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 112;
    box(pen, x0, top, x1 - x0, by, 8, WOOD, shade(WOOD, 0.12));
    const cols = 6, rows = 5;
    const cw = (x1 - x0 - 8) / cols, rh = (by - top - 30) / rows;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const sx = x0 + 4 + c * cw, sy = top + 4 + r * rh;
        pen.poly([sx + 1, sy + 1, sx + cw - 1, sy + 1, sx + cw - 1, sy + rh - 1, sx + 1, sy + rh - 1], shade(WOOD, -0.18), 0.9);
        if (hashf(r, c, 5) < 0.55) pen.poly([sx + 4, sy + rh - 2, sx + cw - 4, sy + rh - 2, sx + cw - 5, sy + rh - 9 - hashf(r, c, 6) * 4, sx + 5, sy + rh - 9], ['#ffffff', '#fde3e3', '#e9f0f4', '#fff1c9'][(r + c) % 4], 0.8);
      }
    pen.poly([x0 + 6, by - 22, x1 - 6, by - 22, x1 - 6, by - 4, x0 + 6, by - 4], shade(WOOD, -0.08), 1);
  },
  parcels(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 6, by = y + h * CELL - 6;
    const boxes: [number, number, number, number, string][] = [[0, 0, 36, 28, '#dcae74'], [38, 0, 30, 24, '#e9c08b'], [6, -28, 28, 22, '#e9c08b'], [40, -24, 22, 18, '#d39b62'], [12, -50, 20, 16, '#dcae74']];
    for (const [bx, byy, bw, bh, col] of boxes) {
      pen.poly([x0 + bx, by + byy, x0 + bx + bw, by + byy, x0 + bx + bw, by + byy - bh, x0 + bx, by + byy - bh], col, 1.2);
      pen.line([x0 + bx + bw / 2, by + byy, x0 + bx + bw / 2, by + byy - bh], 1, '#b05a4a');
      pen.line([x0 + bx, by + byy - bh / 2, x0 + bx + bw, by + byy - bh / 2], 1, '#b05a4a');
    }
  },
  postbox(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    pen.poly([cx - 14, by, cx + 14, by, cx + 14, by - 46, cx - 14, by - 46], '#e0605e');
    pen.shape([cx - 15, by - 46, cx - 12, by - 56, cx, by - 60, cx + 12, by - 56, cx + 15, by - 46], '#e86f6c');
    pen.poly([cx - 9, by - 40, cx + 9, by - 40, cx + 9, by - 36, cx - 9, by - 36], INK, 0.6);
    pen.poly([cx - 8, by - 26, cx + 8, by - 26, cx + 8, by - 16, cx - 8, by - 16], '#fffaf0', 1);
  },
  bench_in(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 6, x1 = x + w * CELL - 6, by = y + h * CELL - 6;
    pen.poly([x0, by - 30, x1, by - 30, x1, by - 24, x0, by - 24], WOOD);
    pen.poly([x0, by - 18, x1, by - 18, x1 + 1, by - 13, x0 - 1, by - 13], WOOD);
    for (const lx of [x0 + 6, x1 - 6]) {
      pen.tube([lx, by - 13, lx, by], 3, WOOD_D);
      pen.tube([lx, by - 30, lx, by - 18], 2.5, WOOD_D);
    }
  },
  flower_stand(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 6, x1 = x + w * CELL - 6, by = y + h * CELL - 6;
    for (let tier = 0; tier < 3; tier++) {
      const ty = by - 22 - tier * 28, tx0 = x0 + tier * 10, tx1 = x1 - tier * 10;
      pen.poly([tx0, ty, tx1, ty, tx1, ty + 6, tx0, ty + 6], WOOD, 1.2);
      let i = 0;
      for (let px = tx0 + 12; px < tx1 - 6; px += 22, i++) {
        pen.shape([px - 7, ty, px + 7, ty, px + 5, ty - 11, px - 5, ty - 11], '#e9a47e', 1);
        bouquet(pen, px, ty - 11, tier * 7 + i, [['#f49ab0', '#ffffff'], ['#ffd45e', '#f6a04d'], ['#c7a8f0', '#a8d0f0']][(tier + i) % 3]);
      }
    }
    pen.tube([x0 + 2, by, x0 + 2, by - 22], 2.4, WOOD_D);
    pen.tube([x1 - 2, by, x1 - 2, by - 22], 2.4, WOOD_D);
  },
  flower_buckets(d, x, y, w, h, v) {
    const { pen } = d;
    const x0 = x + 8, x1 = x + w * CELL - 8, by = y + h * CELL - 6;
    let i = 0;
    for (let bx = x0 + 10; bx < x1 - 4; bx += 26, i++) {
      const cols = [['#f27d8f', '#fbd3df'], ['#ffd45e', '#ffffff'], ['#f6a04d', '#f27d8f'], ['#c7a8f0', '#ffffff']][(i + v * 2) % 4];
      bouquet(pen, bx, by - 22, i * 3 + v, cols);
      bouquet(pen, bx + 4, by - 26, i * 3 + v + 11, cols);
      pen.shape([bx - 11, by - 22, bx + 11, by - 22, bx + 8, by, bx - 8, by], '#c9d4dc', 1.2);
      pen.line([bx - 10, by - 16, bx + 10, by - 16], 1, rgba(INK, 0.35));
    }
  },
  flower_counter(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 48;
    box(pen, x0, top, x1 - x0, by, 12, '#fbe8d8', shade('#fbe8d8', 0.06));
    pen.line([x0 + 4, top + 16, x1 - 4, top + 16], 1, rgba(INK, 0.3));
    // a roll of wrapping paper, a ribbon and a bouquet being wrapped
    pen.tube([x0 + 12, top - 8, x0 + 44, top - 8], 9, '#f4c5bd', 1.2);
    pen.shape([x1 - 44, top - 4, x1 - 20, top - 4, x1 - 26, top - 24, x1 - 38, top - 24], '#fff8e8', 1.1);
    bouquet(pen, x1 - 32, top - 24, 9, ['#f27d8f', '#ffd45e', '#ffffff']);
    pen.line([x1 - 36, top - 12, x1 - 28, top - 10, x1 - 22, top - 16], 1.4, '#e05d6f');
  },
  mannequin(d, x, y, w, h, v) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    pen.line([cx - 12, by, cx, by - 10, cx + 12, by], 1.8, WOOD_D);
    pen.tube([cx, by - 10, cx, by - 40], 3, WOOD_D);
    if (v === 0) pen.shape([cx - 14, by - 70, cx + 14, by - 70, cx + 20, by - 34, cx - 20, by - 34], '#f6b8c6');
    else pen.shape([cx - 15, by - 70, cx + 15, by - 70, cx + 13, by - 40, cx - 13, by - 40], '#6d7f95');
    if (v === 1) {
      pen.line([cx, by - 70, cx, by - 42], 1, rgba('#ffffff', 0.6));
      pen.shape([cx - 4, by - 68, cx + 4, by - 68, cx, by - 60], '#e0605e', 0.9);
    } else for (let i = 0; i < 4; i++) pen.ellipse(cx - 12 + i * 8, by - 38, 2.5, 2.5, '#ffffff', 0.7);
    pen.ellipse(cx, by - 76, 9, 7, '#f4e4cf', 1.3);
  },
  fabric_rolls(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 104;
    box(pen, x0, top, x1 - x0, by, 8, WOOD, shade(WOOD, 0.12));
    const cols = ['#f49ab0', '#8fc3e8', '#ffd45e', '#9ccf86', '#c7a8f0', '#f4a76c', '#ffffff', '#e0605e'];
    [top + 34, top + 68, by - 3].forEach((s, r) => {
      if (r < 2) pen.line([x0 + 2, s, x1 - 2, s], 1.3);
      let i = 0;
      for (let fx = x0 + 12; fx < x1 - 8; fx += 17, i++) {
        pen.ellipse(fx, s - 10, 8, 10, cols[(r * 4 + i) % cols.length], 1.1);
        pen.ellipse(fx, s - 10, 2.5, 3, shade(cols[(r * 4 + i) % cols.length], -0.2), 0.7);
      }
    });
  },
  sewing_table(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6, top = by - 44;
    box(pen, x0, top, x1 - x0, by, 12, WOOD, shade(WOOD, 0.14));
    // the sewing machine
    pen.shape([x0 + 14, top - 6, x0 + 14, top - 30, x0 + 54, top - 30, x0 + 54, top - 20, x0 + 30, top - 20, x0 + 30, top - 6], '#e9eef2', 1.4);
    pen.line([x0 + 48, top - 20, x0 + 48, top - 10], 1.6);
    pen.ellipse(x0 + 18, top - 22, 4, 4, '#8a8c94', 1);
    const sp = (d.t * 3) % 1;
    pen.line([x0 + 44, top - 6, x0 + 56 + sp * 6, top - 6], 1.6, '#f49ab0');
    // pincushion and a spool
    pen.ellipse(x1 - 22, top - 10, 9, 7, '#e0605e', 1.1);
    for (const [px, py] of [[-4, -16], [2, -17], [5, -13]]) pen.line([x1 - 22 + px, top + py + 3, x1 - 22 + px, top + py - 2], 1, '#8a8c94');
    pen.poly([x1 - 46, top - 6, x1 - 38, top - 6, x1 - 38, top - 18, x1 - 46, top - 18], '#8fc3e8', 1);
  },
  mirror(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    pen.line([cx - 12, by, cx, by - 14, cx + 12, by], 1.8, WOOD_D);
    pen.ellipse(cx, by - 52, 16, 36, WOOD, 1.6);
    pen.ellipse(cx, by - 52, 12, 31, '#e3f1f8', 1.1);
    pen.line([cx - 6, by - 70, cx - 2, by - 62], 1.4, 'rgba(255,255,255,0.9)');
    pen.line([cx - 7, by - 58, cx - 3, by - 50], 1.4, 'rgba(255,255,255,0.9)');
  },
  doormat(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 6, x1 = x + w * CELL - 6, y0 = y + 8, y1 = y + h * CELL - 2;
    pen.poly([x0, y0, x1, y0, x1, y1, x0, y1], '#d9ab70', 1.4);
    const ctx = pen.ctx;
    ctx.strokeStyle = rgba('#8a6440', 0.45);
    ctx.lineWidth = 1;
    for (let i = x0 + 4; i < x1 - 2; i += 5) {
      ctx.beginPath();
      ctx.moveTo(i, y0 + 3);
      ctx.lineTo(i, y1 - 3);
      ctx.stroke();
    }
    ctx.fillStyle = rgba(INK, 0.55);
    ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('出 门', (x0 + x1) / 2, (y0 + y1) / 2);
  },
};

export function drawShopPiece(id: string, d: DrawCtx, x: number, y: number, w: number, h: number, v = 0) {
  draws[id]?.(d, x, y, w, h, v);
}

export const isShopPiece = (id: string) => id in draws;

// ---- on the back wall ----
type WDraw = (d: DrawCtx, x: number, w: number, v: number) => void;
const wallDraws: Record<string, WDraw> = {
  menu(d, x, w, v) {
    const { pen } = d;
    const x0 = x + 8, x1 = x + w * CELL - 8, top = -WALL_H + 34, bot = -WALL_H + 100;
    pen.poly([x0, top, x1, top, x1, bot, x0, bot], '#4f6b5c', 2.2);
    pen.poly([x0 - 3, top - 3, x1 + 3, top - 3, x1 + 3, bot + 3, x0 - 3, bot + 3], null, 2, WOOD_D);
    const ctx = pen.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = 'bold 13px "PingFang SC","Microsoft YaHei",system-ui';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = v === 1 ? ['今日推荐', '热牛奶 · 小鱼拿铁', '慢慢喝，不着急'] : ['今日出炉', '鱼形面包 · 可颂', '尝一口不要钱'];
    lines.forEach((l, i) => {
      ctx.font = `${i === 0 ? 'bold 14px' : '11px'} "PingFang SC","Microsoft YaHei",system-ui`;
      ctx.fillText(l, (x0 + x1) / 2, top + 14 + i * 19);
    });
    pen.line([x0 + 14, top + 24, x1 - 14, top + 24], 0.8, 'rgba(255,255,255,0.5)');
  },
  hatrack(d, x, w) {
    const { pen } = d;
    const x0 = x + 10, x1 = x + w * CELL - 10, y0 = -WALL_H + 54;
    pen.poly([x0, y0, x1, y0, x1, y0 + 8, x0, y0 + 8], WOOD, 1.4);
    const pegs = [x0 + 18, (x0 + x1) / 2, x1 - 18];
    for (const px of pegs) pen.tube([px, y0 + 8, px, y0 + 16], 3, WOOD_D);
    // a beret, a straw hat, a scarf
    pen.shape([pegs[0] - 14, y0 + 20, pegs[0] - 10, y0 + 10, pegs[0] + 10, y0 + 10, pegs[0] + 14, y0 + 20], '#e0605e', 1.2);
    pen.ellipse(pegs[1], y0 + 22, 20, 5, '#f2d38a', 1.2);
    pen.shape([pegs[1] - 10, y0 + 22, pegs[1] - 8, y0 + 10, pegs[1] + 8, y0 + 10, pegs[1] + 10, y0 + 22], '#f2d38a', 1.2);
    pen.tube([pegs[2], y0 + 14, pegs[2] + 4, y0 + 44], 8, '#8fc3e8', 1.1);
  },
  stamps(d, x, w) {
    const { pen } = d;
    const x0 = x + 10, x1 = x + w * CELL - 10, top = -WALL_H + 40, bot = -WALL_H + 96;
    pen.poly([x0, top, x1, top, x1, bot, x0, bot], CREAM, 2);
    const cols = ['#f49ab0', '#8fc3e8', '#ffd45e', '#9ccf86', '#c7a8f0', '#f4a76c'];
    for (let i = 0; i < 6; i++) {
      const sx = x0 + 8 + (i % 3) * ((x1 - x0 - 16) / 3), sy = top + 8 + Math.floor(i / 3) * 24;
      const sw = (x1 - x0 - 16) / 3 - 6;
      pen.poly([sx, sy, sx + sw, sy, sx + sw, sy + 18, sx, sy + 18], cols[i], 1);
      pen.ellipse(sx + sw / 2, sy + 9, 3.4, 3, '#ffffff', 0.6);
    }
  },
  notice(d, x, w) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, top = -WALL_H + 46;
    pen.poly([cx - 16, top, cx + 16, top, cx + 15, top + 40, cx - 15, top + 40], '#fffaf0', 1.4);
    pen.ellipse(cx, top + 2, 2, 2, '#e0605e', 0.6);
    for (let i = 0; i < 4; i++) pen.line([cx - 10, top + 12 + i * 7, cx + (i === 3 ? 2 : 10), top + 12 + i * 7], 1, rgba(INK, 0.45));
  },
};

export function drawShopWall(id: string, d: DrawCtx, x: number, w: number, v = 0): boolean {
  const fn = wallDraws[id];
  if (!fn) return false;
  fn(d, x, w, v);
  return true;
}

/** The shop's name on a little plaque above the middle of the back wall. */
export function drawPlaque(pen: Pen, cx: number, name: string) {
  const ctx = pen.ctx;
  ctx.font = 'bold 15px "PingFang SC","Microsoft YaHei",system-ui';
  const tw = ctx.measureText(name).width + 26;
  const top = -WALL_H + 6;
  pen.poly([cx - tw / 2, top, cx + tw / 2, top, cx + tw / 2, top + 24, cx - tw / 2, top + 24], '#fff8e8', 1.6);
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, top + 13);
}
