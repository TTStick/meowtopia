import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ui, activeCat, toast, type Panel } from '../game/state';
import { useStore } from '../game/store';
import { game } from '../game/game';
import { audio } from '../game/audio';
import { catPortrait, itemIcon } from '../art/icons';
import { moodWord, ageOf } from '../../../shared/stats';
import { ITEMS, ITEM_MAP } from '../../../shared/items';
import { placedCounts } from '../../../shared/nest';
import { phaseOf, PHASE_NAME, SEASON_NAME } from '../../../shared/time';
import * as clock from '../game/clock';
import { NPC_MAP } from '../../../shared/npcs';
import * as I from './icons';

function open(panel: Panel) {
  audio.blip(600, 0.06);
  ui.set({ panel });
}

function Weather() {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  void now;
  const h = clock.localHour();
  const w = clock.weather();
  const night = h < 6 || h >= 19;
  const Icon = w.kind === 'rain' ? I.IRain : w.kind === 'snow' ? I.ISnow : w.kind === 'cloudy' ? I.ICloud : night ? I.IMoon : I.ISun;
  return (
    <span class="pill wx" title={SEASON_NAME[clock.season()]}>
      <Icon size={16} />
      <span class="wx-t">{PHASE_NAME[phaseOf(h)]}</span>
    </span>
  );
}

export function TopBar() {
  const me = useStore(ui, (s) => s.me);
  const unread = useStore(ui, (s) => s.unread);
  const visiting = useStore(ui, (s) => s.visiting);
  const cat = me ? me.cats.find((c) => c.id === me.activeCatId) ?? me.cats[0] : null;
  if (!me || !cat) return null;
  const shown = visiting?.cat ?? cat;
  return (
    <div class="hud-top">
      <button class="catchip" onClick={() => !visiting && open('cat')} style={{ border: '2px solid var(--ink)' }}>
        <img src={catPortrait(shown.genes, shown.outfit, 64, ageOf(shown.born), 'happy')} alt="" />
        <span style={{ textAlign: 'left', minWidth: 0 }}>
          <div class="nm">{shown.name}</div>
          <div class="md">{visiting ? `${visiting.ownerName}家的猫` : shown.location === 'world' ? '在外面探险' : moodWord(shown.stats)}</div>
        </span>
      </button>
      <div class="spacer" />
      <Weather />
      <span class="pill">
        <I.IFish size={16} />
        {me.user.fish}
      </span>
      <button class="iconbtn" aria-label="信箱" onClick={() => open('letters')}>
        <I.IMail />
        {unread > 0 && <span class="badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      <button class="iconbtn" aria-label="更多" onClick={() => open('help')}>
        <I.IMenu />
      </button>
    </div>
  );
}

export function WishPill() {
  const wish = useStore(ui, (s) => s.wish);
  const visiting = useStore(ui, (s) => s.visiting);
  const scene = useStore(ui, (s) => s.scene);
  if (!wish || visiting) return null;
  const act = () => {
    if (wish.done) return toast('今天的心愿已经实现啦，明天它还会有新的小心愿', '🌟');
    switch (wish.kind) {
      case 'treat':
        return ui.set({ panel: 'feed' });
      case 'play':
        if (scene !== 'nest') return game.openNest();
        return ui.state.play || game.togglePlay();
      case 'pet':
        return toast('点点它、顺顺毛就好～', '🤲');
      case 'outfit':
        return ui.set({ panel: 'wardrobe' });
      case 'goodnight':
        return toast('晚上 8 点半以后，点「晚安」哄它睡觉', '🌙');
      case 'friend':
        return ui.state.catOut ? toast('它正在外面，遇到别的猫猫就会去打招呼', '🐾') : game.goOut();
      case 'visit':
        if (!ui.state.catOut) game.goOut();
        else game.openWorld();
        setTimeout(() => wish.target && game.world?.goToPoi(wish.target), 800);
        return;
    }
  };
  return (
    <button class="pill wish" onClick={act} style={wish.done ? { background: 'var(--leaf-soft)' } : undefined}>
      <I.ISparkle size={15} />
      <span class="wt">{wish.done ? `心愿实现啦：${wish.text}` : `小心愿：${wish.text}`}</span>
      {!wish.done && wish.need > 1 && (
        <span class="muted">
          {wish.progress}/{wish.need}
        </span>
      )}
    </button>
  );
}

export function GoodnightOverlay() {
  const t = useStore(ui, (s) => s.goodnight);
  const [show, setShow] = useState(false);
  const cat = activeCat();
  useEffect(() => {
    if (!t) return;
    setShow(true);
    const h = setTimeout(() => setShow(false), 4200);
    return () => clearTimeout(h);
  }, [t]);
  if (!show || !cat) return null;
  return (
    <div class="goodnight">
      <I.IMoon size={40} />
      <div class="gn-t">晚安，{cat.name}</div>
      <div class="gn-s">今天也辛苦啦</div>
    </div>
  );
}

export function Hint() {
  const hint = useStore(ui, (s) => s.hint);
  if (!hint) return null;
  return <div class="pill hint">{hint}</div>;
}

export function Toasts() {
  const toasts = useStore(ui, (s) => s.toasts);
  return (
    <div class="toasts">
      {toasts.map((t) => (
        <div key={t.id} class="toast">
          {t.icon ? `${t.icon} ` : ''}
          {t.text}
        </div>
      ))}
    </div>
  );
}

function Speak({ onClose }: { onClose: () => void }) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = setTimeout(() => ref.current?.focus(), 30);
    return () => clearTimeout(t);
  }, []);
  const busy = useStore(ui, (s) => s.busy);
  const cat = activeCat();
  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setText('');
    await game.command(t);
  };
  return (
    <div class="speak">
      <input
        ref={ref}
        class="field"
        maxLength={60}
        placeholder={`对${cat?.name ?? '猫猫'}说…（如：去河边看看、睡一会儿）`}
        value={text}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') send();
          if (e.key === 'Escape') onClose();
        }}
      />
      <button class="iconbtn" disabled={busy} onClick={send} aria-label="发送">
        <I.ISend />
      </button>
    </div>
  );
}

