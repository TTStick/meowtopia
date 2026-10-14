import { Pen, shade, rgba } from '../engine/pen';
import { hashf } from '../../../shared/rng';
import { now as clockNow } from '../game/clock';

export const CELL = 44;
export const WALL_H = 156;

const WOOD = '#dcb58a';
const WOOD_D = '#b98d61';
const CARD = '#dcae74';
const CARD_D = '#a97c4c';
const SOFT_PINK = '#f5c6c6';
const SOFT_BLUE = '#bcd8ec';
const CREAM = '#fbf3e3';
const GREEN = '#9ccf86';
const GREEN_D = '#6faa5d';

export interface DrawCtx {
  pen: Pen;
  t: number;
  night: number; // 0..1
  flip: boolean;
}

type Layer = 'back' | 'front';
type FDraw = (d: DrawCtx, x: number, y: number, w: number, h: number, layer: Layer) => void;

// helpers ---------------------------------------------------------------
function box3(pen: Pen, x: number, y: number, w: number, h: number, depth: number, front: string, top: string, lw?: number) {
  // front face (x,y)=top-left of front face
  pen.poly([x, y, x + w, y, x + w, y + h, x, y + h], front, lw, undefined, 0.25);
  pen.poly([x, y, x + depth * 0.25, y - depth, x + w - depth * 0.25, y - depth, x + w, y], top, lw, undefined, 0.25);
}

function legs4(pen: Pen, x: number, y: number, w: number, h: number, color = WOOD_D) {
  pen.tube([x + 3, y, x + 3, y + h], 3.4, color);
  pen.tube([x + w - 3, y, x + w - 3, y + h], 3.4, color);
}

