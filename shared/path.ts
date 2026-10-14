// Grid A* pathfinding with line-of-sight smoothing. Used by nest and world.

export interface Grid {
  w: number;
  h: number;
  blocked: Uint8Array; // 1 = blocked
}

export function makeGrid(w: number, h: number): Grid {
  return { w, h, blocked: new Uint8Array(w * h) };
}

export function isBlocked(g: Grid, x: number, y: number): boolean {
  if (x < 0 || y < 0 || x >= g.w || y >= g.h) return true;
  return g.blocked[y * g.w + x] === 1;
}

class Heap {
  private a: number[] = [];
  private f: Float64Array;
  constructor(size: number) {
    this.f = new Float64Array(size);
  }
  get size() {
    return this.a.length;
  }
  push(i: number, f: number) {
    this.f[i] = f;
    const a = this.a;
    a.push(i);
    let k = a.length - 1;
    while (k > 0) {
      const p = (k - 1) >> 1;
      if (this.f[a[p]] <= this.f[a[k]]) break;
      [a[p], a[k]] = [a[k], a[p]];
      k = p;
    }
  }
  pop(): number {
    const a = this.a;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let k = 0;
      for (;;) {
        const l = k * 2 + 1, r = l + 1;
        let m = k;
        if (l < a.length && this.f[a[l]] < this.f[a[m]]) m = l;
        if (r < a.length && this.f[a[r]] < this.f[a[m]]) m = r;
        if (m === k) break;
        [a[m], a[k]] = [a[k], a[m]];
        k = m;
      }
    }
    return top;
  }
}

/** Nearest unblocked cell to (x,y) by spiral search. */
export function nearestOpen(g: Grid, x: number, y: number, maxR = 12): [number, number] | null {
  if (!isBlocked(g, x, y)) return [x, y];
  for (let r = 1; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++)
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (!isBlocked(g, x + dx, y + dy)) return [x + dx, y + dy];
      }
  }
  return null;
}

/** Returns list of cells (inclusive of start and goal) or null. */
export function findPath(g: Grid, sx: number, sy: number, tx: number, ty: number, maxIter = 40000): [number, number][] | null {
  const W = g.w, H = g.h;
  if (sx < 0 || sy < 0 || sx >= W || sy >= H) return null;
  const goalOpen = !isBlocked(g, tx, ty);
  if (!goalOpen) {
    const n = nearestOpen(g, tx, ty);
    if (!n) return null;
    [tx, ty] = n;
  }
  if (isBlocked(g, sx, sy)) {
    const n = nearestOpen(g, sx, sy);
    if (!n) return null;
    [sx, sy] = n;
  }
  const N = W * H;
  const gScore = new Float64Array(N).fill(Infinity);
  const came = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const heap = new Heap(N);
  const s = sy * W + sx, goal = ty * W + tx;
  gScore[s] = 0;
  const h = (i: number) => {
    const x = i % W, y = (i / W) | 0;
    const dx = Math.abs(x - tx), dy = Math.abs(y - ty);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };
  heap.push(s, h(s));
  let iter = 0;
  while (heap.size && iter++ < maxIter) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % W, cy = (cur / W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const ni = ny * W + nx;
        if (g.blocked[ni] || closed[ni]) continue;
        if (dx && dy && (g.blocked[cy * W + nx] || g.blocked[ny * W + cx])) continue; // no corner cutting
        const ng = gScore[cur] + (dx && dy ? Math.SQRT2 : 1);
        if (ng < gScore[ni]) {
          gScore[ni] = ng;
          came[ni] = cur;
          heap.push(ni, ng + h(ni));
        }
      }
  }
  if (came[goal] === -1 && goal !== s) return null;
  const out: [number, number][] = [];
  let c = goal;
  while (c !== -1) {
    out.push([c % W, (c / W) | 0]);
    if (c === s) break;
    c = came[c];
  }
  return out.reverse();
}

/** Bresenham-style line of sight over grid cells (supercover). */
export function lineOfSight(g: Grid, x0: number, y0: number, x1: number, y1: number): boolean {
  let dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  let x = x0, y = y0;
  const sx = x1 > x0 ? 1 : -1, sy = y1 > y0 ? 1 : -1;
  let err = dx - dy;
  dx *= 2;
  dy *= 2;
  for (let i = 0; i < 2000; i++) {
    if (isBlocked(g, x, y)) return false;
    if (x === x1 && y === y1) return true;
    if (err > 0) {
      x += sx;
      err -= dy;
    } else if (err < 0) {
      y += sy;
      err += dx;
    } else {
      // passing exactly through a corner: check both neighbours
      if (isBlocked(g, x + sx, y) || isBlocked(g, x, y + sy)) return false;
      x += sx;
      y += sy;
      err += dx - dy;
    }
  }
  return true;
}

export function smoothPath(g: Grid, path: [number, number][]): [number, number][] {
  if (path.length <= 2) return path;
  const out: [number, number][] = [path[0]];
  let anchor = 0;
  for (let i = 2; i < path.length; i++) {
    if (!lineOfSight(g, path[anchor][0], path[anchor][1], path[i][0], path[i][1])) {
      out.push(path[i - 1]);
      anchor = i - 1;
    }
  }
  out.push(path[path.length - 1]);
  return out;
}
