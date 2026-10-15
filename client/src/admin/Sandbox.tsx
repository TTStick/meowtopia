// The sandbox: the whole town as a pixel map, every cat and resident moving on it.
// Positions come from /api/admin/world every two seconds and glide in between.
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { getWorld, TILE, WW, WH, Ter, POIS, BUILDINGS } from '../../../shared/world';
import { adminApi, type WorldEnt, type WorldSnap } from './api';

const POLL = 2000;
const TER_COLOR: Record<number, string> = {
  [Ter.Grass]: '#cfe6ae', [Ter.Path]: '#ecdcc0', [Ter.Plaza]: '#efe4d2', [Ter.Water]: '#a9d6ec', [Ter.Sand]: '#f4e4bf',
  [Ter.Field]: '#e6e3a8', [Ter.Forest]: '#a9cf8c', [Ter.Wood]: '#dcb58a', [Ter.Hill]: '#d5ebb4', [Ter.Deep]: '#93c6e3',
};
const ACT: Record<string, string> = {
  walk: '在走路', run: '在跑', sit: '坐着', loaf: '揣着手', sleep: '睡觉', groom: '舔毛', stretch: '伸懒腰', play: '在玩',
  eat: '吃东西', roll: '打滚', look: '张望', sniff: '闻闻', stand: '站着', meow: '喵喵叫', fish: '钓鱼', read: '看书', work: '干活',
};
const MODE: Record<string, string> = { idle: '闲逛', walk: '赶路', meet: '和朋友碰面', talk: '聊天' };

interface Glide { from: [number, number]; to: [number, number]; t0: number }

function since(ms: number) {
  const m = Math.max(0, Math.round((Date.now() - ms) / 60000));
  return m < 60 ? `${m} 分钟` : `${Math.floor(m / 60)} 小时 ${m % 60} 分钟`;
}

/** The terrain, one pixel per tile, drawn once. */
function terrainImage() {
  const w = getWorld();
  const c = document.createElement('canvas');
  c.width = WW;
  c.height = WH;
  const x = c.getContext('2d')!;
  for (let y = 0; y < WH; y++)
    for (let X = 0; X < WW; X++) {
      x.fillStyle = TER_COLOR[w.ter[y * WW + X]] ?? '#cfe6ae';
      x.fillRect(X, y, 1, 1);
    }
  // a darker pixel here and there, so the grass and water read as pixel art
  for (let y = 0; y < WH; y++)
    for (let X = 0; X < WW; X++) {
      const t = w.ter[y * WW + X];
      if ((X * 7 + y * 13) % 11 === 0 && (t === Ter.Grass || t === Ter.Forest || t === Ter.Water || t === Ter.Deep)) {
        x.fillStyle = t === Ter.Water || t === Ter.Deep ? 'rgba(255,255,255,0.35)' : 'rgba(74,58,52,0.08)';
        x.fillRect(X, y, 1, 1);
      }
    }
  return { canvas: c, props: w.props };
}

