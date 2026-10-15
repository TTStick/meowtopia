// Draws the Android launcher icons and splash with the game's own cat art:
//   node --import tsx scripts/make-android-icons.ts
// Adaptive icon = background (warm gradient + sun) + foreground (cushion + calico),
// plus a monochrome layer for themed icons, legacy square/round PNGs and the splash cat.
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
(globalThis as { Path2D?: unknown }).Path2D ??= Path2D;
const { Pen } = await import('../client/src/engine/pen');
const { drawCat, defaultPose } = await import('../client/src/art/cat');
const { randomGenes } = await import('../shared/genes');

const RES = 'android/app/src/main/res';
const INK = '#4a3a34';
const SEED = 951; // the calico from the iOS icon

type Ctx = ReturnType<ReturnType<typeof createCanvas>['getContext']>;

function background(ctx: Ctx, S: number) {
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, '#fcf5e8');
  g.addColorStop(1, '#f2e2c6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(255, 214, 150, 0.45)';
  ctx.beginPath();
  ctx.arc(S / 2, S * 0.47, S * 0.27, 0, Math.PI * 2);
  ctx.fill();
}

/** Cushion and cat inside the adaptive-icon safe zone (the middle 66 of 108 dp). */
function foreground(ctx: Ctx, S: number) {
  const k = S / 108; // dp → px
  const cx = S / 2;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 1.5 * k;
  ctx.strokeStyle = INK;
  ctx.fillStyle = '#e98f6f';
  ctx.beginPath();
  ctx.ellipse(cx, 76 * k, 24 * k, 6.6 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#f7b49a';
  ctx.beginPath();
  ctx.ellipse(cx, 74.8 * k, 18.6 * k, 3.6 * k, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.lineWidth = 0.9 * k;
  ctx.stroke();
  ctx.restore();

  const pen = new Pen(ctx).begin(7, 0.22, 1.7);
  ctx.save();
  ctx.translate(cx, 77 * k);
  const u = (44 * k) / 52; // the cat is ~52 units tall; keep it ~44 dp
  ctx.scale(u, u);
  const p = defaultPose();
  p.view = 'front';
  p.eyes = 'happy';
  p.mouth = 'w';
  p.blush = 1;
  p.tailUp = 1;
  p.headTilt = -0.08;
  drawCat(pen, randomGenes(SEED), p, { age: 0.75, outfit: [], shadow: false });
  ctx.restore();
}

function save(canvas: ReturnType<typeof createCanvas>, dir: string, name: string) {
  mkdirSync(join(RES, dir), { recursive: true });
  writeFileSync(join(RES, dir, name), canvas.toBuffer('image/png'));
}

const DENSITIES: [string, number][] = [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]];

for (const [d, m] of DENSITIES) {
  // adaptive layers, 108 dp
  const S = Math.round(108 * m);
  const bg = createCanvas(S, S);
  background(bg.getContext('2d'), S);
  save(bg, `mipmap-${d}`, 'ic_launcher_background.png');

  const fg = createCanvas(S, S);
  foreground(fg.getContext('2d'), S);
  save(fg, `mipmap-${d}`, 'ic_launcher_foreground.png');

  const mono = createCanvas(S, S);
  const mc = mono.getContext('2d');
  mc.drawImage(fg, 0, 0);
  mc.globalCompositeOperation = 'source-in';
  mc.fillStyle = '#ffffff';
  mc.fillRect(0, 0, S, S);
  save(mono, `mipmap-${d}`, 'ic_launcher_monochrome.png');

  // legacy icons (Android 7), 48 dp: the full art, rounded square and circle
  const L = Math.round(48 * m);
  for (const [name, round] of [['ic_launcher.png', false], ['ic_launcher_round.png', true]] as const) {
    const c = createCanvas(L, L);
    const x = c.getContext('2d');
    x.save();
    x.beginPath();
    if (round) x.arc(L / 2, L / 2, L / 2, 0, Math.PI * 2);
    else x.roundRect(0, 0, L, L, L * 0.18);
    x.clip();
    // the 108 dp layers, cropped to their middle 72 dp like a launcher would
    const crop = (18 / 108) * S;
    x.drawImage(bg, crop, crop, S - 2 * crop, S - 2 * crop, 0, 0, L, L);
    x.drawImage(fg, crop, crop, S - 2 * crop, S - 2 * crop, 0, 0, L, L);
    x.restore();
    save(c, `mipmap-${d}`, name);
  }
}

// the cat shown centred on the cream launch screen (Android 7–11; 12+ uses the icon)
const SP = 600;
const sp = createCanvas(SP, SP);
foreground(sp.getContext('2d'), SP);
save(sp, 'drawable-xxhdpi', 'splash_cat.png');
console.log('android icons written');
