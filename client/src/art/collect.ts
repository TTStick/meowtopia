// Line-art icons for collectible treasures (centered at 0,0, about 28 units wide).
import { Pen, rgba } from '../engine/pen';

const INK = '#4a3a34';

export function collectIcon(pen: Pen, id: string) {
  const ctx = pen.ctx;
  switch (id) {
    case 'ginkgo':
      pen.shape([0, 8, -12, -4, -8, -10, 0, -6, 8, -10, 12, -4], '#f6c945');
      pen.line([0, 8, 0, 16], 1.4);
      break;
    case 'maple': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 13 : 6;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      pen.shape(pts, '#e9674f');
      pen.line([0, 4, 2, 16], 1.4);
      break;
    }
    case 'clover':
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        pen.ellipse(Math.cos(a) * 6, Math.sin(a) * 6 - 2, 6, 6, '#7cc56a');
      }
      pen.line([0, 2, 3, 14], 1.4, '#5a9a4a');
      break;
    case 'pebble':
      pen.ellipse(0, 2, 13, 9, '#c9c6c0');
      pen.ellipse(-4, -1, 4, 2, 'rgba(255,255,255,0.6)', 0, null);
      break;
    case 'shell':
      pen.shape([0, 10, -13, 0, -9, -9, 0, -12, 9, -9, 13, 0], '#f7d5c4');
      for (let i = -2; i <= 2; i++) pen.line([0, 10, i * 5, -10], 1, rgba(INK, 0.5));
      break;
    case 'feather':
      pen.shape([-10, 12, -6, 0, 4, -12, 10, -14, 6, -4, -2, 8], '#cfe3f2');
      pen.line([-12, 14, 8, -12], 1.4);
      break;
    case 'pinecone':
      pen.ellipse(0, 2, 9, 13, '#a87a4a');
      for (let i = -2; i <= 2; i++) pen.line([-8, i * 5, 0, i * 5 + 3, 8, i * 5], 1, rgba(INK, 0.6));
      break;
    case 'bottlecap':
      pen.ellipse(0, 0, 12, 12, '#e86b5e');
      pen.ellipse(0, 0, 8, 8, '#f2a29a', 1);
      pen.shape([0, -5, 1.5, -1.5, 5, -1, 2, 1.5, 3, 5, 0, 3, -3, 5, -2, 1.5, -5, -1, -1.5, -1.5], '#ffd45e', 0.6);
      break;
    case 'marble': {
      pen.ellipse(0, 0, 12, 12, '#bfe0f2');
      ctx.fillStyle = '#f49ab0';
      ctx.beginPath();
      ctx.ellipse(-2, 2, 6, 2.5, 0.6, 0, 7);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-4, -5, 2.5, 0, 7);
      ctx.fill();
      break;
    }
    case 'dandelion':
      pen.line([0, 16, 0, -2], 1.4, '#6faa5d');
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        pen.line([0, -6, Math.cos(a) * 11, -6 + Math.sin(a) * 11], 0.8, rgba(INK, 0.6));
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(Math.cos(a) * 11, -6 + Math.sin(a) * 11, 1.6, 0, 7);
        ctx.fill();
      }
      break;
    case 'petal':
      pen.shape([0, 12, -10, 0, -6, -10, 0, -6, 6, -10, 10, 0], '#f8c6d4');
      break;
    case 'acorn':
      pen.ellipse(0, 3, 9, 10, '#c98e5a');
      pen.shape([-11, -3, -8, -10, 8, -10, 11, -3], '#8a5a3c');
      pen.line([0, -10, 2, -15], 1.6);
      break;
    case 'snail_shell':
      pen.ellipse(0, 0, 12, 11, '#e9c08b');
      pen.line([0, 0, 5, -2, 4, 5, -4, 6, -8, 0, -4, -7, 5, -8, 10, -2], 1.2, rgba(INK, 0.7));
      break;
    case 'chalk':
      for (const [c, x] of [['#f49ab0', -8], ['#8fc3e8', 0], ['#ffd45e', 8]] as [string, number][]) pen.shape([x - 3, 12, x - 3, -10, x + 3, -10, x + 3, 12], c, 1.2);
      break;
    case 'yarn_bit':
      pen.line([-12, 6, -4, -6, 4, 6, 12, -6], 2.4, '#f490a8');
      break;
    case 'stamp': {
      pen.shape([-11, -13, 11, -13, 11, 13, -11, 13], '#fffaf0');
      ctx.strokeStyle = rgba(INK, 0.5);
      ctx.setLineDash([2, 2]);
      ctx.strokeRect(-9, -11, 18, 22);
      ctx.setLineDash([]);
      pen.ellipse(0, 1, 5, 5, '#f6b26b', 1);
      pen.shape([-4, -3, -3, -9, 0, -5], '#f6b26b', 1);
      pen.shape([4, -3, 3, -9, 0, -5], '#f6b26b', 1);
      break;
    }
    case 'button':
      pen.ellipse(0, 0, 11, 11, '#8fc3e8');
      for (const [x, y] of [[-3, -3], [3, -3], [-3, 3], [3, 3]]) pen.ellipse(x, y, 1.6, 1.6, INK, 0, null);
      break;
    case 'star_candy': {
      const pts: number[] = [];
      for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
        const r = i % 2 === 0 ? 13 : 6;
        pts.push(Math.cos(a) * r, Math.sin(a) * r);
      }
      pen.shape(pts, '#ffe27a');
      break;
    }
    case 'fish_scale':
      pen.shape([0, -12, 11, 0, 0, 12, -11, 0], '#bfe7f0');
      pen.line([-4, -4, 4, 4], 1.4, '#ffffff');
      break;
    case 'mushroom':
      pen.tube([0, 12, 0, 0], 6, '#f6eedf');
      pen.shape([-12, 2, -8, -8, 0, -11, 8, -8, 12, 2], '#e86b5e');
      ctx.fillStyle = '#fff';
      for (const [x, y] of [[-5, -4], [4, -6], [0, 0]]) {
        ctx.beginPath();
        ctx.arc(x, y, 1.8, 0, 7);
        ctx.fill();
      }
      break;
    case 'ice_crystal':
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI;
        pen.line([Math.cos(a) * -13, Math.sin(a) * -13, Math.cos(a) * 13, Math.sin(a) * 13], 2.4, '#8fc3e8');
      }
      break;
    case 'sunflower_seed':
      pen.ellipse(0, 0, 6, 12, '#5a4a40');
      pen.line([-1, -9, -1, 9], 1.4, '#ffffff');
      break;
    case 'firefly_jar': {
      pen.shape([-9, -10, 9, -10, 10, 12, -10, 12], 'rgba(220,240,255,0.6)');
      pen.shape([-10, -14, 10, -14, 10, -10, -10, -10], '#c99a6b', 1);
      const g = ctx.createRadialGradient(0, 2, 0, 0, 2, 10);
      g.addColorStop(0, 'rgba(255,240,140,0.95)');
      g.addColorStop(1, 'rgba(255,240,140,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-10, -8, 20, 20);
      break;
    }
    case 'tiny_bell':
      pen.shape([-10, 6, -8, -4, 0, -10, 8, -4, 10, 6], '#f5c74f');
      pen.ellipse(0, 7, 3, 3, '#e0a53c', 1);
      break;
    case 'ribbon':
      pen.shape([0, 0, -12, -8, -12, 8], '#f49ab0');
      pen.shape([0, 0, 12, -8, 12, 8], '#f49ab0');
      pen.line([0, 0, -6, 14], 2, '#f49ab0');
      pen.line([0, 0, 6, 14], 2, '#f49ab0');
      break;
    case 'old_key':
      pen.ellipse(-6, -6, 6, 6, null, 2.4, '#c9a25a');
      pen.line([-2, -2, 12, 12], 2.4, '#c9a25a');
      pen.line([7, 7, 10, 4], 2, '#c9a25a');
      break;
    case 'postcard':
      pen.shape([-14, -10, 14, -10, 14, 10, -14, 10], '#fffaf0');
      pen.line([2, -8, 2, 8], 1, rgba(INK, 0.5));
      pen.shape([6, -7, 12, -7, 12, -1, 6, -1], '#f49ab0', 0.8);
      for (let i = 0; i < 3; i++) pen.line([-11, -4 + i * 5, -2, -4 + i * 5], 1, rgba(INK, 0.5));
      break;
    case 'sea_glass':
      pen.shape([-8, -10, 8, -12, 12, 4, 0, 12, -12, 4], '#a8e0cf');
      break;
    case 'moonstone': {
      pen.ellipse(0, 0, 12, 12, '#e8ecff');
      const g = ctx.createRadialGradient(-3, -3, 0, 0, 0, 12);
      g.addColorStop(0, 'rgba(255,255,255,0.9)');
      g.addColorStop(1, 'rgba(170,190,255,0.3)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 11, 0, 7);
      ctx.fill();
      break;
    }
    case 'rain_drop':
      pen.shape([0, -13, 9, 2, 6, 10, -6, 10, -9, 2], '#a9d6ec');
      break;
    case 'lotus_leaf':
      pen.shape([-13, 2, -10, -8, 0, -10, 10, -8, 13, 2, 6, 8, 0, 3, -6, 8], '#8cc66a');
      break;
    case 'snow_globe':
      pen.ellipse(0, 0, 12, 12, '#ffffff');
      pen.ellipse(-3, -3, 3, 3, '#eaf4fb', 0, null);
      break;
    default:
      pen.ellipse(0, 0, 10, 10, '#eee');
  }
}

