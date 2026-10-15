// Pixel art for the website (client/home.html), drawn with the game's own cat code:
//   node --import tsx scripts/make-site-art.ts
// Cats are drawn small with flat lines, then given hard edges and a few flat colours.
// Also writes the dusk town behind the hero, the logo, little icons, and WebP copies
// of the screenshots in docs/images.
import { createCanvas, loadImage, GlobalFonts, Path2D, type SKRSContext2D } from '@napi-rs/canvas';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
(globalThis as { Path2D?: unknown }).Path2D ??= Path2D;
const { Pen } = await import('../client/src/engine/pen');
const { drawCat, defaultPose } = await import('../client/src/art/cat');
const { randomGenes, COATS } = await import('../shared/genes');

const OUT = 'client/site';
const INK = '#4a3a34';
type Ctx = SKRSContext2D;
type Pose = ReturnType<typeof defaultPose>;
mkdirSync(join(OUT, 'img'), { recursive: true });

// a CJK font for the logo (macOS); the page itself uses the visitor's fonts
for (const f of ['/System/Library/Fonts/PingFang.ttc', '/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc']) {
  if (existsSync(f)) {
    GlobalFonts.registerFromPath(f, 'LogoFont');
    break;
  }
}

function save(cv: ReturnType<typeof createCanvas>, name: string) {
  writeFileSync(join(OUT, name), cv.toBuffer('image/png'));
  console.log('wrote', name, `${cv.width}x${cv.height}`);
}
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

/** Hard alpha, then snap every pixel to the most common colours (plus ink). */
function crisp(x: Ctx, W: number, H: number, colors = 14) {
  const img = x.getImageData(0, 0, W, H);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i + 3] >= 110 ? 255 : 0;
  const counts = new Map<number, number>();
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    const k = ((d[i] >> 3) << 10) | ((d[i + 1] >> 3) << 5) | (d[i + 2] >> 3);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const pal = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, colors).map(([k]) => [((k >> 10) & 31) * 8 + 4, ((k >> 5) & 31) * 8 + 4, (k & 31) * 8 + 4]);
  pal.push(hex(INK));
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue;
    let best = 0, bd = Infinity;
    for (let j = 0; j < pal.length; j++) {
      const dd = (d[i] - pal[j][0]) ** 2 + (d[i + 1] - pal[j][1]) ** 2 + (d[i + 2] - pal[j][2]) ** 2;
      if (dd < bd) { bd = dd; best = j; }
    }
    d[i] = pal[best][0]; d[i + 1] = pal[best][1]; d[i + 2] = pal[best][2];
  }
  x.putImageData(img, 0, 0);
}

const CELL = 56;
/** One pixel cat in a CELL×CELL frame, feet near the bottom. */
function catFrame(seed: number, pose: (p: Pose) => void, outfit: string[] = [], age = 1, unit = 0.9) {
  const cv = createCanvas(CELL, CELL);
  const x = cv.getContext('2d');
  x.save();
  x.translate(CELL / 2, CELL * 0.9);
  x.scale(unit, unit);
  const p = defaultPose();
  pose(p);
  drawCat(new Pen(x).begin(3, 0, 2.0), randomGenes(seed), p, { age, outfit, shadow: false });
  x.restore();
  crisp(x, CELL, CELL);
  return cv;
}
function sheet(frames: ReturnType<typeof createCanvas>[], name: string) {
  const cv = createCanvas(CELL * frames.length, CELL);
  const x = cv.getContext('2d');
  frames.forEach((f, i) => x.drawImage(f, i * CELL, 0));
  save(cv, name);
}

/** One seed per coat colour, deterministic. */
function seedsByCoat() {
  const found = new Map<string, number>();
  for (let s = 1; s < 5000 && found.size < COATS.length; s++) {
    const seed = s * 977 + 13;
    const key = (randomGenes(seed) as { coat: string }).coat;
    if (!found.has(key)) found.set(key, seed);
  }
  return found;
}
const SEEDS = seedsByCoat();