export function NestBar() {
  const play = useStore(ui, (s) => s.play);
  const catOut = useStore(ui, (s) => s.catOut);
  const [speak, setSpeak] = useState(false);
  const cat = activeCat();
  return (
    <>
      {speak && <Speak onClose={() => setSpeak(false)} />}
      <div class="side">
        <button class={`iconbtn`} aria-label="对它说" onClick={() => setSpeak((v) => !v)} style={speak ? { background: 'var(--coral-soft)' } : undefined}>
          <I.IChat />
        </button>
        {!catOut && (
          <button class="iconbtn" aria-label="叫它过来" onClick={() => game.callCat()}>
            <I.ICall />
          </button>
        )}
        <button class="iconbtn" aria-label="拍照" onClick={() => game.takePhoto()}>
          <I.ICamera />
        </button>
      </div>
      <div class="bar">
        <div class="dock">
          {catOut ? (
            <button onClick={() => game.openWorld(cat?.id)}>
              <I.IMap />
              去找它
            </button>
          ) : (
            <>
              <button onClick={() => (audio.unlock(), game.nest?.petTap())}>
                <I.IHand />
                摸摸
              </button>
              <button onClick={() => open('feed')}>
                <I.IBowl />
                喂食
              </button>
              <button class={play ? 'on' : ''} onClick={() => (audio.unlock(), game.togglePlay())}>
                <I.IFeather />
                {play ? '收起' : '逗猫'}
              </button>
            </>
          )}
          <button onClick={() => game.startBuild()}>
            <I.IBrush />
            装修
          </button>
          {!catOut && (
            <button onClick={() => game.goOut()}>
              <I.IDoor />
              出门
            </button>
          )}
          {!catOut && game.isNight() ? (
            <button onClick={() => (audio.unlock(), game.goodnight())}>
              <I.IMoon />
              晚安
            </button>
          ) : (
            <button onClick={() => open('shop')}>
              <I.IBag />
              商店
            </button>
          )}
        </div>
      </div>
    </>
  );
}

