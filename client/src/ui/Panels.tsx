import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ComponentChildren } from 'preact';
import { ui, activeCat, toast, patchCat, type Panel } from '../game/state';
import { useStore } from '../game/store';
import { game } from '../game/game';
import { api } from '../game/net';
import { isNative, isMacShell, toMac, enableNativePush, saveFile } from '../game/platform';
import { registerApns } from '../game/account';
import { audio } from '../game/audio';
import { itemIcon, catPortrait } from '../art/icons';
import { LiveCat } from './LiveCat';
import { ITEMS, ITEM_MAP, WEAR_SLOT, type ItemCat } from '../../../shared/items';
import { coatName, traitWords } from '../../../shared/genes';
import { ageOf, bondLevel, moodWord } from '../../../shared/stats';
import { getWorld, TILE, WW, WH, Ter, POIS, ZONE_NAME } from '../../../shared/world';
import type { CatRecord, JournalEntry } from '../../../shared/types';
import * as I from './icons';
import { Sheet, Tabs, when } from './Sheet';
import { SecuritySection, ProtectPanel, PrivacyPanel, ReportLink } from './Account';
import { confirmBox } from './Dialog';

const go = (panel: Panel) => ui.set({ panel });

// ---------------- feed ----------------
function FeedPanel() {
  const me = useStore(ui, (s) => s.me)!;
  const foods = ITEMS.filter((i) => i.cat === 'food' && (me.inventory[i.id] ?? 0) > 0);
  return (
    <Sheet title="喂点好吃的">
      <p class="muted" style={{ marginTop: 0 }}>食盆里一直有猫粮，它不会饿着。零食是额外的小幸福～</p>
      {foods.length === 0 ? (
        <div class="empty">
          零食吃完啦
          <br />
          <button class="btn soft" style={{ marginTop: 10 }} onClick={() => ui.set({ panel: 'shop' })}>
            去商店买一点
          </button>
        </div>
      ) : (
        <div class="grid">
          {foods.map((f) => (
            <button key={f.id} class="item" onClick={() => game.feed(f.id)}>
              <span class="cnt">×{me.inventory[f.id]}</span>
              <img src={itemIcon(f.id)} alt="" />
              <span class="in">{f.name}</span>
              <span class="ip">{f.desc}</span>
            </button>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------------- shop ----------------
type ShopTab = 'furniture' | 'wall' | 'surface' | 'food' | 'wear' | 'sell';
function ShopPanel() {
  const me = useStore(ui, (s) => s.me)!;
  const kind = useStore(ui, (s) => s.shopKind);
  const [tab, setTab] = useState<ShopTab>(kind === 'tailor' ? 'wear' : 'furniture');
  const [sel, setSel] = useState<string | null>(null);
  const cats: Record<ShopTab, ItemCat[]> = { furniture: ['furniture'], wall: ['wall'], surface: ['wallpaper', 'floor'], food: ['food'], wear: ['wear'], sell: ['collect'] };
  const list = ITEMS.filter((i) => cats[tab].includes(i.cat) && (tab === 'sell' ? (me.inventory[i.id] ?? 0) > 0 : i.shop));
  const it = sel ? ITEM_MAP[sel] : null;
  const owned = (id: string) => me.inventory[id] ?? 0;
  const unique = (c: ItemCat) => c === 'wear' || c === 'wallpaper' || c === 'floor';
  return (
    <Sheet
      title={kind === 'tailor' ? '针针的裁缝铺' : '豆豆杂货铺'}
      right={
        <span class="pill">
          <I.IFish size={16} />
          {me.user.fish}
        </span>
      }
      tabs={
        <Tabs
          value={tab}
          set={(t) => (setTab(t), setSel(null))}
          items={[
            ['furniture', '家具'],
            ['wall', '墙饰'],
            ['surface', '墙纸地板'],
            ['food', '零食'],
            ['wear', '装扮'],
            ['sell', '卖宝贝'],
          ]}
        />
      }
    >
      {it && (
        <div class="row" style={{ marginBottom: 12, background: 'var(--cream)' }}>
          <img src={itemIcon(it.id)} alt="" />
          <div class="grow">
            <div class="t1">{it.name}</div>
            <div class="t2">{it.desc}</div>
          </div>
          {tab === 'sell' ? (
            <button class="btn small primary" onClick={() => game.sell(it.id)}>
              换 {it.sell} <I.IFish size={14} />
            </button>
          ) : unique(it.cat) && owned(it.id) > 0 ? (
            <span class="pill">已拥有</span>
          ) : (
            <button class="btn small primary" disabled={me.user.fish < it.price} onClick={() => game.buy(it.id)}>
              {it.price} <I.IFish size={14} />
            </button>
          )}
        </div>
      )}
      {list.length === 0 && <div class="empty">{tab === 'sell' ? '还没有可以卖的宝贝。让猫猫出门探险，它会捡回好东西！' : '暂时没有货哦'}</div>}
      <div class="grid">
        {list.map((i) => (
          <button key={i.id} class={`item ${sel === i.id ? 'on' : ''}`} onClick={() => (audio.blip(700, 0.05), setSel(i.id))}>
            {owned(i.id) > 0 && <span class="cnt">{unique(i.cat) ? '✓' : `×${owned(i.id)}`}</span>}
            <img src={itemIcon(i.id)} alt="" />
            <span class="in">{i.name}</span>
            <span class="ip">
              {tab === 'sell' ? i.sell : i.price}
              <I.IFish size={12} />
            </span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}

// ---------------- wardrobe ----------------
function WardrobePanel() {
  const me = useStore(ui, (s) => s.me)!;
  const cat = activeCat()!;
  const [outfit, setOutfit] = useState<string[]>(cat.outfit);
  const wears = ITEMS.filter((i) => i.cat === 'wear' && (me.inventory[i.id] ?? 0) > 0);
  const toggle = (id: string) => {
    audio.blip(760, 0.05);
    setOutfit((o) => {
      if (o.includes(id)) return o.filter((x) => x !== id);
      const slot = WEAR_SLOT[id];
      return [...o.filter((x) => WEAR_SLOT[x] !== slot), id];
    });
  };
  return (
    <Sheet title={`${cat.name}的衣柜`}>
      <div class="card" style={{ background: 'var(--cream)', marginBottom: 12 }}>
        <LiveCat genes={cat.genes} outfit={outfit} age={ageOf(cat.born)} height={170} cycle={['sit_happy', 'sit', 'look_up']} />
      </div>
      {wears.length === 0 ? (
        <div class="empty">衣柜还空空的，去裁缝铺看看吧</div>
      ) : (
        <div class="grid">
          {wears.map((w) => (
            <button key={w.id} class={`item ${outfit.includes(w.id) ? 'on' : ''}`} onClick={() => toggle(w.id)}>
              <img src={itemIcon(w.id)} alt="" />
              <span class="in">{w.name}</span>
            </button>
          ))}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button class="btn" onClick={() => (ui.set({ panel: 'shop', shopKind: 'tailor' }))}>
          去裁缝铺
        </button>
        <div class="spacer" />
        <button
          class="btn primary"
          onClick={async () => {
            await game.setOutfit(outfit);
            ui.set({ panel: null });
            toast('好看！', '✨');
            setTimeout(() => game.nest?.say('dress'), 500);
          }}
        >
          就穿这个
        </button>
      </div>
    </Sheet>
  );
}

// ---------------- journal ----------------
function JournalPanel() {
  const cat = activeCat()!;
  const [list, setList] = useState<JournalEntry[] | null>(null);
  useEffect(() => {
    api<JournalEntry[]>('GET', `/api/cat/${cat.id}/journal`).then(setList).catch((e) => toast(e.message));
  }, [cat.id]);
  return (
    <Sheet title={`${cat.name}的日记`}>
      {!list ? (
        <div class="empty">翻开日记本…</div>
      ) : list.length === 0 ? (
        <div class="empty">还没有日记。让它出门走走吧～</div>
      ) : (
        <div class="list">
          {list.map((e) => (
            <div key={e.id} class="entry">
              <div class="when">{when(e.ts)}</div>
              {e.text}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------------- letters ----------------
function LettersPanel() {
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => {
    api<any[]>('GET', '/api/events')
      .then((l) => {
        setList(l);
        api('POST', '/api/events/seen').catch(() => {});
        ui.set({ unread: 0 });
      })
      .catch((e) => toast(e.message));
  }, []);
  return (
    <Sheet title="信箱">
      {!list ? (
        <div class="empty">邮差阿信正在送信…</div>
      ) : list.length === 0 ? (
        <div class="empty">信箱空空的。猫猫在外面有了新发现，会在这里告诉你。</div>
      ) : (
        <div class="list">
          {list.map((e) => (
            <div key={e.id} class="row" style={!e.seen ? { background: 'var(--coral-soft)' } : undefined}>
              <I.IMail />
              <div class="grow">
                <div class="t1">{e.title}</div>
                <div class="t2">{e.text}</div>
                <div class="t2" style={{ fontSize: 11 }}>
                  {when(e.ts)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

// ---------------- collection ----------------
const ZONE_HINT: Record<string, string> = { park: '公园', town: '小镇', plaza: '广场', forest: '森林', meadow: '草地花田', river: '河边', pier: '码头', hill: '山坡' };
function CollectionPanel() {
  const me = useStore(ui, (s) => s.me)!;
  const [found, setFound] = useState<string[]>([]);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    api<{ found: string[] }>('GET', '/api/collection').then((r) => setFound(r.found)).catch(() => {});
  }, []);
  const all = ITEMS.filter((i) => i.cat === 'collect');
  const it = sel ? ITEM_MAP[sel] : null;
  const seasons = ['春', '夏', '秋', '冬'];
  return (
    <Sheet title={`收藏册 ${found.length}/${all.length}`}>
      {it && (
        <div class="row" style={{ marginBottom: 12, background: 'var(--cream)' }}>
          <img src={itemIcon(it.id)} alt="" />
          <div class="grow">
            <div class="t1">
              {it.name} {'★'.repeat(it.rarity ?? 1)}
            </div>
            <div class="t2">{found.includes(it.id) ? it.desc : '还没找到过'}</div>
            <div class="t2">
              出没：{it.zones?.map((z) => ZONE_HINT[z] ?? z).join('、')}
              {it.seasons ? ` · ${it.seasons.map((s) => seasons[s]).join('')}季` : ''}
              {it.night ? ' · 夜晚' : ''}
              {it.rain ? ' · 雨天' : ''}
            </div>
          </div>
          {(me.inventory[it.id] ?? 0) > 0 && (
            <button class="btn small" onClick={() => game.sell(it.id)}>
              卖 {it.sell}
              <I.IFish size={14} />
            </button>
          )}
        </div>
      )}
      <div class="grid">
        {all.map((i) => {
          const f = found.includes(i.id);
          return (
            <button key={i.id} class={`item ${f ? '' : 'unknown'} ${sel === i.id ? 'on' : ''}`} onClick={() => setSel(i.id)}>
              {(me.inventory[i.id] ?? 0) > 0 && <span class="cnt">×{me.inventory[i.id]}</span>}
              {f ? <img src={itemIcon(i.id)} alt="" /> : <div style={{ width: 60, height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, fontWeight: 700 }}>?</div>}
              <span class="in">{f ? i.name : '？？？'}</span>
              <span class="ip">{'★'.repeat(i.rarity ?? 1)}</span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

// ---------------- social ----------------
type SocialTab = 'friends' | 'visit' | 'bond' | 'notes';
function SocialPanel() {
  const [tab, setTab] = useState<SocialTab>('friends');
  return (
    <Sheet
      title="小镇邻里"
      tabs={
        <Tabs
          value={tab}
          set={setTab}
          items={[
            ['friends', '猫友'],
            ['visit', '去串门'],
            ['bond', '共养'],
            ['notes', '门口的纸条'],
          ]}
        />
      }
    >
      {tab === 'friends' && <Friends />}
      {tab === 'visit' && <VisitList />}
      {tab === 'bond' && <Bond />}
      {tab === 'notes' && <Notes />}
    </Sheet>
  );
}

function Friends() {
  const cat = activeCat()!;
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => {
    api<any[]>('GET', `/api/cat/${cat.id}/friends`).then(setList).catch(() => setList([]));
  }, []);
  if (!list) return <div class="empty">…</div>;
  if (!list.length) return <div class="empty">{cat.name}还没有猫友。带它出门走走，遇到别的猫猫就会碰碰鼻子交朋友～</div>;
  return (
    <div class="list">
      {list.map((f) => (
        <div key={f.id} class="row">
          <img src={catPortrait(f.genes, f.outfit, 48)} alt="" />
          <div class="grow">
            <div class="t1">{f.name}</div>
            <div class="t2">
              {'♥'.repeat(Math.min(5, Math.ceil(f.affinity / 3)))} · 见过 {f.meets} 次 · {f.location === 'world' ? '正在小镇里' : '在家'}
            </div>
          </div>
          {f.location === 'world' ? (
            <button class="btn small" onClick={() => game.openWorld(f.id)}>
              去看看
            </button>
          ) : !f.isTown ? (
            <button class="btn small" onClick={() => game.visit(f.id)}>
              串门
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function VisitList() {
  const [list, setList] = useState<any[] | null>(null);
  const load = () => api<any[]>('GET', '/api/visit/random').then(setList).catch(() => setList([]));
  useEffect(() => {
    load();
  }, []);
  if (!list) return <div class="empty">…</div>;
  return (
    <>
      <p class="muted" style={{ marginTop: 0 }}>去别人家的猫窝坐坐，看看它们的小窝，留一张小纸条。不用打招呼，也不用回消息。</p>
      {!list.length && <div class="empty">附近还没有别的猫窝</div>}
      <div class="list">
        {list.map((c) => (
          <div key={c.id} class="row">
            <img src={catPortrait(c.genes, c.outfit, 48)} alt="" />
            <div class="grow">
              <div class="t1">{c.name}的猫窝</div>
              <div class="t2">{c.location === 'world' ? '主猫出门啦，窝里空空的' : '主猫在家'}</div>
            </div>
            <button class="btn small" onClick={() => game.visit(c.id)}>
              串门
            </button>
          </div>
        ))}
      </div>
      <button class="btn ghost" style={{ marginTop: 10 }} onClick={load}>
        换一批
      </button>
    </>
  );
}

function Bond() {
  const [data, setData] = useState<{ bonds: any[]; queued: boolean } | null>(null);
  const [code, setCode] = useState('');
  const [myCode, setMyCode] = useState<string | null>(null);
  const [page, setPage] = useState('');
  const load = () => api('GET', '/api/bond').then(setData).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  if (!data) return <div class="empty">…</div>;
  const active = data.bonds.filter((b) => b.status === 'active');
  return (
    <>
      <p class="muted" style={{ marginTop: 0, lineHeight: 1.7 }}>
        和一位陌生人一起养一只小猫。你们不会看到对方在不在线，也没有聊天框——只有一本慢慢写的交换日记，和一只被加倍爱着的猫。
      </p>
      {active.map((b) => (
        <div key={b.id} class="card" style={{ padding: 12, marginBottom: 12 }}>
          {b.cat && (
            <div class="row" style={{ border: 'none', padding: 0 }}>
              <img src={catPortrait(b.cat.genes, b.cat.outfit, 48, ageOf(b.cat.born))} alt="" />
              <div class="grow">
                <div class="t1">{b.cat.name}</div>
                <div class="t2">和「{b.partnerName}」一起养 · 第 {Math.max(1, Math.ceil((Date.now() - b.created) / 86400000))} 天</div>
              </div>
              <button
                class="btn small"
                onClick={async () => {
                  await api('POST', '/api/active', { catId: b.cat.id });
                  await game.refreshMe();
                  ui.set((s) => ({ me: s.me ? { ...s.me, activeCatId: b.cat.id } : s.me, panel: null }));
                  await game.openNest(b.cat.id);
                }}
              >
                去它的窝
              </button>
            </div>
          )}
          <div class="sec">交换日记</div>
          <div class="list">
            {b.diary.length === 0 && <div class="muted">还没有人写，第一页留给你？</div>}
            {b.diary.map((d: any, i: number) => (
              <div key={i} class="entry" style={{ borderLeftColor: d.mine ? 'var(--coral)' : 'var(--sky)' }}>
                <div class="when">
                  {d.mine ? '我' : 'TA'} · {when(d.ts)}
                  {!d.mine && d.id && <ReportLink kind="diary" target={String(d.id)} />}
                </div>
                {d.text}
              </div>
            ))}
          </div>
          <textarea class="field" style={{ minHeight: 70, padding: 10, marginTop: 10, resize: 'none' }} maxLength={120} placeholder={`写一点今天关于${b.cat?.name ?? '它'}的小事…（每天一页）`} value={page} onInput={(e) => setPage((e.target as HTMLTextAreaElement).value)} />
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button
              class="btn small ghost"
              onClick={async () => {
                if (!(await confirmBox(`真的要结束共养吗？${b.cat?.name ?? '它'}会搬去小镇生活，你们仍然能在街上遇见它。`, { ok: '结束共养', danger: true }))) return;
                await api('POST', `/api/bond/${b.id}/leave`);
                await game.refreshMe();
                load();
              }}
            >
              结束共养
            </button>
            <div class="spacer" />
            <button
              class="btn small primary"
              disabled={!page.trim()}
              onClick={async () => {
                try {
                  await api('POST', `/api/bond/${b.id}/diary`, { text: page });
                  setPage('');
                  load();
                  toast('写好了，TA 下次来的时候会看到', '📖');
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              写下这一页
            </button>
          </div>
        </div>
      ))}
      {active.length < 2 && (
        <div class="card" style={{ padding: 14 }}>
          <div class="sec" style={{ marginTop: 0 }}>寻找共养伙伴</div>
          {data.queued ? (
            <>
              <p class="muted">正在等一位有缘人…可以先去忙别的，配对成功会有一封信告诉你。</p>
              <button class="btn small" onClick={async () => (await api('DELETE', '/api/bond/match'), load())}>
                不等了
              </button>
            </>
          ) : (
            <button
              class="btn primary"
              onClick={async () => {
                try {
                  const r = await api('POST', '/api/bond/match');
                  if (r.matched) {
                    toast('遇到了有缘人！快去看看你们的小猫', '💛', 4000);
                    await game.refreshMe();
                  }
                  load();
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              随缘匹配一位陌生人
            </button>
          )}
          <div class="sec">和认识的人一起养</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              class="btn small"
              onClick={async () => {
                const r = await api('POST', '/api/bond/invite');
                setMyCode(r.code);
              }}
            >
              生成邀请码
            </button>
            {myCode && <span class="code" style={{ fontSize: 15, padding: '6px 10px' }}>{myCode}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <input class="field" placeholder="输入对方的邀请码" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
            <button
              class="btn"
              disabled={code.trim().length < 4}
              onClick={async () => {
                try {
                  await api('POST', '/api/bond/join', { code });
                  toast('绑定成功！一只小猫来到了你们身边', '💛', 4000);
                  await game.refreshMe();
                  load();
                } catch (e) {
                  toast((e as Error).message);
                }
              }}
            >
              加入
            </button>
          </div>
        </div>
      )}
    </>
  );
}

const STICKER: Record<string, string> = { paw: '🐾', heart: '💗', fish: '🐟', flower: '🌸', star: '⭐', sun: '☀️', moon: '🌙', leaf: '🍃', cake: '🍰', music: '🎵' };

function Notes() {
  const cat = activeCat()!;
  const [list, setList] = useState<any[] | null>(null);
  useEffect(() => {
    api<any[]>('GET', `/api/notes/${cat.id}`).then(setList).catch(() => setList([]));
  }, []);
  if (!list) return <div class="empty">…</div>;
  if (!list.length) return <div class="empty">门口还没有纸条。有猫猫来串门的话，会留在这里。</div>;
  return (
    <div class="list">
      {list.map((n) => (
        <div key={n.id} class="row">
          <span style={{ fontSize: 28 }}>{STICKER[n.sticker] ?? '🐾'}</span>
          <div class="grow">
            <div class="t1">{n.from_cat ? `${n.from_cat}（${n.from_name}家）` : n.from_name}</div>
            <div class="t2">{n.text || '留下了一个小贴纸'}</div>
            <div class="t2" style={{ fontSize: 11 }}>
              {when(n.ts)}
            </div>
          </div>
          {n.text && <ReportLink kind="note" target={String(n.id)} />}
        </div>
      ))}
    </div>
  );
}

function NotePanel() {
  const v = useStore(ui, (s) => s.visiting);
  const [sticker, setSticker] = useState('paw');
  const [text, setText] = useState('');
  if (!v) return null;
  return (
    <Sheet title={`给${v.cat.name}留张纸条`}>
      <div class="stickers">
        {Object.entries(STICKER).map(([k, e]) => (
          <button key={k} class={sticker === k ? 'on' : ''} onClick={() => setSticker(k)}>
            {e}
          </button>
        ))}
      </div>
      <input class="field" style={{ marginTop: 12 }} maxLength={30} placeholder="写一句温柔的话（可不写）" value={text} onInput={(e) => setText((e.target as HTMLInputElement).value)} />
      <button
        class="btn primary"
        style={{ marginTop: 12, width: '100%' }}
        onClick={async () => {
          try {
            await api('POST', '/api/notes', { catId: v.catId, sticker, text: text.trim() });
            toast('纸条贴在门口啦', '📮');
            ui.set({ panel: null });
          } catch (e) {
            toast((e as Error).message);
          }
        }}
      >
        贴在门口
      </button>
    </Sheet>
  );
}

// ---------------- map ----------------
function MapPanel() {
  const ref = useRef<HTMLCanvasElement>(null);
  const cat = activeCat();
  const catOut = useStore(ui, (s) => s.catOut);
  const world = useMemo(() => getWorld(), []);
  useEffect(() => {
    const c = ref.current!;
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = c.clientWidth;
      const h = (w * WH) / WW;
      c.style.height = `${h}px`;
      c.width = w * dpr;
      c.height = h * dpr;
      const ctx = c.getContext('2d')!;
      ctx.scale(dpr, dpr);
      const s = w / WW;
      const col: Record<number, string> = { [Ter.Grass]: '#cfe6ae', [Ter.Path]: '#ecdcc0', [Ter.Plaza]: '#efe4d2', [Ter.Water]: '#a9d6ec', [Ter.Sand]: '#f4e4bf', [Ter.Field]: '#e6e3a8', [Ter.Forest]: '#a9cf8c', [Ter.Wood]: '#dcb58a', [Ter.Hill]: '#d5ebb4', [Ter.Deep]: '#93c6e3' };
      for (let y = 0; y < WH; y++)
        for (let x = 0; x < WW; x++) {
          ctx.fillStyle = col[world.ter[y * WW + x]];
          ctx.fillRect(x * s, y * s, s + 0.5, s + 0.5);
        }
      ctx.fillStyle = '#c99a6b';
      for (const p of world.props) if (p.k === 'house' || p.k === 'shop') ctx.fillRect(p.x / TILE * s - 2.2 * s, p.y / TILE * s - 4 * s, 4.4 * s, 4 * s);
      ctx.font = `bold ${Math.max(9, s * 3)}px system-ui`;
      ctx.textAlign = 'center';
      for (const p of POIS) {
        const known = cat?.discovered.includes(p.id);
        ctx.fillStyle = known ? '#f08a5d' : 'rgba(74,58,52,0.35)';
        ctx.beginPath();
        ctx.arc(p.x * s, p.y * s, Math.max(3, s * 1.1), 0, 7);
        ctx.fill();
        ctx.fillStyle = known ? '#4a3a34' : 'rgba(74,58,52,0.45)';
        ctx.fillText(known ? p.name : '?', p.x * s, p.y * s - Math.max(5, s * 1.6));
      }
      for (const e of game.world?.catPositions() ?? []) {
        ctx.fillStyle = e.mine ? '#ffd45e' : e.npc ? '#8fc3e8' : '#f49ab0';
        ctx.strokeStyle = '#4a3a34';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(e.x * s, e.y * s, e.mine ? 5 : 2.6, 0, 7);
        ctx.fill();
        ctx.stroke();
      }
      ctx.strokeStyle = '#4a3a34';
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, w - 2, h - 2);
    };
    draw();
    const t = setInterval(draw, 1500);
    return () => clearInterval(t);
  }, []);
  const tap = (e: MouseEvent) => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const tx = ((e.clientX - r.left) / r.width) * WW, ty = ((e.clientY - r.top) / r.height) * WH;
    let best = POIS[0], bd = 1e9;
    for (const p of POIS) {
      const d = Math.hypot(p.x - tx, p.y - ty);
      if (d < bd) {
        bd = d;
        best = p;
      }
    }
    if (bd > 6) return;
    ui.set({ panel: null });
    if (ui.state.scene !== 'world') game.openWorld().then(() => game.world?.goToPoi(best.id));
    else game.world?.goToPoi(best.id);
    toast(catOut ? `${cat?.name}出发去「${best.name}」` : `看看「${best.name}」`, '🗺️');
  };
  const known = POIS.filter((p) => cat?.discovered.includes(p.id)).length;
  return (
    <Sheet title="猫猫小镇地图">
      <canvas ref={ref} class="minimap" onClick={tap as any} />
      <p class="muted" style={{ fontSize: 13 }}>
        已发现 {known}/{POIS.length} 个地方 · 点地图上的地点，{catOut ? '猫猫会走过去' : '镜头会移过去'}
      </p>
    </Sheet>
  );
}

// ---------------- cat profile ----------------
function CatPanel() {
  const me = useStore(ui, (s) => s.me)!;
  const cat = me.cats.find((c) => c.id === me.activeCatId) ?? me.cats[0];
  const [name, setName] = useState(cat.name);
  const age = ageOf(cat.born);
  const bl = bondLevel(cat.stats.bond);
  const p = cat.personality;
  const days = Math.max(1, Math.ceil((Date.now() - cat.born) / 86400000));
  const stat = (label: string, v: number, color = 'var(--leaf)') => (
    <div class="stat">
      <span>{label}</span>
      <span class="meter">
        <i style={{ width: `${Math.round(v)}%`, background: color }} />
      </span>
      <span class="muted">{Math.round(v)}</span>
    </div>
  );
  return (
    <Sheet title="猫猫档案">
      <div class="card" style={{ background: 'var(--cream)', marginBottom: 12 }}>
        <LiveCat genes={cat.genes} outfit={cat.outfit} age={age} height={170} cycle={['sit', 'groom', 'sit_happy', 'loaf']} />
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input class="field" maxLength={8} value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        <button
          class="btn"
          disabled={!name.trim() || name === cat.name}
          onClick={async () => {
            try {
              const r = await api<CatRecord>('POST', `/api/cat/${cat.id}/rename`, { name });
              patchCat(cat.id, { name: r.name });
              if (game.nest) game.nest.cat.name = r.name;
              toast('改好名字啦');
            } catch (e) {
              toast((e as Error).message);
            }
          }}
        >
          改名
        </button>
      </div>
      <div class="list" style={{ marginTop: 12 }}>
        <div class="row">
          <div class="grow">
            <div class="t1">
              {coatName(cat.genes)} · {age < 0.6 ? '小奶猫' : age < 0.9 ? '少年猫' : '成年猫'} · 陪伴第 {days} 天
            </div>
            <div class="t2">性格：{traitWords(p).join('、')}</div>
            <div class="t2">小癖好：{p.quirk}</div>
            <div class="t2">说话风格：{p.voice}</div>
            <div class="t2">
              已探索 {cat.discovered.length}/{POIS.length} 个地方 · 现在{cat.location === 'world' ? '在外面' : '在家'}，{moodWord(cat.stats)}
            </div>
          </div>
        </div>
      </div>
      <div class="sec">羁绊：{bl.name}（Lv.{bl.level}）</div>
      {stat('亲密', Math.min(100, (cat.stats.bond / Math.max(1, bl.next)) * 100), 'var(--pink)')}
      <div class="sec">现在的状态</div>
      {stat('心情', cat.stats.mood, 'var(--gold)')}
      {stat('饱腹', cat.stats.hunger)}
      {stat('精力', cat.stats.energy, 'var(--sky)')}
      {stat('陪伴', cat.stats.social, 'var(--pink)')}
      {stat('干净', cat.stats.clean, '#c7a8f0')}
      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button class="btn" onClick={() => go('wardrobe')}>
          <I.IShirt size={18} />
          衣柜
        </button>
        <button class="btn" onClick={() => go('journal')}>
          <I.IBook size={18} />
          日记
        </button>
        {me.cats.length > 1 && (
          <button
            class="btn"
            onClick={async () => {
              const idx = me.cats.findIndex((c) => c.id === cat.id);
              const next = me.cats[(idx + 1) % me.cats.length];
              await api('POST', '/api/active', { catId: next.id });
              ui.set((s) => ({ me: s.me ? { ...s.me, activeCatId: next.id } : s.me, panel: null }));
              await game.openNest(next.id);
            }}
          >
            切换猫猫
          </button>
        )}
      </div>
    </Sheet>
  );
}

// ---------------- settings ----------------
function SettingsPanel() {
  const me = useStore(ui, (s) => s.me)!;
  const st = me.user.settings;
  const [nick, setNick] = useState(me.user.nickname);
  const save = async (patch: Record<string, unknown>) => {
    try {
      const r = await api('POST', '/api/settings', patch);
      ui.set({ me: r });
      audio.sound = r.user.settings.sound;
      audio.setMusic(r.user.settings.music);
    } catch (e) {
      toast((e as Error).message);
    }
  };
  const enablePush = async () => {
    try {
      if (isMacShell) {
        // the Mac app is always in the menu bar and shows the letters itself
        toMac({ type: 'enableNotifications' });
        await save({ push: true });
        toast('开好啦，猫猫有新信时会在屏幕右上角告诉你', '💌');
        return;
      }
      if (isNative) {
        if (!(await enableNativePush(registerApns))) {
          toast('没有拿到通知权限，可以在系统「设置 → 通知」里打开', 'ℹ️', 5000);
          return;
        }
        await save({ push: true });
        await api('POST', '/api/push/test').catch(() => {});
        toast('开好啦，猫猫偶尔会给你写小纸条', '💌');
        return;
      }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        toast('这个浏览器暂时收不到通知。iPhone 需要先「添加到主屏幕」再打开哦', 'ℹ️', 5000);
        return;
      }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') {
        toast('没有拿到通知权限');
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const { key } = await api<{ key: string }>('GET', '/api/push/key');
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64(key) as BufferSource });
      await api('POST', '/api/push/subscribe', { sub: sub.toJSON() });
      await save({ push: true });
      await api('POST', '/api/push/test').catch(() => {});
      toast('开好啦，猫猫偶尔会给你写小纸条', '💌');
    } catch (e) {
      toast(`开启失败：${(e as Error).message}`);
    }
  };
  const hours = Array.from({ length: 24 }, (_, i) => i);
  return (
    <Sheet title="设置">
      <div class="toggle">
        <span>你的称呼</span>
        <span style={{ display: 'flex', gap: 6 }}>
          <input class="field" style={{ width: 140, minHeight: 38 }} maxLength={12} value={nick} onInput={(e) => setNick((e.target as HTMLInputElement).value)} />
          <button class="btn small" disabled={!nick.trim() || nick === me.user.nickname} onClick={() => save({ nickname: nick })}>
            保存
          </button>
        </span>
      </div>
      <div class="toggle">
        <span>音效（呼噜声、喵喵）</span>
        <button class={`sw ${st.sound ? 'on' : ''}`} aria-label="音效" onClick={() => save({ sound: !st.sound })} />
      </div>
      <div class="toggle">
        <span>背景音乐</span>
        <button class={`sw ${st.music ? 'on' : ''}`} aria-label="音乐" onClick={() => save({ music: !st.music })} />
      </div>
      <div class="toggle">
        <span>
          猫猫的小纸条（通知）
          <div class="muted" style={{ fontSize: 12 }}>
            探险回来、交到朋友时轻轻告诉你，一天最多几次
          </div>
        </span>
        {st.push ? <button class="sw on" aria-label="通知" onClick={() => save({ push: false })} /> : <button class="btn small" onClick={enablePush}>开启</button>}
      </div>
      <div class="toggle">
        <span>安静时段（不打扰）</span>
        <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <select class="field" style={{ width: 76, minHeight: 36, padding: '0 6px' }} value={st.quietStart} onChange={(e) => save({ quietStart: Number((e.target as HTMLSelectElement).value) })}>
            {hours.map((h) => (
              <option value={h}>{h}:00</option>
            ))}
          </select>
          ~
          <select class="field" style={{ width: 76, minHeight: 36, padding: '0 6px' }} value={st.quietEnd} onChange={(e) => save({ quietEnd: Number((e.target as HTMLSelectElement).value) })}>
            {hours.map((h) => (
              <option value={h}>{h}:00</option>
            ))}
          </select>
        </span>
      </div>
      <SecuritySection />
    </Sheet>
  );
}

function urlB64(b64: string): Uint8Array {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const s = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (c) => c.charCodeAt(0));
}

// ---------------- more / help ----------------
function HelpPanel() {
  const entries: [Panel, string, (p: { size?: number }) => any][] = [
    ['cat', '猫猫档案', I.IPaw],
    ['wardrobe', '衣柜', I.IShirt],
    ['journal', '日记', I.IBook],
    ['collection', '收藏册', I.ISparkle],
    ['social', '邻里', I.IPeople],
    ['map', '地图', I.IMap],
    ['shop', '商店', I.IBag],
    ['settings', '设置', I.IGear],
  ];
  return (
    <Sheet title="更多">
      <div class="grid">
        {entries.map(([k, n, Icon]) => (
          <button key={k} class="item" onClick={() => go(k)}>
            <div style={{ height: 48, display: 'flex', alignItems: 'center' }}>
              <Icon size={30} />
            </div>
            <span class="in">{n}</span>
          </button>
        ))}
      </div>
      <div class="sec">小贴士</div>
      <div class="list" style={{ fontSize: 14, lineHeight: 1.8 }}>
        <div>· 点一下猫猫是摸摸，按住拖动是顺毛。睡着的时候摸，它会在梦里打呼噜。</div>
        <div>· 「逗猫」之后，移动鼠标或手指，羽毛会在房间里飞，往墙上举高它会跳起来抓。</div>
        <div>· 「出门」后可以在小镇里看它自己探险；点「接管」就能自己带着它走（键盘 WASD 或拖动屏幕）。</div>
        <div>· 右边的对话按钮可以跟它说话，比如“去河边看看”“回家睡觉”。</div>
        <div>· 它会自己出门、捡回宝贝、交到朋友，晚上一定会回家。你不在的时候它也过得很好，不用担心。</div>
      </div>
    </Sheet>
  );
}

// ---------------- while you were away ----------------
function AwayPanel() {
  const me = useStore(ui, (s) => s.me)!;
  const cat = activeCat()!;
  const away = me.away;
  if (!away) return null;
  const hours = Math.round((Date.now() - away.since) / 3600000);
  return (
    <Sheet title="欢迎回来" onClose={() => (ui.set({ panel: null }), game.tip())}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12 }}>
        <img src={catPortrait(cat.genes, cat.outfit, 72, ageOf(cat.born), 'happy')} alt="" style={{ width: 72, height: 72 }} />
        <div style={{ lineHeight: 1.7 }}>
          你不在的这 {hours >= 24 ? `${Math.round(hours / 24)} 天` : `${Math.max(1, hours)} 个小时`}里，
          <br />
          {cat.name}过得很好，还想告诉你这些事：
        </div>
      </div>
      <div class="list">
        {away.entries.map((e) => (
          <div key={e.id} class="entry">
            <div class="when">{when(e.ts)}</div>
            {e.text}
          </div>
        ))}
      </div>
      <button class="btn primary" style={{ width: '100%', marginTop: 14 }} onClick={() => (ui.set({ panel: null }), game.tip())}>
        摸摸它的头
      </button>
    </Sheet>
  );
}

// ---------------- photo ----------------
function PhotoPanel() {
  const photo = useStore(ui, (s) => s.photo);
  const cat = activeCat();
  if (!photo) return null;
  const name = `猫窝-${cat?.name ?? 'cat'}-${new Date().toISOString().slice(0, 10)}.png`;
  const share = async () => {
    try {
      await saveFile(name, await (await fetch(photo)).blob());
    } catch (e) {
      toast((e as Error).message);
    }
  };
  return (
    <Sheet title="咔嚓！" onClose={() => ui.set({ panel: null, photo: null })}>
      <img src={photo} alt="照片" style={{ width: '100%', borderRadius: 12, border: '2px solid var(--ink)', display: 'block' }} />
      <button class="btn primary" style={{ width: '100%', marginTop: 12 }} onClick={share}>
        <I.IDownload size={18} />
        保存 / 分享
      </button>
    </Sheet>
  );
}

export function Panels() {
  const panel = useStore(ui, (s) => s.panel);
  switch (panel) {
    case 'feed':
      return <FeedPanel />;
    case 'shop':
      return <ShopPanel />;
    case 'wardrobe':
      return <WardrobePanel />;
    case 'journal':
      return <JournalPanel />;
    case 'letters':
      return <LettersPanel />;
    case 'collection':
      return <CollectionPanel />;
    case 'social':
      return <SocialPanel />;
    case 'map':
      return <MapPanel />;
    case 'cat':
      return <CatPanel />;
    case 'settings':
      return <SettingsPanel />;
    case 'note':
      return <NotePanel />;
    case 'help':
      return <HelpPanel />;
    case 'away':
      return <AwayPanel />;
    case 'photo':
      return <PhotoPanel />;
    case 'protect':
      return <ProtectPanel />;
    case 'privacy':
      return <PrivacyPanel />;
    default:
      return null;
  }
}

export { ZONE_NAME };
