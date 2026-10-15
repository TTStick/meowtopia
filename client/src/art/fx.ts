import { Pen, rgba } from '../engine/pen';

export type EmoteKind = 'heart' | 'zzz' | 'note' | 'exclaim' | 'question' | 'sparkle' | 'sweat' | 'puff' | 'fish' | 'dots' | 'star' | 'anger' | 'leaf';

export function heartPts(x: number, y: number, s: number): number[] {
  return [x, y + s * 0.8, x - s, y - s * 0.05, x - s * 0.55, y - s * 0.7, x, y - s * 0.3, x + s * 0.55, y - s * 0.7, x + s, y - s * 0.05];
}

export function drawEmote(pen: Pen, kind: EmoteKind, x: number, y: number, k: number, seed: number, scale: number, T: number) {
  const ctx = pen.ctx;
  const a = k < 0.15 ? k / 0.15 : k > 0.75 ? (1 - k) / 0.25 : 1;
  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, a));
  const s = scale;
  const rise = k * 18 * s;
  const pop = k < 0.15 ? 0.6 + (k / 0.15) * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
  switch (kind) {
    case 'heart': {
      const ox = Math.sin(k * 6 + seed) * 5 * s;
      pen.shape(heartPts(x + ox, y - rise - 6 * s, 5 * s * pop), '#f37b8f', 1.1 * s);
      break;
    }
    case 'zzz': {
      ctx.fillStyle = '#7b8fc4';
      ctx.font = `bold ${10 * s}px "Comic Sans MS", system-ui`;
      for (let i = 0; i < 3; i++) {
        const kk = (k * 1.5 + i * 0.33) % 1;
        ctx.globalAlpha = Math.sin(kk * Math.PI) * a;
        ctx.save();
        ctx.translate(x + kk * 14 * s + i * 2, y - kk * 22 * s);
        ctx.scale(0.6 + kk * 0.6, 0.6 + kk * 0.6);
        ctx.fillText('z', 0, 0);
        ctx.restore();
      }
      break;
    }
    case 'note': {
      const ox = Math.sin(k * 8 + seed) * 6 * s;
      const nx = x + ox, ny = y - rise - 4 * s;
      pen.line([nx + 3 * s, ny, nx + 3 * s, ny - 10 * s, nx + 8 * s, ny - 8 * s], 1.3 * s);
      pen.ellipse(nx + 0.8 * s, ny + 0.5 * s, 2.6 * s, 2 * s, '#4a3a34', 0.6 * s, null, -0.4);
      break;
    }
    case 'exclaim': {
      const by = y - 10 * s - (1 - pop) * 4;
      pen.shape([x - 2.2 * s, by - 12 * s, x + 2.2 * s, by - 12 * s, x + 1.2 * s, by - 2 * s, x - 1.2 * s, by - 2 * s], '#ffd45e', 1.1 * s);
      pen.ellipse(x, by + 2 * s, 1.8 * s, 1.8 * s, '#ffd45e', 1 * s);
      break;
    }
    case 'question': {
      ctx.fillStyle = '#4a3a34';
      ctx.font = `bold ${15 * s * pop}px system-ui`;
      ctx.textAlign = 'center';
      ctx.fillText('?', x + Math.sin(T * 3) * 2 * s, y - 6 * s);
      break;
    }
    case 'sparkle': {
      for (let i = 0; i < 3; i++) {
        const ang = seed + i * 2.1;
        const r = (6 + k * 14) * s;
        const sx = x + Math.cos(ang) * r, sy = y - 4 * s + Math.sin(ang) * r * 0.6;
        const sz = (3 + i) * s * (1 - k * 0.5);
        const pts: number[] = [];
        for (let j = 0; j < 8; j++) {
          const aa = (j / 8) * Math.PI * 2;
          const rr = j % 2 ? sz * 0.3 : sz;
          pts.push(sx + Math.cos(aa) * rr, sy + Math.sin(aa) * rr);
        }
        pen.shape(pts, '#ffe27a', 0.8 * s);
      }
      break;
    }
    case 'sweat': {
      const sx = x + 10 * s, sy = y + 4 * s + k * 6 * s;
      pen.shape([sx, sy - 6 * s, sx + 3 * s, sy, sx, sy + 2.5 * s, sx - 3 * s, sy], '#a9d6f5', 0.9 * s);
      break;
    }
    case 'puff': {
      for (let i = 0; i < 4; i++) {
        const ang = Math.PI + (i / 3) * Math.PI;
        const r = (4 + k * 12) * s;
        pen.ellipse(x + Math.cos(ang) * r, y + 16 * s + Math.sin(ang) * r * 0.3, (4 - k * 2) * s, (3 - k * 1.5) * s, '#f3eee4', 0.8 * s);
      }
      break;
    }
    case 'fish': {
      const fx = x, fy = y - rise - 6 * s;
      pen.ellipse(fx, fy, 6 * s, 3.4 * s, '#8fc3e8', 1 * s);
      pen.shape([fx + 5 * s, fy, fx + 10 * s, fy - 4 * s, fx + 10 * s, fy + 4 * s], '#8fc3e8', 1 * s);
      break;
    }
    case 'dots': {
      ctx.fillStyle = '#4a3a34';
      for (let i = 0; i < 3; i++) {
        if (k * 4 > i) {
          ctx.beginPath();
          ctx.arc(x - 6 * s + i * 6 * s, y - 6 * s, 1.6 * s, 0, 7);
          ctx.fill();
        }
      }
      break;
    }
    case 'star': {
      const pts: number[] = [];
      const sz = 6 * s * pop;
      for (let j = 0; j < 10; j++) {
        const aa = (j / 10) * Math.PI * 2 - Math.PI / 2;
        const rr = j % 2 ? sz * 0.45 : sz;
        pts.push(x + Math.cos(aa) * rr, y - rise - 6 * s + Math.sin(aa) * rr);
      }
      pen.shape(pts, '#ffd45e', 1 * s);
      break;
    }
    case 'anger': {
      const sx = x + 10 * s, sy = y;
      for (let i = 0; i < 4; i++) {
        const ang = (i / 4) * Math.PI * 2 + Math.PI / 4;
        pen.line([sx + Math.cos(ang) * 1.5 * s, sy + Math.sin(ang) * 1.5 * s, sx + Math.cos(ang) * 4.5 * s, sy + Math.sin(ang) * 4.5 * s], 1.4 * s, '#e0605e');
      }
      break;
    }
    case 'leaf': {
      const lx = x + Math.sin(k * 5) * 8 * s, ly = y - 20 * s + k * 26 * s;
      pen.shape([lx, ly, lx - 3 * s, ly - 4 * s, lx, ly - 9 * s, lx + 3 * s, ly - 4 * s], '#9ccf86', 0.8 * s);
      break;
    }
  }
  ctx.restore();
}

