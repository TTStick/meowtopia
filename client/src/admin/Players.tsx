// 玩家: the people of the town, gently. A roster to look through, a page per person
// with what caring for them needs, letters instead of levers, and the test tools
// folded away at the bottom.
import { useEffect, useState } from 'preact/hooks';
import { adminApi, type PlayerDetail, type PlayerFilter, type PlayerPage, type PlayerRow } from './api';

const FILTERS: [PlayerFilter, string][] = [
  ['all', '全部'],
  ['today', '今天来过'],
  ['week', '这周来过'],
  ['new', '新来的'],
  ['secured', '猫窝上了锁'],
  ['paused', '暂停中'],
];
const SORTS: [string, string][] = [['recent', '最近来过'], ['new', '最新加入'], ['name', '按称呼']];

const fmt = (n: number) => n.toLocaleString('zh-CN');
function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  if (m < 1440) return `${Math.floor(m / 60)} 小时前`;
  const d = Math.floor(m / 1440);
  return d < 30 ? `${d} 天前` : new Date(t).toLocaleDateString('zh-CN');
}
const date = (t: number) => new Date(t).toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });
const days = (t: number) => Math.max(1, Math.ceil((Date.now() - t) / 86400000));
const sprite = (id: string, size = 64) => `/api/sprite/cat/${encodeURIComponent(id)}/sit?size=${size}`;

