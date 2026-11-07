// The sandbox: the whole town as the game draws it, with every cat and resident moving about in it.
// The town is asked for every two seconds; in between everyone walks on (see figures.ts).
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Pen } from '../engine/pen';
import { roundRect } from '../art/fx';
import { adminApi, type WorldEnt, type WorldSnap } from './api';
import { TownMap, MAP_W, MAP_H, bounds, type View, type Sky, type Light } from './townmap';
import { Figure, POLL, TONE, toneOf, type Tone } from './figures';
import { daylight } from '../../../shared/time';

const ACT: Record<string, string> = {
  walk: '在走路', run: '在跑', sit: '坐着', sit_happy: '开心地坐着', loaf: '揣着手', sleep: '睡觉', nap: '打盹', groom: '舔毛', stretch: '伸懒腰',
  play: '在玩', eat: '吃东西', roll: '打滚', look: '张望', watch: '看风景', sniff: '闻闻', stand: '站着', meow: '喵喵叫', fish: '钓鱼', read: '看书',
  work: '干活', knit: '织毛线', music: '演奏', gaze: '望着天', patrol: '巡逻', pounce: '扑东西', beg: '讨吃的', think: '发呆',
  belly: '翻肚皮', bat: '拍爪爪', scratch: '磨爪子', yawn: '打哈欠', purr: '呼噜呼噜', window: '看窗外', dance: '跳舞',
};
const MODE: Record<string, string> = { idle: '闲逛', walk: '赶路', meet: '和朋友碰面', talk: '聊天' };
/** From this zoom in (css pixels per world unit) everyone is drawn as in the game; further out, on pins. */
const FIG_Z = 0.5;
const MAX_Z = 2.4;
const FONT = '-apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
const NOON: Sky = { hour: 12, season: 0, kind: 'clear', rain: 0, snow: 0, cloud: 0.1, wind: 0.5 };

interface Layers {
  names: boolean;
  trails: boolean;
  npcs: boolean;
  night: boolean;
  weather: boolean;
}
const LAYERS: [keyof Layers, string][] = [['names', '名字'], ['trails', '足迹'], ['npcs', '居民'], ['night', '夜色'], ['weather', '天气']];
const DEFAULT_LAYERS: Layers = { names: true, trails: true, npcs: true, night: true, weather: true };
function loadLayers(): Layers {
  try {
    return { ...DEFAULT_LAYERS, ...JSON.parse(localStorage.getItem('sandbox-layers') ?? '{}') };
  } catch {
    return DEFAULT_LAYERS;
  }
}

