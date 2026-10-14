// World props in line-art style. Each draws with its base at (0,0).
import { Pen, shade, rgba, mix } from '../engine/pen';
import { hashf } from '../../../shared/rng';
import type { PropKind } from '../../../shared/world';

const INK = '#4a3a34';
const TRUNK = '#b58a63';
const WOOD = '#dcb58a';
const WOOD_D = '#b98d61';

export interface PropCtx {
  season: number;
  night: number;
  t: number;
  label?: string;
}

/** Visual bounds relative to base: [left, top, right, bottom]. */
export const BOUNDS: Partial<Record<PropKind, [number, number, number, number]>> = {
  tree: [-50, -118, 50, 10], pine: [-38, -120, 38, 10], sakura: [-52, -118, 52, 10], bigtree: [-80, -170, 80, 12],
  bush: [-26, -34, 26, 8], flower: [-8, -18, 8, 4], flowers: [-26, -22, 26, 6], rock: [-18, -18, 18, 6], mushroom: [-9, -16, 9, 4],
  stump: [-22, -24, 22, 8], reed: [-14, -44, 14, 4], lily: [-14, -8, 14, 8], lamp: [-10, -78, 10, 6], bench: [-34, -30, 34, 6],
  fence: [-4, -26, 40, 6], mailbox: [-10, -40, 10, 6], board: [-28, -60, 28, 6], sign: [-36, -58, 36, 6], fountain: [-64, -84, 64, 14],
  house: [-80, -150, 80, 8], shop: [-130, -190, 130, 10], slide: [-46, -66, 46, 8], swing: [-50, -70, 50, 8], sandbox: [-36, -18, 36, 18],
  windmill: [-80, -190, 80, 10], lighthouse: [-40, -200, 40, 10], boat: [-34, -26, 34, 12], picnic: [-36, -24, 36, 16],
  telescope: [-16, -44, 16, 6], table: [-26, -56, 26, 6], well: [-26, -64, 26, 8], crop: [-12, -26, 12, 4], post: [-6, -26, 6, 4],
  cart: [-32, -64, 32, 8], hive: [-14, -28, 14, 4], kite: [-20, -20, 20, 20],
  snowman: [-22, -62, 22, 6], flowerarch: [-50, -96, 50, 8], parasol: [-34, -66, 34, 14], pumpkins: [-26, -30, 26, 6], lanterns: [-130, -110, 130, 6],
};

function canopyColors(season: number, v: number): [string, string] {
  switch (season) {
    case 0: return v === 2 ? ['#c8e6a0', '#a9d389'] : ['#b8de96', '#96c87a'];
    case 1: return ['#8fcb7a', '#73b462'];
    case 2: return v === 0 ? ['#f6b85c', '#e99a45'] : v === 1 ? ['#ef8c5a', '#da6f45'] : ['#f2cf62', '#e2b44a'];
    default: return ['#d7e2d0', '#bccbb6'];
  }
}

function blobCluster(pen: Pen, cx: number, cy: number, r: number, n: number, seed: number, fill: string, lw?: number) {
  const pts: number[] = [];
  const lobes = n + 3;
  const m = lobes * 2;
  for (let i = 0; i < m; i++) {
    const a = (i / m) * Math.PI * 2 + seed;
    const bump = i % 2 === 1 ? 1.1 : 0.93;
    const rr = r * bump * (0.94 + hashf(seed, i) * 0.12);
    pts.push(cx + Math.cos(a) * rr * 1.06, cy + Math.sin(a) * rr * 0.92);
  }
  return pen.shape(pts, fill, lw);
}