// furniture --------------------------------------------------------------
const draws: Record<string, FDraw> = {
  box(d, x, y, w, h, layer) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 4;
    const bw = 40, bh = 24, dep = 16;
    const lx = cx - bw / 2, ty = by - bh;
    if (layer === 'back') {
      // back flap + inside
      pen.shape([lx + 3, ty - dep + 2, lx + bw - 3, ty - dep + 2, lx + bw - 6, ty - dep - 12, lx + 6, ty - dep - 10], CARD, undefined, undefined, 0.6);
      pen.shape([lx, ty, lx + 4, ty - dep, lx + bw - 4, ty - dep, lx + bw, ty], CARD_D, undefined, undefined, 0.6);
    } else {
      pen.shape([lx, ty, lx + bw, ty, lx + bw - 1, by, lx + 1, by], CARD, undefined, undefined, 0.6);
      pen.shape([lx, ty, lx - 9, ty + 9, lx - 2, ty + 12, lx + 2, ty + 2], shade(CARD, 0.08), undefined, undefined, 0.5);
      pen.shape([lx + bw, ty, lx + bw + 9, ty + 9, lx + bw + 2, ty + 12, lx + bw - 2, ty + 2], shade(CARD, 0.08), undefined, undefined, 0.5);
      pen.line([cx - 5, ty + 5, cx + 6, ty + 5], 2.2, rgba('#8a6440', 0.5));
      pen.line([lx + 6, by - 6, lx + 14, by - 6], 1.2, rgba('#8a6440', 0.5));
    }
  },
  bed_round(d, x, y, w, h, layer) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, cy = y + h * CELL - 14;
    if (layer === 'back') {
      pen.ellipse(cx, cy, 23, 13, shade(SOFT_PINK, -0.05));
      pen.ellipse(cx, cy - 1, 16, 8, CREAM, 1.2);
    } else {
      const p = new Path2D();
      pen.ctx.save();
      pen.ctx.beginPath();
      pen.ctx.rect(cx - 30, cy + 1, 60, 20);
      pen.ctx.clip();
      pen.ellipse(cx, cy + 1, 23.5, 13, SOFT_PINK);
      pen.ellipse(cx, cy - 1, 16, 8, null, 1.2);
      pen.ctx.restore();
      void p;
    }
  },
  cushion(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, cy = y + h * CELL - 13;
    const path = pen.shape([cx - 19, cy - 9, cx, cy - 12, cx + 19, cy - 9, cx + 21, cy + 4, cx, cy + 8, cx - 21, cy + 4], '#f2c98f');
    pen.clip(path, () => {
      for (let i = -3; i <= 3; i++) pen.line([cx + i * 7, cy - 14, cx + i * 7 + 3, cy + 10], 2, rgba('#e08f6a', 0.45), 0.3);
      for (let i = -1; i <= 1; i++) pen.line([cx - 24, cy + i * 6, cx + 24, cy + i * 6 - 1], 2, rgba('#e08f6a', 0.45), 0.3);
    });
    pen.ctx.fillStyle = '#4a3a34';
    pen.ctx.beginPath();
    pen.ctx.arc(cx, cy - 1, 1.2, 0, 7);
    pen.ctx.fill();
  },
  bowl_food(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, cy = y + h * CELL - 16;
    pen.shape([cx - 13, cy, cx + 13, cy, cx + 10, cy + 9, cx - 10, cy + 9], '#f08f7c');
    pen.ellipse(cx, cy, 13, 4.5, '#f6b3a5');
    pen.ellipse(cx, cy - 1, 9, 2.6, '#c6894f', 0.8);
    const ctx = pen.ctx;
    ctx.fillStyle = '#8f5a2e';
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.arc(cx - 6 + i * 2.4, cy - 1.5 + (i % 2) * 1.2, 0.9, 0, 7);
      ctx.fill();
    }
    // fish icon
    pen.shape([cx - 4, cy + 4.5, cx + 2, cy + 2.5, cx + 2, cy + 6.5], '#fff', 0.8);
    pen.shape([cx + 2, cy + 4.5, cx + 5, cy + 2.8, cx + 5, cy + 6.2], '#fff', 0.8);
  },
  bowl_water(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, cy = y + h * CELL - 16;
    pen.shape([cx - 12, cy, cx + 12, cy, cx + 9, cy + 8, cx - 9, cy + 8], '#8fbde6');
    pen.ellipse(cx, cy, 12, 4.2, '#b9d9f2');
    pen.ellipse(cx, cy - 0.5, 8.5, 2.4, '#d8eefc', 0.7);
    const s = Math.sin(d.t * 2) * 1.5;
    pen.line([cx - 3 + s, cy - 0.5, cx + 2 + s, cy - 0.8], 1, '#ffffff');
  },
  scratch_post(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 8;
    box3(pen, cx - 17, by - 8, 34, 8, 10, '#e8cfa8', '#f3e1c2');
    const path = pen.shape([cx - 6, by - 10, cx - 6, by - 66, cx + 6, by - 66, cx + 6, by - 10], '#e9d3a2');
    pen.clip(path, () => {
      for (let i = 0; i < 14; i++) pen.line([cx - 8, by - 12 - i * 4, cx + 8, by - 14 - i * 4], 1, rgba('#9c7a4a', 0.6), 0.2);
    });
    pen.ellipse(cx, by - 68, 12, 5, '#f3e1c2');
    const sw = Math.sin(d.t * 1.7) * 3;
    pen.line([cx + 9, by - 67, cx + 11 + sw * 0.5, by - 50, cx + 12 + sw, by - 40], 0.9);
    pen.ellipse(cx + 12 + sw, by - 37, 4, 4, '#f58a8a', 1.1);
  },
  tree_small(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 8;
    box3(pen, cx - 18, by - 8, 36, 8, 10, '#c9b2a0', '#ddc8b6');
    const path = pen.shape([cx - 5, by - 10, cx - 5, by - 58, cx + 5, by - 58, cx + 5, by - 10], '#e9d3a2');
    pen.clip(path, () => {
      for (let i = 0; i < 12; i++) pen.line([cx - 7, by - 12 - i * 4, cx + 7, by - 14 - i * 4], 1, rgba('#9c7a4a', 0.6), 0.2);
    });
    pen.ellipse(cx, by - 60, 19, 7, '#c9b2a0');
    pen.ellipse(cx, by - 62, 15, 5, '#ead9cb', 1.2);
    const sw = Math.sin(d.t * 1.3 + 1) * 3;
    pen.line([cx - 15, by - 58, cx - 16 + sw * 0.5, by - 44, cx - 17 + sw, by - 34], 0.9);
    pen.ellipse(cx - 17 + sw, by - 31, 4, 4, '#ffd36b', 1.1);
  },
  tree_big(d, x, y, w, h, layer) {
    const { pen } = d;
    const lx = x + CELL * 0.45, rx = x + CELL * 1.5, by = y + h * CELL - 8;
    if (layer === 'front') {
      // cube house front (cat hides inside)
      const path = pen.shape([lx - 19, by - 6, lx - 19, by - 38, lx + 19, by - 38, lx + 19, by - 6], '#c9b2a0');
      void path;
      pen.ellipse(lx, by - 20, 9, 10, '#5a4740');
      return;
    }
    box3(pen, x + 4, by - 8, w * CELL - 8, 8, 10, '#c9b2a0', '#ddc8b6');
    pen.shape([lx - 19, by - 38, lx - 15, by - 46, lx + 23, by - 46, lx + 19, by - 38], '#ddc8b6');
    for (const px of [lx, rx]) {
      const top = px === lx ? 88 : 48;
      const path = pen.shape([px - 5, by - (px === lx ? 46 : 10), px - 5, by - top, px + 5, by - top, px + 5, by - (px === lx ? 46 : 10)], '#e9d3a2');
      pen.clip(path, () => {
        for (let i = 0; i < 12; i++) pen.line([px - 7, by - 12 - i * 7, px + 7, by - 14 - i * 7], 1, rgba('#9c7a4a', 0.6), 0.2);
      });
    }
    pen.ellipse(lx, by - 90, 21, 7, '#c9b2a0');
    pen.ellipse(lx, by - 92, 17, 5, '#ead9cb', 1.2);
    pen.ellipse(rx, by - 50, 19, 7, '#c9b2a0');
    pen.ellipse(rx, by - 52, 15, 5, '#ead9cb', 1.2);
    // ladder between
    pen.line([lx + 18, by - 60, rx - 14, by - 52], 1.2);
    const sw = Math.sin(d.t * 1.5) * 3;
    pen.line([rx + 14, by - 48, rx + 15 + sw, by - 30], 0.9);
    pen.ellipse(rx + 15 + sw, by - 27, 4, 4, '#8fd0c8', 1.1);
  },
  sofa(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6;
    const col = '#a7c7a0';
    pen.shape([x0 + 6, by - 50, x1 - 6, by - 50, x1 - 6, by - 22, x0 + 6, by - 22], shade(col, -0.05));
    pen.shape([x0 + 4, by - 26, x1 - 4, by - 26, x1 - 3, by - 6, x0 + 3, by - 6], col);
    pen.shape([x0 + 10, by - 28, (x0 + x1) / 2, by - 30, x1 - 10, by - 28, x1 - 10, by - 21, x0 + 10, by - 21], shade(col, 0.12));
    pen.line([(x0 + x1) / 2, by - 29, (x0 + x1) / 2, by - 21], 1.1);
    pen.shape([x0 - 2, by - 36, x0 + 10, by - 38, x0 + 11, by - 6, x0 - 1, by - 6], shade(col, -0.08));
    pen.shape([x1 - 10, by - 38, x1 + 2, by - 36, x1 + 1, by - 6, x1 - 11, by - 6], shade(col, -0.08));
    legs4(pen, x0 + 4, by - 5, x1 - x0 - 8, 6);
  },
  rug_round(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, cy = y + (h * CELL) / 2;
    pen.ellipse(cx, cy, 40, 30, '#f2d4c0', 1.4, undefined, 0, 12);
    pen.ellipse(cx, cy, 30, 22, null, 1, rgba('#d98b75', 0.7), 0, 12);
    pen.ellipse(cx, cy, 18, 13, '#f7e3d6', 1, rgba('#d98b75', 0.7), 0, 10);
    const ctx = pen.ctx;
    ctx.strokeStyle = rgba('#d98b75', 0.6);
    ctx.lineWidth = 1;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const ex = cx + Math.cos(a) * 40, ey = cy + Math.sin(a) * 30;
      ctx.beginPath();
      ctx.moveTo(ex, ey);
      ctx.lineTo(ex + Math.cos(a) * 4, ey + Math.sin(a) * 3);
      ctx.stroke();
    }
  },
  plant(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    const sway = Math.sin(d.t * 0.9) * 0.04;
    const leaves: [number, number, number][] = [[-0.9, 26, 1], [-0.3, 34, 1.1], [0.35, 32, 1.05], [0.95, 24, 0.95], [0.05, 22, 0.8]];
    for (const [a0, len, s] of leaves) {
      const a = -Math.PI / 2 + a0 + sway;
      const bx = cx, byy = by - 20;
      const tx = bx + Math.cos(a) * len, ty = byy + Math.sin(a) * len;
      pen.line([bx, byy, (bx + tx) / 2, (byy + ty) / 2 + 2, tx, ty], 1.4, GREEN_D);
      const r = 10 * s;
      const p = pen.shape(Pen.ellipsePts(tx, ty, r * 1.15, r * 0.8, a, 8), GREEN);
      pen.clip(p, () => {
        pen.line([tx - Math.cos(a) * r, ty - Math.sin(a) * r, tx + Math.cos(a) * r, ty + Math.sin(a) * r], 1, rgba('#4a7a40', 0.6), 0.3);
        for (const k of [-0.5, 0.2]) {
          const ex = tx + Math.cos(a) * r * k, ey = ty + Math.sin(a) * r * k;
          pen.line([ex, ey, ex + Math.cos(a + 1.4) * r, ey + Math.sin(a + 1.4) * r], 1.4, CREAM, 0.2);
        }
      });
    }
    pen.shape([cx - 12, by - 22, cx + 12, by - 22, cx + 9, by, cx - 9, by], '#e9a47e');
    pen.line([cx - 12, by - 18, cx + 12, by - 18], 1);
  },
  cat_grass(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 10;
    for (let i = 0; i < 9; i++) {
      const bx = cx - 8 + i * 2;
      const sw = Math.sin(d.t * 1.6 + i) * 2;
      pen.line([bx, by - 10, bx + sw * 0.5 + (i - 4) * 0.6, by - 18, bx + sw + (i - 4) * 1.2, by - 26 - (i % 3) * 3], 1.4, i % 2 ? GREEN_D : '#7cbb62');
    }
    pen.shape([cx - 11, by - 11, cx + 11, by - 11, cx + 8, by, cx - 8, by], '#f4e1c1');
    pen.line([cx - 5, by - 6, cx + 5, by - 6], 1, rgba('#4a3a34', 0.4));
  },
  lamp(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 8;
    pen.ellipse(cx, by, 10, 3.5, '#8a8c94');
    pen.tube([cx, by - 2, cx, by - 84], 2.4, '#8a8c94');
    const lit = d.night > 0.3;
    pen.shape([cx - 10, by - 104, cx + 10, by - 104, cx + 17, by - 82, cx - 17, by - 82], lit ? '#ffe9a8' : '#f6e3c0');
    pen.line([cx - 15, by - 86, cx + 15, by - 86], 1, rgba('#4a3a34', 0.35));
  },
  bookshelf(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 5, x1 = x + w * CELL - 5, by = y + h * CELL - 6;
    const top = by - 76;
    box3(pen, x0, top, x1 - x0, by - top, 8, WOOD, shade(WOOD, 0.12));
    const ctx = pen.ctx;
    const shelves = [top + 24, top + 50];
    for (const sy of shelves) pen.line([x0 + 2, sy, x1 - 2, sy], 1.3);
    const colors = ['#e58f84', '#86b6d9', '#f2cf74', '#9ccf86', '#c8a2d8', '#f4a76c'];
    for (let r = 0; r < 3; r++) {
      const baseY = r === 0 ? shelves[0] : r === 1 ? shelves[1] : by - 3;
      let bx = x0 + 4;
      let i = 0;
      while (bx < x1 - 8) {
        const bw = 4 + hashf(r, i, 7) * 3;
        const bh = 13 + hashf(r, i, 3) * 7;
        if (hashf(r, i, 11) < 0.15) {
          bx += bw + 2;
          i++;
          continue;
        }
        pen.shape([bx, baseY, bx, baseY - bh, bx + bw, baseY - bh, bx + bw, baseY], colors[(r * 3 + i) % colors.length], 1);
        bx += bw + 0.6;
        i++;
      }
    }
    void ctx;
  },
  fish_tank(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    const ctx = pen.ctx;
    box3(pen, cx - 18, by - 16, 36, 16, 8, WOOD, shade(WOOD, 0.12));
    const tx = cx - 20, ty = by - 48, tw = 40, th = 30;
    const glass = pen.shape([tx, ty, tx + tw, ty, tx + tw, ty + th, tx, ty + th], 'rgba(170,215,240,0.75)');
    pen.clip(glass, () => {
      ctx.fillStyle = 'rgba(120,180,220,0.35)';
      ctx.fillRect(tx, ty + 5, tw, th);
      // weeds
      for (let i = 0; i < 3; i++) {
        const sx = tx + 8 + i * 12;
        pen.line([sx, ty + th, sx + Math.sin(d.t + i) * 2, ty + th - 10, sx + Math.sin(d.t * 1.3 + i) * 3, ty + th - 18], 1.6, GREEN_D);
      }
      // fish
      for (let i = 0; i < 2; i++) {
        const p = (d.t * (0.25 + i * 0.1) + i * 0.5) % 2;
        const dir = p < 1 ? 1 : -1;
        const fxp = tx + 6 + (p < 1 ? p : 2 - p) * (tw - 12);
        const fy = ty + 12 + i * 8 + Math.sin(d.t * 2 + i) * 1.5;
        pen.ellipse(fxp, fy, 4, 2.5, i ? '#f6a04d' : '#f27d6d', 0.9);
        pen.shape([fxp - dir * 3.5, fy, fxp - dir * 7, fy - 2.5, fxp - dir * 7, fy + 2.5], i ? '#f6a04d' : '#f27d6d', 0.9);
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 3; i++) {
        const bpy = ty + th - ((d.t * 8 + i * 9) % th);
        ctx.beginPath();
        ctx.arc(tx + tw - 8 + Math.sin(bpy) * 1, bpy, 1.1, 0, 7);
        ctx.fill();
      }
    });
    pen.fillStroke(glass, null);
    pen.line([tx + 3, ty + 4, tx + 3, ty + 12], 1.4, 'rgba(255,255,255,0.8)');
  },
  hammock(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 6, x1 = x + w * CELL - 6, by = y + h * CELL - 6;
    pen.tube([x0, by, x0 + 8, by - 40, x0 + 16, by], 3, WOOD_D);
    pen.tube([x1, by, x1 - 8, by - 40, x1 - 16, by], 3, WOOD_D);
    pen.line([x0 + 8, by - 40, x1 - 8, by - 40], 3, WOOD_D);
    const sw = Math.sin(d.t * 1.2) * 1.5;
    pen.shape([x0 + 8, by - 38, (x0 + x1) / 2 + sw, by - 16, x1 - 8, by - 38, (x0 + x1) / 2 + sw, by - 24], '#f4c79a');
    pen.line([x0 + 14, by - 33, (x0 + x1) / 2 + sw, by - 19, x1 - 14, by - 33], 1, rgba('#d48a5a', 0.6));
  },
  tunnel(d, x, y, w, h, layer) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 6;
    const cy = by - 14;
    const col = '#93c3e8';
    if (layer === 'back') {
      pen.shape([x0 + 8, cy - 14, x1 - 6, cy - 14, x1 - 6, cy + 14, x0 + 8, cy + 14], col);
      return;
    }
    const path = pen.shape([x0 + 8, cy - 14, x1 - 6, cy - 14, x1 - 6, cy + 14, x0 + 8, cy + 14], col);
    pen.clip(path, () => {
      for (let i = 1; i < 8; i++) {
        const lx = x0 + 8 + i * ((x1 - x0 - 14) / 8);
        pen.line([lx, cy - 15, lx - 2, cy, lx, cy + 15], 1, rgba('#4a3a34', 0.4), 0.3);
      }
    });
    pen.ellipse(x0 + 8, cy, 8, 14, col);
    pen.ellipse(x0 + 8, cy, 5.5, 10.5, '#4f5d70', 1);
  },
  kotatsu(d, x, y, w, h, layer) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, by = y + h * CELL - 8;
    const top = by - 40;
    if (layer === 'back') {
      pen.shape([x0 + 2, top - 30, x1 - 2, top - 30, x1 + 4, top + 6, x0 - 4, top + 6], '#e7a6a0');
      return;
    }
    // quilt front
    const q = pen.shape([x0 - 4, top, x1 + 4, top, x1 + 8, by, x0 - 8, by], '#f2b8b0');
    pen.clip(q, () => {
      for (let i = 0; i < 6; i++) {
        const cx = x0 + 6 + i * 16, cy = top + 14 + (i % 2) * 10;
        pen.ellipse(cx, cy, 3, 3, '#fff3ea', 0, null);
      }
    });
    pen.shape([x0 - 2, top - 8, x1 + 2, top - 8, x1 + 6, top, x0 - 6, top], WOOD);
    // tabletop
    pen.shape([x0 + 2, top - 34, x1 - 2, top - 34, x1 + 2, top - 8, x0 - 2, top - 8], shade(WOOD, 0.1));
    pen.ellipse(x0 + 30, top - 22, 7, 4, '#f9e7cf');
    pen.ellipse(x0 + 30, top - 23, 4, 2, '#c7e3b0', 0.8);
    for (const [ox, oy] of [[x1 - 26, top - 20], [x1 - 18, top - 24], [x1 - 22, top - 16]]) pen.ellipse(ox, oy, 4.2, 4, '#f7a23c', 1);
  },
  teepee(d, x, y, w, h, layer) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    if (layer === 'back') {
      pen.shape([cx - 22, by, cx, by - 58, cx + 22, by], '#e6d2b5');
      pen.ellipse(cx, by - 3, 14, 5, SOFT_BLUE, 1);
      return;
    }
    const pole = (dx: number) => pen.line([cx + dx * 0.2, by - 62, cx + dx * 1.15, by + 1], 1.8, WOOD_D);
    const p = pen.shape([cx - 24, by, cx, by - 56, cx + 24, by, cx + 11, by, cx, by - 30, cx - 11, by], '#f1e3cd');
    pen.clip(p, () => {
      for (let i = 0; i < 4; i++) pen.line([cx - 30, by - 8 - i * 12, cx + 30, by - 8 - i * 12], 2, rgba('#e8938f', 0.5), 0.3);
    });
    pole(-22);
    pole(22);
    pen.shape([cx + 2, by - 64, cx + 14, by - 61, cx + 2, by - 57], '#f4c35a', 1);
  },
  radio(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 8;
    const ctx = pen.ctx;
    pen.line([cx + 8, by - 22, cx + 16, by - 36], 1.2);
    box3(pen, cx - 16, by - 22, 32, 20, 8, '#e98f74', shade('#e98f74', 0.15));
    pen.ellipse(cx - 6, by - 12, 6, 6, '#f7e3c6', 1.2);
    ctx.fillStyle = rgba('#4a3a34', 0.4);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) ctx.fillRect(cx - 9 + i * 3, by - 15 + j * 3, 1.2, 1.2);
    pen.shape([cx + 3, by - 18, cx + 12, by - 18, cx + 12, by - 12, cx + 3, by - 12], '#fff6dc', 1);
    pen.ellipse(cx + 7, by - 7, 2, 2, '#4a3a34', 0.8);
    // floating notes
    for (let i = 0; i < 2; i++) {
      const p = (d.t * 0.4 + i * 0.5) % 1;
      const nx = cx + 10 + p * 12 + Math.sin(p * 6 + i) * 3, ny = by - 30 - p * 30;
      ctx.globalAlpha = 1 - p;
      pen.line([nx, ny, nx, ny - 7], 1);
      pen.ellipse(nx - 1.6, ny, 2, 1.5, '#4a3a34', 0.5);
      ctx.globalAlpha = 1;
    }
  },
  table(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 6;
    pen.tube([cx - 10, by, cx - 8, by - 30], 2.6, WOOD_D);
    pen.tube([cx + 10, by, cx + 8, by - 30], 2.6, WOOD_D);
    pen.tube([cx, by - 2, cx, by - 30], 2.6, shade(WOOD_D, -0.1));
    pen.ellipse(cx, by - 32, 20, 7, WOOD);
    // teacup
    pen.shape([cx + 4, by - 40, cx + 13, by - 40, cx + 12, by - 34, cx + 5, by - 34], '#ffffff', 1.1);
    pen.line([cx + 13, by - 39, cx + 16, by - 37, cx + 13, by - 35], 1);
    const st = Math.sin(d.t * 2) * 1.5;
    pen.line([cx + 8 + st, by - 43, cx + 9 - st, by - 48, cx + 8 + st, by - 53], 1, rgba('#4a3a34', 0.35));
  },
  basket(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 8;
    pen.ellipse(cx, by - 18, 20, 7, '#c99a62');
    pen.ellipse(cx, by - 18, 15, 4.5, '#f6e7cf', 1);
    const p = pen.shape([cx - 20, by - 18, cx + 20, by - 18, cx + 16, by, cx - 16, by], '#d9ab70');
    pen.clip(p, () => {
      for (let i = 0; i < 8; i++) pen.line([cx - 22 + i * 6, by - 20, cx - 18 + i * 6, by + 2], 1, rgba('#8a6440', 0.5), 0.3);
      pen.line([cx - 22, by - 9, cx + 22, by - 9], 1, rgba('#8a6440', 0.5), 0.3);
    });
  },
  heater(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 8;
    const ctx = pen.ctx;
    pen.shape([cx - 15, by - 36, cx + 15, by - 36, cx + 15, by - 4, cx - 15, by - 4], '#e9ddc8');
    const glow = 0.7 + Math.sin(d.t * 3) * 0.15;
    pen.shape([cx - 10, by - 30, cx + 10, by - 30, cx + 10, by - 10, cx - 10, by - 10], `rgba(255,${140 + glow * 40},80,${glow})`, 1);
    for (let i = 0; i < 4; i++) pen.line([cx - 10, by - 26 + i * 5, cx + 10, by - 26 + i * 5], 0.9, rgba('#4a3a34', 0.5), 0.2);
    pen.tube([cx - 10, by - 4, cx - 12, by], 2, '#8a8c94');
    pen.tube([cx + 10, by - 4, cx + 12, by], 2, '#8a8c94');
    void ctx;
  },
  yarn(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 14;
    pen.line([cx + 7, by + 3, cx + 14, by + 6, cx + 18, by + 3, cx + 22, by + 7], 1.2, '#e86c8a');
    const p = pen.ellipse(cx, by, 8, 7.5, '#f490a8');
    pen.clip(p, () => {
      for (let i = -2; i <= 2; i++) pen.line([cx - 9, by + i * 3.2 - 3, cx + 9, by + i * 3.2 + 3], 1, rgba('#b04a66', 0.6), 0.3);
    });
  },
  mouse_toy(d, x, y, w, h) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, by = y + h * CELL - 14;
    pen.line([cx - 7, by + 1, cx - 12, by + 4, cx - 17, by + 1], 1, '#4a3a34');
    pen.shape([cx - 8, by + 2, cx - 4, by - 5, cx + 4, by - 4, cx + 9, by + 2], '#b9b4b0');
    pen.ellipse(cx + 1, by - 6, 2.6, 2.6, '#f2b3b3', 0.9);
    pen.ctx.fillStyle = '#4a3a34';
    pen.ctx.beginPath();
    pen.ctx.arc(cx + 6, by - 1, 0.9, 0, 7);
    pen.ctx.fill();
  },
  piano(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 8, x1 = x + w * CELL - 8, by = y + h * CELL - 6;
    box3(pen, x0, by - 46, x1 - x0, 46, 10, '#6b5049', shade('#6b5049', 0.12));
    pen.shape([x0 + 4, by - 26, x1 - 4, by - 26, x1 - 4, by - 19, x0 + 4, by - 19], '#fffaf0', 1);
    const ctx = pen.ctx;
    ctx.fillStyle = '#4a3a34';
    for (let i = 0; i < 12; i++) if (i % 7 !== 2 && i % 7 !== 6) ctx.fillRect(x0 + 8 + i * ((x1 - x0 - 12) / 12), by - 26, 2, 4);
    pen.line([x0 + 4, by - 19, x0 + 4, by], 1);
    pen.line([x1 - 4, by - 19, x1 - 4, by], 1);
    pen.shape([x0 + 30, by - 44, x0 + 50, by - 44, x0 + 50, by - 34, x0 + 30, by - 34], '#fff6dc', 1);
  },
  collection_shelf(d, x, y, w, h) {
    const { pen } = d;
    const x0 = x + 5, x1 = x + w * CELL - 5, by = y + h * CELL - 6, top = by - 70;
    box3(pen, x0, top, x1 - x0, by - top, 8, '#f0e2c8', shade('#f0e2c8', 0.1));
    pen.shape([x0 + 4, top + 4, x1 - 4, top + 4, x1 - 4, by - 6, x0 + 4, by - 6], 'rgba(200,230,245,0.45)', 1);
    for (const sy of [top + 24, top + 45]) pen.line([x0 + 4, sy, x1 - 4, sy], 1.2);
    const cols = ['#f7c75a', '#9ccf86', '#f2a1a1', '#9fc3e8', '#d1b3e6'];
    for (let r = 0; r < 3; r++) {
      const sy = r === 0 ? top + 24 : r === 1 ? top + 45 : by - 6;
      for (let i = 0; i < 3; i++) pen.ellipse(x0 + 9 + i * 9, sy - 4, 3, 3, cols[(r + i) % cols.length], 0.8);
    }
  },
};

