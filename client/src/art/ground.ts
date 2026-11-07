// The ground of the town: grass, paths, water, sand, bridges. Painted a chunk at a time and
// kept as a picture by the town scene, and by the admin panel's sandbox.
import { Pen, mix } from '../engine/pen';
import { TILE, Ter } from '../../../shared/world';
import { hashf, noise2 } from '../../../shared/rng';

/** Ground colours by season (spring, summer, autumn, winter). */
export const GROUND = {
  grass: ['#cfe6ae', '#cfe6ae', '#d9e6b2', '#e4ebde'],
  forest: ['#b9d99a', '#b2d394', '#cdd59a', '#d6e0d2'],
  hill: ['#d5ebb4', '#d2e8ae', '#e2e2ac', '#eef1ea'],
  field: ['#dde8b0', '#e6e3a8', '#eadbb0', '#ecebe4'],
  bamboo: ['#b4d79c', '#a9d293', '#c6d59c', '#d8e2d2'],
  orchard: ['#d6ebb0', '#cbe6a6', '#dfe2a6', '#e8ede2'],
};

/** Paints chunk (cx, cy) of `chunk` tiles into ctx, in world units; terAt answers outside the map too. */
export function paintGround(ctx: CanvasRenderingContext2D, terAt: (tx: number, ty: number) => number, cx: number, cy: number, chunk: number, season: number) {
  const pen = new Pen(ctx).begin(cx * 31 + cy * 7, 0.5, 1.6);
  const tx0 = cx * chunk - 1, ty0 = cy * chunk - 1, tx1 = tx0 + chunk + 2, ty1 = ty0 + chunk + 2;
  const grass = GROUND.grass[season];
  const forest = GROUND.forest[season];
  const hill = GROUND.hill[season];
  const field = GROUND.field[season];
  const bamboo = GROUND.bamboo[season];
  const orchard = GROUND.orchard[season];
  // base
  for (let ty = ty0; ty < ty1; ty++)
    for (let tx = tx0; tx < tx1; tx++) {
      const t = terAt(tx, ty);
      const n = noise2(tx * 0.18, ty * 0.18, 5) - 0.5;
      const base = t === Ter.Forest ? forest : t === Ter.Hill ? hill : t === Ter.Field ? field : t === Ter.Bamboo ? bamboo : t === Ter.Orchard ? orchard : grass;
      ctx.fillStyle = mix(base, n > 0 ? '#ffffff' : '#7a9a5a', Math.abs(n) * 0.18);
      ctx.fillRect(tx * TILE - 0.5, ty * TILE - 0.5, TILE + 1, TILE + 1);
    }
  const layer = (types: number[], fill: string, outline: boolean, r = 0.72) => {
    const tiles: [number, number, number][] = [];
    for (let ty = ty0; ty < ty1; ty++)
      for (let tx = tx0; tx < tx1; tx++) if (types.includes(terAt(tx, ty))) tiles.push([tx, ty, (r + (hashf(tx, ty, 41) - 0.5) * 0.12) * TILE]);
    if (!tiles.length) return;
    if (outline) {
      ctx.fillStyle = '#4a3a34';
      ctx.beginPath();
      for (const [tx, ty, rr] of tiles) {
        ctx.moveTo((tx + 0.5) * TILE + rr + 1.8, (ty + 0.5) * TILE);
        ctx.arc((tx + 0.5) * TILE, (ty + 0.5) * TILE, rr + 1.8, 0, Math.PI * 2);
      }
      ctx.fill();
    }
    ctx.fillStyle = fill;
    ctx.beginPath();
    for (const [tx, ty, rr] of tiles) {
      ctx.moveTo((tx + 0.5) * TILE + rr, (ty + 0.5) * TILE);
      ctx.arc((tx + 0.5) * TILE, (ty + 0.5) * TILE, rr, 0, Math.PI * 2);
    }
    ctx.fill();
  };
  // grass tufts before overlays
  ctx.strokeStyle = 'rgba(90,120,60,0.45)';
  ctx.lineWidth = 1.2;
  ctx.lineCap = 'round';
  for (let ty = ty0; ty < ty1; ty++)
    for (let tx = tx0; tx < tx1; tx++) {
      const t = terAt(tx, ty);
      if (t !== Ter.Grass && t !== Ter.Forest && t !== Ter.Hill && t !== Ter.Bamboo && t !== Ter.Orchard) continue;
      for (let k = 0; k < 2; k++) {
        if (hashf(tx, ty, 50 + k) > 0.45) continue;
        const x = (tx + hashf(tx, ty, 60 + k)) * TILE, y = (ty + hashf(tx, ty, 70 + k)) * TILE;
        ctx.beginPath();
        ctx.moveTo(x - 3, y - 4);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 1, y - 5);
        ctx.moveTo(x, y);
        ctx.lineTo(x + 4, y - 3);
        ctx.stroke();
      }
      if (season < 3 && hashf(tx, ty, 80) < 0.06) {
        ctx.fillStyle = ['#ffffff', '#ffe08a', '#f8c6d4'][Math.floor(hashf(tx, ty, 81) * 3)];
        ctx.beginPath();
        ctx.arc((tx + hashf(tx, ty, 82)) * TILE, (ty + hashf(tx, ty, 83)) * TILE, 1.8, 0, 7);
        ctx.fill();
      }
    }
  layer([Ter.Sand], '#f4e4bf', true);
  layer([Ter.Path, Ter.Plaza], '#ecdcc0', true, 0.7);
  layer([Ter.Plaza], '#efe4d2', false, 0.74);
  // path pebbles & plaza tiles
  for (let ty = ty0; ty < ty1; ty++)
    for (let tx = tx0; tx < tx1; tx++) {
      const t = terAt(tx, ty);
      if (t === Ter.Path && hashf(tx, ty, 90) < 0.5) {
        pen.ellipse((tx + 0.2 + hashf(tx, ty, 91) * 0.6) * TILE, (ty + 0.2 + hashf(tx, ty, 92) * 0.6) * TILE, 3 + hashf(tx, ty, 93) * 2, 2.2, null, 1, 'rgba(150,120,90,0.45)');
      } else if (t === Ter.Plaza) {
        ctx.strokeStyle = 'rgba(160,130,100,0.28)';
        ctx.lineWidth = 1;
        ctx.strokeRect(tx * TILE + 2, ty * TILE + 2, TILE / 2 - 2, TILE / 2 - 2);
        ctx.strokeRect(tx * TILE + TILE / 2 + 1, ty * TILE + TILE / 2 + 1, TILE / 2 - 3, TILE / 2 - 3);
      } else if (t === Ter.Sand && hashf(tx, ty, 94) < 0.5) {
        ctx.fillStyle = 'rgba(190,150,100,0.4)';
        ctx.fillRect((tx + hashf(tx, ty, 95)) * TILE, (ty + hashf(tx, ty, 96)) * TILE, 1.6, 1.6);
      }
    }
  layer([Ter.Water, Ter.Deep, Ter.Wood, Ter.Stone], '#a9d6ec', true, 0.74);
  layer([Ter.Deep], '#93c6e3', false, 0.7);
  // stepping stones
  for (let ty = ty0; ty < ty1; ty++)
    for (let tx = tx0; tx < tx1; tx++) {
      if (terAt(tx, ty) !== Ter.Stone) continue;
      const sx = (tx + 0.5 + (hashf(tx, ty, 110) - 0.5) * 0.25) * TILE, sy = (ty + 0.5) * TILE;
      pen.ellipse(sx, sy + 2, 12, 7, 'rgba(74,58,52,0.18)', 0, null);
      pen.ellipse(sx, sy, 12, 8, ['#d6d0c6', '#c9c6c0'][(tx + ty) % 2], 1.4);
      pen.line([sx - 6, sy - 2, sx - 1, sy - 4], 1, 'rgba(255,255,255,0.7)');
    }
  // shore highlights
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = 1.4;
  for (let ty = ty0; ty < ty1; ty++)
    for (let tx = tx0; tx < tx1; tx++) {
      const t = terAt(tx, ty);
      if (t !== Ter.Water) continue;
      if (hashf(tx, ty, 100) < 0.3) {
        const x = (tx + 0.3) * TILE, y = (ty + 0.5) * TILE;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 5, y - 3, x + 10, y);
        ctx.stroke();
      }
    }
  // bridges and pier (wood planks)
  for (let ty = ty0; ty < ty1; ty++)
    for (let tx = tx0; tx < tx1; tx++) {
      if (terAt(tx, ty) !== Ter.Wood) continue;
      const x = tx * TILE, y = ty * TILE;
      ctx.fillStyle = '#dcb58a';
      ctx.fillRect(x, y, TILE, TILE);
      ctx.strokeStyle = 'rgba(120,80,50,0.5)';
      ctx.lineWidth = 1.2;
      const vertical = terAt(tx, ty - 1) === Ter.Wood && terAt(tx, ty + 1) === Ter.Wood && !(terAt(tx - 1, ty) === Ter.Wood && terAt(tx + 1, ty) === Ter.Wood);
      for (let i = 0; i < 4; i++) {
        ctx.beginPath();
        if (vertical) {
          ctx.moveTo(x, y + i * 8);
          ctx.lineTo(x + TILE, y + i * 8);
        } else {
          ctx.moveTo(x + i * 8, y);
          ctx.lineTo(x + i * 8, y + TILE);
        }
        ctx.stroke();
      }
      // railings on edges facing water
      ctx.strokeStyle = '#4a3a34';
      ctx.lineWidth = 1.8;
      for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
        const n = terAt(tx + dx, ty + dy);
        if (n !== Ter.Water && n !== Ter.Deep) continue;
        ctx.beginPath();
        if (dy === -1) {
          ctx.moveTo(x, y + 1);
          ctx.lineTo(x + TILE, y + 1);
        } else if (dy === 1) {
          ctx.moveTo(x, y + TILE - 1);
          ctx.lineTo(x + TILE, y + TILE - 1);
        } else if (dx === -1) {
          ctx.moveTo(x + 1, y);
          ctx.lineTo(x + 1, y + TILE);
        } else {
          ctx.moveTo(x + TILE - 1, y);
          ctx.lineTo(x + TILE - 1, y + TILE);
        }
        ctx.stroke();
      }
    }
}
