import { Pen } from './pen';

export class Viewport {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  pen: Pen;
  dpr = 1;
  w = 0;
  h = 0;
  camX = 0;
  camY = 0;
  zoom = 1;
  /** Screen-space insets (CSS px) covered by UI. */
  insetTop = 64;
  insetBottom = 92;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.pen = new Pen(this.ctx);
    this.resize();
  }

  resize() {
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, r.width);
    this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }

  /** Center of the unobstructed area in screen px. */
  get midY() {
    return this.insetTop + (this.h - this.insetTop - this.insetBottom) / 2;
  }

  world() {
    const z = this.zoom * this.dpr;
    this.ctx.setTransform(z, 0, 0, z, this.dpr * (this.w / 2 - this.camX * this.zoom), this.dpr * (this.midY - this.camY * this.zoom));
  }

  screen() {
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  }

  toWorld(sx: number, sy: number): [number, number] {
    return [(sx - this.w / 2) / this.zoom + this.camX, (sy - this.midY) / this.zoom + this.camY];
  }

  toScreen(wx: number, wy: number): [number, number] {
    return [(wx - this.camX) * this.zoom + this.w / 2, (wy - this.camY) * this.zoom + this.midY];
  }

  /** visible world rect */
  bounds(margin = 0): [number, number, number, number] {
    const [x0, y0] = this.toWorld(-margin, -margin);
    const [x1, y1] = this.toWorld(this.w + margin, this.h + margin);
    return [x0, y0, x1, y1];
  }
}
