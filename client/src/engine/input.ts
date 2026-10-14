// Unified pointer / touch / keyboard input for the game canvas.

export interface PointerInfo {
  x: number; // css px
  y: number;
  id: number;
}

export interface InputHandler {
  onTap?(p: PointerInfo): void;
  onDragStart?(p: PointerInfo): boolean | void; // return true to capture drag (else pans)
  onDrag?(p: PointerInfo, dx: number, dy: number): void;
  onDragEnd?(p: PointerInfo): void;
  onHover?(p: PointerInfo): void;
  onPinch?(scale: number, cx: number, cy: number): void;
  onWheel?(delta: number, x: number, y: number): void;
  onLongPress?(p: PointerInfo): void;
}

export class Input {
  handler: InputHandler | null = null;
  keys = new Set<string>();
  private pts = new Map<number, { x: number; y: number; sx: number; sy: number; t: number; moved: boolean }>();
  private dragging = false;
  private pinchDist = 0;
  private lpTimer: any = null;
  lastPointer: PointerInfo = { x: 0, y: 0, id: 0 };

  constructor(el: HTMLElement) {
    el.addEventListener('pointerdown', (e) => this.down(e));
    el.addEventListener('pointermove', (e) => this.move(e));
    el.addEventListener('pointerup', (e) => this.up(e));
    el.addEventListener('pointercancel', (e) => this.up(e, true));
    el.addEventListener('pointerleave', (e) => {
      if (e.pointerType === 'mouse' && !this.pts.size) this.handler?.onHover?.({ x: -999, y: -999, id: 0 });
    });
    el.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault();
        this.handler?.onWheel?.(e.deltaY, e.offsetX, e.offsetY);
      },
      { passive: false },
    );
    window.addEventListener('keydown', (e) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
      this.keys.add(e.key.toLowerCase());
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener('blur', () => this.keys.clear());
  }

  private info(e: PointerEvent): PointerInfo {
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top, id: e.pointerId };
  }

  private down(e: PointerEvent) {
    const p = this.info(e);
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    this.pts.set(e.pointerId, { x: p.x, y: p.y, sx: p.x, sy: p.y, t: performance.now(), moved: false });
    this.lastPointer = p;
    if (this.pts.size === 2) {
      const [a, b] = [...this.pts.values()];
      this.pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      this.dragging = false;
      clearTimeout(this.lpTimer);
    } else if (this.pts.size === 1) {
      clearTimeout(this.lpTimer);
      this.lpTimer = setTimeout(() => {
        const s = this.pts.get(e.pointerId);
        if (s && !s.moved) {
          s.moved = true; // suppress tap
          this.handler?.onLongPress?.(p);
        }
      }, 520);
    }
  }

  private move(e: PointerEvent) {
    const p = this.info(e);
    this.lastPointer = p;
    const s = this.pts.get(e.pointerId);
    if (!s) {
      this.handler?.onHover?.(p);
      return;
    }
    if (this.pts.size === 2) {
      s.x = p.x;
      s.y = p.y;
      const [a, b] = [...this.pts.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.pinchDist > 0) this.handler?.onPinch?.(d / this.pinchDist, (a.x + b.x) / 2, (a.y + b.y) / 2);
      this.pinchDist = d;
      return;
    }
    const dx = p.x - s.x, dy = p.y - s.y;
    if (!s.moved && Math.hypot(p.x - s.sx, p.y - s.sy) > 6) {
      s.moved = true;
      clearTimeout(this.lpTimer);
      this.dragging = true;
      this.handler?.onDragStart?.({ x: s.sx, y: s.sy, id: p.id });
    }
    if (this.dragging) this.handler?.onDrag?.(p, dx, dy);
    s.x = p.x;
    s.y = p.y;
  }

  private up(e: PointerEvent, cancel = false) {
    const p = this.info(e);
    const s = this.pts.get(e.pointerId);
    clearTimeout(this.lpTimer);
    this.pts.delete(e.pointerId);
    if (!s) return;
    if (this.dragging && this.pts.size === 0) {
      this.dragging = false;
      this.handler?.onDragEnd?.(p);
    } else if (!s.moved && !cancel && this.pts.size === 0 && performance.now() - s.t < 600) {
      this.handler?.onTap?.(p);
    }
    if (this.pts.size < 2) this.pinchDist = 0;
  }

  /** WASD / arrows vector */
  axis(): [number, number] {
    const k = this.keys;
    let x = 0, y = 0;
    if (k.has('a') || k.has('arrowleft')) x -= 1;
    if (k.has('d') || k.has('arrowright')) x += 1;
    if (k.has('w') || k.has('arrowup')) y -= 1;
    if (k.has('s') || k.has('arrowdown')) y += 1;
    return [x, y];
  }
}