// ---------- animated cats ----------
function cats() {
  const walkers: [string, number, string[]][] = [['orange', SEEDS.get('orange')!, ['scarf']], ['calico', 951, []], ['gray', SEEDS.get('gray')!, ['bell_collar']]];
  walkers.forEach(([name, seed, outfit]) => {
    const frames = Array.from({ length: 8 }, (_, k) =>
      catFrame(seed, (p) => {
        p.view = 'side'; p.gait = 1; p.phase = (k / 8) * Math.PI * 2; p.tailUp = 1; p.tailCurl = 0.6; p.t = k * 0.12;
      }, outfit));
    sheet(frames, `cat-walk-${name}.png`);
  });
  sheet([
    catFrame(SEEDS.get('siamese')!, (p) => { p.view = 'front'; p.tailUp = 0.6; p.headTilt = 0.1; }),
    catFrame(SEEDS.get('siamese')!, (p) => { p.view = 'front'; p.tailUp = 0.6; p.headTilt = 0.1; p.eyes = 'blink'; }),
  ], 'cat-sit.png');
  sheet([
    catFrame(SEEDS.get('cream')!, (p) => { p.view = 'curl'; p.eyes = 'closed'; p.mouth = 'w'; p.breathe = -1; }),
    catFrame(SEEDS.get('cream')!, (p) => { p.view = 'curl'; p.eyes = 'closed'; p.mouth = 'w'; p.breathe = 1; }),
  ], 'cat-sleep.png');
}

// ---------- the twelve-cat lineup ----------
const PATTERN_NAME: Record<string, string> = { tabby: '虎斑', mackerel: '鲭鱼斑', solid: '纯色', bicolor: '双色', tuxedo: '奶牛', spotted: '点斑', calico: '三花', tortie: '玳瑁', pointed: '重点色' };
function lineup() {
  const poses: [(p: Pose) => void, string[]][] = [
    [(p) => { p.view = 'front'; p.eyes = 'happy'; p.mouth = 'w'; p.tailUp = 1; }, ['scarf']],
    [(p) => { p.view = 'front'; p.sitH = 0; p.eyes = 'half'; }, []],
    [(p) => { p.view = 'side'; p.gait = 1; p.phase = 1.3; p.tailUp = 1; p.tailCurl = 0.6; }, ['bell_collar']],
    [(p) => { p.view = 'front'; p.groom = 1; p.eyes = 'closed'; p.mouth = 'tongue'; p.headTilt = 0.2; }, []],
    [(p) => { p.view = 'front'; p.beg = 1; p.eyes = 'wide'; p.lookY = -1; }, ['flower_crown']],
    [(p) => { p.view = 'curl'; p.eyes = 'closed'; p.mouth = 'w'; }, []],
    [(p) => { p.view = 'front'; p.eyes = 'closed'; p.mouth = 'yawn'; p.headTilt = -0.1; }, ['knit_hat']],
    [(p) => { p.view = 'side'; p.reach = 1; p.tilt = -0.32; p.eyes = 'closed'; p.mouth = 'open'; p.tailUp = 1; }, []],
    [(p) => { p.view = 'front'; p.headTilt = 0.15; p.blush = 1; }, ['beret', 'bow_tie']],
    [(p) => { p.view = 'belly'; p.wiggle = 1; p.eyes = 'happy'; p.mouth = 'open'; }, []],
    [(p) => { p.view = 'side'; p.tailUp = 0.8; }, ['witch_hat']],
    [(p) => { p.view = 'front'; p.eyes = 'wide'; p.tailUp = 0.5; }, ['glasses']],
  ];
  const names: string[] = [];
  [...SEEDS.entries()].slice(0, 12).forEach(([key, seed], i) => {
    const [pose, outfit] = poses[i];
    save(catFrame(seed, pose, outfit, i === 4 || i === 9 ? 0.3 : 1), `cat-${String(i + 1).padStart(2, '0')}.png`);
    const g = randomGenes(seed) as { pattern: string };
    const coat = COATS.find((c) => c.key === key)!;
    names.push(`${coat.name}${g.pattern === 'solid' || g.pattern === key ? '' : '·' + PATTERN_NAME[g.pattern]}`);
  });
  console.log('lineup:', names.join(' / '));
}