function since(ms: number) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时 ${m % 60} 分钟`;
}
const doing = (e: WorldEnt) => `${ACT[e.anim] ?? e.anim} · ${MODE[e.mode] ?? e.mode}`;

/** Draw order: residents under the town's cats under the players' cats. */
const RANK: Record<WorldEnt['kind'], number> = { npc: 0, town: 1, cat: 2 };

export function Sandbox() {
  const ref = useRef<HTMLCanvasElement>(null);
  const miniRef = useRef<HTMLCanvasElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const [snap, setSnap] = useState<WorldSnap | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [following, setFollowing] = useState<string | null>(null);
  const [layers, setLayers] = useState<Layers>(loadLayers);
  const [query, setQuery] = useState('');
  const [painting, setPainting] = useState(0);
  const map = useMemo(() => new TownMap(), []);
  const figs = useRef(new Map<string, Figure>());
  const latest = useRef<WorldSnap | null>(null);
  // camera now, and where it is easing to
  const cam = useRef({ cx: MAP_W / 2, cy: MAP_H / 2, z: 0 });
  const goal = useRef({ cx: MAP_W / 2, cy: MAP_H / 2, z: 0 });
  const live = useRef({ sel, following, layers, hover: null as string | null });
  live.current.sel = sel;
  live.current.following = following;
  live.current.layers = layers;

  const setLayer = (k: keyof Layers) => {
    const next = { ...layers, [k]: !layers[k] };
    setLayers(next);
    try {
      localStorage.setItem('sandbox-layers', JSON.stringify(next));
    } catch {
      /* private window: just for this visit */
    }
  };

  // ask the town every two seconds
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await adminApi<WorldSnap>('GET', '/world');
        if (stop) return;
        const now = performance.now();
        const seen = new Set<string>();
        for (const e of s.ents) {
          seen.add(e.id);
          const f = figs.current.get(e.id);
          if (f) f.update(e, now);
          else figs.current.set(e.id, new Figure(e, now));
        }
        for (const id of [...figs.current.keys()]) if (!seen.has(id)) figs.current.delete(id);
        // went home or indoors for good: nothing left to follow
        if (live.current.following && !seen.has(live.current.following)) setFollowing(null);
        latest.current = s;
        setSnap(s);
        setError('');
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    void tick();
    const t = setInterval(tick, POLL);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);

  // the picture, every frame
  useEffect(() => {
    const c = ref.current!;
    const mini = miniRef.current!;
    let raf = 0;
    let last = performance.now();
    let T = 0;
    let lastProgress = 0;
    const overviews = new Map<number, HTMLCanvasElement>();
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const now = performance.now();
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      T += dt;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = c.clientWidth, H = c.clientHeight;
      if (!W || !H) return;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      const fit = Math.min(W / MAP_W, H / MAP_H);
      const k = cam.current, g = goal.current;
      if (!k.z) {
        // first look: the whole town on a wide screen; on a tall narrow one, its middle filling the height
        const z = Math.max(fit, Math.min(H / MAP_H, (2.2 * W) / MAP_W));
        Object.assign(k, { cx: MAP_W * (z > fit * 1.3 ? 0.4 : 0.5), cy: MAP_H / 2, z });
        Object.assign(g, k);
      }
      const L = live.current;
      const followed = L.following ? figs.current.get(L.following) : undefined;
      if (followed) {
        g.cx = followed.x;
        g.cy = followed.y - 20;
      }
      g.z = Math.max(fit * 0.85, Math.min(MAX_Z, g.z));
      clampCenter(g, W, H);
      const ease = 1 - Math.exp(-dt * 11);
      k.z *= Math.pow(g.z / k.z, ease);
      k.cx += (g.cx - k.cx) * ease;
      k.cy += (g.cy - k.cy) * ease;
      for (const f of figs.current.values()) f.step(now, dt, T);

      const s = latest.current;
      const sky = debug.sky ?? s?.sky ?? NOON;
      const v: View = { cx: k.cx, cy: k.cy, z: k.z, w: W, h: H, dpr };
      const toScreen = (x: number, y: number): [number, number] => [W / 2 + (x - k.cx) * k.z, H / 2 + (y - k.cy) * k.z];
      const ctx = c.getContext('2d')!;
      const world = () => ctx.setTransform(dpr * k.z, 0, 0, dpr * k.z, (W / 2 - k.cx * k.z) * dpr, (H / 2 - k.cy * k.z) * dpr);
      const screen = () => ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      world();
      const progress = map.drawGround(ctx, v, sky, T);
      if (Math.abs(progress - lastProgress) > 0.04 || (progress === 1) !== (lastProgress === 1)) {
        lastProgress = progress;
        setPainting(progress < 1 ? progress : 0);
      }

      // who is shown, bottom of the screen last
      const [x0, y0, x1, y1] = bounds(v, 120);
      const shown = [...figs.current.values()].filter((f) => (L.layers.npcs || f.e.kind !== 'npc' || f.e.id === L.sel) && f.x > x0 && f.x < x1 && f.y > y0 && f.y < y1);
      const picked = L.sel ? figs.current.get(L.sel) : undefined;

      // footprints and where the picked one is heading, on the ground
      for (const f of shown) {
        const mine = f === picked;
        if (!mine && !(L.layers.trails && f.e.kind === 'cat')) continue;
        drawTrail(ctx, f, k.z, mine);
      }
      if (picked?.e.dest) drawRoute(ctx, picked, picked.e.dest, k.z, T);

      const close = k.z >= FIG_Z;
      if (close) {
        const pen = new Pen(ctx);
        // the picked one gets the game's own dashed ring at its feet
        if (picked && shown.includes(picked)) {
          ctx.strokeStyle = 'rgba(217,103,58,0.95)';
          ctx.lineWidth = 2.2;
          ctx.setLineDash([5, 4]);
          ctx.lineDashOffset = -T * 10;
          ctx.beginPath();
          ctx.ellipse(picked.x, picked.y + 2, 28, 9, 0, 0, 7);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        for (const f of [...shown].sort((a, b) => a.y - b.y)) f.draw(pen, T);
      }

      screen();
      if (L.layers.weather) map.drawWeather(ctx, v, sky, T);
      const night = L.layers.night ? 1 - daylight(sky.hour) : 0;
      if (L.layers.night) {
        const glow: Light[] = shown.map((f) => [f.x, f.y - 20, f === picked ? 90 : f.e.kind === 'cat' ? 60 : 34, f === picked || f.e.kind === 'cat' ? 0.75 : 0.35]);
        map.drawLight(ctx, v, sky, glow);
      }
      map.drawNames(ctx, v, toScreen, night);

      // pins, from far out
      const hits: Hit[] = [];
      if (!close) {
        const order = [...shown].sort((a, b) => RANK[a.e.kind] - RANK[b.e.kind] || a.y - b.y);
        if (picked && order.includes(picked)) order.push(...order.splice(order.indexOf(picked), 1));
        for (const f of order) {
          const [sx, sy] = toScreen(f.x, f.y);
          const r = (f.e.kind === 'npc' ? 10 : f.e.kind === 'town' ? 11 : 13) + (f === picked ? 3 : f.e.id === L.hover ? 2 : 0);
          drawPin(ctx, f, sx, sy, r, dpr, f === picked, T);
          hits.push({ f, x: sx, y: sy - 6 - r, r: r + 3 });
        }
      } else {
        for (const f of shown) {
          const [sx, sy] = toScreen(f.x, f.y);
          const h = f.height() * k.z;
          hits.push({ f, x: sx, y: sy - h / 2, r: Math.max(14, h / 2) });
        }
      }
      hitList = hits;
      // what is under the pointer: the map moves under a still mouse too
      const under = pointer && !pointer.down ? pickAt(pointer.x, pointer.y) : null;
      L.hover = under?.e.id ?? null;
      showTip(tipRef.current!, under, pointer?.x ?? 0, pointer?.y ?? 0, W);
      const cursor = pointer?.down ? 'grabbing' : under ? 'pointer' : 'grab';
      if (c.style.cursor !== cursor) c.style.cursor = cursor;

      // names: the picked and hovered first, then players' cats, the town's cats, residents
      const placed: [number, number, number, number][] = [];
      const tagged = [...shown].sort((a, b) => tagRank(b, L) - tagRank(a, L));
      for (const f of tagged) {
        const want = f === picked || f.e.id === L.hover || (L.layers.names && (f.e.kind === 'cat' || (f.e.kind === 'town' && k.z > 0.28) || k.z > 0.62));
        if (!want) continue;
        const [sx, sy] = toScreen(f.x, f.y);
        const ty = close ? sy - f.height() * k.z - 12 : sy + 12;
        drawTag(ctx, f, sx, ty, f === picked, placed);
      }

      drawMini(mini, map, overviews, sky, [...figs.current.values()], v, L.layers.night, L.sel);
    };
    let hitList: Hit[] = [];
    pickAt = (sx: number, sy: number) => {
      let best: Figure | null = null, bd = Infinity;
      for (const h of hitList) {
        const d = Math.hypot(sx - h.x, sy - h.y);
        if (d < h.r && d < bd + 4) {
          bd = d;
          best = h.f;
        }
      }
      return best;
    };
    frame();
    // for looking at it from the console while working on it
    if (import.meta.env.DEV) (window as unknown as { __sb: unknown }).__sb = { map, cam: cam.current, goal: goal.current, figs: figs.current, debug, select: setSel, follow: setFollowing };
    return () => cancelAnimationFrame(raf);
  }, [map]);

  // pan, zoom, pick; minimap; keys
  useEffect(() => {
    const c = ref.current!;
    const mini = miniRef.current!;
    const pointers = new Map<number, { x: number; y: number }>();
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    let pinch: { d: number; z: number } | null = null;
    const local = (ev: { clientX: number; clientY: number }) => {
      const b = c.getBoundingClientRect();
      return [ev.clientX - b.left, ev.clientY - b.top] as [number, number];
    };
    const toWorld = (sx: number, sy: number) => {
      const k = cam.current;
      return [(sx - c.clientWidth / 2) / k.z + k.cx, (sy - c.clientHeight / 2) / k.z + k.cy] as [number, number];
    };
    /** Zooms by f, keeping the world point under (sx, sy) where it is. */
    const zoomAt = (f: number, sx: number, sy: number) => {
      const g = goal.current;
      const fit = Math.min(c.clientWidth / MAP_W, c.clientHeight / MAP_H);
      const nz = Math.max(fit * 0.85, Math.min(MAX_Z, g.z * f));
      const [wx, wy] = toWorld(sx, sy);
      // from the camera as it is now, so a quick run of wheel ticks stays anchored
      g.cx = wx - (sx - c.clientWidth / 2) / nz;
      g.cy = wy - (sy - c.clientHeight / 2) / nz;
      g.z = nz;
      if (live.current.following) setFollowing(null);
    };
    const down = (ev: PointerEvent) => {
      c.setPointerCapture(ev.pointerId);
      const [sx, sy] = local(ev);
      pointers.set(ev.pointerId, { x: sx, y: sy });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: goal.current.z };
        drag = null;
        return;
      }
      drag = { x: sx, y: sy, cx: cam.current.cx, cy: cam.current.cy, moved: false };
      pointer = { x: sx, y: sy, down: true };
      Object.assign(goal.current, { cx: cam.current.cx, cy: cam.current.cy });
    };
    const move = (ev: PointerEvent) => {
      const [sx, sy] = local(ev);
      if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: sx, y: sy });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        const f = (pinch.z * (d / pinch.d)) / goal.current.z;
        zoomAt(f, (a.x + b.x) / 2, (a.y + b.y) / 2);
        return;
      }
      if (drag) {
        const dx = sx - drag.x, dy = sy - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) {
          drag.moved = true;
          if (live.current.following) setFollowing(null);
        }
        if (drag.moved) {
          const z = cam.current.z;
          // dragging moves the map at once, no easing
          cam.current.cx = goal.current.cx = drag.cx - dx / z;
          cam.current.cy = goal.current.cy = drag.cy - dy / z;
        }
        return;
      }
      pointer = { x: sx, y: sy, down: false };
    };
    const up = (ev: PointerEvent) => {
      pointers.delete(ev.pointerId);
      if (pointers.size < 2) pinch = null;
      if (drag && !drag.moved) {
        const [sx, sy] = local(ev);
        const f = pickAt(sx, sy);
        setSel(f?.e.id ?? null);
      }
      drag = null;
      const [sx, sy] = local(ev);
      pointer = ev.pointerType === 'mouse' ? { x: sx, y: sy, down: false } : null;
    };
    const leave = () => {
      pointer = null;
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const [sx, sy] = local(ev);
      // trackpads send many small deltas, mice a few big ones
      zoomAt(Math.exp(-Math.max(-120, Math.min(120, ev.deltaY)) * (ev.ctrlKey ? 0.01 : 0.0022)), sx, sy);
    };
    const dbl = (ev: MouseEvent) => {
      const [sx, sy] = local(ev);
      zoomAt(2, sx, sy);
    };
    // the minimap: press or drag to look there
    let miniDown = false;
    const miniGo = (ev: PointerEvent) => {
      const b = mini.getBoundingClientRect();
      const g = goal.current;
      g.cx = ((ev.clientX - b.left) / b.width) * MAP_W;
      g.cy = ((ev.clientY - b.top) / b.height) * MAP_H;
      if (live.current.following) setFollowing(null);
    };
    const mdown = (ev: PointerEvent) => {
      miniDown = true;
      mini.setPointerCapture(ev.pointerId);
      miniGo(ev);
    };
    const mmove = (ev: PointerEvent) => {
      if (miniDown) miniGo(ev);
    };
    const mup = () => {
      miniDown = false;
    };
    const key = (ev: KeyboardEvent) => {
      if ((ev.target as HTMLElement).closest('input, textarea, select')) return;
      const W = c.clientWidth, H = c.clientHeight;
      const g = goal.current;
      const step = 120 / g.z;
      if (ev.key === '+' || ev.key === '=') zoomAt(1.4, W / 2, H / 2);
      else if (ev.key === '-' || ev.key === '_') zoomAt(1 / 1.4, W / 2, H / 2);
      else if (ev.key === '0') fitAll();
      else if (ev.key === 'Escape') {
        setSel(null);
        setFollowing(null);
      } else if (ev.key === 'ArrowLeft') g.cx -= step;
      else if (ev.key === 'ArrowRight') g.cx += step;
      else if (ev.key === 'ArrowUp') g.cy -= step;
      else if (ev.key === 'ArrowDown') g.cy += step;
      else return;
      ev.preventDefault();
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('pointerleave', leave);
    c.addEventListener('wheel', wheel, { passive: false });
    c.addEventListener('dblclick', dbl);
    mini.addEventListener('pointerdown', mdown);
    mini.addEventListener('pointermove', mmove);
    mini.addEventListener('pointerup', mup);
    window.addEventListener('keydown', key);
    zoomBy = (f: number) => zoomAt(f, c.clientWidth / 2, c.clientHeight / 2);
    fitAll = () => {
      setFollowing(null);
      Object.assign(goal.current, { cx: MAP_W / 2, cy: MAP_H / 2, z: Math.min(c.clientWidth / MAP_W, c.clientHeight / MAP_H) });
    };
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('pointercancel', up);
      c.removeEventListener('pointerleave', leave);
      c.removeEventListener('wheel', wheel);
      c.removeEventListener('dblclick', dbl);
      mini.removeEventListener('pointerdown', mdown);
      mini.removeEventListener('pointermove', mmove);
      mini.removeEventListener('pointerup', mup);
      window.removeEventListener('keydown', key);
    };
  }, []);

  /** From the list: look at it, close in, and keep it in view until the map is moved. */
  const focus = (e: WorldEnt) => {
    setSel(e.id);
    setFollowing(e.id);
    goal.current.z = Math.max(goal.current.z, 0.9);
  };
  const follow = (id: string | null) => {
    setFollowing(id);
    if (id) goal.current.z = Math.max(goal.current.z, 0.9);
  };

  const ents = snap?.ents ?? [];
  const q = query.trim().toLowerCase();
  const match = (e: WorldEnt) => !q || [e.name, e.owner, e.role, e.place].some((s) => s && s.toLowerCase().includes(q));
  const cats = ents.filter((e) => e.kind === 'cat');
  const strays = ents.filter((e) => e.kind === 'town');
  const npcs = ents.filter((e) => e.kind === 'npc');
  const picked = ents.find((e) => e.id === sel) ?? null;
  const pickedFig = picked ? figs.current.get(picked.id) : undefined;
  const sky = snap?.sky;
  const isNight = sky ? daylight(sky.hour) < 0.5 : false;

  const row = (e: WorldEnt) => (
    <li key={e.id} class={e.id === sel ? 'on' : ''} onClick={() => focus(e)}>
      <Avatar fig={figs.current.get(e.id)} tone={toneOf(e)} />
      <span class="who-name">
        {e.name}
        {e.kind === 'cat' && e.owner && <em>{e.owner}</em>}
        {e.kind === 'npc' && e.role && <em>{e.role}</em>}
      </span>
      <small>
        {e.room ? `${e.room}里` : e.place} · {ACT[e.anim] ?? e.anim}
      </small>
    </li>
  );
  const group = (title: string, list: WorldEnt[], empty?: string) => {
    const shown = list.filter(match);
    if (!list.length && !empty) return null;
    return (
      <>
        <h4>
          {title}
          <span class="n">{list.length}</span>
        </h4>
        {shown.length ? <ul class="who">{shown.map(row)}</ul> : <p class="muted small">{list.length ? '没有对得上的' : empty}</p>}
      </>
    );
  };

  return (
    <div class="sandbox">
      <div class="sb-bar">
        {snap ? (
          <>
            <span class="chip">
              <i class={isNight ? 'moon' : 'sun'} />
              小镇 {snap.clock.time} · {snap.clock.phase}
            </span>
            <span class="chip">{snap.clock.season} · {snap.clock.weather}</span>
            <span class="chip">在线玩家 {snap.players} · 游客 {snap.guests}</span>
            <span class="chip">出门玩的猫 {cats.length}</span>
          </>
        ) : (
          <span class="chip">{error || '正在打开小镇…'}</span>
        )}
        <span class="sb-tools">
          {LAYERS.map(([k, name]) => (
            <button key={k} class={`chip-btn${layers[k] ? ' on' : ''}`} onClick={() => setLayer(k)} title={`显示${name}`}>
              {name}
            </button>
          ))}
        </span>
      </div>
      <div class="sb-main">
        <div class="sb-map">
          <canvas ref={ref} />
          <div class="sb-zoom">
            <button class="btn small" onClick={() => zoomBy(1.5)} title="放大（+）">＋</button>
            <button class="btn small" onClick={() => zoomBy(1 / 1.5)} title="缩小（-）">－</button>
            <button class="btn small" onClick={() => fitAll()} title="看整个小镇（0）">全图</button>
          </div>
          {following && (
            <div class="sb-follow">
              正跟着 <b>{ents.find((e) => e.id === following)?.name ?? '…'}</b>
              <button class="link" onClick={() => setFollowing(null)}>不跟了</button>
            </div>
          )}
          {painting > 0 && <div class="sb-paint">正在画小镇… {Math.round(painting * 100)}%</div>}
          <div class="legend">
            {(['cat', 'ctl', 'home', 'town', 'npc'] as Tone[]).map((t) => (
              <span key={t}>
                <i class="dot" style={{ background: TONE[t].fill, boxShadow: `0 0 0 2px ${TONE[t].ring}` }} />
                {TONE[t].name}
              </span>
            ))}
          </div>
          <canvas ref={miniRef} class="sb-mini" title="小地图：点一下去那里" />
          <div ref={tipRef} class="sb-tip" />
          {error && snap && <div class="sb-error">连接断了一下：{error}</div>}
        </div>
        <aside class="sb-side">
          {picked ? (
            <div class="card detail">
              <div class="detail-head">
                <CardPic fig={pickedFig} />
                <div>
                  <b>{picked.name}</b>
                  <p class="muted">
                    {picked.kind === 'npc' ? `小镇居民 · ${picked.role}` : picked.kind === 'town' ? '小镇自己的猫，没有主人' : `主人：${picked.owner ?? '—'}`}
                  </p>
                  <span class="tone" style={{ background: TONE[toneOf(picked)].fill, boxShadow: `0 0 0 2px ${TONE[toneOf(picked)].ring}` }}>
                    {TONE[toneOf(picked)].name}
                  </span>
                </div>
                <button class="link close" onClick={() => setSel(null)} title="关闭（Esc）">×</button>
              </div>
              <dl>
                <dt>在哪</dt>
                <dd>{picked.room ? `${picked.room}里` : picked.place}</dd>
                <dt>在做什么</dt>
                <dd>{doing(picked)}</dd>
                {picked.controlled && (
                  <>
                    <dt>状态</dt>
                    <dd>主人正带着它走</dd>
                  </>
                )}
                {picked.trip && (
                  <>
                    <dt>这次出门</dt>
                    <dd>
                      {since(picked.trip.since)}
                      {picked.trip.goingHome ? '，正在回家' : ''}
                      {picked.trip.userSent ? '（主人让它出来的）' : '（自己出来的）'}
                    </dd>
                    <dt>去过</dt>
                    <dd>{picked.trip.places} 个地方</dd>
                    <dt>捡到</dt>
                    <dd>{picked.trip.finds.length ? picked.trip.finds.join('、') : '还没有'}</dd>
                    <dt>遇见</dt>
                    <dd>{picked.trip.friends.length ? picked.trip.friends.join('、') : '还没有'}</dd>
                  </>
                )}
              </dl>
              <div class="row">
                {following === picked.id ? (
                  <button class="btn small" onClick={() => follow(null)}>不跟了</button>
                ) : (
                  <button class="btn small primary" onClick={() => follow(picked.id)}>跟着它</button>
                )}
              </div>
              <p class="mono muted">{picked.id}{picked.ownerId ? ` · 主人 ${picked.ownerId}` : ''}</p>
            </div>
          ) : (
            <p class="muted hint">点地图上的猫猫或下面的名字，看看它在做什么。滚轮或双指缩放，拖动平移，双击放大；键盘 + − 0 也行。</p>
          )}
          <input class="field sb-search" type="search" placeholder="找猫、主人、居民或地方…" value={query} onInput={(e) => setQuery((e.target as HTMLInputElement).value)} />
          {group('玩家的猫', cats, '现在没有猫在外面玩。')}
          {group('小镇的猫', strays)}
          {group('居民', npcs)}
        </aside>
      </div>
    </div>
  );
}

/** Dev only: a sky to draw instead of the town's own (night, rain, winter). */
const debug: { sky: Sky | null } = { sky: null };

/** Where the mouse is over the map, if it is. */
let pointer: { x: number; y: number; down: boolean } | null = null;
// set by the effects above, used by the buttons
let pickAt: (sx: number, sy: number) => Figure | null = () => null;
let zoomBy: (f: number) => void = () => {};
let fitAll: () => void = () => {};

interface Hit {
  f: Figure;
  x: number;
  y: number;
  r: number;
}

function tagRank(f: Figure, L: { sel: string | null; hover: string | null }) {
  return f.e.id === L.sel ? 9 : f.e.id === L.hover ? 8 : RANK[f.e.kind];
}

/** Keeps a little of the town in view however far it is dragged. */
function clampCenter(g: { cx: number; cy: number; z: number }, W: number, H: number) {
  const mx = Math.max(0, W / 2 / g.z - 200), my = Math.max(0, H / 2 / g.z - 200);
  g.cx = Math.max(-mx, Math.min(MAP_W + mx, g.cx));
  g.cy = Math.max(-my, Math.min(MAP_H + my, g.cy));
}

/** A portrait on a pin standing at (sx, sy), screen space. */
function drawPin(ctx: CanvasRenderingContext2D, f: Figure, sx: number, sy: number, r: number, dpr: number, picked: boolean, T: number) {
  const tone = TONE[toneOf(f.e)];
  const cy = sy - 6 - r;
  ctx.fillStyle = 'rgba(74,58,52,0.28)';
  ctx.beginPath();
  ctx.ellipse(sx, sy, r * 0.5, r * 0.2, 0, 0, 7);
  ctx.fill();
  ctx.fillStyle = tone.ring;
  ctx.beginPath();
  ctx.moveTo(sx - r * 0.38, cy + r * 0.8);
  ctx.lineTo(sx, sy - 0.5);
  ctx.lineTo(sx + r * 0.38, cy + r * 0.8);
  ctx.fill();
  if (picked) {
    const pr = r + 5 + Math.sin(T * 4) * 1.5;
    ctx.strokeStyle = 'rgba(217,103,58,0.9)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(sx, cy, pr, 0, 7);
    ctx.stroke();
  }
  const size = Math.round(r * 2 * dpr);
  ctx.drawImage(f.portrait(size), sx - r, cy - r, r * 2, r * 2);
}

/** Name pill centred on (sx, top); skipped where another already is. */
function drawTag(ctx: CanvasRenderingContext2D, f: Figure, sx: number, y: number, picked: boolean, placed: [number, number, number, number][]) {
  const name = f.e.name;
  const sub = f.e.kind === 'cat' && f.e.owner ? f.e.owner : f.e.kind === 'npc' && picked ? f.e.role ?? '' : '';
  ctx.font = `600 12px ${FONT}`;
  const nw = ctx.measureText(name).width;
  ctx.font = `11px ${FONT}`;
  const sw = sub ? ctx.measureText(sub).width + 6 : 0;
  const w = nw + sw + 14, h = 19;
  const x = sx - w / 2;
  if (!picked && placed.some(([ax, ay, aw, ah]) => x < ax + aw && x + w > ax && y < ay + ah && y + h > ay)) return;
  placed.push([x, y, w, h]);
  ctx.fillStyle = picked ? 'rgba(217,103,58,0.95)' : 'rgba(35,29,63,0.82)';
  roundRect(ctx, x, y, w, h, 9.5);
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fff6e4';
  ctx.font = `600 12px ${FONT}`;
  ctx.fillText(name, x + 7, y + h / 2 + 0.5);
  if (sub) {
    ctx.font = `11px ${FONT}`;
    ctx.fillStyle = picked ? 'rgba(255,246,228,0.85)' : 'rgba(255,246,228,0.62)';
    ctx.fillText(sub, x + 7 + nw + 6, y + h / 2 + 0.5);
  }
}

/** Little paw dots where it has been, fading out with age; world space. */
function drawTrail(ctx: CanvasRenderingContext2D, f: Figure, z: number, picked: boolean) {
  const pts = f.trail;
  if (!pts.length) return;
  const r = Math.max(3, 3.2 / z);
  ctx.fillStyle = picked ? '#d9673a' : TONE[toneOf(f.e)].ring;
  for (let i = 0; i < pts.length; i++) {
    ctx.globalAlpha = ((i + 1) / pts.length) * (picked ? 0.75 : 0.4);
    ctx.beginPath();
    ctx.arc(pts[i][0], pts[i][1], r, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

/** A dashed line to where it is going, with a ring there; world space. */
function drawRoute(ctx: CanvasRenderingContext2D, f: Figure, dest: [number, number], z: number, T: number) {
  const lw = Math.max(2, 2.2 / z);
  ctx.strokeStyle = 'rgba(217,103,58,0.9)';
  ctx.lineWidth = lw;
  ctx.setLineDash([lw * 3, lw * 2.5]);
  ctx.lineDashOffset = -T * lw * 8;
  ctx.beginPath();
  ctx.moveTo(f.x, f.y);
  ctx.lineTo(dest[0], dest[1]);
  ctx.stroke();
  ctx.setLineDash([]);
  const pr = Math.max(10, 11 / z) * (1 + Math.sin(T * 3) * 0.12);
  ctx.fillStyle = 'rgba(240,138,93,0.22)';
  ctx.beginPath();
  ctx.ellipse(dest[0], dest[1], pr * 1.4, pr * 0.6, 0, 0, 7);
  ctx.fill();
  ctx.stroke();
}

/** The whole town small, everyone as a dot and the view as a box; css size from the stylesheet. */
function drawMini(c: HTMLCanvasElement, map: TownMap, cache: Map<number, HTMLCanvasElement>, sky: Sky, figs: Figure[], v: View, nightOn: boolean, sel: string | null) {
  const W = c.clientWidth, H = c.clientHeight;
  if (!W || !H) return;
  const dpr = v.dpr;
  if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
    c.width = Math.round(W * dpr);
    c.height = Math.round(H * dpr);
  }
  const x = c.getContext('2d')!;
  x.setTransform(dpr, 0, 0, dpr, 0, 0);
  let ov = cache.get(sky.season);
  if (!ov) cache.set(sky.season, (ov = map.paintOverview(sky.season)));
  x.imageSmoothingEnabled = false;
  x.drawImage(ov, 0, 0, W, H);
  const night = nightOn ? 1 - daylight(sky.hour) : 0;
  if (night > 0.05) {
    x.fillStyle = `rgba(18,26,78,${0.45 * night})`;
    x.fillRect(0, 0, W, H);
  }
  const sx = W / MAP_W, sy = H / MAP_H;
  for (const f of [...figs].sort((a, b) => RANK[a.e.kind] - RANK[b.e.kind])) {
    const t = TONE[toneOf(f.e)];
    const r = f.e.id === sel ? 3.5 : f.e.kind === 'cat' ? 2.6 : 1.8;
    x.fillStyle = f.e.id === sel ? '#d9673a' : t.ring;
    x.beginPath();
    x.arc(f.x * sx, f.y * sy, r, 0, 7);
    x.fill();
  }
  const [x0, y0, x1, y1] = bounds(v, 0);
  x.strokeStyle = '#d9673a';
  x.lineWidth = 1.5;
  x.strokeRect(Math.max(0, x0 * sx) + 0.5, Math.max(0, y0 * sy) + 0.5, Math.min(W - 1, (x1 - Math.max(0, x0)) * sx), Math.min(H - 1, (y1 - Math.max(0, y0)) * sy));
}

/** The hover card beside the pointer, or none. */
function showTip(tip: HTMLDivElement, f: Figure | null, sx: number, sy: number, W: number) {
  if (!f) {
    if (tip.style.display !== 'none') tip.style.display = 'none';
    return;
  }
  const e = f.e;
  const who = e.kind === 'npc' ? e.role ?? '居民' : e.kind === 'town' ? '小镇的猫' : `${e.owner ?? '?'} 的猫`;
  const lines = [e.name, who, `${e.room ? `${e.room}里` : e.place} · ${ACT[e.anim] ?? e.anim}`];
  if (tip.dataset.text !== lines.join('|')) {
    tip.dataset.text = lines.join('|');
    tip.replaceChildren(...lines.map((t, i) => Object.assign(document.createElement(i ? 'span' : 'b'), { textContent: t })));
  }
  tip.style.display = 'grid';
  const left = sx + 16 + 180 > W ? sx - 16 - 180 : sx + 16;
  tip.style.left = `${left}px`;
  tip.style.top = `${sy + 12}px`;
}

/** A list portrait, as an image (kept per figure and look). */
const avatars = new Map<string, string>();
function Avatar({ fig, tone }: { fig: Figure | undefined; tone: Tone }) {
  if (!fig) return <i class="avatar" />;
  const k = `${fig.e.id}|${tone}|${(fig.e.outfit ?? []).join(',')}`;
  let url = avatars.get(k);
  if (!url) {
    url = fig.portrait(64, tone).toDataURL();
    avatars.set(k, url);
  }
  return <img class="avatar" src={url} alt="" />;
}

function CardPic({ fig }: { fig: Figure | undefined }) {
  if (!fig) return null;
  const k = `card|${fig.e.id}|${(fig.e.outfit ?? []).join(',')}`;
  let url = avatars.get(k);
  if (!url) {
    url = fig.card(84, 92).toDataURL();
    avatars.set(k, url);
  }
  return <img class="card-pic" src={url} alt="" />;
}
