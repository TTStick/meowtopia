// Anthropomorphic townsfolk: upright cats wearing clothes, doing their jobs.
import { Pen, shade, rgba } from '../engine/pen';
import { drawCatHead, defaultPose, catPalette, type CatPose } from './cat';
import { drawHeadwear } from './wear';
import type { CatGenes } from '../../../shared/types';
import type { NpcOutfit } from '../../../shared/npcs';

const INK = '#4a3a34';

interface Look {
  shirt: string;
  pants: string | null;
  apron?: string;
  hat?: string;
  extra?: 'bag' | 'scarf' | 'shawl' | 'bowtie' | 'tape';
  extraColor?: string;
  glasses?: boolean;
}

const LOOKS: Record<NpcOutfit, Look> = {
  chef: { shirt: '#fffaf0', pants: '#8fb6d9', apron: '#ffffff', hat: 'chef' },
  apron: { shirt: '#f4c5bd', pants: null, apron: '#ffffff' },
  postman: { shirt: '#7fb38a', pants: '#5c7f68', hat: 'cap', extra: 'bag', extraColor: '#c99a6b' },
  cardigan: { shirt: '#f2b8c6', pants: '#8b95a3', glasses: true, extra: 'shawl', extraColor: '#e8d7b0' },
  fisher: { shirt: '#fff3dc', pants: '#5d86b8', hat: 'straw_hat' },
  florist: { shirt: '#fde3e3', pants: null, apron: '#9fd08a', hat: 'flower_crown' },
  merchant: { shirt: '#fff3dc', pants: '#a77b5f', apron: '#d9a86c', extra: 'bowtie', extraColor: '#e0605e' },
  kid: { shirt: '#ffd666', pants: '#8fc3e8' },
  musician: { shirt: '#4f5d70', pants: '#3d3838', extra: 'scarf', extraColor: '#e8735f' },
  granny: { shirt: '#c7a8d8', pants: null, glasses: true, extra: 'shawl', extraColor: '#f4e1c1' },
  scholar: { shirt: '#9db48c', pants: '#6f6a62', glasses: true },
  tailor: { shirt: '#3f4a5c', pants: '#2f3442', hat: 'beret', extra: 'tape', extraColor: '#ffd45e' },
};

export interface NpcPose {
  anim: string;
  t: number;
  phase: number;
  moving: boolean;
  dir: 1 | -1;
  blink: boolean;
  talking: boolean;
}

