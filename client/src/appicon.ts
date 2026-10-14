// Dev tool (not part of the build): renders the iOS app icon and launch image
// with the game's own cat art. /appicon.html?pick=1 shows candidate cats;
// /appicon.html?seed=N&send=http://localhost:5298 renders and uploads the PNGs.
import { Pen } from './engine/pen';
import { drawCat, defaultPose } from './art/cat';
import { randomGenes, coatName } from '../../shared/genes';

const q = new URLSearchParams(location.search);
const out = document.getElementById('out')!;
const INK = '#4a3a34';

function catOn(ctx: CanvasRenderingContext2D, seed: number, cx: number, baseY: number, unit: number, happy = true) {
  const pen = new Pen(ctx).begin(7, 0.25, 1.7);
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
  drawCat(pen, randomGenes(seed), p, { age: 0.75, outfit: [], shadow: false });
  ctx.restore();
}

/** A round cushion the cat sits in: the little nest. */
function cushion(ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number, lw: number) {
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

function background(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#fcf5e8');
  g.addColorStop(1, '#f2e2c6');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function icon(seed: number): HTMLCanvasElement {
  const S = 1024;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  background(ctx, S, S);
  // soft sun behind the cat
  ctx.fillStyle = 'rgba(255, 214, 150, 0.45)';
  ctx.beginPath();
  ctx.arc(S / 2, S * 0.47, S * 0.36, 0, Math.PI * 2);
  ctx.fill();
  cushion(ctx, S / 2, S * 0.84, S * 0.36, S * 0.1, 15);
  catOn(ctx, seed, S / 2, S * 0.86, 15.2);
  return c;
}

function splash(seed: number): HTMLCanvasElement {
  const S = 2732;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f6eedf';
  ctx.fillRect(0, 0, S, S);
  cushion(ctx, S / 2, S * 0.545, 250, 70, 11);
  catOn(ctx, seed, S / 2, S * 0.56, 10.5, false);
  ctx.fillStyle = INK;
  ctx.font = '600 120px "PingFang SC", system-ui';
  ctx.textAlign = 'center';
  ctx.fillText('猫 窝', S / 2, S * 0.56 + 220);
  return c;
}

if (q.get('pick')) {
  for (let i = 0; i < 24; i++) {
    const seed = 100 + i * 37;
    const c = document.createElement('canvas');
    c.width = c.height = 220;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#f6eedf';
    ctx.fillRect(0, 0, 220, 220);
    catOn(ctx, seed, 110, 200, 3.4);
    ctx.fillStyle = '#333';
    ctx.font = '14px system-ui';
    ctx.fillText(`${seed} ${coatName(randomGenes(seed))}`, 6, 18);
    out.appendChild(c);
  }
} else {
  const seed = Number(q.get('seed') ?? 100);
  const send = q.get('send');
  for (const [name, c] of [['AppIcon-512@2x.png', icon(seed)], ['splash-2732x2732.png', splash(seed)]] as const) {
    out.appendChild(c);
    if (send) void fetch(`${send}/save?name=${name}`, { method: 'POST', mode: 'no-cors', body: c.toDataURL('image/png') });
  }
}