const FONT = '"PingFang SC","HarmonyOS Sans SC","Microsoft YaHei","Noto Sans SC",system-ui,sans-serif';

/** Closing punctuation never starts a line; it hangs off the end of the previous one. */
const NO_LINE_START = new Set(Array.from('，。！？、；：）」』】》〉…～—,.!?;:)]}~'));

export function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const lines: string[] = [];
  let cur = '';
  for (const ch of Array.from(text)) {
    const test = cur + ch;
    if (ctx.measureText(test).width > maxW && cur && !NO_LINE_START.has(ch)) {
      lines.push(cur);
      cur = ch;
    } else cur = test;
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

export function measureBubble(ctx: CanvasRenderingContext2D, text: string, name?: string): { w: number; h: number } {
  ctx.save();
  ctx.font = `14px ${FONT}`;
  const lines = wrapText(ctx, text, 168);
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  if (name) {
    ctx.font = `bold 11px ${FONT}`;
    w = Math.max(w, ctx.measureText(name).width);
  }
  ctx.restore();
  return { w: w + 22, h: lines.length * 19 + 16 + (name ? 14 : 0) + 10 };
}

/** Speech bubble in screen space. (x, y) = point the tail points at. `lift` raises the box (stacking). */
export function drawBubble(ctx: CanvasRenderingContext2D, x: number, y: number, text: string, alpha: number, name?: string, tone: 'cat' | 'npc' | 'me' = 'cat', lift = 0) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `14px ${FONT}`;
  const lines = wrapText(ctx, text, 168);
  const lh = 19;
  let w = 0;
  for (const l of lines) w = Math.max(w, ctx.measureText(l).width);
  if (name) {
    ctx.font = `bold 11px ${FONT}`;
    w = Math.max(w, ctx.measureText(name).width);
  }
  const padX = 11, padY = 8;
  const bw = w + padX * 2, bh = lines.length * lh + padY * 2 + (name ? 14 : 0);
  let bx = x - bw / 2;
  bx = Math.max(6, Math.min(ctx.canvas.clientWidth - bw - 6, bx));
  const by = y - bh - 10 - lift;
  const fill = tone === 'npc' ? '#fff8e8' : tone === 'me' ? '#eef6ff' : '#ffffff';
  ctx.fillStyle = 'rgba(74,58,52,0.12)';
  roundRect(ctx, bx + 2, by + 3, bw, bh, 12);
  ctx.fill();
  ctx.fillStyle = fill;
  ctx.strokeStyle = '#4a3a34';
  ctx.lineWidth = 2;
  ctx.beginPath();
  const r = 12;
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + bh - r);
  ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - r, by + bh);
  const tx = Math.max(bx + 14, Math.min(bx + bw - 14, x));
  ctx.lineTo(tx + 6, by + bh);
  ctx.lineTo(tx - 1, by + bh + 9 + Math.min(lift, 30));
  ctx.lineTo(tx - 6, by + bh);
  ctx.lineTo(bx + r, by + bh);
  ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  let ty = by + padY;
  if (name) {
    ctx.font = `bold 11px ${FONT}`;
    ctx.fillStyle = '#c0846a';
    ctx.textBaseline = 'top';
    ctx.fillText(name, bx + padX, ty);
    ty += 14;
  }
  ctx.font = `14px ${FONT}`;
  ctx.fillStyle = '#4a3a34';
  ctx.textBaseline = 'top';
  for (const l of lines) {
    ctx.fillText(l, bx + padX, ty + 1);
    ty += lh;
  }
  ctx.restore();
}

export function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function drawNameTag(ctx: CanvasRenderingContext2D, x: number, y: number, name: string, color = '#4a3a34', alpha = 0.85) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `bold 11px ${FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = ctx.measureText(name).width + 12;
  ctx.fillStyle = 'rgba(255,253,246,0.85)';
  roundRect(ctx, x - w / 2, y - 8, w, 16, 8);
  ctx.fill();
  ctx.fillStyle = color;
  ctx.fillText(name, x, y + 0.5);
  ctx.restore();
}

export { FONT, rgba };