export function Players() {
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<PlayerFilter>('all');
  const [sort, setSort] = useState('recent');
  const [page, setPage] = useState(0);
  const [data, setData] = useState<PlayerPage | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  const load = (over: Partial<{ q: string; filter: PlayerFilter; sort: string; page: number }> = {}) => {
    const p = { q, filter, sort, page, ...over };
    const qs = new URLSearchParams({ q: p.q.trim(), filter: p.filter, sort: p.sort, page: String(p.page) });
    return adminApi<PlayerPage>('GET', `/players?${qs}`).then((x) => (setData(x), setErr('')), (e) => setErr(e.message));
  };
  useEffect(() => {
    void load();
  }, [filter, sort, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div class="people">
      <div class="people-head">
        <div>
          <h2>小镇里的铲屎官</h2>
          {data && <p class="muted">一共 {fmt(data.counts.all)} 位，今天来过 {fmt(data.counts.today)} 位</p>}
        </div>
        <form class="search" onSubmit={(e) => (e.preventDefault(), setPage(0), void load({ page: 0 }))}>
          <input class="field" placeholder="找一位铲屎官：称呼、猫的名字或 ID" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <button class="btn">找找</button>
        </form>
      </div>

      <div class="people-tools">
        <div class="chips">
          {FILTERS.map(([f, name]) => (
            <button key={f} class={filter === f ? 'chip-btn on' : 'chip-btn'} onClick={() => (setFilter(f), setPage(0))}>
              {name}
              {data && <span class="n">{fmt(data.counts[f])}</span>}
            </button>
          ))}
        </div>
        <label class="sort">
          <select class="field" value={sort} onChange={(e) => (setSort((e.target as HTMLSelectElement).value), setPage(0))}>
            {SORTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
          </select>
        </label>
      </div>

      {err && <p class="error">{err}</p>}
      {!data ? (
        <p class="muted">正在翻名册…</p>
      ) : !data.rows.length ? (
        <div class="card empty">{q.trim() ? '没有找到这位铲屎官。' : '这里还没有人。'}</div>
      ) : (
        <div class="roster">
          {data.rows.map((p) => <Row key={p.id} p={p} onOpen={() => setOpen(p.id)} />)}
        </div>
      )}

      {data && pages > 1 && (
        <div class="pager">
          <button class="btn small" disabled={page === 0} onClick={() => setPage(page - 1)}>上一页</button>
          <span class="muted">第 {page + 1} / {pages} 页</span>
          <button class="btn small" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>下一页</button>
        </div>
      )}

      <p class="muted small privacy">这里只有照顾小镇需要的信息：看不到交换日记和门口纸条的内容，也看不到任何人的找回码和密钥。</p>

      <TestTools />

      {open && <Detail uid={open} onClose={() => setOpen(null)} onChanged={() => void load()} />}
    </div>
  );
}

function Row({ p, onOpen }: { p: PlayerRow; onOpen: () => void }) {
  return (
    <button class={p.banned ? 'person paused' : 'person'} onClick={onOpen}>
      <span class="faces">
        {p.cats.length ? p.cats.slice(0, 3).map((c) => <img key={c.id} src={sprite(c.id, 48)} width="48" height="48" alt="" loading="lazy" />) : <span class="no-cat">🐾</span>}
      </span>
      <span class="who">
        <b>{p.nickname}</b>
        <small>{p.cats.length ? p.cats.map((c) => `${c.name}（${c.stage}${c.out ? '，在小镇里' : ''}${c.shared ? '，共养' : ''}）`).join('、') : '还没有领养小猫'}</small>
      </span>
      <span class="when">
        {p.online ? <span class="here">● 正在玩</span> : <span>{ago(p.lastSeen)}来过</span>}
        <small>加入于 {new Date(p.created).toLocaleDateString('zh-CN')}</small>
      </span>
      <span class="tags">
        {p.secured && <span class="tag soft">已上锁</span>}
        {!!p.banned && <span class="tag warn">暂停中</span>}
      </span>
    </button>
  );
}

// ---------- one person ----------
function Detail({ uid, onClose, onChanged }: { uid: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<PlayerDetail | null>(null);
  const [err, setErr] = useState('');
  const load = () => adminApi<PlayerDetail>('GET', `/players/${encodeURIComponent(uid)}`).then(setD, (e) => setErr(e.message));
  useEffect(() => {
    void load();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [uid]);
  const changed = () => {
    void load();
    onChanged();
  };
  return (
    <div class="drawer-wrap" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <aside class="drawer" role="dialog" aria-label="玩家详情">
        <button class="link close" onClick={onClose}>关闭</button>
        {!d ? (
          <p class="muted">{err || '正在打开…'}</p>
        ) : (
          <>
            <header class="d-head">
              <h3>{d.nickname}</h3>
              <p class="muted">
                {d.online ? <span class="here">● 正在玩</span> : `${ago(d.lastSeen)}来过`} · 来到小镇第 {days(d.created)} 天（{date(d.created)}）
              </p>
              {d.banned && <p class="tag warn">账号暂停中{d.banReason ? `：${d.banReason}` : ''}</p>}
            </header>

            {d.cats.length ? d.cats.map((c) => <CatCard key={c.id} c={c} onRenamed={changed} />) : <p class="muted">还没有领养小猫。</p>}

            <section class="d-sec">
              <h4>账号</h4>
              <dl class="kv">
                <dt>猫窝的锁</dt>
                <dd>{d.recoveryCode || d.passkeys ? [d.recoveryCode && '找回码', d.passkeys && `${d.passkeys} 个通行密钥`].filter(Boolean).join('、') : '还没上锁（换设备会找不回来）'}</dd>
                <dt>登录着的设备</dt>
                <dd>{d.devices} 台</dd>
                <dt>小纸条通知</dt>
                <dd>{d.notifications ? '开着' : '没开'}</dd>
                <dt>小鱼干</dt>
                <dd>{fmt(d.fish)}</dd>
                <dt>背包</dt>
                <dd>{fmt(d.items)} 件东西 · 收藏册 {d.collection.found} / {d.collection.total}</dd>
              </dl>
            </section>

            <Letter uid={d.id} name={d.nickname} onSent={changed} />
            <Pause d={d} onChanged={changed} />
            <p class="mono muted">{d.id}</p>
          </>
        )}
      </aside>
    </div>
  );
}

function CatCard({ c, onRenamed }: { c: PlayerDetail['cats'][number]; onRenamed: () => void }) {
  const bar = (label: string, v: number) => (
    <div class="bar-row">
      <span>{label}</span>
      <i><b style={{ width: `${Math.max(0, Math.min(100, v))}%` }} /></i>
    </div>
  );
  const rename = async () => {
    const name = prompt(`给「${c.name}」换一个名字（最多 8 个字）。只在名字不合适时这样做哦。`, c.name)?.trim();
    if (!name || name === c.name) return;
    try {
      await adminApi('POST', '/rename-cat', { cat: c.id, name });
      onRenamed();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  return (
    <section class="d-cat">
      <img src={sprite(c.id, 96)} width="96" height="96" alt="" />
      <div class="d-cat-info">
        <div class="row between">
          <b>{c.name}</b>
          <span class="muted small">{c.stage} · {c.mood}</span>
        </div>
        <p class="muted small">现在在{c.place} · 去过 {c.discovered} / {c.places} 个地方 · 羁绊：{c.bond.name}（{c.bond.level} 级）{c.partner ? ` · 和「${c.partner}」一起养` : ''}</p>
        {bar('饱腹', c.stats.hunger)}
        {bar('精力', c.stats.energy)}
        {bar('心情', c.stats.mood)}
        <button class="link small" onClick={rename}>名字不太合适？帮它改一个</button>
      </div>
    </section>
  );
}

const FISH = [0, 50, 100, 200];
function Letter({ uid, name, onSent }: { uid: string; name: string; onSent: () => void }) {
  const [text, setText] = useState('');
  const [fish, setFish] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const send = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    try {
      await adminApi('POST', `/players/${encodeURIComponent(uid)}/letter`, { text, fish });
      setMsg(`寄出去了。${name}会在信箱里收到它${fish ? `，还有 ${fish} 小鱼干` : ''}。`);
      setText('');
      setFish(0);
      onSent();
    } catch (x) {
      setMsg((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form class="d-sec letter" onSubmit={send}>
      <h4>寄一封小纸条</h4>
      <p class="muted small">以小镇的名义寄到 ta 的信箱，比如谢谢 ta 报告了问题，或者节日问个好。</p>
      <textarea class="field" rows={3} maxLength={200} placeholder="写点温柔的话…" value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
      <div class="row">
        <span class="muted small">随信附上</span>
        {FISH.map((n) => (
          <label key={n} class={fish === n ? 'pill on' : 'pill'}>
            <input type="radio" name="fish" checked={fish === n} onChange={() => setFish(n)} />
            {n ? `${n} 小鱼干` : '不附'}
          </label>
        ))}
        <span class="spacer" />
        <button class="btn primary small" disabled={busy || !text.trim()}>{busy ? '正在寄…' : '寄出'}</button>
      </div>
      {msg && <p class="ok small">{msg}</p>}
    </form>
  );
}

/** Pausing is the last resort, so it sits quietly at the bottom and asks why. */
function Pause({ d, onChanged }: { d: PlayerDetail; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const act = async (body: object) => {
    try {
      await adminApi('POST', '/ban', { user: d.id, ...body });
      setOpen(false);
      setReason('');
      onChanged();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  if (d.banned)
    return (
      <section class="d-sec quiet">
        <p class="muted small">这个账号暂停中。想好了，就让 ta 回来吧。</p>
        <button class="btn small" onClick={() => act({ unban: true })}>恢复账号</button>
      </section>
    );
  return (
    <section class="d-sec quiet">
      {!open ? (
        <button class="link small muted" onClick={() => setOpen(true)}>暂停这个账号…</button>
      ) : (
        <div class="pause-box">
          <p class="small">暂停后 ta 会退出登录，猫会回到窝里，暂停期间不会出现在小镇和串门列表里；以后可以随时恢复，数据都还在。</p>
          <input class="field" maxLength={60} placeholder="原因（必填，比如：多次留下不友善的纸条）" value={reason} onInput={(e) => setReason((e.target as HTMLInputElement).value)} />
          <div class="row">
            <button class="btn small danger" disabled={!reason.trim()} onClick={() => act({ reason: reason.trim() })}>确定暂停</button>
            <button class="link small" onClick={() => setOpen(false)}>算了</button>
          </div>
        </div>
      )}
    </section>
  );
}

// ---------- folded away: for your own test accounts ----------
function TestTools() {
  const [q, setQ] = useState('');
  const [found, setFound] = useState<{ id: string; name: string; owner: string }[] | null>(null);
  const [msg, setMsg] = useState('');
  const find = async (e: Event) => {
    e.preventDefault();
    const res = await adminApi<PlayerPage>('GET', `/players?q=${encodeURIComponent(q.trim())}`);
    setFound(res.rows.flatMap((p) => p.cats.filter((c) => !q.trim() || c.name.includes(q.trim()) || c.id === q.trim()).map((c) => ({ id: c.id, name: c.name, owner: p.nickname }))));
    setMsg('');
  };
  const unlock = async (c: { id: string; name: string; owner: string }) => {
    if (!confirm(`给「${c.name}」（${c.owner}）解锁全部内容？\n\n商店里所有东西放进背包、收藏册集满、小镇全部地点都去过、小鱼干补到 9999。只用于自己的测试账号，做了不能撤回。`)) return;
    try {
      const r = await adminApi<{ items: number; places: number; collectibles: number; fish: number }>('POST', '/unlock', { cat: c.id });
      setMsg(`「${c.name}」解锁好了：新增 ${r.items} 件物品、${r.collectibles} 种收藏品、${r.places} 个地点，小鱼干 ${fmt(r.fish)}。重新打开游戏就能看到。`);
    } catch (e) {
      setMsg((e as Error).message);
    }
  };
  return (
    <details class="devtools">
      <summary>测试工具</summary>
      <div class="devtools-body">
        <p class="muted small">给自己的测试账号解锁全部内容，方便先体验装修、换装、收藏和整张地图。不会改变猫的年龄和羁绊。</p>
        <form class="row" onSubmit={find}>
          <input class="field grow" placeholder="猫的名字或 ID" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} />
          <button class="btn small" disabled={!q.trim()}>找这只猫</button>
        </form>
        {found && !found.length && <p class="muted small">没有找到。</p>}
        {found?.map((c) => (
          <div key={c.id} class="row tool-cat">
            <img src={sprite(c.id, 40)} width="40" height="40" alt="" />
            <span>{c.name}<small class="muted">（{c.owner}）</small></span>
            <span class="spacer" />
            <button class="btn small" onClick={() => unlock(c)}>解锁全部内容</button>
          </div>
        ))}
        {msg && <p class="ok small">{msg}</p>}
      </div>
    </details>
  );
}
