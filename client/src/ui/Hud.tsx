import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { ui, activeCat, toast, type Panel } from '../game/state';
import { useStore } from '../game/store';
import { game } from '../game/game';
import { audio } from '../game/audio';
import { closeOnBack } from '../game/platform';
import { catPortrait, itemIcon } from '../art/icons';
import { moodWord, ageOf } from '../../../shared/stats';
import { ITEMS, ITEM_MAP } from '../../../shared/items';
import { placedCounts } from '../../../shared/nest';
import { phaseOf, PHASE_NAME, SEASON_NAME } from '../../../shared/time';
import * as clock from '../game/clock';
import { NPC_MAP } from '../../../shared/npcs';
import { roomById } from '../../../shared/world';
import { roomOpen } from '../../../shared/rooms';
import { showAt, showOn, SHOW_START } from '../../../shared/shows';
import { clockAt } from '../../../shared/time';
import * as I from './icons';
import { ReportLink } from './Account';
import { api } from '../game/net';

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
  // a card open at the bottom of the town pushes them up out of its way
  const card = useStore(ui, (s) => s.scene === 'world' && !!(s.worldTarget || s.worldShop));
  return (
    <div class={card ? 'toasts high' : 'toasts'}>
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
  useEffect(() => closeOnBack(onClose), []);
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
  const shop = useStore(ui, (s) => s.worldShop);
  const room = useStore(ui, (s) => s.room);
  const myRoom = useStore(ui, (s) => s.myRoom);
  const [speak, setSpeak] = useState(false);
  const w = game.world;
  const peeking = !!room && myRoom !== room;
  return (
    <>
      {speak && catOut && <Speak onClose={() => setSpeak(false)} />}
      {target && <TargetCard />}
      {shop && !target && <ShopCard id={shop} />}
      {catOut && !target && !shop && <CompanionPill />}
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
          {peeking ? (
            <>
              <button onClick={() => w?.leaveRoom()}>
                <I.IDoor />
                回小镇
              </button>
              {catOut && (
                <button onClick={() => room && w?.goInto(room)}>
                  <I.IPaw />
                  带它进来
                </button>
              )}
            </>
          ) : catOut ? (
            <>
              <button class={controlling ? 'on' : ''} onClick={() => (audio.unlock(), w?.setControl(!controlling))}>
                <I.IJoy />
                {controlling ? '放手' : '接管'}
              </button>
              <button onClick={() => w?.emote('meow')}>
                <I.IPaw />
                喵
              </button>
              {!room && (
                <button onClick={() => w?.emote('roll')}>
                  <I.IHeart />
                  打滚
                </button>
              )}
              <button onClick={() => w?.emote('sit')}>
                <I.IStar />
                坐下
              </button>
              {room ? (
                <button onClick={() => w?.leaveRoom()}>
                  <I.IDoor />
                  出门
                </button>
              ) : (
                <button onClick={() => game.callHome()}>
                  <I.IDoor />
                  回家
                </button>
              )}
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

interface NpcInfo {
  level: number;
  name: string;
  points: number;
  next: number | null;
  walks: number;
  walking: boolean;
  busy: string | null;
  special: { label: string; done: boolean } | null;
  errand: { to: string; from: string; here: boolean } | null;
}

function Hearts({ level }: { level: number }) {
  return (
    <span class="hearts" aria-label={`熟悉度 ${level}/3`}>
      {[1, 2, 3].map((i) => (
        <span key={i} style={{ opacity: i <= level ? 1 : 0.25, color: 'var(--coral)', display: 'inline-flex' }}>
          <I.IHeart size={13} />
        </span>
      ))}
    </span>
  );
}

function TargetCard() {
  const t = useStore(ui, (s) => s.worldTarget)!;
  const catOut = useStore(ui, (s) => s.catOut);
  const e = game.world?.ents.get(t.id);
  const npc = NPC_MAP[t.id];
  const townCat = !npc && e?.st.ownerId === 'town';
  const resident = !!npc || townCat;
  const img = e ? catPortrait(e.st.genes, e.st.outfit, 56, e.st.age, 'open') : '';
  const cat = activeCat();
  const [info, setInfo] = useState<NpcInfo | null>(null);
  useEffect(() => {
    setInfo(null);
    if (!resident || !cat) return;
    let live = true;
    api<NpcInfo>('GET', `/api/cat/${cat.id}/townsfolk/${t.id}`)
      .then((r) => live && setInfo(r))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [t.id]);
  const close = () => ui.set({ worldTarget: null });
  const act = (a: 'special' | 'walk' | 'bye') => (game.world?.npcAct(t.id, a), close());
  return (
    <div class="card target">
      {img && <img src={img} alt="" />}
      <div class="info">
        <div class="tn">
          {t.name}
          {info && info.points > 0 && (
            <span class="muted" style={{ fontSize: '12px', fontWeight: 400, marginLeft: '6px' }}>
              <Hearts level={info.level} /> {info.name}
            </span>
          )}
        </div>
        <div class="muted" style={{ fontSize: '13px' }}>
          {npc ? `${npc.role} · ${npc.desc}` : t.owner ? `${t.owner}的猫` : '小镇的猫'}
        </div>
        {info?.errand?.here && <div style={{ fontSize: '13px', marginTop: '2px' }}>💌 {info.errand.from}托你带的信，就是给它的</div>}
        {info && !info.walking && info.busy && catOut && <div class="muted" style={{ fontSize: '12px', marginTop: '2px' }}>{info.busy}</div>}
        <div class="tb">
          {catOut && (
            <button class={`btn small ${info?.errand?.here ? 'primary' : resident ? '' : 'primary'}`} onClick={() => (game.world?.interact(t.id), close())}>
              {info?.errand?.here ? '把信交给它' : npc ? '打招呼' : '碰碰鼻子'}
            </button>
          )}
          {catOut && npc?.special && (
            <button class="btn small primary" disabled={info?.special?.done} onClick={() => act('special')}>
              {info?.special?.done ? '明天再来' : npc.special.label}
            </button>
          )}
          {catOut &&
            resident &&
            (info?.walking ? (
              <button class="btn small" onClick={() => act('bye')}>
                说再见
              </button>
            ) : (
              <button class="btn small" disabled={!!info?.busy} onClick={() => act('walk')}>
                一起逛逛
              </button>
            ))}
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
          {!npc && e?.st.ownerId && e.st.ownerId !== 'town' && e.st.ownerId !== ui.state.me?.user.id && <ReportLink kind="cat" target={t.id} />}
          <button class="btn small ghost" onClick={close}>
            <I.IClose size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Who is walking along with my cat right now. */
function CompanionPill() {
  const c = useStore(ui, (s) => s.companion);
  if (!c) return null;
  return (
    <div class="pill companion">
      <I.IPaw size={15} />
      <span>{c.name}陪着它散步</span>
      <button class="link" onClick={() => game.world?.npcAct(c.id, 'bye')}>
        说再见
      </button>
    </div>
  );
}

const hm = (h: number) => `${Math.floor(h)}:${String(Math.round((h % 1) * 60)).padStart(2, '0')}`;

/** Take my cat to the stage (or just look, if it's at home). */
function goToShow() {
  ui.set({ worldShop: null });
  if (ui.state.catOut) {
    if (ui.state.scene !== 'world') void game.openWorld().then(() => game.world?.goToPoi('stage'));
    else game.world?.goToPoi('stage');
  } else if (ui.state.scene !== 'world') {
    game.goOut();
    setTimeout(() => game.world?.goToPoi('stage'), 900);
  } else game.world?.goToPoi('stage');
}

function StageCard() {
  const catOut = useStore(ui, (s) => s.catOut);
  const now = clock.now();
  const on = showAt(now);
  const tonight = showOn(clockAt(now).day);
  const status = on
    ? on.live
      ? `正在演出：${on.show.name}`
      : `今晚 ${hm(SHOW_START)} 开演：${on.show.name}`
    : tonight && clock.worldClock().hour < SHOW_START
      ? `今晚 ${hm(SHOW_START)} 有演出：${tonight.name}`
      : '今晚没有演出。有演出的晚上，19:30 开始';
  return (
    <div class="card target">
      <div class="info">
        <div class="tn">露天舞台</div>
        <div class="muted" style={{ fontSize: '13px' }}>
          {on?.show.blurb ?? tonight?.blurb ?? '河东草坪上的小舞台。有些晚上，小镇的居民会在这里唱歌、跳舞、讲故事。'}
        </div>
        <div class="muted" style={{ fontSize: '12px', marginTop: '2px' }}>
          {status}
        </div>
        <div class="tb">
          {on && (
            <button class="btn small primary" onClick={goToShow}>
              {catOut ? '带它去看' : '带它出门去看'}
            </button>
          )}
          <button class="btn small ghost" onClick={() => ui.set({ worldShop: null })}>
            <I.IClose size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Tonight's show, while it's on: a tap takes the cat there. */
export function ShowPill() {
  const [, tick] = useState(0);
  const scene = useStore(ui, (s) => s.scene);
  const visiting = useStore(ui, (s) => s.visiting);
  const build = useStore(ui, (s) => s.build);
  const companion = useStore(ui, (s) => s.companion);
  const catOut = useStore(ui, (s) => s.catOut);
  useEffect(() => {
    const t = setInterval(() => tick((x) => x + 1), 20_000);
    return () => clearInterval(t);
  }, []);
  const on = showAt(clock.now());
  if (!on || visiting || build) return null;
  const pos = scene === 'world' ? (companion && catOut ? 'w2' : 'w1') : 'n';
  return (
    <button class={`pill showpill ${pos}`} onClick={goToShow}>
      <span aria-hidden="true">🎵</span>
      <span class="st">{on.live ? `露天舞台正在演出：${on.show.name}` : `${hm(SHOW_START)} 露天舞台：${on.show.name}`}</span>
    </button>
  );
}

function ShopCard({ id }: { id: string }) {
  const catOut = useStore(ui, (s) => s.catOut);
  if (id === 'stage') return <StageCard />;
  const r = roomById(id);
  if (!r) return null;
  const open = roomOpen(r, clock.worldClock().hour);
  const v = game.world?.shopVisitors(id) ?? { cats: 0, keeper: false };
  const keeper = r.keeper ? NPC_MAP[r.keeper] : null;
  const status = !open ? '已经打烊了，明天再来吧' : keeper ? (v.keeper ? `${keeper.name}在店里` : `${keeper.name}出去了一会儿`) : '';
  return (
    <div class="card target">
      <div class="info">
        <div class="tn">{r.name}</div>
        <div class="muted" style={{ fontSize: '13px' }}>
          {r.desc}
        </div>
        <div class="muted" style={{ fontSize: '12px', marginTop: '2px' }}>
          {status}
          {v.cats > 0 ? ` · 里面有 ${v.cats} 只猫猫` : ''}
        </div>
        <div class="tb">
          {catOut && open && (
            <button class="btn small primary" onClick={() => game.world?.goInto(id)}>
              带它进去
            </button>
          )}
          <button class="btn small" onClick={() => game.world?.peek(id)}>
            {catOut && open ? '先看看' : '看看里面'}
          </button>
          <button class="btn small ghost" onClick={() => ui.set({ worldShop: null })}>
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
