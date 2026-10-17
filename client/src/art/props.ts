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
  fruittree: [-38, -92, 38, 8], bamboo: [-24, -134, 24, 6], hotspring: [-128, -132, 128, 10], stonelamp: [-14, -50, 14, 6],
  tent: [-62, -84, 62, 8], campfire: [-24, -22, 24, 8], log: [-28, -20, 28, 6], palm: [-58, -132, 58, 8], gazebo: [-58, -124, 58, 8],
  fruitbasket: [-17, -24, 17, 5],
  stage: [-174, -128, 174, 18], stageback: [-186, -236, 186, 8], speaker: [-17, -48, 17, 4], stagelight: [-26, -100, 26, 6],
};

/** The low wooden platform (drawn flat, under whoever stands on it). Base = front edge. */
function stage(pen: Pen, c: PropCtx) {
  const ctx = pen.ctx;
  const W = 166, D = 122;
  const floor = pen.poly([-W, 0, -W, -D, W, -D, W, 0], '#e2bd8f', 1.8);
  pen.clip(floor, () => {
    for (let y = -D + 14; y < 0; y += 14) pen.line([-W, y, W, y], 1, rgba(INK, 0.22), 0.3);
    for (let i = 0; i < 24; i++) {
      const y = -D + 14 * (i % 8), x = -W + ((i * 53) % (W * 2));
      pen.line([x, y, x, y + 14], 1, rgba(INK, 0.2), 0.3);
    }
  });
  // the front face, with little footlights
  pen.poly([-W, 0, W, 0, W, 14, -W, 14], '#c99a6b', 1.8);
  for (let x = -W + 30; x < W - 10; x += 40) {
    pen.ellipse(x, 6, 4, 3, c.night > 0.4 ? '#ffe39a' : '#f6efd9', 1);
  }
  // steps at both front corners
  for (const sx of [-1, 1]) {
    const x = sx * (W + 2);
    pen.poly([x, 14, x + sx * 22, 14, x + sx * 22, 6, x, 6], '#d6ab7c', 1.4);
    pen.poly([x, 6, x + sx * 12, 6, x + sx * 12, -2, x, -2], '#d6ab7c', 1.4);
  }
  void ctx;
}

/** The backdrop: posts, an arched canopy with bulbs, curtains and the name on top. Base = back edge. */
function stageback(pen: Pen, c: PropCtx) {
  const ctx = pen.ctx;
  const lit = c.night > 0.4;
  for (const sx of [-1, 1]) pen.tube([sx * 168, 4, sx * 168, -186], 9, '#a5754e', 1.6);
  const panel = pen.poly([-158, 0, -158, -150, 158, -150, 158, 0], lit ? '#33406b' : '#5b6fa6', 1.8);
  pen.clip(panel, () => {
    ctx.fillStyle = 'rgba(255,240,180,0.85)';
    for (let i = 0; i < 26; i++) {
      const x = -150 + hashf(i, 51) * 300, y = -144 + hashf(i, 52) * 130;
      const r = 1 + hashf(i, 53) * 1.8;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, 7);
      ctx.fill();
    }
    pen.ellipse(96, -112, 16, 16, '#fff3c4', 1.2);
    pen.ellipse(102, -116, 13, 13, lit ? '#33406b' : '#5b6fa6', 0, null);
  });
  // curtains gathered at each side
  for (const sx of [-1, 1]) {
    const x0 = sx * 158;
    pen.shape([x0, -150, x0 - sx * 58, -150, x0 - sx * 34, -96, x0 - sx * 18, -60, x0 - sx * 30, 0, x0, 0], '#d9575a', 1.6);
    pen.line([x0 - sx * 18, -150, x0 - sx * 12, -90, x0 - sx * 16, -40], 1.2, rgba('#ffffff', 0.35));
    pen.line([x0 - sx * 22, -66, x0 - sx * 4, -70], 3, '#ffd45e');
  }
  pen.shape([-160, -150, 160, -150, 150, -132, 120, -140, 80, -132, 40, -140, 0, -132, -40, -140, -80, -132, -120, -140, -150, -132], '#d9575a', 1.6);
  // the arched canopy with a row of bulbs
  pen.shape([-180, -178, -120, -206, 0, -218, 120, -206, 180, -178, 180, -166, 120, -192, 0, -204, -120, -192, -180, -166], '#f3e3c3', 1.8);
  for (let i = 0; i <= 12; i++) {
    const t = i / 12, x = -172 + t * 344, y = -170 - Math.sin(t * Math.PI) * 32;
    pen.ellipse(x, y, 3.6, 3.6, lit ? ['#ffe39a', '#f9b4c4', '#b9dcf4'][i % 3] : '#fffaf0', 1);
  }
  // the name on a little board at the top
  pen.poly([-58, -232, 58, -232, 58, -206, -58, -206], '#fff8e8', 1.8);
  ctx.fillStyle = INK;
  ctx.font = 'bold 17px "PingFang SC","Microsoft YaHei",system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('♪ 露天舞台', 0, -219);
}