function tree(pen: Pen, c: PropCtx, v: number, big = false, sakura = false) {
  const s = big ? 1.5 : 1;
  pen.tube([0, 2, -1, -18 * s, 2 * s, -34 * s], 7 * s, TRUNK);
  pen.line([-5 * s, -26 * s, -14 * s, -40 * s], 4 * s, TRUNK);
  let [c1, c2] = canopyColors(c.season, v);
  if (sakura && c.season === 0) [c1, c2] = ['#fbd3df', '#f4b3c6'];
  if (sakura && c.season === 1) [c1, c2] = ['#9fd08a', '#82bb6c'];
  if (c.season === 3 && !big && v === 1) {
    // bare winter tree
    pen.line([2 * s, -34 * s, 12 * s, -60 * s], 3 * s, TRUNK);
    pen.line([0, -34 * s, -10 * s, -66 * s], 3 * s, TRUNK);
    pen.line([6 * s, -48 * s, 20 * s, -58 * s], 2 * s, TRUNK);
    pen.line([-6 * s, -50 * s, -20 * s, -56 * s], 2 * s, TRUNK);
    return;
  }
  const seed = v * 13 + (big ? 7 : 0);
  const shapes: [number, number, number][] = v === 0
    ? [[-16, -56, 22], [16, -58, 22], [0, -76, 26], [0, -50, 22]]
    : v === 1
      ? [[-12, -60, 26], [14, -66, 24], [0, -84, 20]]
      : [[0, -64, 32], [-20, -54, 16], [20, -52, 16]];
  for (const [x, y, r] of shapes) blobCluster(pen, x * s, y * s, r * s, 5, seed + x, c2);
  for (const [x, y, r] of shapes) {
    const ctx = pen.ctx;
    ctx.fillStyle = c1;
    ctx.beginPath();
    ctx.ellipse(x * s - r * s * 0.15, y * s - r * s * 0.18, r * s * 0.72, r * s * 0.62, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  // leaf strokes
  for (let i = 0; i < 6; i++) {
    const x = (hashf(seed, i, 3) - 0.5) * 50 * s, y = -50 * s - hashf(seed, i, 4) * 36 * s;
    pen.line([x, y, x + 4 * s, y - 3 * s], 1.1, rgba(INK, 0.35), 0.3);
  }
  if (c.season === 3) {
    // snow caps
    for (const [x, y, r] of shapes) pen.ellipse(x * s, (y - r * 0.6) * s, r * 0.7 * s, r * 0.28 * s, '#ffffff', 1, rgba(INK, 0.5));
  }
  if (c.season === 1 && v === 0 && !sakura) {
    for (let i = 0; i < 5; i++) pen.ellipse((hashf(v, i, 8) - 0.5) * 44, -50 - hashf(v, i, 9) * 30, 3, 3, '#ef6f61', 0.8);
  }
}

function pine(pen: Pen, c: PropCtx, v: number) {
  pen.tube([0, 2, 0, -18], 6, TRUNK);
  const col = c.season === 3 ? '#8fb39a' : v === 2 ? '#7cad76' : '#6f9f6e';
  const tiers = [[-34, -18, 30], [-56, -38, 24], [-78, -58, 17]];
  for (const [y0, y1, w] of tiers) {
    const pts = [-w, y0 + 14, -w * 0.4, y0 + 10, 0, y0 + 15, w * 0.4, y0 + 10, w, y0 + 14, w * 0.3, y1 - 6, 0, y1 - 14, -w * 0.3, y1 - 6];
    pen.shape(pts, col);
    if (c.season === 3) pen.shape([-w * 0.32, y1 - 4, 0, y1 - 14, w * 0.32, y1 - 4, 0, y1 - 2], '#ffffff', 1);
  }
}

function house(pen: Pen, c: PropCtx, v: number, label?: string, shop = false) {
  const ctx = pen.ctx;
  const W = shop ? 230 : 136, Hh = shop ? 110 : 78;
  const walls = ['#fbe6cf', '#e8f1f7', '#fde3e3', '#eef6e4', '#fff1c9', '#f1e6f7', '#e7f2ee', '#fbe8d8'];
  const roofs = ['#e58f75', '#8fb6d9', '#f0a6a6', '#9fc98a', '#e8b65e', '#b9a2d6', '#7fc0b0', '#d98f6a'];
  const shopWall = ['#fff3dc', '#efe6d6', '#f6e5d4', '#e9f0f4', '#f7ede2', '#fbeef2', '#f1ecf8'];
  const shopRoof = ['#e48c6a', '#7c9cc9', '#a77b5f', '#86b37a', '#d95f5f', '#f19bb5', '#8a7cc0'];
  const wall = shop ? shopWall[v % 7] : walls[v % 8];
  const roof = shop ? shopRoof[v % 7] : roofs[v % 8];
  const x0 = -W / 2, x1 = W / 2, top = -Hh;
  // body
  pen.poly([x0, 0, x0, top, x1, top, x1, 0], wall);
  // wood beams / texture
  pen.line([x0 + 2, top + 10, x1 - 2, top + 10], 1, rgba(INK, 0.2));
  // roof
  const rh = shop ? 66 : 62;
  const rp = shop
    ? [x0 - 14, top + 6, x0 + 10, top - rh, x1 - 10, top - rh, x1 + 14, top + 6]
    : [x0 - 12, top + 6, 0, top - rh, x1 + 12, top + 6];
  const roofPath = pen.poly(rp, roof, undefined, undefined, 0.15);
  pen.clip(roofPath, () => {
    for (let i = 1; i < 6; i++) pen.line([x0 - 20, top + 6 - i * 13, x1 + 20, top + 6 - i * 13], 1.1, rgba(INK, 0.28), 0.4);
    for (let i = 0; i < 18; i++) {
      const sx = x0 - 10 + i * 16, sy = top + 6 - ((i % 5) + 1) * 13;
      pen.line([sx, sy, sx + 2, sy + 13], 1, rgba(INK, 0.2), 0.3);
    }
  });
  if (c.season === 3) pen.shape([rp[0] + 6, rp[1] - 6, ...(shop ? [rp[2] + 4, rp[3] + 4, rp[4] - 4, rp[5] + 4] : [0, top - rh + 6]), rp[rp.length - 2] - 6, rp[rp.length - 1] - 6, ...(shop ? [x1 - 20, top - 4, 0, top - 10, x0 + 20, top - 4] : [0, top - 4])], '#ffffff', 1.1);
  // chimney
  if (!shop) {
    pen.poly([x1 - 40, top - 30, x1 - 40, top - 52, x1 - 28, top - 52, x1 - 28, top - 20], '#c98e74');
  }
  // windows
  const lit = c.night > 0.4;
  const winCol = lit ? '#ffe39a' : '#bfe0f2';
  const win = (wx: number, wy: number, ww: number, wh: number) => {
    pen.poly([wx, wy, wx + ww, wy, wx + ww, wy + wh, wx, wy + wh], winCol, 1.6);
    pen.line([wx + ww / 2, wy, wx + ww / 2, wy + wh], 1.4);
    pen.line([wx, wy + wh / 2, wx + ww, wy + wh / 2], 1.4);
    pen.poly([wx - 3, wy + wh, wx + ww + 3, wy + wh, wx + ww + 3, wy + wh + 4, wx - 3, wy + wh + 4], WOOD, 1);
  };
  if (shop) {
    win(x0 + 18, top + 28, 44, 36);
    win(x1 - 62, top + 28, 44, 36);
  } else {
    win(x0 + 14, top + 22, 28, 26);
    win(x1 - 42, top + 22, 28, 26);
    // flower box
    pen.poly([x1 - 46, top + 52, x1 - 10, top + 52, x1 - 12, top + 58, x1 - 44, top + 58], '#c98e74', 1);
    for (let i = 0; i < 4; i++) pen.ellipse(x1 - 40 + i * 8, top + 50, 3, 3, ['#f49ab0', '#ffd666', '#f49ab0', '#c7a8f0'][i], 0.8);
  }
  // door
  const dw = shop ? 34 : 28, dh = shop ? 52 : 44;
  pen.poly([-dw / 2, 0, -dw / 2, -dh + 8, -dw / 2 + 4, -dh + 2, 0, -dh, dw / 2 - 4, -dh + 2, dw / 2, -dh + 8, dw / 2, 0], lit ? '#f0c27a' : shade(roof, -0.15), undefined, undefined, 0.5);
  ctx.fillStyle = INK;
  ctx.beginPath();
  ctx.arc(dw / 2 - 7, -dh / 2, 1.8, 0, 7);
  ctx.fill();
  if (!shop) {
    // a little cat door, because cats
    pen.shape([-7, 0, -7, -10, 0, -14, 7, -10, 7, 0], shade(roof, -0.3), 1);
  }
  // step
  pen.poly([-dw / 2 - 6, 0, dw / 2 + 6, 0, dw / 2 + 4, 6, -dw / 2 - 4, 6], '#d8cfc2', 1);
  if (shop) {
    // awning
    const ay = top + 4;
    const aw = pen.poly([x0 + 6, ay, x1 - 6, ay, x1 + 2, ay + 18, x0 - 2, ay + 18], '#ffffff');
    pen.clip(aw, () => {
      ctx.fillStyle = roof;
      for (let i = 0; i < 14; i++) if (i % 2 === 0) ctx.fillRect(x0 - 4 + i * ((W + 8) / 14), ay - 2, (W + 8) / 14, 24);
    });
    pen.fillStroke(aw, null);
    for (let i = 0; i < 14; i++) {
      const sx = x0 - 2 + i * ((W + 4) / 14);
      pen.shape([sx, ay + 18, sx + (W + 4) / 14, ay + 18, sx + (W + 4) / 28, ay + 25], i % 2 === 0 ? roof : '#ffffff', 1);
    }
    // signboard
    const sy = top - rh + 8;
    pen.poly([-56, sy, 56, sy, 56, sy + 30, -56, sy + 30], '#fff8e8', 1.8, undefined, 0.35);
    if (label) {
      ctx.fillStyle = INK;
      ctx.font = 'bold 19px "PingFang SC","Microsoft YaHei",system-ui';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, 0, sy + 16);
    }
    shopIcon(pen, v, x1 - 30, top - 6);
  }
}

function shopIcon(pen: Pen, v: number, x: number, y: number) {
  switch (v) {
    case 0: // bread
      pen.ellipse(x, y, 16, 9, '#e9b46a');
      for (let i = -1; i <= 1; i++) pen.line([x + i * 6 - 2, y - 6, x + i * 6 + 2, y + 2], 1.4);
      break;
    case 1: // book
      pen.shape([x - 16, y - 10, x, y - 6, x + 16, y - 10, x + 16, y + 10, x, y + 14, x - 16, y + 10], '#9ec3e6');
      pen.line([x, y - 6, x, y + 14], 1.4);
      break;
    case 2: // cup
      pen.shape([x - 11, y - 8, x + 11, y - 8, x + 8, y + 10, x - 8, y + 10], '#ffffff');
      pen.line([x + 11, y - 4, x + 17, y, x + 10, y + 5], 1.6);
      pen.line([x - 3, y - 12, x - 1, y - 20, x - 4, y - 26], 1.2, rgba(INK, 0.5));
      break;
    case 3: // box
      pen.shape([x - 14, y - 6, x + 14, y - 6, x + 14, y + 12, x - 14, y + 12], '#dcae74');
      pen.shape([x - 14, y - 6, x - 9, y - 14, x + 19, y - 14, x + 14, y - 6], '#e9c08b');
      break;
    case 4: // envelope
      pen.shape([x - 16, y - 10, x + 16, y - 10, x + 16, y + 10, x - 16, y + 10], '#ffffff');
      pen.line([x - 16, y - 10, x, y + 2, x + 16, y - 10], 1.4);
      pen.ellipse(x, y + 1, 3, 3, '#e05d6f', 0.8);
      break;
    case 5: // flower
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        pen.ellipse(x + Math.cos(a) * 7, y + Math.sin(a) * 7, 6, 6, '#f49ab0', 1);
      }
      pen.ellipse(x, y, 5, 5, '#ffd666', 1);
      break;
    case 6: // scissors / thread
      pen.ellipse(x - 6, y + 6, 6, 6, null, 1.6);
      pen.ellipse(x + 6, y + 6, 6, 6, null, 1.6);
      pen.line([x - 3, y + 2, x + 8, y - 16], 1.8);
      pen.line([x + 3, y + 2, x - 8, y - 16], 1.8);
      break;
  }
}

