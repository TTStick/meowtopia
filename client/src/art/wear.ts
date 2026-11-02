import { Pen, shade } from '../engine/pen';

// Accessories drawn in head-local coordinates (head center = 0,0, radius R)
// or at the neck position.

export function drawNeckwear(pen: Pen, outfit: string[], x: number, y: number, R: number, side: number) {
  if (!outfit.length) return;
  const ctx = pen.ctx;
  for (const id of outfit) {
    switch (id) {
      case 'bell_collar': {
        pen.line([x - R * 0.6 + side * R * 0.2, y - R * 0.05, x + side * R * 0.25, y + R * 0.12, x + R * 0.6 + side * R * 0.2, y - R * 0.05], R * 0.16, '#e0605e', 0.3);
        pen.ellipse(x + side * R * 0.25, y + R * 0.3, R * 0.15, R * 0.15, '#f5c74f', pen.lw * 0.8);
        ctx.fillStyle = '#4a3a34';
        ctx.fillRect(x + side * R * 0.25 - R * 0.06, y + R * 0.33, R * 0.12, R * 0.03);
        break;
      }
      case 'bow_tie': {
        const cx = x + side * R * 0.25, cy = y + R * 0.15;
        pen.shape([cx, cy, cx - R * 0.4, cy - R * 0.22, cx - R * 0.4, cy + R * 0.22], '#5b8fd6', pen.lw * 0.8);
        pen.shape([cx, cy, cx + R * 0.4, cy - R * 0.22, cx + R * 0.4, cy + R * 0.22], '#5b8fd6', pen.lw * 0.8);
        pen.ellipse(cx, cy, R * 0.1, R * 0.1, '#3f6fb3', pen.lw * 0.7);
        break;
      }
      case 'scarf': {
        // wound low enough to show under the round chin
        const sy = y + R * 0.2;
        const p = pen.line([x - R * 0.7, sy - R * 0.05, x, sy + R * 0.18, x + R * 0.7, sy - R * 0.05], R * 0.3, '#e8735f', 0.3);
        pen.tubeOverlay(p, R * 0.3, '#f6d27a', [R * 0.12, R * 0.16]);
        // the loose end hangs off to one side, striped like the rest
        const end = pen.tube([x + R * 0.48 + side * R * 0.2, sy + R * 0.06, x + R * 0.64 + side * R * 0.2, sy + R * 0.52], R * 0.22, '#e8735f');
        pen.tubeOverlay(end, R * 0.22, '#f6d27a', [R * 0.1, R * 0.12]);
        break;
      }
      case 'bandana': {
        const cx = x + side * R * 0.2;
        pen.shape([cx - R * 0.7, y - R * 0.05, cx + R * 0.7, y - R * 0.05, cx, y + R * 0.65], '#e05d6f', pen.lw * 0.85);
        ctx.fillStyle = '#fff';
        for (const [dx, dy] of [[-0.3, 0.12], [0.25, 0.15], [0, 0.38]]) {
          ctx.beginPath();
          ctx.arc(cx + dx * R, y + dy * R, R * 0.05, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
    }
  }
}

/** How far below the old crown the cat's (flatter) head now starts, in head radii. */
export const CROWN_DROP = 0.12;

export function drawHeadwear(pen: Pen, outfit: string[], R: number, back: boolean) {
  if (!outfit.length) return;
  const ctx = pen.ctx;
  ctx.save();
  ctx.translate(0, R * CROWN_DROP);
  for (const id of outfit) {
    switch (id) {
      case 'flower_crown': {
        const cols = ['#f49ab0', '#ffd666', '#a8d8f0', '#f49ab0', '#c7a8f0'];
        pen.line([-R * 0.95, -R * 0.62, 0, -R * 0.98, R * 0.95, -R * 0.62], R * 0.07, '#7cb36b', 0.4);
        for (let i = 0; i < 5; i++) {
          const a = -Math.PI * 0.82 + (i / 4) * Math.PI * 0.64;
          const fx = Math.cos(a) * R * 1.02, fy = Math.sin(a) * R * 0.92 + R * 0.05;
          for (let k = 0; k < 5; k++) {
            const pa = (k / 5) * Math.PI * 2;
            ctx.fillStyle = cols[i];
            ctx.beginPath();
            ctx.arc(fx + Math.cos(pa) * R * 0.1, fy + Math.sin(pa) * R * 0.1, R * 0.085, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.fillStyle = '#ffe9a6';
          ctx.beginPath();
          ctx.arc(fx, fy, R * 0.06, 0, Math.PI * 2);
          ctx.fill();
        }
        break;
      }
      case 'beret': {
        pen.shape([-R * 0.85, -R * 0.62, -R * 0.6, -R * 1.18, R * 0.3, -R * 1.3, R * 1.0, -R * 0.95, R * 0.75, -R * 0.62, 0, -R * 0.72], '#d65a5a');
        pen.line([R * 0.05, -R * 1.28, R * 0.12, -R * 1.45], pen.lw * 1.2);
        break;
      }
      case 'straw_hat': {
        pen.ellipse(0, -R * 0.78, R * 1.45, R * 0.32, '#f2d38a');
        pen.shape([-R * 0.72, -R * 0.8, -R * 0.55, -R * 1.42, R * 0.55, -R * 1.42, R * 0.72, -R * 0.8], '#f2d38a');
        pen.line([-R * 0.7, -R * 0.92, 0, -R * 0.86, R * 0.7, -R * 0.92], R * 0.16, '#e2725b', 0.3);
        break;
      }
      case 'knit_hat': {
        const p = pen.shape([-R * 0.9, -R * 0.55, -R * 0.75, -R * 1.2, 0, -R * 1.45, R * 0.75, -R * 1.2, R * 0.9, -R * 0.55], '#8fc1d9');
        pen.clip(p, () => {
          for (let i = -3; i <= 3; i++) pen.line([i * R * 0.25, -R * 0.6, i * R * 0.22, -R * 1.5], pen.lw * 0.5, 'rgba(74,58,52,0.3)', 0.3);
        });
        pen.line([-R * 0.92, -R * 0.62, 0, -R * 0.52, R * 0.92, -R * 0.62], R * 0.22, '#f4f0e6', 0.3);
        pen.ellipse(0, -R * 1.55, R * 0.22, R * 0.2, '#f4f0e6');
        break;
      }
      case 'bow': {
        const cx = R * 0.62, cy = -R * 0.9;
        pen.shape([cx, cy, cx - R * 0.42, cy - R * 0.3, cx - R * 0.4, cy + R * 0.22], '#f28ba8', pen.lw * 0.8);
        pen.shape([cx, cy, cx + R * 0.42, cy - R * 0.3, cx + R * 0.4, cy + R * 0.22], '#f28ba8', pen.lw * 0.8);
        pen.ellipse(cx, cy, R * 0.11, R * 0.11, '#e06a8c', pen.lw * 0.7);
        break;
      }
      case 'leaf': {
        const cx = -R * 0.1, cy = -R * 1.0;
        pen.shape([cx, cy, cx - R * 0.25, cy - R * 0.4, cx + R * 0.05, cy - R * 0.85, cx + R * 0.3, cy - R * 0.4], '#8cc66a', pen.lw * 0.8);
        pen.line([cx, cy, cx + R * 0.03, cy - R * 0.7], pen.lw * 0.6);
        break;
      }
      case 'witch_hat': {
        pen.ellipse(0, -R * 0.78, R * 1.3, R * 0.26, '#6b5b95');
        pen.shape([-R * 0.65, -R * 0.82, R * 0.1, -R * 2.2, R * 0.4, -R * 1.95, R * 0.65, -R * 0.82], '#6b5b95');
        pen.line([-R * 0.6, -R * 1.0, R * 0.6, -R * 1.0], R * 0.14, '#f5c74f', 0.3);
        break;
      }
      case 'crown': {
        pen.shape([-R * 0.5, -R * 0.8, -R * 0.55, -R * 1.35, -R * 0.25, -R * 1.1, 0, -R * 1.45, R * 0.25, -R * 1.1, R * 0.55, -R * 1.35, R * 0.5, -R * 0.8], '#f5c74f');
        ctx.fillStyle = '#e0605e';
        ctx.beginPath();
        ctx.arc(0, -R * 0.98, R * 0.08, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
    }
  }
  ctx.restore();
  void back;
}

export function drawFacewear(pen: Pen, outfit: string[], R: number, turn: number) {
  if (!outfit.includes('glasses')) return;
  const ctx = pen.ctx;
  const a = turn * 0.62;
  const ex1 = Math.sin(-0.56 + a) * R * 1.05, ex2 = Math.sin(0.56 + a) * R * 1.05;
  const y = R * 0.12;
  ctx.strokeStyle = '#4a3a34';
  ctx.lineWidth = pen.lw * 0.9;
  ctx.fillStyle = 'rgba(200,230,255,0.25)';
  for (const ex of [ex1, ex2]) {
    ctx.beginPath();
    ctx.arc(ex, y, R * 0.28, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(ex1 + R * 0.28, y - R * 0.04);
  ctx.quadraticCurveTo((ex1 + ex2) / 2, y - R * 0.12, ex2 - R * 0.28, y - R * 0.04);
  ctx.stroke();
}

export { shade };