export function drawFurniture(id: string, d: DrawCtx, x: number, y: number, w: number, h: number, layer: Layer) {
  const fn = draws[id];
  if (!fn) return;
  const ctx = d.pen.ctx;
  if (d.flip) {
    const cx = x + (w * CELL) / 2;
    ctx.save();
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
    fn(d, x, y, w, h, layer);
    ctx.restore();
  } else fn(d, x, y, w, h, layer);
}

export const HAS_FRONT = new Set(['box', 'bed_round', 'tree_big', 'tunnel', 'kotatsu', 'teepee']);

// ---- wall items ----
export interface SkyInfo {
  sky: string; // sky color
  sun: number; // 0..1 daylight
  rain: number;
  snow: number;
  hour: number;
}

type WDraw = (d: DrawCtx, x: number, w: number, sky: SkyInfo) => void;
const wallDraws: Record<string, WDraw> = {
  window(d, x, w, sky) {
    const { pen } = d;
    const ctx = pen.ctx;
    const x0 = x + 8, x1 = x + w * CELL - 8, top = -WALL_H + 30, bot = -46;
    const frame = pen.shape([x0, top, x1, top, x1, bot, x0, bot], sky.sky, 2.2);
    pen.clip(frame, () => {
      // clouds or stars
      if (sky.sun > 0.3) {
        for (let i = 0; i < 2; i++) {
          const cx = x0 + ((d.t * 2 + i * 50) % (x1 - x0 + 40)) - 20, cy = top + 18 + i * 22;
          ctx.fillStyle = 'rgba(255,255,255,0.85)';
          ctx.beginPath();
          ctx.ellipse(cx, cy, 12, 5, 0, 0, 7);
          ctx.ellipse(cx + 7, cy - 3, 7, 5, 0, 0, 7);
          ctx.fill();
        }
      } else {
        ctx.fillStyle = '#fff6c8';
        for (let i = 0; i < 6; i++) {
          const sx = x0 + hashf(i, 3) * (x1 - x0), sy = top + hashf(i, 5) * (bot - top) * 0.7;
          const tw = 0.6 + Math.sin(d.t * 2 + i) * 0.4;
          ctx.globalAlpha = tw;
          ctx.fillRect(sx, sy, 1.5, 1.5);
        }
        ctx.globalAlpha = 1;
        pen.ellipse(x1 - 16, top + 16, 6, 6, '#fff3b0', 0);
      }
      // distant hills
      pen.shape([x0 - 5, bot, x0 + 10, bot - 22, x0 + 35, bot - 14, x0 + 60, bot - 28, x1 + 10, bot - 12, x1 + 10, bot + 5], sky.sun > 0.3 ? '#bfe0b0' : '#5b6f86', 0, null);
      if (sky.rain > 0) {
        ctx.strokeStyle = 'rgba(255,255,255,0.7)';
        ctx.lineWidth = 1;
        for (let i = 0; i < 14; i++) {
          const rx = x0 + ((hashf(i, 1) * (x1 - x0) + d.t * 30) % (x1 - x0 + 10)), ry = top + ((hashf(i, 2) * (bot - top) + d.t * 140) % (bot - top));
          ctx.beginPath();
          ctx.moveTo(rx, ry);
          ctx.lineTo(rx - 2, ry + 6);
          ctx.stroke();
        }
      }
      if (sky.snow > 0) {
        ctx.fillStyle = '#ffffff';
        for (let i = 0; i < 14; i++) {
          const rx = x0 + ((hashf(i, 1) * (x1 - x0) + Math.sin(d.t + i) * 4) % (x1 - x0)), ry = top + ((hashf(i, 2) * (bot - top) + d.t * 18) % (bot - top));
          ctx.beginPath();
          ctx.arc(rx, ry, 1.4, 0, 7);
          ctx.fill();
        }
      }
    });
    pen.fillStroke(frame, null, 2.2);
    const mx = (x0 + x1) / 2;
    pen.line([mx, top, mx, bot], 2.2, '#4a3a34');
    pen.line([x0, (top + bot) / 2, x1, (top + bot) / 2], 2.2, '#4a3a34');
    // curtains
    const sw = Math.sin(d.t * 0.8) * 1.5;
    pen.shape([x0 - 8, top - 6, x0 + 8, top - 6, x0 + 3 + sw, bot + 4, x0 - 10, bot + 6], '#f4c5bd');
    pen.shape([x1 - 8, top - 6, x1 + 8, top - 6, x1 + 10, bot + 6, x1 - 3 + sw, bot + 4], '#f4c5bd');
    pen.line([x0 - 14, top - 7, x1 + 14, top - 7], 2.4, WOOD_D);
    // sill
    box3(pen, x0 - 10, bot, x1 - x0 + 20, 6, 8, WOOD, shade(WOOD, 0.12));
  },
  painting(d, x, w) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, cy = -WALL_H + 62;
    pen.shape([cx - 16, cy - 20, cx + 16, cy - 20, cx + 16, cy + 18, cx - 16, cy + 18], WOOD_D, 1.8);
    pen.shape([cx - 12, cy - 16, cx + 12, cy - 16, cx + 12, cy + 14, cx - 12, cy + 14], '#fbf3e3', 1);
    pen.ellipse(cx - 1, cy, 7, 4, '#86b6d9', 1);
    pen.shape([cx + 5, cy, cx + 10, cy - 4, cx + 10, cy + 4], '#86b6d9', 1);
    pen.ctx.fillStyle = '#4a3a34';
    pen.ctx.beginPath();
    pen.ctx.arc(cx - 4, cy - 1, 0.9, 0, 7);
    pen.ctx.fill();
  },
  clock(d, x, w) {
    const { pen } = d;
    const ctx = pen.ctx;
    const cx = x + (w * CELL) / 2, cy = -WALL_H + 58;
    const sw = Math.sin(d.t * 3) * 0.5;
    pen.tube([cx, cy + 14, cx + Math.sin(sw) * 16, cy + 14 + Math.cos(sw) * 16], 3, '#4f4a4c');
    pen.shape([cx - 12, cy - 6, cx - 11, cy - 20, cx - 4, cy - 12], '#4f4a4c');
    pen.shape([cx + 12, cy - 6, cx + 11, cy - 20, cx + 4, cy - 12], '#4f4a4c');
    pen.ellipse(cx, cy, 14, 14, '#4f4a4c');
    pen.ellipse(cx, cy, 10, 10, '#fffaf0', 1);
    const now = new Date(clockNow());
    const hr = ((now.getHours() % 12) + now.getMinutes() / 60) / 12;
    const mn = now.getMinutes() / 60;
    ctx.strokeStyle = '#4a3a34';
    ctx.lineCap = 'round';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(hr * Math.PI * 2) * 5, cy - Math.cos(hr * Math.PI * 2) * 5);
    ctx.stroke();
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.sin(mn * Math.PI * 2) * 8, cy - Math.cos(mn * Math.PI * 2) * 8);
    ctx.stroke();
  },
  shelf(d, x, w) {
    const { pen } = d;
    const x0 = x + 4, x1 = x + w * CELL - 4, y0 = -74;
    pen.line([x0 + 10, y0, x0 + 10, y0 + 12, x0 + 20, y0], 1.4);
    pen.line([x1 - 10, y0, x1 - 10, y0 + 12, x1 - 20, y0], 1.4);
    box3(pen, x0, y0 - 5, x1 - x0, 5, 8, WOOD, shade(WOOD, 0.12));
    // small pot + books
    pen.shape([x1 - 22, y0 - 5, x1 - 12, y0 - 5, x1 - 13, y0 - 14, x1 - 21, y0 - 14], '#e9a47e', 1);
    pen.line([x1 - 17, y0 - 14, x1 - 20, y0 - 22], 1.2, GREEN_D);
    pen.line([x1 - 17, y0 - 14, x1 - 13, y0 - 21], 1.2, GREEN_D);
  },
  fairy_lights(d, x, w) {
    const { pen } = d;
    const ctx = pen.ctx;
    const x0 = x + 6, x1 = x + w * CELL - 6, y0 = -WALL_H + 22;
    const pts: number[] = [];
    const n = 7;
    for (let i = 0; i <= n; i++) {
      const tt = i / n;
      pts.push(x0 + (x1 - x0) * tt, y0 + Math.sin(tt * Math.PI * 2) * 0 + Math.abs(Math.sin(tt * Math.PI * 2)) * 10);
    }
    pen.line(pts, 1, rgba('#4a3a34', 0.7));
    const cols = ['#ffd45e', '#f6a0b0', '#a8d8f0', '#c3e6a0'];
    for (let i = 0; i <= n; i++) {
      const lx = pts[i * 2], ly = pts[i * 2 + 1] + 4;
      const on = d.night > 0.3 ? 0.6 + Math.sin(d.t * 2.5 + i * 1.3) * 0.4 : 0;
      if (on > 0) {
        const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 12);
        g.addColorStop(0, rgba(cols[i % 4], 0.6 * on));
        g.addColorStop(1, rgba(cols[i % 4], 0));
        ctx.fillStyle = g;
        ctx.fillRect(lx - 12, ly - 12, 24, 24);
      }
      const star: number[] = [];
      for (let k = 0; k < 10; k++) {
        const a = (k / 10) * Math.PI * 2 - Math.PI / 2;
        const r = k % 2 === 0 ? 4 : 1.8;
        star.push(lx + Math.cos(a) * r, ly + Math.sin(a) * r);
      }
      pen.shape(star, cols[i % 4], 0.8);
    }
  },
  photo(d, x, w) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, cy = -WALL_H + 70;
    pen.shape([cx - 12, cy - 14, cx + 12, cy - 14, cx + 12, cy + 12, cx - 12, cy + 12], '#ffffff', 1.6);
    pen.shape([cx - 9, cy - 11, cx + 9, cy - 11, cx + 9, cy + 6, cx - 9, cy + 6], '#cfe6f2', 0.8);
    pen.ellipse(cx - 2, cy + 1, 4.5, 4, '#f6b26b', 0.8);
    pen.shape([cx - 6, cy - 1, cx - 5.5, cy - 6, cx - 3, cy - 3], '#f6b26b', 0.8);
    pen.shape([cx + 2, cy - 1, cx + 1.5, cy - 6, cx - 1, cy - 3], '#f6b26b', 0.8);
    pen.line([cx + 4, cy + 4, cx + 7, cy - 1], 2.2, '#f2c6a0');
  },
  wreath(d, x, w) {
    const { pen } = d;
    const cx = x + (w * CELL) / 2, cy = -WALL_H + 64;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      pen.ellipse(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 5, 3, i % 2 ? GREEN : GREEN_D, 0.8, undefined, a + 1.2, 6);
    }
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.4;
      pen.ellipse(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 3, 3, ['#f49ab0', '#ffd666', '#f49ab0', '#c7a8f0'][i], 0.8);
    }
    pen.shape([cx - 2, cy + 12, cx - 7, cy + 20, cx, cy + 15, cx + 7, cy + 20, cx + 2, cy + 12], '#f28ba8', 0.9);
  },
};