// ---------- the dusk town behind the hero: 320×180, tiles left to right ----------
function rng(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}
function town() {
  const W = 320, H = 180;
  const cv = createCanvas(W, H);
  const x = cv.getContext('2d');
  const px = (X: number, Y: number, c: string, w = 1, h = 1) => {
    x.fillStyle = c;
    x.fillRect(((Math.round(X) % W) + W) % W, Math.round(Y), w, h);
    if ((((Math.round(X) % W) + W) % W) + w > W) x.fillRect((((Math.round(X) % W) + W) % W) - W, Math.round(Y), w, h);
  };
  // sky: bands with a checkerboard dither between them
  const bands = ['#231d3f', '#2e2650', '#3d3163', '#523d73', '#6e4a7e', '#94597f', '#bd6c80', '#de8580', '#f0a283', '#f7c28c'];
  const bh = 12;
  for (let y = 0; y < 124; y++) {
    const b = Math.min(bands.length - 1, Math.floor(y / bh));
    const next = Math.min(bands.length - 1, b + 1);
    const t = (y % bh) / bh;
    for (let X = 0; X < W; X++) {
      const dither = t > 0.66 && (X + y) % 2 === 0;
      px(X, y, dither ? bands[next] : bands[b]);
    }
  }
  // stars
  const r = rng(7);
  for (let i = 0; i < 70; i++) {
    const X = Math.floor(r() * W), Y = Math.floor(r() * 70);
    px(X, Y, r() < 0.3 ? '#fff6d8' : '#cfc3ea');
    if (r() < 0.12) { px(X - 1, Y, '#8f80b8'); px(X + 1, Y, '#8f80b8'); px(X, Y - 1, '#8f80b8'); px(X, Y + 1, '#8f80b8'); }
  }
  // clouds
  const cloud = (cx: number, cy: number, w: number, c: string, rim: string) => {
    for (let X = -w; X <= w; X++)
      for (let Y = -6; Y <= 4; Y++) {
        const k = (X / w) ** 2 + (Y / (Y < 0 ? 5 + 2 * Math.cos((X / w) * 5) : 3.5)) ** 2;
        if (k < 1) px(cx + X, cy + Y, Y > 1 ? rim : c);
      }
  };
  cloud(60, 58, 26, '#7c5d8f', '#6a4f80');
  cloud(210, 44, 20, '#6b5287', '#5c4778');
  cloud(285, 72, 16, '#a26b8a', '#8e5d80');
  // far hills
  for (let X = 0; X < W; X++) {
    const h = 112 + 6 * Math.sin((X / W) * Math.PI * 2 * 2) + 4 * Math.sin((X / W) * Math.PI * 2 * 5 + 1);
    for (let Y = Math.round(h); Y < 150; Y++) px(X, Y, Y < h + 2 ? '#5a4778' : '#4a3c69');
  }
  // houses
  const houses = [
    { x: 6, w: 38, h: 26, roof: '#d9715f', wall: '#f3dfc8' },
    { x: 58, w: 34, h: 30, roof: '#6f8fc9', wall: '#e3e6ef' },
    { x: 104, w: 40, h: 24, roof: '#d98aa0', wall: '#f5e1e4' },
    { x: 160, w: 30, h: 32, roof: '#7cae76', wall: '#e8efe0' },
    { x: 204, w: 42, h: 26, roof: '#e2a347', wall: '#f6ead2' },
    { x: 262, w: 36, h: 29, roof: '#9a7cc4', wall: '#ece4f3' },
  ];
  const base = 150;
  for (const hs of houses) {
    const top = base - hs.h;
    // wall + outline
    for (let X = 0; X < hs.w; X++) for (let Y = top; Y < base; Y++) px(hs.x + X, Y, X === 0 || X === hs.w - 1 ? INK : hs.wall);
    // roof: stepped triangle
    const rh = Math.ceil(hs.w / 2.4);
    for (let i = 0; i < rh; i++) {
      const inset = Math.round((i / rh) * (hs.w / 2 + 2));
      const Y = top - 1 - (rh - 1 - i);
      for (let X = -2 + (rh - 1 - i) * ((hs.w / 2 + 2) / rh); X <= hs.w + 1 - (rh - 1 - i) * ((hs.w / 2 + 2) / rh); X++) px(hs.x + X, Y, hs.roof);
      void inset;
    }
    for (let X = -2; X <= hs.w + 1; X++) px(hs.x + X, top - 1, INK);
    // chimney
    px(hs.x + hs.w - 9, top - rh - 2, INK, 5, rh - 2);
    px(hs.x + hs.w - 8, top - rh - 1, '#b1543f', 3, rh - 4);
    // windows, mostly lit
    const lit = (i: number) => (hs.x + i) % 3 !== 0;
    [6, hs.w - 12].forEach((wx, i) => {
      px(hs.x + wx, top + 6, INK, 6, 6);
      px(hs.x + wx + 1, top + 7, lit(i) ? '#ffd774' : '#6d6a8a', 4, 4);
      if (lit(i)) px(hs.x + wx + 1, top + 7, '#fff1b8', 2, 2);
    });
    // door
    const dx = hs.x + Math.floor(hs.w / 2) - 3;
    px(dx, base - 10, INK, 7, 10);
    px(dx + 1, base - 9, '#a86a4b', 5, 9);
    px(dx + 4, base - 5, '#f7cf7a');
  }
  // lamp posts with a warm halo
  for (const lx of [50, 152, 254]) {
    for (let Y = -9; Y <= 9; Y++)
      for (let X = -9; X <= 9; X++) {
        const k = X * X + Y * Y;
        if (k < 81 && (X + Y) % 2 === 0 && k > 9) px(lx + X, base - 22 + Y, k < 40 ? '#f7c28c' : '#d99a7f');
      }
    px(lx, base - 20, INK, 1, 20);
    px(lx - 2, base - 25, INK, 5, 4);
    px(lx - 1, base - 24, '#ffe9a6', 3, 2);
  }
  // fences
  for (let X = 0; X < W; X += 4) if (!houses.some((h) => X >= h.x - 1 && X <= h.x + h.w)) px(X, base - 6, '#efe2cf', 2, 6);
  for (let X = 0; X < W; X++) if (!houses.some((h) => X >= h.x - 1 && X <= h.x + h.w)) px(X, base - 4, '#d9c6ad');
  // grass and the path the cats walk on
  for (let X = 0; X < W; X++) {
    px(X, base, '#4f8a4a');
    px(X, base + 1, '#6fa35a', 1, 5);
    if (X % 7 === 0) px(X, base - 1, '#6fa35a');
    if (X % 11 === 3) px(X, base - 2, '#8fbf6a');
    px(X, base + 6, '#c9a983');
    px(X, base + 7, '#e8d3b0', 1, 16);
    px(X, base + 23, '#c9a983');
    px(X, base + 24, '#6fa35a', 1, 6);
  }
  const rp = rng(11);
  for (let i = 0; i < 40; i++) px(rp() * W, base + 9 + rp() * 12, rp() < 0.5 ? '#d8bf98' : '#f3e4c8', 2, 1);
  for (let i = 0; i < 16; i++) { const X = rp() * W; px(X, base + 26 + rp() * 3, ['#f7cf7a', '#f2a5a5', '#ffffff'][i % 3]); }
  save(cv, 'town.png');

  // the moon sits on its own (it must not repeat with the tile)
  const m = createCanvas(24, 24);
  const mx = m.getContext('2d');
  for (let Y = 0; Y < 24; Y++)
    for (let X = 0; X < 24; X++) {
      const k = (X - 11.5) ** 2 + (Y - 11.5) ** 2;
      if (k < 121) {
        mx.fillStyle = k > 100 ? '#e8d9a8' : (X - 8) ** 2 + (Y - 9) ** 2 < 6 || (X - 15) ** 2 + (Y - 14) ** 2 < 4 ? '#efe2b6' : '#fff6d6';
        mx.fillRect(X, Y, 1, 1);
      }
    }
  save(m, 'moon.png');
}

