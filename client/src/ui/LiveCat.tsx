import { useEffect, useRef } from 'preact/hooks';
import { Pen } from '../engine/pen';
import { CatActor, type AnimName } from '../game/actor';
import type { CatGenes } from '../../../shared/types';

interface Props {
  genes: CatGenes;
  anim?: AnimName;
  outfit?: string[];
  age?: number;
  height?: number;
  scale?: number;
  cycle?: AnimName[]; // cycle through animations
  class?: string;
}

/** A small live-animated cat rendered on its own canvas. */
export function LiveCat(p: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef(p);
  state.current = p;
  useEffect(() => {
    const c = ref.current!;
    const ctx = c.getContext('2d')!;
    const pen = new Pen(ctx);
    const actor = new CatActor('ui', 'ui', p.genes);
    let raf = 0;
    let last = performance.now();
    let T = Math.random() * 10;
    let cycleI = 0;
    let cycleT = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      T += dt;
      const s = state.current;
      actor.genes = s.genes;
      actor.outfit = s.outfit ?? [];
      actor.age = s.age ?? 1;
      if (s.cycle?.length) {
        cycleT += dt;
        if (cycleT > 4) {
          cycleT = 0;
          cycleI = (cycleI + 1) % s.cycle.length;
        }
        actor.play(s.cycle[cycleI]);
      } else actor.play(s.anim ?? 'sit');
      actor.update(dt, T);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth, h = c.clientHeight;
      if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      const sc = s.scale ?? h / 62;
      ctx.translate(w / 2, h * 0.9);
      ctx.scale(sc, sc);
      actor.x = 0;
      actor.y = 0;
      pen.begin(Math.floor(T * 7) % 3, 0.45, 1.6);
      actor.draw(pen);
      actor.drawEmotes(pen, T);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    (c as any).__actor = actor;
    return () => cancelAnimationFrame(raf);
  }, []);
  return <canvas ref={ref} class={p.class} style={{ width: '100%', height: `${p.height ?? 140}px`, display: 'block' }} onClick={(e) => (e.currentTarget as any).__actor?.emote('heart')} />;
}