export function drawWallItem(id: string, d: DrawCtx, x: number, w: number, sky: SkyInfo) {
  wallDraws[id]?.(d, x, w, sky);
}

// ---- wallpaper & floor ----
const WP: Record<string, { base: string; draw?: (ctx: CanvasRenderingContext2D, pen: Pen, x: number, y: number, w: number, h: number) => void }> = {
  wp_cream: { base: '#fbf1df' },
  wp_stripe: {
    base: '#fde8e6',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.fillStyle = 'rgba(244,170,170,0.35)';
      for (let i = 0; i < w; i += 22) ctx.fillRect(x + i, y, 10, h);
    },
  },
  wp_dots: {
    base: '#eef4fb',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.fillStyle = 'rgba(150,185,225,0.5)';
      for (let j = 0, r = 0; j < h; j += 20, r++)
        for (let i = r % 2 ? 10 : 0; i < w; i += 20) {
          ctx.beginPath();
          ctx.arc(x + i, y + j + 8, 2.6, 0, 7);
          ctx.fill();
        }
    },
  },
  wp_fish: {
    base: '#eaf5f4',
    draw: (ctx, pen, x, y, w, h) => {
      for (let j = 0, r = 0; j < h; j += 30, r++)
        for (let i = r % 2 ? 18 : 0; i < w + 20; i += 36) {
          const fx = x + i, fy = y + j + 14;
          ctx.fillStyle = 'rgba(120,180,200,0.45)';
          ctx.beginPath();
          ctx.ellipse(fx, fy, 6, 3.4, 0, 0, 7);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(fx + 5, fy);
          ctx.lineTo(fx + 10, fy - 3.5);
          ctx.lineTo(fx + 10, fy + 3.5);
          ctx.fill();
        }
    },
  },
  wp_night: {
    base: '#46507a',
    draw: (ctx, pen, x, y, w, h) => {
      for (let i = 0; i < 70; i++) {
        const sx = x + hashf(i, 77) * w, sy = y + hashf(i, 78) * h;
        ctx.fillStyle = i % 7 === 0 ? '#ffe9a0' : 'rgba(255,255,255,0.7)';
        const r = i % 7 === 0 ? 2 : 1;
        ctx.fillRect(sx, sy, r, r);
      }
      ctx.fillStyle = '#ffe9a0';
      ctx.beginPath();
      ctx.arc(x + w * 0.8, y + 30, 10, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#46507a';
      ctx.beginPath();
      ctx.arc(x + w * 0.8 + 5, y + 27, 9, 0, 7);
      ctx.fill();
    },
  },
  wp_wood: {
    base: '#e7cba5',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.strokeStyle = 'rgba(150,105,60,0.35)';
      ctx.lineWidth = 1.2;
      for (let i = 0; i < w; i += 26) {
        ctx.beginPath();
        ctx.moveTo(x + i, y);
        ctx.lineTo(x + i, y + h);
        ctx.stroke();
      }
      for (let i = 0; i < 25; i++) {
        const kx = x + hashf(i, 4) * w, ky = y + hashf(i, 5) * h;
        ctx.beginPath();
        ctx.ellipse(kx, ky, 3, 1.5, 0, 0, 7);
        ctx.stroke();
      }
    },
  },
  wp_mint: {
    base: '#e6f4ec',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.fillStyle = 'rgba(140,200,170,0.22)';
      for (let i = 0; i < w; i += 28) ctx.fillRect(x + i, y, 12, h);
      for (let j = 0; j < h; j += 28) ctx.fillRect(x, y + j, w, 12);
    },
  },
  wp_sakura: {
    base: '#fdf0f2',
    draw: (ctx, pen, x, y, w, h) => {
      for (let i = 0; i < 40; i++) {
        const fx = x + hashf(i, 21) * w, fy = y + hashf(i, 22) * h;
        ctx.fillStyle = 'rgba(244,160,180,0.5)';
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2 + i;
          ctx.beginPath();
          ctx.ellipse(fx + Math.cos(a) * 3, fy + Math.sin(a) * 3, 2.4, 1.6, a, 0, 7);
          ctx.fill();
        }
      }
    },
  },
};

