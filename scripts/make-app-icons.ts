// Draws the app icon and launch image with the game's own cat art, for every place that uses them:
//   node --import tsx scripts/make-app-icons.ts
// iPhone icon + splash, the iPhone's companion watch app, the Mac app (rounded, with a shadow),
// the web app (PWA) icons and docs/images/app-icon.png. The same picture as client/appicon.html;
// Android and the standalone watch app have their own scripts (make-android-icons.ts, make-watch-icon.ts).
import { createCanvas, GlobalFonts, Path2D, type Canvas } from '@napi-rs/canvas';
import { existsSync, writeFileSync } from 'node:fs';
import { crc32, deflateSync } from 'node:zlib';
(globalThis as { Path2D?: unknown }).Path2D ??= Path2D;
const { Pen } = await import('../client/src/engine/pen');
const { drawCat, defaultPose } = await import('../client/src/art/cat');
const { randomGenes } = await import('../shared/genes');

const INK = '#4a3a34';
const SEED = 951; // the calico on its cushion

for (const f of ['/System/Library/Fonts/PingFang.ttc', '/System/Library/AssetsV2/com_apple_MobileAsset_Font8/86ba2c91f017a3749571a82f2c6d890ac7ffb2fb.asset/AssetData/PingFang.ttc', '/System/Library/Fonts/Hiragino Sans GB.ttc']) {
  if (existsSync(f)) {
    GlobalFonts.registerFromPath(f, 'TitleFont');
    break;
  }
}

type Ctx = ReturnType<Canvas['getContext']>;

function catOn(ctx: Ctx, cx: number, baseY: number, unit: number, happy = true) {
  const pen = new Pen(ctx as unknown as CanvasRenderingContext2D).begin(7, 0.25, 1.7);
  ctx.save();
  ctx.translate(cx, baseY);
  ctx.scale(unit, unit);
  const p = defaultPose();
  p.view = 'front';
  p.eyes = happy ? 'happy' : 'open';
  p.mouth = 'w';
  p.blush = 1;
  p.tailUp = 1;
  p.headTilt = -0.08;
  drawCat(pen, randomGenes(SEED), p, { age: 0.75, outfit: [], shadow: false });
  ctx.restore();
}

/** A round cushion the cat sits in: the little nest. */
function cushion(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, lw: number) {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#e98f6f';
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f7b49a';
  ctx.beginPath();
  ctx.ellipse(cx, cy - ry * 0.18, rx * 0.78, ry * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = lw * 0.6;
  ctx.stroke();
  ctx.restore();
}

function icon(): Canvas {
  const S = 1024;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#fcf5e8');
  g.addColorStop(1, '#f2e2c6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  // soft sun behind the cat
  ctx.fillStyle = 'rgba(255, 214, 150, 0.45)';
  ctx.beginPath();
  ctx.arc(S / 2, S * 0.47, S * 0.36, 0, Math.PI * 2);
  ctx.fill();
  cushion(ctx, S / 2, S * 0.84, S * 0.36, S * 0.1, 15);
  catOn(ctx, S / 2, S * 0.86, 15.2);
  return c;
}

function splash(): Canvas {
  const S = 2732;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#f6eedf';
  ctx.fillRect(0, 0, S, S);
  cushion(ctx, S / 2, S * 0.545, 250, 70, 11);
  catOn(ctx, S / 2, S * 0.56, 10.5, false);
  ctx.fillStyle = INK;
  ctx.font = '600 120px TitleFont';
  ctx.textAlign = 'center';
  ctx.fillText('猫 窝', S / 2, S * 0.56 + 220);
  return c;
}

function resized(src: Canvas, size: number): Canvas {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, 0, 0, size, size);
  return c;
}

/** macOS icons sit in a rounded square on the 824/1024 grid, with a soft shadow. */
function macIcon(src: Canvas): Canvas {
  const S = 1024, inset = 100, side = 824, r = 185;
  const c = createCanvas(S, S);
  const ctx = c.getContext('2d');
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
  ctx.shadowBlur = 28;
  ctx.shadowOffsetY = 10;
  ctx.beginPath();
  ctx.roundRect(inset, inset, side, side, r);
  ctx.fillStyle = '#f7ebd7';
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(inset, inset, side, side, r);
  ctx.clip();
  ctx.drawImage(src, inset, inset, side, side);
  ctx.restore();
  return c;
}

/** An RGB PNG without an alpha channel: Xcode turns down app icons that have one. */
function opaquePng(c: Canvas): Buffer {
  const { width: w, height: h } = c;
  const px = c.getContext('2d').getImageData(0, 0, w, h).data;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0, o = 0; y < h; y++) {
    raw[o++] = 0; // no filter
    for (let x = 0; x < w; x++, o += 3) {
      const i = (y * w + x) * 4;
      raw[o] = px[i];
      raw[o + 1] = px[i + 1];
      raw[o + 2] = px[i + 2];
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function save(c: Canvas, path: string, opaque = true) {
  writeFileSync(path, opaque ? opaquePng(c) : c.toBuffer('image/png'));
  console.log('wrote', path, `${c.width}x${c.height}`);
}

const ic = icon();
save(ic, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
save(ic, 'ios/App/CatNestWatch/Assets.xcassets/AppIcon.appiconset/icon.png');
save(ic, 'docs/images/app-icon.png');
save(resized(ic, 512), 'client/public/icon-512.png');
save(resized(ic, 192), 'client/public/icon-192.png');
const sp = splash();
for (const n of ['', '-1', '-2']) save(sp, `ios/App/App/Assets.xcassets/Splash.imageset/splash-2732x2732${n}.png`);
const mac = macIcon(ic);
for (const size of [16, 32, 64, 128, 256, 512, 1024]) save(size === 1024 ? mac : resized(mac, size), `macos/CatNest/Assets.xcassets/AppIcon.appiconset/icon_${size}.png`, false);