// ---------- a strip of grass that tiles, for the bottom of sections ----------
function grass() {
  const W = 64, H = 12;
  const cv = createCanvas(W, H);
  const x = cv.getContext('2d');
  const r = rng(5);
  for (let X = 0; X < W; X++) {
    const h = 3 + Math.round(2 * Math.sin((X / W) * Math.PI * 4) + r() * 2);
    x.fillStyle = '#6fa35a';
    x.fillRect(X, H - 7 - (X % 5 === 0 ? 2 : 0) - (h > 4 ? 1 : 0), 1, 8);
    x.fillStyle = '#4f8a4a';
    x.fillRect(X, H - 7 - (X % 5 === 0 ? 2 : 0) - (h > 4 ? 1 : 0), 1, 1);
    x.fillStyle = '#5e9a4a';
    x.fillRect(X, H - 2, 1, 2);
  }
  for (const [X, c] of [[9, '#f7cf7a'], [27, '#f2a5a5'], [44, '#ffffff'], [58, '#c9b6e4']] as const) {
    x.fillStyle = c;
    x.fillRect(X, H - 10, 1, 1);
    x.fillRect(X - 1, H - 9, 3, 1);
    x.fillRect(X, H - 8, 1, 1);
  }
  save(cv, 'grass.png');
}

