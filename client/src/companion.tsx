// The little panel that opens from the cat in the Mac menu bar: your cat, live,
// with a few things to do together. The full game opens in its own window.
// Talks to the native shell through window.webkit.messageHandlers.catnest.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { api, ApiError } from './game/net';
import { LiveCat } from './ui/LiveCat';
import type { AnimName } from './game/actor';
import type { CatGenes, CatStats } from '../../shared/types';
import './style.css';
import './companion.css';

interface Home {
  user: { nickname: string; fish: number };
  cat: null | { id: string; name: string; out: boolean; sleepy: boolean; stats: CatStats; mood: string; age: number; look: string };
  line?: string;
  wish?: { wish: { text: string; need: number }; progress: number; done: boolean };
  foods?: { id: string; name: string; count: number }[];
  letters?: { id: number; ts: number; title: string; text: string; seen: boolean }[];
  unread?: number;
  night?: boolean;
}

// ---------- native bridge ----------
type Msg = { type: string; [k: string]: unknown };
const bridge = (window as { webkit?: { messageHandlers?: { catnest?: { postMessage(m: Msg): void } } } }).webkit?.messageHandlers?.catnest;
const post = (m: Msg) => bridge?.postMessage(m);

let genes: CatGenes | null = null;
let outfit: string[] = [];

async function fetchHome(): Promise<Home | null> {
  try {
    const h = await api<Home>('GET', '/api/companion');
    if (h.cat && (!genes || (window as { __look?: string }).__look !== h.cat.look)) {
      // the full record has the genes and outfit for drawing
      const me = await api<{ cats: { id: string; genes: CatGenes; outfit: string[] }[] }>('GET', '/api/me');
      const c = me.cats.find((x) => x.id === h.cat!.id);
      if (c) {
        genes = c.genes;
        outfit = c.outfit;
        (window as { __look?: string }).__look = h.cat.look;
      }
    }
    post({ type: 'state', loggedIn: true, catId: h.cat?.id ?? null, name: h.cat?.name ?? '', out: !!h.cat?.out, sleepy: !!h.cat?.sleepy, look: h.cat?.look ?? '', unread: h.unread ?? 0 });
    return h;
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) {
      post({ type: 'state', loggedIn: false });
      return null;
    }
    throw e;
  }
}

// ---------- UI ----------
function Bar(p: { label: string; value: number; color: string }) {
  return (
    <div class="c-bar">
      <span>{p.label}</span>
      <div class="c-track">
        <div style={{ width: `${Math.max(4, Math.min(100, p.value))}%`, background: p.color }} />
      </div>
    </div>
  );
}

