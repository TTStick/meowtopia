// Draws the icon of the standalone watch app (猫窝手表版) with the game's own cat art:
//   node --import tsx scripts/make-watch-icon.ts
// The same calico on its cushion as the other icons, under a night sky, so it's easy
// to tell from the iPhone's companion watch app when both are on one watch.
import { createCanvas, Path2D } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
(globalThis as { Path2D?: unknown }).Path2D ??= Path2D;
const { Pen } = await import('../client/src/engine/pen');
const { drawCat, defaultPose } = await import('../client/src/art/cat');
const { randomGenes } = await import('../shared/genes');

const OUT = 'watchos/CatNestWatchSolo/Assets.xcassets/AppIcon.appiconset/icon.png';
const INK = '#4a3a34';
const SEED = 951; // the calico from the other icons
const S = 1024;

const canvas = createCanvas(S, S);
const ctx = canvas.getContext('2d');

// night sky
const g = ctx.createLinearGradient(0, 0, 0, S);
g.addColorStop(0, '#231d3f');
g.addColorStop(1, '#4a3a6e');
ctx.fillStyle = g;
ctx.fillRect(0, 0, S, S);
for (let i = 0; i < 26; i++) {
  const x = ((i * 389) % 997) / 997;
  const y = ((i * 211) % 613) / 613;
  if (Math.hypot(x - 0.5, y - 0.55) < 0.3) continue; // keep the middle clear for the cat
  ctx.fillStyle = `rgba(255, 246, 216, ${0.45 + ((i * 7) % 5) / 10})`;
  const r = S * (0.004 + ((i * 3) % 4) * 0.0018);
  ctx.beginPath();
  ctx.arc(x * S, y * S * 0.8, r, 0, Math.PI * 2);
  ctx.fill();
}
// a crescent moon, top right
ctx.fillStyle = '#fff3c4';
ctx.beginPath();
ctx.arc(S * 0.76, S * 0.22, S * 0.085, 0, Math.PI * 2);
ctx.fill();
ctx.fillStyle = '#2a2349';
ctx.beginPath();
ctx.arc(S * 0.79, S * 0.2, S * 0.072, 0, Math.PI * 2);
ctx.fill();
// a soft glow behind the cat
const glow = ctx.createRadialGradient(S / 2, S * 0.55, S * 0.05, S / 2, S * 0.55, S * 0.36);
glow.addColorStop(0, 'rgba(255, 214, 150, 0.32)');
glow.addColorStop(1, 'rgba(255, 214, 150, 0)');
ctx.fillStyle = glow;
ctx.fillRect(0, 0, S, S);

// cushion
const base = S * 0.84;
ctx.save();
ctx.lineJoin = 'round';
ctx.lineWidth = S * 0.018;
ctx.strokeStyle = INK;
ctx.fillStyle = '#e98f6f';
ctx.beginPath();
ctx.ellipse(S / 2, base, S * 0.34, S * 0.09, 0, 0, Math.PI * 2);
ctx.fill();
ctx.stroke();
ctx.fillStyle = '#f7b49a';
ctx.beginPath();
ctx.ellipse(S / 2, base - S * 0.017, S * 0.26, S * 0.05, 0, 0, Math.PI * 2);
ctx.fill();
ctx.lineWidth = S * 0.011;
ctx.stroke();
ctx.restore();

// the cat
const pen = new Pen(ctx).begin(7, 0.22, 1.7);
ctx.save();
ctx.translate(S / 2, base + S * 0.012);
const u = (S * 0.62) / 52; // the cat is ~52 units tall
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

writeFileSync(OUT, canvas.toBuffer('image/png'));
console.log('watch icon written:', OUT);