const FRUIT: [string, string, string][] = [
  // blossom, summer fruit, autumn fruit
  ['#fffaf6', '#b8d86a', '#e9574f'], // apple
  ['#fbd3df', '#f7a98a', '#f2c45a'], // peach
  ['#fff6e6', '#9fcf72', '#f39a45'], // persimmon
];

function fruitTree(pen: Pen, c: PropCtx, v: number) {
  const ctx = pen.ctx;
  pen.tube([0, 2, -1, -16, 1, -30], 6.5, TRUNK);
  pen.line([0, -22, -10, -32], 3.4, TRUNK);
  pen.line([1, -26, 11, -36], 3, TRUNK);
  const [bloom, summer, autumn] = FRUIT[v % 3];
  if (c.season === 3) {
    // bare branches; persimmons hang on through winter
    for (const [x1, y1, x2, y2] of [[-10, -32, -18, -50], [11, -36, 20, -52], [1, -30, 2, -58], [-4, -44, -12, -60], [6, -46, 12, -62]]) pen.line([x1, y1, x2, y2], 2.2, TRUNK);
    for (const [x, y] of [[-18, -50], [20, -52], [2, -58]]) pen.ellipse(x, y - 3, 6, 2.2, '#ffffff', 1, rgba(INK, 0.5));
    if (v % 3 === 2) for (const [x, y] of [[-12, -52], [14, -50], [6, -60]]) pen.ellipse(x, y, 3.6, 3.4, autumn, 1);
    return;
  }
  const leaf = c.season === 2 ? (v % 3 === 1 ? ['#f2cf62', '#e2b44a'] : ['#c9d97a', '#a8c062']) : c.season === 1 ? ['#8fcb7a', '#73b462'] : ['#b8de96', '#96c87a'];
  const lobes: [number, number, number][] = [[-14, -48, 17], [14, -50, 17], [0, -62, 20], [0, -42, 16]];
  for (const [x, y, r] of lobes) blobCluster(pen, x, y, r, 4, v * 5 + x, leaf[1]);
  ctx.fillStyle = leaf[0];
  for (const [x, y, r] of lobes) {
    ctx.beginPath();
    ctx.ellipse(x - r * 0.15, y - r * 0.2, r * 0.68, r * 0.58, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  const dots = (col: string, r: number, n: number, lw = 1) => {
    for (let i = 0; i < n; i++) pen.ellipse((hashf(v, i, 41) - 0.5) * 50, -40 - hashf(v, i, 42) * 32, r, r * 0.95, col, lw);
  };
  if (c.season === 0) dots(bloom, 3.2, 12, 0.8);
  else if (c.season === 1) dots(summer, 3.4, 6);
  else dots(autumn, 4, 8);
}

function bamboo(pen: Pen, c: PropCtx, v: number) {
  const stalks: [number, number, number][] = v === 0 ? [[-8, -118, -0.05], [4, -128, 0.03], [14, -100, 0.08]] : v === 1 ? [[-12, -104, -0.08], [0, -124, 0], [10, -112, 0.05]] : [[-4, -126, -0.02], [9, -108, 0.06]];
  const green = c.season === 3 ? '#9fbf9a' : '#8cc47a';
  for (const [x, top, lean] of stalks) {
    const tx = x + top * -lean;
    pen.tube([x, 2, (x + tx) / 2, top / 2, tx, top], 5, green, 1.4);
    for (let k = 1; k < 6; k++) {
      const yy = (top * k) / 6, xx = x + (tx - x) * (k / 6);
      pen.line([xx - 3, yy, xx + 3, yy], 1.2, rgba(INK, 0.55));
    }
    // leaf sprays
    for (let k = 0; k < 3; k++) {
      const yy = top * (0.55 + k * 0.17), xx = x + (tx - x) * (0.55 + k * 0.17);
      const side = k % 2 === 0 ? 1 : -1;
      for (let j = 0; j < 3; j++) pen.shape([xx, yy, xx + side * (10 + j * 4), yy - 6 + j * 5, xx + side * (18 + j * 4), yy - 2 + j * 6, xx + side * 6, yy + 2], c.season === 3 ? '#e8efe6' : j === 1 ? '#a9d68f' : '#94c77c', 1);
    }
  }
}

function hotspring(pen: Pen, c: PropCtx) {
  const ctx = pen.ctx;
  const cy = -66;
  // rocks all the way round
  for (let i = 0; i < 22; i++) {
    const a = (i / 22) * Math.PI * 2;
    const rx = 112 + hashf(i, 3) * 8, ry = 64 + hashf(i, 4) * 6;
    pen.ellipse(Math.cos(a) * rx, cy + Math.sin(a) * ry, 14 + hashf(i, 5) * 6, 10 + hashf(i, 6) * 4, ['#c9c6c0', '#bdb7ae', '#d6d0c6'][i % 3], 1.4);
  }
  const water = ctx.createRadialGradient(-20, cy - 10, 10, 0, cy, 110);
  water.addColorStop(0, c.night > 0.4 ? '#8fc9d6' : '#b9e6ea');
  water.addColorStop(1, c.night > 0.4 ? '#5f9fb3' : '#86cbd6');
  pen.ellipse(0, cy, 104, 56, water, 1.8);
  // ripples and a floating yuzu or two
  for (let i = 0; i < 5; i++) {
    const x = -60 + i * 30, y = cy - 18 + (i % 2) * 22;
    pen.line([x - 10, y, x - 4, y - 3, x + 2, y], 1.1, 'rgba(255,255,255,0.75)');
  }
  pen.ellipse(-30, cy + 14, 5, 4.5, '#ffd45e', 1);
  pen.ellipse(36, cy - 4, 5, 4.5, '#ffd45e', 1);
  if (c.season === 2) pen.shape([12, cy + 22, 18, cy + 16, 22, cy + 24, 16, cy + 28], '#e9674f', 0.8);
  // a little wooden bucket on the rocks
  pen.poly([86, -18, 104, -18, 102, -2, 88, -2], WOOD, 1.4);
  pen.line([88, -12, 102, -12], 1, rgba(INK, 0.5));
}

function tent(pen: Pen, v: number) {
  const col = ['#f0a35e', '#7fc0b0'][v % 2];
  pen.shape([-58, 2, 0, -78, 58, 2], col);
  pen.shape([-12, 2, 0, -50, 12, 2], shade(col, -0.25), 1.6);
  pen.line([0, -78, 0, -88], 2, WOOD_D);
  pen.shape([0, -88, 12, -84, 0, -80], '#e0605e', 1);
  pen.line([-58, 2, -66, 6], 1.2, rgba(INK, 0.6));
  pen.line([58, 2, 66, 6], 1.2, rgba(INK, 0.6));
  pen.line([-30, -36, -2, -76], 1, rgba('#ffffff', 0.6));
}

function palm(pen: Pen, c: PropCtx, v: number) {
  const lean = v === 0 ? 1 : -1;
  pen.tube([0, 2, 6 * lean, -40, 14 * lean, -96], 9, '#c99a6b', 1.6);
  for (let k = 1; k < 7; k++) {
    const t = k / 7;
    const x = 14 * lean * t * t + 6 * lean * t, y = -96 * t;
    pen.line([x - 4, y, x + 4, y + 2], 1, rgba(INK, 0.5));
  }
  const tx = 14 * lean, ty = -98;
  const frond = c.season === 3 ? '#a9c39a' : '#7fbf6a';
  for (const [dx, dy] of [[-48, 14], [-40, -16], [-10, -26], [24, -22], [46, -2], [40, 20]]) {
    pen.shape([tx, ty, tx + dx * 0.5, ty + dy * 0.5 - 8, tx + dx, ty + dy, tx + dx * 0.55, ty + dy * 0.5 + 4], frond, 1.4);
  }
  pen.ellipse(tx - 4, ty + 6, 5, 5, '#8a6440', 1);
  pen.ellipse(tx + 5, ty + 7, 5, 5, '#8a6440', 1);
}

function gazebo(pen: Pen, c: PropCtx) {
  pen.poly([-40, 2, 40, 2, 36, -6, -36, -6], '#d8cfc2', 1.4);
  for (const x of [-32, -11, 11, 32]) pen.tube([x, -6, x, -66], 4.5, '#e9dccb');
  pen.line([-36, -40, 36, -40], 2, rgba(INK, 0.6));
  const roof = pen.poly([-56, -62, 0, -112, 56, -62, 40, -58, 0, -64, -40, -58], '#d98f6a');
  pen.clip(roof, () => {
    for (let i = 1; i < 5; i++) pen.line([-60, -62 - i * 11, 60, -62 - i * 11], 1, rgba(INK, 0.25), 0.4);
  });
  pen.ellipse(0, -114, 4, 4, '#ffd45e', 1);
  if (c.season === 3) pen.shape([-40, -72, 0, -110, 40, -72, 0, -80], '#ffffff', 1);
  if (c.night > 0.4) pen.ellipse(0, -52, 6, 7, '#ffe39a', 1.2);
}

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
    case 'stage': return stage(pen, c);
    case 'stageback': return stageback(pen, c);
    case 'speaker': {
      pen.poly([-14, 2, 14, 2, 13, -42, -13, -42], '#4f5562', 1.6);
      pen.ellipse(0, -28, 8, 8, '#8a8c94', 1.2);
      pen.ellipse(0, -28, 3, 3, '#4f5562', 0.8);
      pen.ellipse(0, -11, 5, 5, '#8a8c94', 1.1);
      return;
    }
    case 'stagelight': {
      const sx = v === 0 ? 1 : -1;
      pen.line([-12, 4, 0, -10, 12, 4], 1.8, '#6f7480');
      pen.tube([0, -10, 0, -78], 3.6, '#6f7480');
      pen.tube([0, -82, sx * 18, -76], 13, '#4f5562', 1.5);
      pen.ellipse(sx * 24, -74, 5, 7, c.night > 0.4 ? '#fff3c4' : '#d6dbe0', 1.2, undefined, sx * 0.4);
      return;
    }
    case 'fruittree': return fruitTree(pen, c, v);
    case 'bamboo': return bamboo(pen, c, v % 3);
    case 'hotspring': return hotspring(pen, c);
    case 'tent': return tent(pen, v);
    case 'palm': return palm(pen, c, v % 2);
    case 'gazebo': return gazebo(pen, c);
    case 'stonelamp': {
      pen.poly([-10, 2, 10, 2, 7, -6, -7, -6], '#bdb7ae', 1.4);
      pen.tube([0, -6, 0, -18], 7, '#c9c6c0', 1.4);
      pen.poly([-11, -18, 11, -18, 9, -32, -9, -32], '#d6d0c6', 1.4);
      pen.poly([-5, -21, 5, -21, 5, -29, -5, -29], c.night > 0.4 ? '#ffe39a' : '#8f8a82', 1);
      pen.shape([-14, -32, 0, -44, 14, -32], '#bdb7ae', 1.4);
      pen.ellipse(0, -46, 3, 3, '#bdb7ae', 1);
      if (c.season === 3) pen.shape([-11, -35, 0, -45, 11, -35, 0, -37], '#ffffff', 1);
      return;
    }
    case 'campfire': {
      for (let i = 0; i < 9; i++) {
        const a = (i / 9) * Math.PI * 2;
        pen.ellipse(Math.cos(a) * 17, -4 + Math.sin(a) * 7, 5.5, 4, '#bdb7ae', 1.2);
      }
      pen.tube([-12, -2, 10, -10], 5, '#8a6440', 1.3);
      pen.tube([12, -2, -9, -10], 5, '#a07455', 1.3);
      return;
    }
    case 'log': {
      pen.tube([-24, -8, 24, -8], 14, v === 0 ? '#a07455' : '#8a6440', 1.6);
      pen.ellipse(24, -8, 4, 7, '#e8c9a0', 1.4);
      pen.ellipse(24, -8, 1.6, 3, null, 0.8, rgba(INK, 0.5));
      return;
    }
    case 'fruitbasket': {
      const fruit = v === 0 ? '#e9574f' : '#f7a98a';
      for (const [x, y] of [[-8, -14], [0, -17], [8, -14], [-4, -20], [4, -21]]) pen.ellipse(x, y, 5, 4.6, fruit, 1);
      pen.poly([-15, -12, 15, -12, 11, 2, -11, 2], '#d9ab70', 1.6);
      pen.line([-13, -6, 13, -6], 1, rgba(INK, 0.4));
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
