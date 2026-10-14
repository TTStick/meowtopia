import type { ComponentChildren } from 'preact';
import { ui } from '../game/state';
import * as I from './icons';

export function Sheet(p: { title: string; onClose?: () => void; children: ComponentChildren; tabs?: ComponentChildren; right?: ComponentChildren }) {
  const close = p.onClose ?? (() => ui.set({ panel: null }));
  return (
    <div class="scrim" onClick={(e) => e.target === e.currentTarget && close()}>
      <div class="sheet" role="dialog" aria-label={p.title}>
        <div class="sheet-h">
          <h2>{p.title}</h2>
          {p.right}
          <button class="iconbtn" aria-label="关闭" onClick={close}>
            <I.IClose />
          </button>
        </div>
        {p.tabs}
        <div class="sheet-b">{p.children}</div>
      </div>
    </div>
  );
}

export function Tabs<T extends string>(p: { value: T; set: (v: T) => void; items: [T, string][] }) {
  return (
    <div class="tabs">
      {p.items.map(([k, n]) => (
        <button key={k} class={p.value === k ? 'on' : ''} onClick={() => p.set(k)}>
          {n}
        </button>
      ))}
    </div>
  );
}

export function when(ts: number) {
  const d = new Date(ts);
  const now = new Date();
  const hm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
  if (d.toDateString() === now.toDateString()) return `今天 ${hm}`;
  const y = new Date(now.getTime() - 86400000);
  if (d.toDateString() === y.toDateString()) return `昨天 ${hm}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}