export function Sandbox() {
  const ref = useRef<HTMLCanvasElement>(null);
  const [snap, setSnap] = useState<WorldSnap | null>(null);
  const [error, setError] = useState('');
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [labels, setLabels] = useState(true);
  const terrain = useMemo(terrainImage, []);
  // camera: tiles per screen pixel is 1/scale; (cx, cy) = centre in tiles
  const cam = useRef({ cx: WW / 2, cy: WH / 2, scale: 0 });
  const glide = useRef(new Map<string, Glide>());
  const follow = useRef<string | null>(null);
  const latest = useRef<WorldSnap | null>(null);
  const selRef = useRef<string | null>(null);
  selRef.current = sel;
  const hoverRef = useRef(hover);
  hoverRef.current = hover;
  const labelsRef = useRef(labels);
  labelsRef.current = labels;

  // poll the town
  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const s = await adminApi<WorldSnap>('GET', '/world');
        if (stop) return;
        const now = performance.now();
        const g = glide.current;
        const seen = new Set<string>();
        for (const e of s.ents) {
          seen.add(e.id);
          const prev = g.get(e.id);
          const at = prev ? pos(prev, now) : ([e.x, e.y] as [number, number]);
          g.set(e.id, { from: at, to: [e.x, e.y], t0: now });
        }
        for (const id of [...g.keys()]) if (!seen.has(id)) g.delete(id);
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

  // draw loop
  useEffect(() => {
    const c = ref.current!;
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const W = c.clientWidth, H = c.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) {
        c.width = Math.round(W * dpr);
        c.height = Math.round(H * dpr);
      }
      const k = cam.current;
      if (!k.scale) k.scale = Math.min(W / WW, H / WH);
      const followed = follow.current ? glide.current.get(follow.current) : undefined;
      if (followed) {
        const [fx, fy] = pos(followed, performance.now());
        k.cx += (fx / TILE - k.cx) * 0.12;
        k.cy += (fy / TILE - k.cy) * 0.12;
      }
      const x = c.getContext('2d')!;
      x.setTransform(dpr, 0, 0, dpr, 0, 0);
      x.fillStyle = '#93c6e3';
      x.fillRect(0, 0, W, H);
      const ox = W / 2 - k.cx * k.scale, oy = H / 2 - k.cy * k.scale;
      const sx = (tx: number) => ox + tx * k.scale, sy = (ty: number) => oy + ty * k.scale;
      x.imageSmoothingEnabled = false;
      x.drawImage(terrain.canvas, ox, oy, WW * k.scale, WH * k.scale);

      // houses and shops
      for (const p of terrain.props) {
        if (p.k !== 'house') continue;
        const bx = sx(p.x / TILE - 2.2), by = sy(p.y / TILE - 3.6);
        x.fillStyle = '#e9b48f';
        x.fillRect(bx, by, 4.4 * k.scale, 3.6 * k.scale);
        x.fillStyle = '#c9765a';
        x.fillRect(bx, by, 4.4 * k.scale, 1.3 * k.scale);
      }
      for (const b of BUILDINGS) {
        x.fillStyle = '#f3dfc8';
        x.fillRect(sx(b.x), sy(b.y), b.w * k.scale, b.h * k.scale);
        x.fillStyle = '#d9715f';
        x.fillRect(sx(b.x), sy(b.y), b.w * k.scale, Math.max(2, b.h * 0.35 * k.scale));
        x.strokeStyle = '#4a3a34';
        x.lineWidth = 1;
        x.strokeRect(Math.round(sx(b.x)) + 0.5, Math.round(sy(b.y)) + 0.5, Math.round(b.w * k.scale), Math.round(b.h * k.scale));
      }
      // place names
      x.textAlign = 'center';
      x.textBaseline = 'bottom';
      const fs = Math.max(10, Math.min(15, k.scale * 1.6));
      x.font = `600 ${fs}px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
      for (const p of POIS) {
        const px = sx(p.x), py = sy(p.y);
        if (px < -60 || py < -20 || px > W + 60 || py > H + 20) continue;
        x.fillStyle = 'rgba(74,58,52,0.35)';
        x.fillRect(px - 2, py - 2, 4, 4);
        if (k.scale > 5) {
          x.lineWidth = 3;
          x.strokeStyle = 'rgba(255,250,240,0.9)';
          x.strokeText(p.name, px, py - 4);
          x.fillStyle = '#7d6b61';
          x.fillText(p.name, px, py - 4);
        }
      }

      // everyone in town
      const now = performance.now();
      const s = latest.current;
      if (!s) return;
      const r = Math.max(3, Math.min(9, k.scale * 0.55));
      const order = [...s.ents].sort((a, b) => (a.kind === b.kind ? 0 : a.kind === 'npc' ? -1 : 1));
      for (const e of order) {
        const g = glide.current.get(e.id);
        if (!g) continue;
        const [ux, uy] = pos(g, now);
        const px = sx(ux / TILE), py = sy(uy / TILE);
        const picked = e.id === selRef.current;
        if (picked && e.dest) {
          x.setLineDash([4, 4]);
          x.strokeStyle = '#d9673a';
          x.lineWidth = 2;
          x.beginPath();
          x.moveTo(px, py);
          x.lineTo(sx(e.dest[0] / TILE), sy(e.dest[1] / TILE));
          x.stroke();
          x.setLineDash([]);
        }
        if (e.kind === 'npc') {
          x.fillStyle = '#8fc3e8';
          x.strokeStyle = '#2f5d7c';
          x.lineWidth = 1.5;
          x.beginPath();
          x.moveTo(px, py - r);
          x.lineTo(px + r, py);
          x.lineTo(px, py + r);
          x.lineTo(px - r, py);
          x.closePath();
          x.fill();
          x.stroke();
        } else {
          x.fillStyle = e.kind === 'town' ? '#d8c9b4' : e.controlled ? '#ffd45e' : e.trip?.goingHome ? '#f7c2a8' : '#f08a5d';
          x.strokeStyle = '#4a3a34';
          x.lineWidth = 2;
          x.fillRect(px - r, py - r, r * 2, r * 2);
          x.strokeRect(px - r, py - r, r * 2, r * 2);
        }
        if (picked) {
          x.strokeStyle = '#d9673a';
          x.lineWidth = 2;
          x.strokeRect(px - r - 4, py - r - 4, r * 2 + 8, r * 2 + 8);
        }
        const isHover = hoverRef.current?.id === e.id;
        if (picked || isHover || (labelsRef.current && k.scale > 6 && e.kind !== 'npc')) {
          const label = e.kind === 'npc' ? `${e.name}·${e.role}` : e.kind === 'cat' && e.owner ? `${e.name}（${e.owner}）` : e.name;
          x.font = `600 12px -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif`;
          const tw = x.measureText(label).width;
          x.fillStyle = 'rgba(35,29,63,0.85)';
          x.fillRect(px - tw / 2 - 5, py - r - 22, tw + 10, 17);
          x.fillStyle = '#fff6e4';
          x.textBaseline = 'middle';
          x.fillText(label, px, py - r - 13);
          x.textBaseline = 'bottom';
        }
      }
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [terrain]);

  // pan, zoom, pick
  useEffect(() => {
    const c = ref.current!;
    let drag: { x: number; y: number; cx: number; cy: number; moved: boolean } | null = null;
    const toTiles = (ev: { clientX: number; clientY: number }) => {
      const b = c.getBoundingClientRect();
      const k = cam.current;
      return [(ev.clientX - b.left - b.width / 2) / k.scale + k.cx, (ev.clientY - b.top - b.height / 2) / k.scale + k.cy];
    };
    const pick = (ev: { clientX: number; clientY: number }) => {
      const [tx, ty] = toTiles(ev);
      const k = cam.current;
      let best: WorldEnt | null = null, bd = Math.max(1.2, 12 / k.scale);
      for (const e of latest.current?.ents ?? []) {
        const g = glide.current.get(e.id);
        const [ux, uy] = g ? pos(g, performance.now()) : [e.x, e.y];
        const d = Math.hypot(ux / TILE - tx, uy / TILE - ty);
        if (d < bd) {
          bd = d;
          best = e;
        }
      }
      return best;
    };
    const down = (ev: PointerEvent) => {
      follow.current = null;
      drag = { x: ev.clientX, y: ev.clientY, cx: cam.current.cx, cy: cam.current.cy, moved: false };
      c.setPointerCapture(ev.pointerId);
    };
    const move = (ev: PointerEvent) => {
      if (drag) {
        const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y;
        if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
        cam.current.cx = drag.cx - dx / cam.current.scale;
        cam.current.cy = drag.cy - dy / cam.current.scale;
        return;
      }
      const e = pick(ev);
      setHover(e ? { id: e.id, x: ev.offsetX, y: ev.offsetY } : null);
      c.style.cursor = e ? 'pointer' : 'grab';
    };
    const up = (ev: PointerEvent) => {
      if (drag && !drag.moved) setSel(pick(ev)?.id ?? null);
      drag = null;
    };
    const wheel = (ev: WheelEvent) => {
      ev.preventDefault();
      const k = cam.current;
      const [tx, ty] = toTiles(ev);
      const next = Math.max(Math.min(c.clientWidth / WW, c.clientHeight / WH) * 0.8, Math.min(40, k.scale * Math.exp(-ev.deltaY * 0.0015)));
      // keep the point under the mouse where it is
      k.cx = tx - (tx - k.cx) * (k.scale / next);
      k.cy = ty - (ty - k.cy) * (k.scale / next);
      k.scale = next;
    };
    c.addEventListener('pointerdown', down);
    c.addEventListener('pointermove', move);
    c.addEventListener('pointerup', up);
    c.addEventListener('wheel', wheel, { passive: false });
    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      c.removeEventListener('pointerup', up);
      c.removeEventListener('wheel', wheel);
    };
  }, []);

  /** From the list: centre on it and keep following until the map is dragged. */
  const focus = (e: WorldEnt) => {
    setSel(e.id);
    follow.current = e.id;
    const k = cam.current;
    k.scale = Math.max(k.scale, 12);
  };
  const zoom = (f: number) => {
    const k = cam.current;
    k.scale = Math.max(4, Math.min(40, k.scale * f));
  };
  const fit = () => {
    follow.current = null;
    const c = ref.current!;
    cam.current = { cx: WW / 2, cy: WH / 2, scale: Math.min(c.clientWidth / WW, c.clientHeight / WH) };
  };

  const cats = snap?.ents.filter((e) => e.kind === 'cat') ?? [];
  const strays = snap?.ents.filter((e) => e.kind === 'town') ?? [];
  const npcs = snap?.ents.filter((e) => e.kind === 'npc') ?? [];
  const picked = snap?.ents.find((e) => e.id === sel) ?? null;

  return (
    <div class="sandbox">
      <div class="sb-bar">
        {snap ? (
          <>
            <span class="chip">小镇时间 {snap.clock.time} · {snap.clock.phase}</span>
            <span class="chip">{snap.clock.season} · {snap.clock.weather}</span>
            <span class="chip">在线玩家 {snap.players}</span>
            <span class="chip">路过的游客 {snap.guests}</span>
            <span class="chip">出门玩的猫 {cats.length}</span>
          </>
        ) : (
          <span class="chip">{error || '正在打开小镇…'}</span>
        )}
        <span class="sb-tools">
          <label class="check"><input type="checkbox" checked={labels} onChange={(e) => setLabels((e.target as HTMLInputElement).checked)} />显示猫名</label>
          <button class="btn small" onClick={() => zoom(1.4)}>放大</button>
          <button class="btn small" onClick={() => zoom(1 / 1.4)}>缩小</button>
          <button class="btn small" onClick={fit}>全图</button>
        </span>
      </div>
      <div class="sb-main">
        <div class="sb-map">
          <canvas ref={ref} />
          <div class="legend">
            <span><i class="lg-cat" />玩家的猫</span>
            <span><i class="lg-ctl" />被主人带着走</span>
            <span><i class="lg-home" />正在回家</span>
            <span><i class="lg-town" />小镇的猫</span>
            <span><i class="lg-npc" />居民</span>
          </div>
          {error && snap && <div class="sb-error">连接断了一下：{error}</div>}
        </div>
        <aside class="sb-side">
          {picked ? (
            <div class="card detail">
              <div class="detail-head">
                <b>{picked.name}</b>
                <button class="link" onClick={() => setSel(null)}>关闭</button>
              </div>
              {picked.kind === 'npc' ? (
                <p class="muted">小镇居民 · {picked.role}</p>
              ) : picked.kind === 'town' ? (
                <p class="muted">小镇自己的猫，没有主人</p>
              ) : (
                <p class="muted">主人：{picked.owner ?? '—'}</p>
              )}
              <dl>
                <dt>在哪</dt>
                <dd>{picked.place}</dd>
                <dt>在做什么</dt>
                <dd>{ACT[picked.anim] ?? picked.anim} · {MODE[picked.mode] ?? picked.mode}</dd>
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
              <p class="mono muted">{picked.id}{picked.ownerId ? ` · 主人 ${picked.ownerId}` : ''}</p>
            </div>
          ) : (
            <p class="muted hint">点地图上的方块或右边的名字，看看它在做什么。滚轮缩放，拖动平移。</p>
          )}
          <h4>玩家的猫（{cats.length}）</h4>
          {cats.length ? (
            <ul class="who">
              {cats.map((e) => (
                <li key={e.id} class={e.id === sel ? 'on' : ''} onClick={() => focus(e)}>
                  <i class={e.controlled ? 'lg-ctl' : e.trip?.goingHome ? 'lg-home' : 'lg-cat'} />
                  <span>{e.name}</span>
                  <small>{e.place}</small>
                </li>
              ))}
            </ul>
          ) : (
            <p class="muted">现在没有猫在外面玩。</p>
          )}
          {strays.length > 0 && (
            <>
              <h4>小镇的猫（{strays.length}）</h4>
              <ul class="who">
                {strays.map((e) => (
                  <li key={e.id} class={e.id === sel ? 'on' : ''} onClick={() => focus(e)}>
                    <i class="lg-town" />
                    <span>{e.name}</span>
                    <small>{e.place}</small>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h4>居民（{npcs.length}）</h4>
          <ul class="who">
            {npcs.map((e) => (
              <li key={e.id} class={e.id === sel ? 'on' : ''} onClick={() => focus(e)}>
                <i class="lg-npc" />
                <span>{e.name}</span>
                <small>{e.role} · {e.place}</small>
              </li>
            ))}
          </ul>
        </aside>
      </div>
    </div>
  );
}

function pos(g: Glide, now: number): [number, number] {
  const t = Math.min(1, (now - g.t0) / POLL);
  return [g.from[0] + (g.to[0] - g.from[0]) * t, g.from[1] + (g.to[1] - g.from[1]) * t];
}