// ---------- the logo: 猫窝 in pixels, ink outline and a coral shadow ----------
function logo() {
  const S = 24; // glyph size in pixels
  const tmp = createCanvas(S * 3, S + 8);
  const t = tmp.getContext('2d');
  t.font = `600 ${S}px LogoFont`;
  t.textBaseline = 'middle';
  t.fillStyle = '#000';
  t.fillText('猫窝', 2, (S + 8) / 2 + 1);
  const src = t.getImageData(0, 0, tmp.width, tmp.height).data;
  const glyph = (X: number, Y: number) => X >= 0 && Y >= 0 && X < tmp.width && Y < tmp.height && src[(Y * tmp.width + X) * 4 + 3] >= 120;
  const outline = (X: number, Y: number) => glyph(X, Y) || glyph(X - 1, Y) || glyph(X + 1, Y) || glyph(X, Y - 1) || glyph(X, Y + 1);
  let maxX = 0;
  for (let Y = 0; Y < tmp.height; Y++) for (let X = 0; X < tmp.width; X++) if (glyph(X, Y)) maxX = Math.max(maxX, X);
  const W = maxX + 5, H = tmp.height + 3;
  const cv = createCanvas(W, H);
  const x = cv.getContext('2d');
  const layer = (test: (X: number, Y: number) => boolean, dx: number, dy: number, color: (Y: number) => string) => {
    for (let Y = -1; Y <= tmp.height; Y++)
      for (let X = -1; X <= tmp.width; X++)
        if (test(X, Y)) {
          x.fillStyle = color(Y);
          x.fillRect(X + dx, Y + dy, 1, 1);
        }
  };
  layer(outline, 2, 3, () => '#d9673a'); // shadow of the whole outlined shape
  layer(outline, 1, 1, () => INK);
  layer(glyph, 1, 1, (Y) => (Y < S * 0.62 ? '#fffaf0' : '#fbe2bd'));
  save(cv, 'logo.png');
}