const FL: Record<string, { base: string; draw?: (ctx: CanvasRenderingContext2D, pen: Pen, x: number, y: number, w: number, h: number) => void }> = {
  fl_wood: {
    base: '#ecd2ac',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.strokeStyle = 'rgba(160,110,60,0.35)';
      ctx.lineWidth = 1.2;
      for (let j = 0, r = 0; j <= h; j += 22, r++) {
        ctx.beginPath();
        ctx.moveTo(x, y + j);
        ctx.lineTo(x + w, y + j);
        ctx.stroke();
        for (let i = (r % 3) * 30; i < w; i += 90) {
          ctx.beginPath();
          ctx.moveTo(x + i, y + j);
          ctx.lineTo(x + i, y + j + 22);
          ctx.stroke();
        }
      }
    },
  },
  fl_tatami: {
    base: '#dfe3b5',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.strokeStyle = 'rgba(120,130,60,0.25)';
      ctx.lineWidth = 0.8;
      for (let j = 0; j < h; j += 4) {
        ctx.beginPath();
        ctx.moveTo(x, y + j);
        ctx.lineTo(x + w, y + j);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(90,110,60,0.6)';
      ctx.lineWidth = 3;
      for (let i = 0; i < w; i += 88) {
        ctx.strokeRect(x + i, y, 88, h / 2);
        ctx.strokeRect(x + i + 44, y + h / 2, 88, h / 2);
      }
    },
  },
  fl_tile: {
    base: '#f4efe6',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.fillStyle = 'rgba(160,190,210,0.35)';
      for (let j = 0, r = 0; j < h; j += 22, r++) for (let i = r % 2 ? 22 : 0; i < w; i += 44) ctx.fillRect(x + i, y + j, 22, 22);
    },
  },
  fl_carpet: {
    base: '#e9c9c0',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let i = 0; i < 300; i++) ctx.fillRect(x + hashf(i, 9) * w, y + hashf(i, 10) * h, 1.5, 1.5);
    },
  },
  fl_herring: {
    base: '#e3c49c',
    draw: (ctx, pen, x, y, w, h) => {
      ctx.strokeStyle = 'rgba(150,100,55,0.35)';
      ctx.lineWidth = 1;
      for (let j = -h; j < h * 2; j += 14) {
        for (let i = 0; i < w; i += 28) {
          ctx.beginPath();
          ctx.moveTo(x + i, y + j);
          ctx.lineTo(x + i + 14, y + j + 14);
          ctx.lineTo(x + i + 28, y + j);
          ctx.stroke();
        }
      }
    },
  },
};

export function drawWallpaper(id: string, pen: Pen, x: number, y: number, w: number, h: number) {
  const wp = WP[id] ?? WP.wp_cream;
  const ctx = pen.ctx;
  ctx.fillStyle = wp.base;
  ctx.fillRect(x, y, w, h);
  if (wp.draw) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    wp.draw(ctx, pen, x, y, w, h);
    ctx.restore();
  }
}

export function drawFloor(id: string, pen: Pen, x: number, y: number, w: number, h: number) {
  const fl = FL[id] ?? FL.fl_wood;
  const ctx = pen.ctx;
  ctx.fillStyle = fl.base;
  ctx.fillRect(x, y, w, h);
  if (fl.draw) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    fl.draw(ctx, pen, x, y, w, h);
    ctx.restore();
  }
}

export function wallpaperBase(id: string) {
  return (WP[id] ?? WP.wp_cream).base;
}