export function WorldBar() {
  const catOut = useStore(ui, (s) => s.catOut);
  const controlling = useStore(ui, (s) => s.controlling);
  const target = useStore(ui, (s) => s.worldTarget);
  const [speak, setSpeak] = useState(false);
  const w = game.world;
  return (
    <>
      {speak && catOut && <Speak onClose={() => setSpeak(false)} />}
      {target && <TargetCard />}
      <div class="side">
        <button class="iconbtn" aria-label="放大" onClick={() => w?.zoomBy(1.25)}>
          <I.IPlus />
        </button>
        <button class="iconbtn" aria-label="缩小" onClick={() => w?.zoomBy(0.8)}>
          <I.IMinus />
        </button>
        {catOut && (
          <button class="iconbtn" aria-label="找到我的猫" onClick={() => w?.focusMine()}>
            <I.ITarget />
          </button>
        )}
        {catOut && (
          <button class="iconbtn" aria-label="对它说" onClick={() => setSpeak((v) => !v)} style={speak ? { background: 'var(--coral-soft)' } : undefined}>
            <I.IChat />
          </button>
        )}
        <button class="iconbtn" aria-label="拍照" onClick={() => game.takePhoto()}>
          <I.ICamera />
        </button>
      </div>
      <div class="bar">
        <div class="dock">
          <button onClick={() => game.openNest()}>
            <I.IHome />
            猫窝
          </button>
          {catOut ? (
            <>
              <button class={controlling ? 'on' : ''} onClick={() => (audio.unlock(), w?.setControl(!controlling))}>
                <I.IJoy />
                {controlling ? '放手' : '接管'}
              </button>
              <button onClick={() => w?.emote('meow')}>
                <I.IPaw />
                喵
              </button>
              <button onClick={() => w?.emote('roll')}>
                <I.IHeart />
                打滚
              </button>
              <button onClick={() => w?.emote('sit')}>
                <I.IStar />
                坐下
              </button>
              <button onClick={() => game.callHome()}>
                <I.IDoor />
                回家
              </button>
            </>
          ) : (
            <button onClick={() => game.goOut()}>
              <I.IDoor />
              带它出门
            </button>
          )}
          <button onClick={() => open('map')}>
            <I.IMap />
            地图
          </button>
        </div>
      </div>
    </>
  );
}

