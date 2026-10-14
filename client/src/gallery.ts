import { Pen } from './engine/pen';
import { drawCat, defaultPose, type CatPose } from './art/cat';
import { randomGenes } from '../../shared/genes';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const pen = new Pen(ctx);
const dpr = Math.min(2, window.devicePixelRatio || 1);

const params = new URLSearchParams(location.search);
const seedBase = Number(params.get('seed') ?? 1);
const scale = Number(params.get('scale') ?? 3);
const genes = Array.from({ length: Number(params.get('n') ?? 4) }, (_, i) => randomGenes(seedBase + i * 977));

type PoseFn = (p: CatPose, t: number) => void;
const poses: [string, PoseFn][] = [
  ['sit', (p) => { p.view = 'front'; }],
  ['sit-tailup', (p, t) => { p.view = 'front'; p.tailUp = 1; p.eyes = 'happy'; p.mouth = 'open'; p.headTilt = Math.sin(t) * 0.15; }],
  ['loaf', (p) => { p.view = 'front'; p.sitH = 0; p.eyes = 'half'; }],
  ['knead', (p, t) => { p.view = 'front'; p.sitH = 0.7; p.pawL = Math.max(0, Math.sin(t * 6)); p.pawR = Math.max(0, -Math.sin(t * 6)); p.eyes = 'closed'; p.blush = 1; }],
  ['groom', (p, t) => { p.view = 'front'; p.groom = 1; p.eyes = 'closed'; p.mouth = 'tongue'; p.headTilt = 0.2 + Math.sin(t * 6) * 0.06; }],
  ['beg', (p) => { p.view = 'front'; p.beg = 1; p.eyes = 'wide'; p.lookY = -1; }],
  ['yawn', (p) => { p.view = 'front'; p.eyes = 'closed'; p.mouth = 'yawn'; p.headTilt = -0.1; }],
  ['back', (p) => { p.view = 'back'; }],
  ['walk', (p, t) => { p.view = 'side'; p.gait = 1; p.phase = t * 7; p.tailUp = 1; p.tailCurl = 0.6; }],
  ['run', (p, t) => { p.view = 'side'; p.gait = 2; p.phase = t * 13; p.tailUp = 0.3; p.ear = -0.3; p.eyes = 'wide'; }],
  ['stand', (p) => { p.view = 'side'; p.tailUp = 0.8; }],
  ['stretch', (p) => { p.view = 'side'; p.reach = 1; p.tilt = -0.32; p.eyes = 'closed'; p.mouth = 'open'; p.tailUp = 1; }],
  ['pounce', (p, t) => { p.view = 'side'; p.crouch = 1; p.wiggle = 1; p.eyes = 'wide'; p.tailUp = 0; p.tailSwish = 1.2; p.headDY = 0.3; void t; }],
  ['scratch', (p) => { p.view = 'side'; p.standUp = 1; p.pawLift = 1; p.eyes = 'happy'; }],
  ['sleep', (p) => { p.view = 'curl'; p.eyes = 'closed'; p.mouth = 'w'; }],
  ['belly', (p) => { p.view = 'belly'; p.wiggle = 1; p.eyes = 'happy'; p.mouth = 'open'; }],
  ['lie', (p) => { p.view = 'lie'; p.eyes = 'closed'; }],
  ['eat', (p) => { p.view = 'front'; p.sitH = 0.6; p.headDown = 0.55; p.eyes = 'closed'; p.mouth = 'chew'; }],
];

function resize() {
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  canvas.style.width = innerWidth + 'px';
  canvas.style.height = innerHeight + 'px';
}
resize();
addEventListener('resize', resize);

const only = params.get('only')?.split(',');
const shown = only ? poses.filter(([n]) => only.includes(n)) : poses;
const cellW = 52 * scale, cellH = 52 * scale;
function frame(ts: number) {
  const t = ts / 1000;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#f7f0e1';
  ctx.fillRect(0, 0, innerWidth, innerHeight);
  const cols = Math.max(1, Math.floor(innerWidth / cellW));
  const boil = Math.floor(t * 7) % 3;
  let k = 0;
  for (let gi = 0; gi < genes.length; gi++) {
    for (const [name, fn] of shown) {
      const col = k % cols, row = Math.floor(k / cols);
      k++;
      const p = defaultPose();
      p.t = t + gi;
      p.breathe = Math.sin(t * 2.4);
      if (Math.floor(t * 0.7 + gi) % 5 === 0 && (t * 0.7 + gi) % 1 < 0.08) p.eyes = 'blink';
      fn(p, t + gi * 0.3);
      ctx.save();
      ctx.translate(col * cellW + cellW / 2, row * cellH + cellH * 0.8);
      ctx.scale(scale, scale);
      pen.begin(boil * 101 + gi * 7 + k, 0.5, 1.6);
      drawCat(pen, genes[gi], p, { age: gi % 3 === 2 ? 0.2 : 1, outfit: gi === 1 ? ['bell_collar'] : gi === 2 ? ['flower_crown'] : gi === 3 ? ['scarf', 'beret'] : [] });
      ctx.restore();
      ctx.fillStyle = '#9a8a80';
      ctx.font = '11px system-ui';
      ctx.fillText(name, col * cellW + 6, row * cellH + 14);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
