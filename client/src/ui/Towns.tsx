// Picking a town (server): the official trial town, or one of your own.
// Also what the app shows when its town can't be reached.
import { useEffect, useState } from 'preact/hooks';
import { ui, toast } from '../game/state';
import { useStore } from '../game/store';
import { SERVER, isNative, isMacShell, switchServer } from '../game/platform';
import { towns, addTown, removeTown, townName, checkTown, normalizeTown, isOfficial, type TownStatus } from '../game/towns';
import { keepsakeHere, saveKeepsakeFile } from '../game/keepsake';
import { Sheet, when } from './Sheet';
import { confirmBox } from './Dialog';
import { GUIDE_URL } from './Moving';

/** "小镇：官方体验服 · 换一个" — on the welcome screen. */
export function TownLine() {
  return (
    <button class="town-line" onClick={() => ui.set({ towns: true })}>
      <span>小镇：{townName(SERVER)}</span>
      <b>换一个</b>
    </button>
  );
}

/** A settings row: which town you're in, and a way to another. */
export function TownRow() {
  return (
    <div class="toggle">
      <span>
        所在的小镇
        <div class="muted" style={{ fontSize: 12 }}>
          {isOfficial(SERVER) ? `官方体验服 · ${new URL(SERVER).host}` : new URL(SERVER).host}
        </div>
      </span>
      <button class="btn small" onClick={() => ui.set({ towns: true })}>
        换一个小镇
      </button>
    </div>
  );
}

export function TownPicker() {
  const open = useStore(ui, (s) => s.towns);
  const phase = useStore(ui, (s) => s.phase);
  const [list, setList] = useState(towns);
  const [status, setStatus] = useState<Record<string, TownStatus | undefined>>({});
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const l = towns();
    setList(l);
    for (const t of l) void checkTown(t.url).then((s) => setStatus((st) => ({ ...st, [t.url]: s })));
  }, [open]);
  if (!open) return null;
  const close = () => ui.set({ towns: false });

  const go = async (url: string) => {
    if (url === SERVER) return close();
    // inside the game, say what switching means; on the sign-in screen just go
    if (phase === 'game' && !(await confirmBox('去这个小镇？那边用的是那边的账号；回到这里时，你的猫还在这里等你。', { ok: '去看看' }))) return;
    await switchServer(url);
  };
  const add = async () => {
    const url = normalizeTown(input);
    if (!url) return toast('这不像一个网址，比如 cat.example.com');
    setBusy(true);
    const s = await checkTown(url);
    setBusy(false);
    // a browser may not be allowed to ask an older town; the apps always can
    if (!s.ok && (isNative || !(await confirmBox('没能联系上这个小镇。网址对吗？还要加上吗？', { ok: '还是加上' })))) {
      if (isNative) toast('联系不上这个小镇：看看网址对不对、小镇有没有开着');
      return;
    }
    addTown(url);
    setList(towns());
    setStatus((st) => ({ ...st, [url]: s }));
    setInput('');
  };

  return (
    <Sheet title="选择小镇" onClose={close}>
      <p class="muted" style={{ marginTop: 0, fontSize: 13, lineHeight: 1.7 }}>
        每个小镇是一台独立的服务器，账号和猫猫各住各的。默认是官方体验服；自己开了小镇，把网址加进来就能去。
      </p>
      <div class="towns">
        {list.map((t) => {
          const s = status[t.url];
          const here = t.url === SERVER;
          return (
            <div key={t.url} class={`town ${here ? 'here' : ''}`}>
              <button class="town-main" onClick={() => go(t.url)}>
                <b>
                  {townName(t.url)}
                  {here && <span class="tag">现在在这里</span>}
                  {s?.trial && <span class="tag soft">体验服</span>}
                </b>
                <span class="muted">
                  <i class={`dot ${s ? (s.ok ? 'on' : 'off') : ''}`} />
                  {s ? (s.ok ? '开着' : '联系不上') : '看看在不在…'} · {new URL(t.url).host}
                </span>
              </button>
              {!t.builtin && !here && (
                <button class="iconbtn small" aria-label="从列表里去掉" onClick={() => (removeTown(t.url), setList(towns()))}>
                  ×
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div class="sec">加一个小镇</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input class="field" style={{ flex: 1, minHeight: 42 }} placeholder="网址，比如 cat.example.com" value={input} inputMode="url" autoCapitalize="off" autoCorrect="off" onInput={(e) => setInput((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button class="btn small" disabled={busy || !input.trim()} onClick={add}>
          {busy ? '联系中…' : '添加'}
        </button>
      </div>
      <p class="muted towns-foot" style={{ fontSize: 13 }}>
        还没有自己的小镇？
        <a href={GUIDE_URL} target={isNative ? undefined : '_blank'} rel="noopener">
          看看怎么开一个 →
        </a>
        {!isNative && !isMacShell && <span>（网页版会直接打开那个小镇的网站）</span>}
      </p>
    </Sheet>
  );
}

/** While the town doesn't answer: try again, go elsewhere, or take the cat along. */
export function Unreachable() {
  const k = keepsakeHere();
  return (
    <div class="card move-wait unreachable">
      <div style={{ fontSize: 30 }}>🌙</div>
      <b>联系不上「{townName(SERVER)}」</b>
      <p class="muted">可能是网络不好，也可能是这个小镇暂时（或者已经）关了。会一直自己再试的。</p>
      {k && (
        <p class="muted">
          这台设备上带着<b>{k.cat.name}</b>的搬家包（{when(k.at)}）。到别的小镇的领养页就能用它搬家
          {isNative ? '' : '；网页上要先存成文件'}。
        </p>
      )}
      <button class="btn primary small" onClick={() => ui.set({ towns: true })}>
        换一个小镇
      </button>
      {k && (
        <button class="btn small" onClick={() => saveKeepsakeFile(k).catch((e) => toast((e as Error).message))}>
          把{k.cat.name}的搬家包存成文件
        </button>
      )}
    </div>
  );
}