export function drawProp(pen: Pen, kind: PropKind, v: number, c: PropCtx) {
  const ctx = pen.ctx;
  switch (kind) {
    case 'tree': return tree(pen, c, v % 3);
    case 'sakura': return tree(pen, c, v % 3, false, true);
    case 'bigtree': return tree(pen, c, 0, true, v === 1);
    case 'pine': return pine(pen, c, v % 3);
    case 'bush': {
      const cols = c.season === 2 ? (v === 0 ? ['#f0b562', '#dd9548'] : ['#b8cf7a', '#9cb865']) : c.season === 3 ? ['#b9c9b1', '#9fb197'] : ['#9fd08a', '#82bb6c'];
      blobCluster(pen, -8, -12, 13, 4, v * 7, cols[1]);
      blobCluster(pen, 9, -14, 14, 4, v * 7 + 1, cols[0]);
      if (v === 1 && c.season < 2) for (let i = 0; i < 4; i++) pen.ellipse(-12 + i * 8, -16 + (i % 2) * 6, 2.5, 2.5, '#f27d8f', 0.8);
      if (v === 2 && c.season < 2) for (let i = 0; i < 4; i++) pen.ellipse(-12 + i * 8, -14 + (i % 2) * 7, 2.5, 2.5, '#ffffff', 0.8);
      return;
    }
    case 'flower': {
      if (c.season === 3) {
        pen.line([0, 0, 0, -6], 1.2, '#9db48c');
        return;
      }
      const cols = ['#f49ab0', '#ffd666', '#a8d0f0', '#ffffff', '#c7a8f0'];
      pen.line([0, 2, 1, -10], 1.3, '#6faa5d');
      pen.line([1, -4, 5, -7], 1.1, '#6faa5d');
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2;
        ctx.fillStyle = cols[v % 5];
        ctx.beginPath();
        ctx.arc(1 + Math.cos(a) * 3.4, -12 + Math.sin(a) * 3.4, 2.8, 0, 7);
        ctx.fill();
      }
      pen.ellipse(1, -12, 1.8, 1.8, '#ffe08a', 0.6);
      return;
    }
    case 'flowers': {
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.translate(-20 + i * 8, (i % 2) * 4);
        drawProp(pen, 'flower', (v + i) % 5, c);
        ctx.restore();
      }
      return;
    }
    case 'rock': {
      const col = ['#c9c6c0', '#bdb7ae', '#d6d0c6'][v % 3];
      pen.shape([-15, 0, -14, -9, -5, -16, 7, -15, 15, -6, 14, 0], col);
      pen.line([-3, -12, 0, -7, -4, -3], 1, rgba(INK, 0.5));
      return;
    }
    case 'mushroom': {
      pen.tube([0, 0, 0, -7], 4, '#f6eedf');
      const col = ['#e86b5e', '#f0a65b', '#c9a0dc'][v % 3];
      pen.shape([-8, -6, -6, -12, 0, -14, 6, -12, 8, -6], col);
      ctx.fillStyle = '#fff';
      for (const [x, y] of [[-3, -10], [3, -11], [0, -7]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.4, 0, 7);
        ctx.fill();
      }
      return;
    }
    case 'stump': {
      pen.shape([-18, 0, -16, -18, 16, -18, 18, 0], '#c08f63');
      pen.ellipse(0, -18, 16, 6, '#e8c9a0');
      pen.ellipse(0, -18, 9, 3.2, null, 1, rgba(INK, 0.5));
      pen.ellipse(0, -18, 3.5, 1.2, null, 1, rgba(INK, 0.5));
      return;
    }
    case 'reed': {
      for (let i = 0; i < 4; i++) {
        const x = -8 + i * 5;
        pen.line([x, 2, x + (i - 1.5) * 2, -20, x + (i - 1.5) * 4, -36 - (i % 2) * 5], 1.3, '#7fa86a');
      }
      pen.tube([4, -26, 5, -36], 3.5, '#a5754e');
      return;
    }
    case 'lily': {
      pen.shape([-12, 0, -10, -6, 0, -8, 10, -6, 12, 0, 6, 5, 0, 1, -6, 5], '#8cc66a', 1.2);
      if (v === 0 && c.season < 3) {
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2;
          pen.ellipse(Math.cos(a) * 3, -4 + Math.sin(a) * 2, 2.5, 2, '#f8c6d4', 0.6);
        }
      }
      return;
    }
    case 'lamp': {
      pen.tube([0, 0, 0, -58], 3.2, '#6f7480');
      pen.shape([-7, -58, 7, -58, 9, -72, -9, -72], c.night > 0.4 ? '#ffe39a' : '#f6efd9');
      pen.shape([-11, -72, 0, -80, 11, -72], '#6f7480');
      pen.ellipse(0, 0, 6, 2.5, '#6f7480');
      return;
    }
    case 'bench': {
      pen.poly([-32, -22, 32, -22, 32, -16, -32, -16], WOOD);
      pen.poly([-32, -12, 32, -12, 33, -8, -33, -8], WOOD);
      pen.tube([-26, -8, -26, 2], 3, WOOD_D);
      pen.tube([26, -8, 26, 2], 3, WOOD_D);
      pen.tube([-26, -22, -26, -12], 2.5, WOOD_D);
      pen.tube([26, -22, 26, -12], 2.5, WOOD_D);
      return;
    }
    case 'fence': {
      pen.line([0, -12, 36, -12], 2.4, WOOD_D);
      for (let i = 0; i < 4; i++) pen.shape([i * 11, 2, i * 11, -20, i * 11 + 3, -24, i * 11 + 6, -20, i * 11 + 6, 2], '#f4ead8', 1.2);
      return;
    }
    case 'mailbox': {
      pen.tube([0, 2, 0, -22], 3, WOOD_D);
      pen.shape([-9, -22, 9, -22, 9, -34, 0, -38, -9, -34], v === 0 ? '#5d9ad6' : '#e0605e');
      pen.shape([9, -34, 14, -36, 14, -30, 9, -30], '#ffd45e', 1);
      return;
    }
    case 'board': {
      pen.tube([-20, 2, -20, -50], 3, WOOD_D);
      pen.tube([20, 2, 20, -50], 3, WOOD_D);
      pen.poly([-26, -54, 26, -54, 26, -18, -26, -18], '#c99a6b');
      pen.shape([-20, -48, -4, -48, -4, -30, -20, -30], '#fffaf0', 1);
      pen.shape([0, -50, 20, -50, 20, -36, 0, -36], '#fde3e3', 1);
      pen.shape([4, -32, 18, -32, 18, -22, 4, -22], '#e6f4ec', 1);
      for (const [x, y] of [[-12, -48], [10, -50], [11, -32]]) pen.ellipse(x, y, 1.6, 1.6, '#e0605e', 0.6);
      return;
    }
    case 'sign': {
      pen.tube([0, 2, 0, -40], 3.4, WOOD_D);
      const dir = c.label?.startsWith('←') || c.label?.startsWith('↖') ? -1 : 1;
      pen.shape([-30, -50, 26, -50, 34 * (dir > 0 ? 1 : 0.88), -42, 26, -34, -30, -34].map((n, i) => (i % 2 === 0 && dir < 0 ? -n : n)), '#f3d9a8', 1.6);
      if (c.label) {
        ctx.fillStyle = INK;
        ctx.font = 'bold 10px "PingFang SC","Microsoft YaHei",system-ui';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(c.label, 0, -42);
      }
      return;
    }
    case 'fountain': {
      pen.ellipse(0, -6, 60, 20, '#d8d2c8');
      pen.ellipse(0, -9, 52, 15, '#a9d3ea', 1.4);
      pen.tube([0, -10, 0, -40], 10, '#d8d2c8');
      pen.ellipse(0, -40, 22, 7, '#d8d2c8');
      pen.ellipse(0, -42, 17, 4.5, '#a9d3ea', 1.2);
      pen.tube([0, -44, 0, -58], 5, '#d8d2c8');
      // a little stone fish on top
      pen.ellipse(0, -64, 7, 5, '#e6e0d6', 1.2);
      pen.shape([-6, -64, -12, -70, -12, -58], '#e6e0d6', 1.2);
      return;
    }
    case 'house': return house(pen, c, v, c.label, false);
    case 'shop': return house(pen, c, v, c.label, true);
    case 'slide': {
      pen.tube([-34, 2, -34, -52], 3, '#f08a5d');
      pen.tube([-20, 2, -20, -52], 3, '#f08a5d');
      for (let i = 1; i < 5; i++) pen.line([-34, -i * 11, -20, -i * 11], 2, '#f08a5d');
      pen.shape([-20, -52, -14, -54, 40, -2, 32, 2], '#ffd45e');
      pen.shape([-36, -52, -18, -52, -18, -56, -36, -56], '#8fc3e8', 1);
      return;
    }
    case 'swing': {
      pen.tube([-44, 2, -36, -62], 3, '#8fb6d9');
      pen.tube([44, 2, 36, -62], 3, '#8fb6d9');
      pen.line([-38, -62, 38, -62], 4, '#8fb6d9');
      for (const sx of [-18, 16]) {
        const a = Math.sin(c.t * 1.7 + sx) * 0.18;
        const ex = sx + Math.sin(a) * 40, ey = -62 + Math.cos(a) * 40;
        pen.line([sx - 7, -62, ex - 7, ey], 1, INK);
        pen.line([sx + 7, -62, ex + 7, ey], 1, INK);
        pen.shape([ex - 10, ey, ex + 10, ey, ex + 9, ey + 4, ex - 9, ey + 4], '#f4c79a', 1.2);
      }
      return;
    }
    case 'sandbox': {
      pen.poly([-34, -14, 34, -14, 34, 14, -34, 14], '#c99a6b');
      pen.poly([-28, -9, 28, -9, 28, 9, -28, 9], '#f3e3bd', 1.2);
      pen.shape([4, 2, 10, -4, 16, 2, 16, 6, 4, 6], '#e86b5e', 1);
      pen.shape([-18, 0, -8, 0, -9, 6, -17, 6], '#5d9ad6', 1);
      return;
    }
    case 'windmill': {
      pen.poly([-30, 0, -20, -130, 20, -130, 30, 0], '#f4ead8');
      pen.poly([-26, -128, 0, -160, 26, -128], '#d98f6a');
      pen.poly([-8, 0, -8, -26, 8, -26, 8, 0], '#b98d61', 1.4, undefined, 0.5);
      pen.poly([-8, -80, 8, -80, 8, -64, -8, -64], '#bfe0f2', 1.2);
      return; // blades drawn live
    }
    case 'lighthouse': {
      const body = pen.poly([-26, 0, -16, -150, 16, -150, 26, 0], '#ffffff');
      pen.clip(body, () => {
        ctx.fillStyle = '#e0605e';
        for (let i = 0; i < 4; i++) ctx.fillRect(-30, -30 - i * 38, 60, 16);
      });
      pen.fillStroke(body, null);
      pen.poly([-20, -150, 20, -150, 20, -156, -20, -156], '#6f7480');
      pen.poly([-12, -156, 12, -156, 12, -176, -12, -176], c.night > 0.3 ? '#ffe39a' : '#bfe0f2');
      pen.poly([-16, -176, 0, -192, 16, -176], '#e0605e');
      pen.shape([-7, 0, -7, -18, 7, -18, 7, 0], '#b98d61', 1.2);
      return;
    }
    case 'boat': {
      pen.shape([-32, -10, 32, -10, 22, 6, -22, 6], v === 0 ? '#e98f74' : '#86b6d9');
      pen.line([-26, -6, 26, -6], 1, rgba(INK, 0.5));
      pen.line([-6, -10, 18, -22], 2.2, WOOD_D);
      return;
    }
    case 'picnic': {
      const p = pen.shape([-34, -12, 30, -16, 34, 14, -30, 16], '#ffffff');
      pen.clip(p, () => {
        ctx.fillStyle = 'rgba(232,115,95,0.55)';
        for (let i = -4; i < 5; i++) ctx.fillRect(i * 9, -20, 4.5, 40);
        for (let j = -2; j < 3; j++) ctx.fillRect(-40, j * 9, 80, 4.5);
      });
      pen.shape([6, -18, 22, -18, 20, -6, 8, -6], '#d9ab70', 1.2);
      pen.line([8, -18, 14, -26, 20, -18], 1.2);
      pen.ellipse(-14, -2, 6, 3, '#f7a23c', 1);
      return;
    }
    case 'telescope': {
      pen.line([0, -20, -10, 2], 1.8, WOOD_D);
      pen.line([0, -20, 10, 2], 1.8, WOOD_D);
      pen.line([0, -20, 0, 2], 1.8, WOOD_D);
      pen.tube([-10, -16, 12, -34], 7, '#8a7cc0');
      return;
    }
    case 'table': {
      pen.tube([0, 2, 0, -22], 3, '#6f7480');
      pen.ellipse(0, -24, 20, 6, '#ffffff');
      pen.tube([0, -24, 0, -50], 1.6, '#6f7480');
      pen.shape([-24, -44, 0, -56, 24, -44], '#f4a3a0');
      pen.shape([-4, -30, 4, -30, 3, -25, -3, -25], '#ffffff', 1);
      return;
    }
    case 'well': {
      pen.poly([-20, 0, -20, -20, 20, -20, 20, 0], '#cfc8bd');
      pen.ellipse(0, -20, 20, 6, '#cfc8bd');
      pen.ellipse(0, -20, 15, 4, '#5a6f80', 1);
      pen.tube([-17, -20, -17, -46], 2.5, WOOD_D);
      pen.tube([17, -20, 17, -46], 2.5, WOOD_D);
      pen.poly([-24, -44, 0, -60, 24, -44], '#d98f6a');
      return;
    }
    case 'crop': {
      const sea = c.season;
      if (sea === 3) {
        pen.line([-6, 0, -4, -6], 1, '#b7a37a');
        pen.line([4, 0, 6, -5], 1, '#b7a37a');
        return;
      }
      const kind = (v + sea) % 4;
      for (let i = -1; i <= 1; i++) {
        const x = i * 7;
        pen.line([x, 2, x + 1, -16], 1.3, '#6faa5d');
        if (kind === 0) {
          // sunflower
          for (let k = 0; k < 8; k++) {
            const a = (k / 8) * Math.PI * 2;
            ctx.fillStyle = '#ffd45e';
            ctx.beginPath();
            ctx.arc(x + 1 + Math.cos(a) * 4, -19 + Math.sin(a) * 4, 2.6, 0, 7);
            ctx.fill();
          }
          pen.ellipse(x + 1, -19, 2.6, 2.6, '#8a5a3c', 0.6);
        } else if (kind === 1) {
          // lavender
          for (let k = 0; k < 4; k++) pen.ellipse(x + 1, -14 - k * 3, 2, 1.6, '#b9a2e6', 0.5);
        } else if (kind === 2) {
          // wheat
          pen.ellipse(x + 1, -20, 2.2, 5, '#f2cf62', 0.7);
        } else {
          // tulips
          pen.shape([x - 2, -16, x + 1, -22, x + 4, -16, x + 1, -13], ['#f27d8f', '#ffd45e', '#f6a04d'][(i + 1) % 3], 0.7);
        }
      }
      return;
    }
    case 'post': {
      pen.tube([0, 4, 0, -20], 6, WOOD_D);
      return;
    }
    case 'cart': {
      pen.poly([-28, -24, 28, -24, 28, -6, -28, -6], '#e9b46a');
      pen.ellipse(-16, -2, 7, 7, WOOD_D);
      pen.ellipse(16, -2, 7, 7, WOOD_D);
      for (let i = 0; i < 4; i++) pen.ellipse(-18 + i * 12, -28, 6, 4, '#f2c27a', 1);
      pen.tube([-26, -30, -26, -54], 2, WOOD_D);
      pen.tube([26, -30, 26, -54], 2, WOOD_D);
      const aw = pen.shape([-32, -54, 32, -54, 30, -44, -30, -44], '#ffffff');
      pen.clip(aw, () => {
        ctx.fillStyle = '#e48c6a';
        for (let i = 0; i < 8; i += 2) ctx.fillRect(-32 + i * 8, -56, 8, 14);
      });
      return;
    }
    case 'hive': {
      pen.poly([-12, 0, -12, -20, 12, -20, 12, 0], '#f4d58a');
      pen.line([-12, -10, 12, -10], 1.2);
      pen.poly([-14, -20, 0, -27, 14, -20], '#c99a6b');
      return;
    }
    case 'kite':
      return;
    case 'snowman': {
      pen.ellipse(0, -12, 17, 13, '#ffffff');
      pen.ellipse(0, -34, 12, 11, '#ffffff');
      pen.ellipse(0, -51, 9, 8.5, '#ffffff');
      // tiny cat ears, because it's a cat town
      pen.shape([-7, -56, -6, -64, -2, -58], '#ffffff', 1.2);
      pen.shape([7, -56, 6, -64, 2, -58], '#ffffff', 1.2);
      ctx.fillStyle = INK;
      for (const ex of [-3, 3]) {
        ctx.beginPath();
        ctx.arc(ex, -52, 1.3, 0, 7);
        ctx.fill();
      }
      pen.shape([0, -49, 7, -48, 0, -46.5], '#f08a5d', 0.8);
      pen.line([-8, -41, 0, -38.5, 8, -41], 4, ['#e0605e', '#5b8fd6', '#9ccf86'][v % 3]);
      pen.line([-11, -34, -22, -42, -24, -48], 1.4, '#8a6440');
      pen.line([11, -34, 22, -40, 25, -45], 1.4, '#8a6440');
      for (const by of [-30, -36]) {
        ctx.beginPath();
        ctx.arc(0, by, 1.2, 0, 7);
        ctx.fill();
      }
      return;
    }
    case 'flowerarch': {
      pen.tube([-40, 2, -40, -62], 4, '#b98d61');
      pen.tube([40, 2, 40, -62], 4, '#b98d61');
      pen.line([-40, -60, -30, -84, 0, -92, 30, -84, 40, -60], 5, '#7fb36b');
      const cols = ['#f49ab0', '#ffd666', '#ffffff', '#c7a8f0'];
      for (let i = 0; i <= 12; i++) {
        const a = Math.PI + (i / 12) * Math.PI;
        const fx = Math.cos(a) * 40, fy = -60 + Math.sin(a) * 30;
        for (let k = 0; k < 5; k++) {
          const pa = (k / 5) * Math.PI * 2;
          ctx.fillStyle = cols[(i + v) % 4];
          ctx.beginPath();
          ctx.arc(fx + Math.cos(pa) * 3, fy + Math.sin(pa) * 3, 2.6, 0, 7);
          ctx.fill();
        }
      }
      for (let i = 0; i < 6; i++) {
        pen.ellipse(-40 + (i % 2) * 2, -10 - i * 9, 3, 2.4, cols[i % 4], 0.6);
        pen.ellipse(40 - (i % 2) * 2, -14 - i * 9, 3, 2.4, cols[(i + 1) % 4], 0.6);
      }
      return;
    }
    case 'parasol': {
      const col = ['#f08a5d', '#8fc3e8', '#ffd45e'][v % 3];
      pen.shape([-24, 6, 26, 2, 30, 12, -20, 14], ['#ffffff', '#fde3e3', '#e1f1d6'][v % 3], 1.2);
      pen.line([2, 4, -2, -50], 2.2, '#b98d61');
      const p = pen.shape([-32, -40, -12, -58, -2, -62, 12, -58, 32, -40], col);
      pen.clip(p, () => {
        for (let i = -3; i <= 3; i++) if (i % 2 === 0) pen.line([-2, -62, i * 11, -40], 7, '#ffffff', 0.3);
      });
      pen.fillStroke(p, null);
      return;
    }
    case 'pumpkins': {
      const big = (x: number, y: number, r: number) => {
        pen.ellipse(x, y - r * 0.7, r, r * 0.75, '#f39a45');
        pen.line([x, y - r * 1.45, x, y - r * 0.05], 1, rgba(INK, 0.45));
        pen.line([x - r * 0.5, y - r * 1.3, x - r * 0.55, y - r * 0.15], 1, rgba(INK, 0.45));
        pen.line([x + r * 0.5, y - r * 1.3, x + r * 0.55, y - r * 0.15], 1, rgba(INK, 0.45));
        pen.tube([x, y - r * 1.4, x + 2, y - r * 1.75], 2.4, '#7a9a4a');
      };
      big(-10, 0, 12);
      big(10, 2, 9);
      big(-2, -16, 7);
      return;
    }
    case 'lanterns': {
      pen.tube([-120, 2, -120, -96], 3, '#8a6440');
      pen.tube([120, 2, 120, -96], 3, '#8a6440');
      pen.line([-120, -92, -60, -78, 0, -74, 60, -78, 120, -92], 1, INK);
      const cols = v === 1 ? ['#e0605e', '#ffd45e'] : ['#f39a45', '#e0605e'];
      for (let i = 0; i < 7; i++) {
        const tx = -90 + i * 30, ty = -82 + Math.abs(i - 3) * 2.5 + Math.sin(c.t * 1.5 + i) * 1;
        pen.line([tx, ty - 6, tx, ty], 0.8, INK);
        pen.ellipse(tx, ty + 6, 6, 8, c.night > 0.4 ? '#ffd27a' : cols[i % 2], 1.2);
        pen.line([tx - 5, ty + 6, tx + 5, ty + 6], 0.7, rgba(INK, 0.4));
      }
      return;
    }
  }
}

export { shade, mix };