// ---------- tiny icons, 12×12 ----------
const ICONS: Record<string, string[]> = {
  play: ['   #        ', '   ##       ', '   #o#      ', '   #oo#     ', '   #ooo#    ', '   #oooo#   ', '   #oooo#   ', '   #ooo#    ', '   #oo#     ', '   #o#      ', '   ##       ', '   #        '],
  down: ['    ####    ', '    #oo#    ', '    #oo#    ', '    #oo#    ', ' ####oo#### ', ' #oooooooo# ', '  #oooooo#  ', '   #oooo#   ', '    #oo#    ', '     ##     ', ' ########## ', ' ########## '],
  phone: ['  ########  ', '  #oooooo#  ', '  #o####o#  ', '  #o#..#o#  ', '  #o#..#o#  ', '  #o#..#o#  ', '  #o#..#o#  ', '  #o#..#o#  ', '  #o####o#  ', '  #ooo#oo#  ', '  #oooooo#  ', '  ########  '],
  code: ['            ', '   #    #   ', '  #o#  #o#  ', ' #o#    #o# ', '#o#  ##  #o#', '#o# #oo# #o#', '#o# #oo# #o#', '#o#  ##  #o#', ' #o#    #o# ', '  #o#  #o#  ', '   #    #   ', '            '],
  heart: ['            ', ' ###  ###   ', '#ooo##ooo#  ', '#oooooooo#  ', '#oooooooo#  ', ' #oooooo#   ', '  #oooo#    ', '   #oo#     ', '    ##      ', '            ', '            ', '            '],
  paw: ['  ##    ##  ', ' #oo#  #oo# ', ' #oo#  #oo# ', '  ##    ##  ', '##  ####  ##', '#o##oooo##o#', '##ooooooooo#', ' #oooooooo# ', ' #oooooooo# ', '  #oooooo#  ', '   ######   ', '            '],
  globe: ['   ######   ', '  #o.oo.o#  ', ' #o.oo.oo.# ', '#oooooooooo#', '#.##.##.##.#', '#o.oo.oo.oo#', '#o.oo.oo.oo#', '#.##.##.##.#', '#oooooooooo#', ' #o.oo.oo.# ', '  #o.oo.o#  ', '   ######   '],
  star: ['     ##     ', '     #o#    ', '    #oo#    ', '#####ooo####', '#oooooooooo#', ' #oooooooo# ', '  #oooooo#  ', '  #ooo#oo#  ', ' #oo#  #oo# ', ' ##     ### ', '            ', '            '],
};
function icons() {
  for (const [name, rows] of Object.entries(ICONS)) {
    const cv = createCanvas(12, 12);
    const x = cv.getContext('2d');
    rows.forEach((row, Y) =>
      [...row].forEach((ch, X) => {
        if (ch === ' ') return;
        x.fillStyle = ch === '#' ? INK : ch === '.' ? '#9fd0c4' : '#fffaf0';
        x.fillRect(X, Y, 1, 1);
      }));
    save(cv, `icon-${name}.png`);
  }
}

// ---------- screenshots as WebP ----------
async function shots() {
  const list: [string, number][] = [
    ['hero', 1600], ['client-web', 1400], ['client-iphone', 900], ['client-android', 900], ['client-mac', 1100], ['client-watch', 900],
    ...['welcome', 'profile', 'photo', 'night', 'build', 'wardrobe', 'world', 'map', 'social', 'letters', 'journal', 'collection'].map((n) => [`phone-${n}`, 480] as [string, number]),
  ];
  for (const [name, maxW] of list) {
    const im = await loadImage(`docs/images/${name}.png`);
    // the README banner carries its own title; the website shows just the devices
    const top = name === 'hero' ? Math.round(im.height * 0.29) : 0;
    const w = Math.min(maxW, im.width), h = Math.round(((im.height - top) * w) / im.width);
    const cv = createCanvas(w, h);
    cv.getContext('2d').drawImage(im, 0, top, im.width, im.height - top, 0, 0, w, h);
    writeFileSync(join(OUT, 'img', `${name}.webp`), await cv.encode('webp', 82));
    console.log('wrote', `img/${name}.webp`, `${w}x${h}`);
  }
}

cats();
lineup();
town();
grass();
logo();
icons();
await shots();