function TargetCard() {
  const t = useStore(ui, (s) => s.worldTarget)!;
  const catOut = useStore(ui, (s) => s.catOut);
  const e = game.world?.ents.get(t.id);
  const npc = NPC_MAP[t.id];
  const img = e ? catPortrait(e.st.genes, e.st.outfit, 56, e.st.age, 'open') : '';
  return (
    <div class="card target">
      {img && <img src={img} alt="" />}
      <div class="info">
        <div class="tn">{t.name}</div>
        <div class="muted" style={{ fontSize: '13px' }}>
          {npc ? `${npc.role} · ${npc.desc}` : t.owner ? `${t.owner}的猫` : '小镇的猫'}
        </div>
        <div class="tb">
          {catOut && (
            <button class="btn small primary" onClick={() => (game.world?.interact(t.id), ui.set({ worldTarget: null }))}>
              {npc ? '去打个招呼' : '去碰碰鼻子'}
            </button>
          )}
          {t.shop && (
            <button class="btn small" onClick={() => ui.set({ panel: 'shop', shopKind: t.shop === 'tailor' ? 'tailor' : 'store', worldTarget: null })}>
              进店看看
            </button>
          )}
          {!npc && e?.st.ownerId && e.st.ownerId !== 'town' && (
            <button class="btn small" onClick={() => (ui.set({ worldTarget: null }), game.visit(t.id))}>
              去它家串门
            </button>
          )}
          <button class="btn small ghost" onClick={() => ui.set({ worldTarget: null })}>
            <I.IClose size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function VisitBar() {
  const v = useStore(ui, (s) => s.visiting)!;
  return (
    <div class="bar">
      <div class="dock">
        <button onClick={() => game.nest?.petTap()}>
          <I.IHand />
          摸摸它
        </button>
        <button onClick={() => open('note')}>
          <I.IMail />
          留纸条
        </button>
        <button onClick={() => game.openWorld()}>
          <I.IMap />
          小镇
        </button>
        <button onClick={() => game.openNest()}>
          <I.IHome />
          回家
        </button>
      </div>
      <span style={{ display: 'none' }}>{v.catId}</span>
    </div>
  );
}

type TrayTab = 'furniture' | 'wall' | 'wallpaper' | 'floor';

export function BuildTray() {
  const me = useStore(ui, (s) => s.me);
  const [tab, setTab] = useState<TrayTab>('furniture');
  const [, force] = useState(0);
  useEffect(() => ui.subscribe(() => force((x) => x + 1)), []);
  const nest = game.nest;
  if (!me || !nest) return null;
  const inv = me.inventory;
  const placed = placedCounts(nest.layout);
  const items = ITEMS.filter((i) => i.cat === tab && (inv[i.id] ?? 0) > 0);
  const sel = nest.selected;
  const selDef = sel ? ITEM_MAP[(nest.layout.items.find((i) => i.uid === sel) ?? nest.layout.wall.find((w) => w.uid === sel))?.item ?? ''] : null;
  const placing = nest.ghost && !nest.ghost.uid ? nest.ghost : null;
  return (
    <div class="build-tray">
      <div class="build-top">
        <div class="tabs" style={{ padding: 0, flex: 1 }}>
          {(
            [
              ['furniture', '家具'],
              ['wall', '墙饰'],
              ['wallpaper', '墙纸'],
              ['floor', '地板'],
            ] as [TrayTab, string][]
          ).map(([k, n]) => (
            <button key={k} class={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
              {n}
            </button>
          ))}
        </div>
        <button class="btn small" onClick={() => game.finishBuild(false)}>
          取消
        </button>
        <button class="btn small primary" onClick={() => game.finishBuild(true)}>
          <I.ICheck size={18} />
          完成
        </button>
      </div>
      {placing ? (
        <div class="build-top">
          <span class="muted" style={{ flex: 1 }}>
            点一下房间里的位置放下「{ITEM_MAP[placing.item].name}」
          </span>
          <button class="btn small" onClick={() => (nest.cancelPlacing(), force((x) => x + 1))}>
            不放了
          </button>
        </div>
      ) : sel && selDef ? (
        <div class="build-top">
          <span style={{ flex: 1, fontWeight: 600 }}>已选中：{selDef.name}（拖动可以移动）</span>
          {selDef.cat === 'furniture' && (
            <button class="btn small" onClick={() => (nest.flipSelected(), force((x) => x + 1))}>
              <I.IFlip size={18} />
              翻转
            </button>
          )}
          <button class="btn small" onClick={() => (nest.storeSelected(), force((x) => x + 1))}>
            <I.IBox size={18} />
            收起
          </button>
        </div>
      ) : null}
      <div class="tray-items">
        {items.length === 0 && <div class="muted" style={{ padding: '12px' }}>这里还空空的，去商店逛逛吧</div>}
        {items.map((it) => {
          const have = inv[it.id] ?? 0;
          const free = tab === 'wallpaper' || tab === 'floor' ? have : have - (placed[it.id] ?? 0);
          const isOn = (tab === 'wallpaper' && nest.layout.wallpaper === it.id) || (tab === 'floor' && nest.layout.floor === it.id);
          return (
            <button
              key={it.id}
              class={`item ${isOn ? 'on' : ''}`}
              disabled={(tab === 'furniture' || tab === 'wall') && free <= 0}
              style={(tab === 'furniture' || tab === 'wall') && free <= 0 ? { opacity: 0.45 } : undefined}
              onClick={() => {
                if (tab === 'wallpaper' || tab === 'floor') nest.setSurface(tab, it.id);
                else nest.startPlacing(it.id);
                force((x) => x + 1);
              }}
            >
              <img src={itemIcon(it.id, 48)} alt="" />
              <span class="in">{it.name}</span>
              {(tab === 'furniture' || tab === 'wall') && <span class="cnt">{free}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ConnBadge() {
  const connected = useStore(ui, (s) => s.connected);
  const online = useStore(ui, (s) => s.online);
  const scene = useStore(ui, (s) => s.scene);
  const llm = useStore(ui, (s) => s.llm);
  const label = useMemo(() => (connected ? `小镇里有 ${Math.max(1, online)} 位铲屎官` : '正在连接小镇…'), [connected, online]);
  if (scene !== 'world') return null;
  return (
    <div class="pill conn" title={llm ? '猫猫的话由语言模型实时生成' : ''}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: connected ? 'var(--leaf)' : 'var(--coral)', display: 'inline-block' }} />
      {label}
    </div>
  );
}

export { toast };