export function drawNpc(pen: Pen, g: CatGenes, outfit: NpcOutfit, p: NpcPose, kidScale = 1) {
  const ctx = pen.ctx;
  const look = LOOKS[outfit];
  const pal = catPalette(g);
  const fur = pal.base;
  const t = p.t;
  const kid = outfit === 'kid';
  const s = kid ? 0.82 * kidScale : 1;
  ctx.save();
  ctx.scale(p.dir * s, s);
  const sitting = p.anim === 'sit' || p.anim === 'sleep' || p.anim === 'fish' || p.anim === 'knit' || p.anim === 'read' && !p.moving;
  const walk = p.moving;
  const bob = walk ? Math.abs(Math.sin(p.phase)) * 2.2 : Math.sin(t * 2) * 0.6;
  const hop = p.anim === 'play' && !walk ? Math.max(0, Math.sin(t * 6)) * 8 : 0;
  const by = -bob - hop + (sitting ? 8 : 0);

  // shadow
  ctx.fillStyle = 'rgba(74,58,52,0.14)';
  ctx.beginPath();
  ctx.ellipse(0, 2, 16, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // tail
  const sw = Math.sin(t * 1.8) * 0.3;
  pen.tube([-8, by - 16, -18, by - 20, -22 + sw * 10, by - 34, -18 + sw * 16, by - 44], 6, pal.points ?? fur);

  // legs
  const legC = look.pants ?? fur;
  for (const sd of [-1, 1]) {
    const ph = p.phase + (sd > 0 ? Math.PI : 0);
    const fx = sitting ? sd * 6 + 8 : sd * 5 + (walk ? Math.sin(ph) * 6 : 0);
    const fy = sitting ? by - 2 : -(walk ? Math.max(0, Math.cos(ph)) * 4 : 0);
    pen.tube([sd * 5, by - 14, fx, fy - 3], 7, sd > 0 ? legC : shade(legC, -0.1));
    pen.ellipse(fx + 2, fy - 1, 5, 3.2, pal.points ?? (g.socks ? '#fffdf8' : fur), 1.3);
  }

  // body
  const bodyPts = [-12, by - 12, -13, by - 26, -9, by - 38, 9, by - 38, 13, by - 26, 12, by - 12, 0, by - 9];
  const body = pen.shape(bodyPts, look.shirt);
  pen.clip(body, () => {
    if (look.apron) {
      pen.shape([-9, by - 32, 9, by - 32, 10, by - 8, -10, by - 8], look.apron, 1.1);
      pen.ellipse(0, by - 20, 3, 2.4, rgba(INK, 0.15), 0, null);
    }
    if (outfit === 'kid') {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 4; i++) ctx.fillRect(-14, by - 34 + i * 7, 28, 3);
    }
    if (outfit === 'postman' || outfit === 'scholar' || outfit === 'cardigan') {
      for (let i = 0; i < 3; i++) pen.ellipse(0, by - 32 + i * 7, 1.2, 1.2, INK, 0, null);
    }
  });
  if (look.extra === 'bag') {
    pen.line([-9, by - 38, 10, by - 18], 2.2, look.extraColor);
    pen.shape([4, by - 22, 18, by - 22, 18, by - 10, 4, by - 10], look.extraColor!, 1.3);
    pen.shape([4, by - 22, 18, by - 22, 11, by - 16], shade(look.extraColor!, 0.15), 1);
  }
  if (look.extra === 'shawl') pen.shape([-14, by - 38, 14, by - 38, 10, by - 28, 0, by - 22, -10, by - 28], look.extraColor!, 1.2);
  if (look.extra === 'scarf') {
    pen.line([-9, by - 37, 0, by - 35, 9, by - 37], 5, look.extraColor);
    pen.tube([5, by - 35, 8, by - 22], 4, look.extraColor!);
  }
  if (look.extra === 'bowtie') {
    pen.shape([0, by - 37, -6, by - 40, -6, by - 34], look.extraColor!, 1);
    pen.shape([0, by - 37, 6, by - 40, 6, by - 34], look.extraColor!, 1);
  }
  if (look.extra === 'tape') pen.line([-8, by - 38, -5, by - 28, -9, by - 16], 2.4, look.extraColor);

  // arms & held props
  const armC = look.shirt;
  const hand = pal.points ?? fur;
  const sh = (sd: number): [number, number] => [sd * 10, by - 33];
  const arm = (sd: number, hx: number, hy: number) => {
    const [sx, sy] = sh(sd);
    pen.tube([sx, sy, (sx + hx) / 2 + sd * 2, (sy + hy) / 2, hx, hy], 6, sd > 0 ? armC : shade(armC, -0.08));
    pen.ellipse(hx, hy, 3.6, 3.4, hand, 1.2);
  };
  const a = p.anim;
  if (walk) {
    const swg = Math.sin(p.phase) * 6;
    arm(-1, -13 - swg * 0.3, by - 18 + swg * 0.2);
    arm(1, 13 + swg * 0.3, by - 18 - swg * 0.2);
  } else if (a === 'work') {
    const k = Math.sin(t * 5);
    if (outfit === 'chef') {
      pen.ellipse(2, by - 18, 10, 5, '#f7e3c6', 1.2);
      arm(-1, -4 + k * 2, by - 20 - Math.abs(k) * 2);
      arm(1, 8 - k * 2, by - 20 - Math.abs(k) * 2);
    } else if (outfit === 'florist') {
      arm(-1, -12, by - 18);
      pen.shape([10, by - 26, 22, by - 26, 20, by - 16, 12, by - 16], '#8fc3e8', 1.1);
      arm(1, 12, by - 24 + k);
      if (Math.sin(t * 3) > 0) pen.line([22, by - 22, 28, by - 14], 1, '#8fc3e8');
    } else if (outfit === 'apron') {
      // a warm cup of milk, steaming
      arm(-1, -6, by - 24);
      arm(1, 6, by - 24);
      pen.shape([-5, by - 30, 5, by - 30, 4, by - 22, -4, by - 22], '#ffffff', 1.1);
      for (let i = 0; i < 2; i++) {
        const k = (t * 0.6 + i * 0.5) % 1;
        ctx.globalAlpha = 1 - k;
        pen.line([-2 + i * 4, by - 32 - k * 6, -3 + i * 4 + Math.sin(k * 6) * 2, by - 38 - k * 8], 1, rgba(INK, 0.45));
        ctx.globalAlpha = 1;
      }
    } else if (outfit === 'tailor') {
      arm(-1, -6, by - 26);
      arm(1, 6 + k * 3, by - 26);
      pen.line([-6, by - 26, 6 + k * 3, by - 26], 1, '#e0605e');
    } else {
      arm(-1, -10, by - 24 + k);
      arm(1, 12, by - 28 - Math.max(0, k) * 6);
    }
  } else if (a === 'fish') {
    arm(-1, 6, by - 24);
    arm(1, 10, by - 26);
    const tip = [44, by - 58];
    pen.line([4, by - 22, tip[0], tip[1]], 2, '#a5754e');
    const bobY = Math.sin(t * 2) * 2;
    pen.line([tip[0], tip[1], tip[0] + 10, by + 14 + bobY], 0.8, rgba(INK, 0.6));
    pen.ellipse(tip[0] + 10, by + 14 + bobY, 2.4, 2.4, '#e0605e', 0.8);
  } else if (a === 'music') {
    // guitar
    pen.ellipse(2, by - 18, 9, 7, '#d98f6a', 1.3);
    pen.ellipse(2, by - 18, 2.4, 2.4, '#5a4740', 0.6);
    pen.line([6, by - 21, 22, by - 34], 3, '#a5754e');
    arm(-1, 18, by - 31);
    arm(1, 4 + Math.sin(t * 9) * 2, by - 18);
  } else if (a === 'read') {
    pen.shape([-8, by - 26, 0, by - 22, 8, by - 26, 8, by - 14, 0, by - 10, -8, by - 14], '#9ec3e6', 1.2);
    pen.line([0, by - 22, 0, by - 10], 1);
    arm(-1, -8, by - 20);
    arm(1, 8, by - 20);
  } else if (a === 'knit') {
    const k = Math.sin(t * 6);
    pen.line([-6 + k, by - 26, 4, by - 18], 1.4, '#c99a6b');
    pen.line([6 - k, by - 26, -4, by - 18], 1.4, '#c99a6b');
    pen.shape([-6, by - 18, 6, by - 18, 4, by - 12, -4, by - 12], '#f2b8c6', 1);
    arm(-1, -6 + k, by - 24);
    arm(1, 6 - k, by - 24);
    pen.ellipse(16, -6, 6, 5.5, '#f2b8c6', 1.2);
    pen.line([16, -6, 8, -10, 0, by - 14], 0.8, '#e08fa6');
  } else if (a === 'play') {
    arm(-1, -14, by - 44);
    arm(1, 14, by - 44);
  } else if (a === 'gaze') {
    arm(-1, -12, by - 18);
    arm(1, 6, by - 40);
  } else if (p.talking) {
    arm(-1, -12, by - 18);
    arm(1, 14, by - 34 + Math.sin(t * 6) * 3);
  } else {
    arm(-1, -13, by - 18);
    arm(1, 13, by - 18);
  }

  // head
  const pose: CatPose = defaultPose();
  pose.view = 'front';
  pose.turn = 0.25;
  pose.t = t;
  pose.eyes = a === 'sleep' ? 'closed' : p.blink ? 'blink' : a === 'music' || a === 'play' ? 'happy' : a === 'read' ? 'half' : 'open';
  pose.mouth = p.talking ? (Math.sin(t * 12) > 0 ? 'open' : 'w') : a === 'music' ? 'smile' : 'w';
  pose.lookY = a === 'read' || a === 'knit' ? 0.8 : a === 'gaze' ? -1 : 0;
  pose.blush = 0.4;
  const headTilt = a === 'sleep' ? 0.25 + Math.sin(t) * 0.05 : a === 'music' ? Math.sin(t * 3) * 0.1 : a === 'gaze' ? -0.2 : 0;
  ctx.save();
  ctx.translate(0, by - 46);
  ctx.rotate(headTilt);
  drawCatHead(pen, g, 11, pose);
  // hats
  if (look.hat === 'chef') {
    pen.shape([-8, -9, -12, -18, -8, -26, 0, -24, 8, -26, 12, -18, 8, -9], '#ffffff');
    pen.line([-8, -12, 8, -12], 1, rgba(INK, 0.4));
  } else if (look.hat === 'cap') {
    pen.shape([-11, -6, -9, -14, 0, -16, 9, -14, 11, -6], '#5c7f68');
    pen.shape([4, -6, 18, -5, 16, -2, 4, -3], '#4b6a56', 1.2);
    pen.ellipse(0, -11, 2.4, 2.4, '#ffd45e', 0.6);
  } else if (look.hat) {
    drawHeadwear(pen, [look.hat], 11, false);
  }
  if (look.glasses) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 1.1;
    for (const ex of [-4.2, 6.6]) {
      ctx.beginPath();
      ctx.arc(ex, 0.5, 3.4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
  ctx.restore();
}