function Companion() {
  const [home, setHome] = useState<Home | null | undefined>(undefined);
  const [say, setSay] = useState<string | null>(null);
  const [anim, setAnim] = useState<AnimName | null>(null);
  const [feeding, setFeeding] = useState(false);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [loginItem, setLoginItem] = useState<boolean | null>(null);

  const load = async () => {
    try {
      const h = await fetchHome();
      setHome(h);
      if (h?.line) setSay((s) => s ?? h.line!);
    } catch {
      setHome((x) => x ?? null);
    }
  };

  useEffect(() => {
    void load();
    const native = {
      onShow: () => {
        setSay(null);
        void load();
      },
      setLoginItem: (on: boolean) => setLoginItem(on),
    };
    (window as { catnestNative?: typeof native }).catnestNative = native;
    post({ type: 'ready' });
  }, []);

  const react = (a: AnimName, ms = 2600) => {
    setAnim(a);
    setTimeout(() => setAnim(null), ms);
  };

  const act = async (kind: string, extra: Record<string, unknown> = {}) => {
    const c = home?.cat;
    if (!c || busy) return;
    setBusy(true);
    try {
      const r = await api<{ stats: CatStats }>('POST', `/api/cat/${c.id}/act`, { kind, ...extra });
      setHome((h) => (h?.cat ? { ...h, cat: { ...h.cat, stats: r.stats } } : h));
      const line = await api<{ text: string }>('GET', `/api/cat/${c.id}/line?ctx=${kind === 'goodnight' ? 'goodnight' : kind}`).catch(() => null);
      if (line) setSay(line.text);
      if (kind === 'pet') {
        react('purr');
        post({ type: 'mood', mood: 'happy' });
      }
      if (kind === 'play') react('pounce', 2000);
      if (kind === 'feed') react('eat', 3500);
      if (kind === 'goodnight') react('sleep', 4000);
    } catch (e) {
      setSay((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const outing = async (go: boolean) => {
    const c = home?.cat;
    if (!c) return;
    try {
      await api('POST', `/api/cat/${c.id}/outing`, { go });
      setSay(go ? '我出门转转，晚点回来讲给你听～' : '听到你叫我了，马上回来！');
      setTimeout(load, 800);
    } catch (e) {
      setSay((e as Error).message);
    }
  };

  const talk = async () => {
    const c = home?.cat;
    const t = text.trim();
    if (!c || !t) return;
    setText('');
    setSay('…');
    try {
      const r = await api<{ action: string; reply: string }>('POST', `/api/cat/${c.id}/command`, { text: t, where: c.out ? 'world' : 'nest' });
      setSay(r.reply);
      if (!c.out && (r.action === 'explore' || r.action === 'goto')) void outing(true);
      else if (c.out && r.action === 'home') void outing(false);
      else if (r.action === 'sleep') react('sleep', 4000);
      else if (r.action === 'meow') react('meow');
      else if (r.action === 'groom') react('groom');
      else if (r.action === 'roll') react('belly');
      else if (r.action === 'stretch') react('stretch');
      else if (r.action === 'eat') react('eat');
    } catch (e) {
      setSay((e as Error).message);
    }
  };

  if (home === undefined) return <div class="c-empty">猫猫正在伸懒腰…</div>;
  if (home === null || !home.cat)
    return (
      <div class="c-empty">
        <p>{home === null ? '还没有登录猫窝' : '还没有领养猫猫'}</p>
        <button class="btn primary" onClick={() => post({ type: 'openGame' })}>
          打开猫窝
        </button>
      </div>
    );

  const c = home.cat;
  const cycle: AnimName[] = c.sleepy ? ['sleep', 'nap'] : ['sit', 'groom', 'loaf', 'slowblink', 'sit_happy', 'knead'];
  const w = home.wish;
  return (
    <div class="c-wrap">
      <header class="c-head">
        <div>
          <div class="c-name">{c.name}</div>
          <div class="c-mood">{c.out ? '在外面探险' : c.mood}</div>
        </div>
        <div class="c-fish">🐟 {home.user.fish}</div>
      </header>

      <div class="c-stage">
        {say && <div class="c-say">{say}</div>}
        {c.out ? (
          <div class="c-away">
            <div class="c-cushion" />
            <p>{c.name}出门探险去了</p>
          </div>
        ) : (
          genes && (
            <div class="c-cat" onClick={() => act('pet')} title="摸摸它">
              <LiveCat genes={genes} outfit={outfit} age={c.age} height={146} anim={anim ?? undefined} cycle={anim ? undefined : cycle} />
            </div>
          )
        )}
      </div>

      <div class="c-bars">
        <Bar label="饱腹" value={c.stats.hunger} color="#f2b16b" />
        <Bar label="精力" value={c.stats.energy} color="#8fc3e8" />
        <Bar label="心情" value={c.stats.mood} color="#f08a8a" />
      </div>

      {w && (
        <div class={`c-wish ${w.done ? 'done' : ''}`}>
          ✧ {w.wish.text}
          <span>{w.done ? '达成啦' : `${w.progress}/${w.wish.need}`}</span>
        </div>
      )}

      {feeding ? (
        <div class="c-foods">
          {(home.foods ?? []).length === 0 && <span class="muted">没有吃的了，去商店看看吧</span>}
          {(home.foods ?? []).map((f) => (
            <button key={f.id} class="btn small" onClick={() => (setFeeding(false), void act('feed', { item: f.id }))}>
              {f.name} ×{f.count}
            </button>
          ))}
          <button class="btn small ghost" onClick={() => setFeeding(false)}>
            算了
          </button>
        </div>
      ) : (
        <div class="c-actions">
          {c.out ? (
            <>
              <button class="btn small primary" onClick={() => outing(false)}>
                叫它回家
              </button>
              <button class="btn small" onClick={() => post({ type: 'openGame', where: 'world' })}>
                去小镇看看
              </button>
            </>
          ) : (
            <>
              <button class="btn small" disabled={busy} onClick={() => act('pet')}>
                摸摸
              </button>
              <button class="btn small" disabled={busy} onClick={() => setFeeding(true)}>
                喂食
              </button>
              <button class="btn small" disabled={busy || c.sleepy} onClick={() => act('play')}>
                逗猫
              </button>
              {home.night ? (
                <button class="btn small" disabled={busy} onClick={() => act('goodnight')}>
                  晚安
                </button>
              ) : (
                <button class="btn small" onClick={() => outing(true)}>
                  出门
                </button>
              )}
            </>
          )}
        </div>
      )}

      <form
        class="c-talk"
        onSubmit={(e) => {
          e.preventDefault();
          void talk();
        }}
      >
        <input class="field" maxLength={60} placeholder={`对${c.name}说…`} value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
        <button class="btn small primary" disabled={!text.trim()}>
          说
        </button>
      </form>

      {home.letters?.[0] && (
        <button class="c-letter" onClick={() => post({ type: 'openGame', panel: 'letters' })}>
          <b>{home.unread ? `✉ ${home.unread} 封新信` : '✉ 信箱'}</b>
          <span>{home.letters[0].title}</span>
        </button>
      )}

      <footer class="c-foot">
        <button class="btn small primary" onClick={() => post({ type: 'openGame' })}>
          打开完整游戏
        </button>
        <label class="c-check">
          <input type="checkbox" checked={!!loginItem} onChange={(e) => post({ type: 'setLoginItem', on: (e.target as HTMLInputElement).checked })} />
          开机时陪着你
        </label>
        <button class="btn small ghost" title="退出" onClick={() => post({ type: 'quit' })}>
          退出
        </button>
      </footer>
    </div>
  );
}

render(<Companion />, document.getElementById('app')!);
