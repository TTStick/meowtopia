// 猫窝 admin panel (/admin/): sign in with the server's admin token.
import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './admin.css';
import { adminApi, signedOut, type LlmSettings, type LlmUsage, type Overview, type Report, type Effort } from './api';
import { Sandbox } from './Sandbox';

type Tab = 'overview' | 'sandbox' | 'model' | 'reports';
const TABS: [Tab, string][] = [['overview', '概览'], ['sandbox', '沙盘'], ['model', '模型'], ['reports', '举报']];

function App() {
  const [state, setState] = useState<'checking' | 'out' | 'in'>('checking');
  const [tab, setTab] = useState<Tab>(() => (location.hash.slice(1) as Tab) || 'overview');
  useEffect(() => {
    adminApi('GET', '/me').then(() => setState('in'), () => setState('out'));
    const out = () => setState('out');
    signedOut.addEventListener('out', out);
    return () => signedOut.removeEventListener('out', out);
  }, []);
  useEffect(() => {
    history.replaceState(null, '', `#${tab}`);
  }, [tab]);
  if (state === 'checking') return <div class="center muted">正在打开…</div>;
  if (state === 'out') return <Login onIn={() => setState('in')} />;
  const logout = async () => {
    await adminApi('POST', '/logout').catch(() => {});
    setState('out');
  };
  return (
    <div class="shell">
      <header class="top">
        <a class="brand" href="/" title="回到官网">
          <span class="logo">猫窝</span>
          <span>管理面板</span>
        </a>
        <nav>
          {TABS.map(([id, name]) => (
            <button key={id} class={tab === id ? 'tab on' : 'tab'} onClick={() => setTab(id)}>{name}</button>
          ))}
        </nav>
        <span class="spacer" />
        <a class="link" href="/play/" target="_blank" rel="noopener">进游戏</a>
        <button class="link" onClick={logout}>退出</button>
      </header>
      <main class={tab === 'sandbox' ? 'page wide' : 'page'}>
        {tab === 'overview' && <OverviewTab go={setTab} />}
        {tab === 'sandbox' && <Sandbox />}
        {tab === 'model' && <ModelTab />}
        {tab === 'reports' && <ReportsTab />}
      </main>
    </div>
  );
}

// ---------------- sign in ----------------
function Login({ onIn }: { onIn: () => void }) {
  const [token, setToken] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await adminApi('POST', '/login', { token });
      onIn();
    } catch (x) {
      setErr((x as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="center">
      <form class="card login" onSubmit={submit}>
        <div class="logo big">猫窝</div>
        <h1>管理面板</h1>
        <p class="muted">输入服务器 <code>.env</code> 里的 <code>CAT_ADMIN_TOKEN</code>。登录在这台电脑上保持一天。</p>
        <input class="field" type="password" autocomplete="current-password" placeholder="管理口令" value={token} onInput={(e) => setToken((e.target as HTMLInputElement).value)} autofocus />
        {err && <p class="error">{err}</p>}
        <button class="btn primary" disabled={busy || !token.trim()}>{busy ? '正在登录…' : '登录'}</button>
        <p class="muted small">忘了口令？在服务器上运行 <code>grep CAT_ADMIN_TOKEN /opt/catnest/.env</code></p>
      </form>
    </div>
  );
}

// ---------------- overview ----------------
const fmt = (n: number) => n.toLocaleString('zh-CN');
const bytes = (n: number) => (n > 1 << 30 ? `${(n / (1 << 30)).toFixed(1)} GB` : n > 1 << 20 ? `${(n / (1 << 20)).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`);
const uptime = (s: number) => (s < 3600 ? `${Math.floor(s / 60)} 分钟` : s < 86400 ? `${Math.floor(s / 3600)} 小时` : `${Math.floor(s / 86400)} 天 ${Math.floor((s % 86400) / 3600)} 小时`);

function OverviewTab({ go }: { go: (t: Tab) => void }) {
  const [o, setO] = useState<Overview | null>(null);
  const [err, setErr] = useState('');
  useEffect(() => {
    const load = () => adminApi<Overview>('GET', '/overview').then((x) => (setO(x), setErr('')), (e) => setErr(e.message));
    void load();
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, []);
  if (!o) return <p class="muted">{err || '正在读取…'}</p>;
  const stat = (label: string, value: string | number, sub?: string, accent = false) => (
    <div class={accent ? 'stat accent' : 'stat'}>
      <div class="v">{typeof value === 'number' ? fmt(value) : value}</div>
      <div class="l">{label}</div>
      {sub && <div class="s">{sub}</div>}
    </div>
  );
  return (
    <>
      <section>
        <h2>现在</h2>
        <div class="stats">
          {stat('在线玩家', o.online.players, `今天最多 ${o.online.peakToday} 人同时在线`, true)}
          {stat('路过的游客', o.online.guests, '没登录、只在看小镇')}
          {stat('出门玩的猫', o.online.catsInTown, `玩家的猫；另有 ${o.online.townCats} 只小镇的猫、${o.online.residents} 位居民`)}
          {stat('待处理举报', o.reports, o.reports ? '去「举报」里看看' : '一切安好')}
        </div>
      </section>
      <section>
        <h2>玩家</h2>
        <div class="stats">
          {stat('注册玩家', o.users.total, `一共养了 ${fmt(o.cats.total)} 只猫`)}
          {stat('今天来过', o.users.activeToday, `7 天 ${fmt(o.users.active7d)} · 30 天 ${fmt(o.users.active30d)}`)}
          {stat('今天新来', o.users.newToday, `最近 7 天 ${fmt(o.users.new7d)}`)}
          {stat('给猫窝上了锁', o.users.secured, `占 ${o.users.total ? Math.round((o.users.secured / o.users.total) * 100) : 0}%${o.users.banned ? ` · 封禁 ${o.users.banned}` : ''}`)}
        </div>
      </section>
      <section>
        <h2>最近两周</h2>
        <div class="card"><Chart days={o.days} /></div>
      </section>
      <section class="two">
        <div class="card">
          <h3>猫猫的语言模型</h3>
          <p>{o.llm.active ? <span class="ok">● 正在使用 {o.llm.model}</span> : <span class="off">● 没有开启（用内置的句子）</span>}</p>
          <p class="muted">今天调用 {fmt(o.llm.calls)} 次{o.llm.failed ? `，失败 ${o.llm.failed} 次` : ''}{o.llm.cost != null ? `，约 ${o.llm.currency}${o.llm.cost.toFixed(2)}` : ''}</p>
          <button class="btn small" onClick={() => go('model')}>去配置</button>
        </div>
        <div class="card">
          <h3>服务器</h3>
          <dl class="kv">
            <dt>已运行</dt><dd>{uptime(o.server.uptime)}</dd>
            <dt>内存</dt><dd>{bytes(o.server.rss)}</dd>
            <dt>数据库</dt><dd>{bytes(o.server.dbBytes)}</dd>
            <dt>小镇时区</dt><dd>UTC{o.server.worldTz >= 0 ? '+' : ''}{o.server.worldTz}</dd>
            <dt>Node.js</dt><dd>{o.server.node}</dd>
          </dl>
        </div>
      </section>
    </>
  );
}

/** Bars: new players per day. Line: players who came that day. Dots: most online at once. */
function Chart({ days }: { days: Overview['days'] }) {
  const W = 760, H = 220, pad = 30, bw = (W - pad * 2) / days.length;
  const max = Math.max(4, ...days.map((d) => Math.max(d.newUsers, d.active ?? 0, d.peak ?? 0)));
  const y = (v: number) => H - pad - (v / max) * (H - pad * 2);
  const pts = days.map((d, i) => (d.active == null ? null : `${pad + bw * i + bw / 2},${y(d.active)}`)).filter(Boolean);
  return (
    <div class="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="最近两周的玩家数量">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={pad} x2={W - pad} y1={y(max * f)} y2={y(max * f)} class="grid" />
            <text x={pad - 6} y={y(max * f) + 4} class="axis" text-anchor="end">{Math.round(max * f)}</text>
          </g>
        ))}
        {days.map((d, i) => (
          <g key={d.day}>
            <rect x={pad + bw * i + bw * 0.22} y={y(d.newUsers)} width={bw * 0.56} height={H - pad - y(d.newUsers)} class="bar"><title>{`${d.day} 新来 ${d.newUsers}`}</title></rect>
            {d.peak != null && <rect x={pad + bw * i + bw / 2 - 3} y={y(d.peak) - 3} width="6" height="6" class="peak"><title>{`${d.day} 最多同时在线 ${d.peak}`}</title></rect>}
            {i % 2 === days.length % 2 && <text x={pad + bw * i + bw / 2} y={H - 10} class="axis" text-anchor="middle">{d.day}</text>}
          </g>
        ))}
        {pts.length > 1 && <polyline points={pts.join(' ')} class="line" />}
      </svg>
      <div class="chart-legend">
        <span><i class="bar" />当天新来的玩家</span>
        <span><i class="line" />当天来过的玩家</span>
        <span><i class="peak" />最多同时在线</span>
      </div>
      <p class="muted small">“来过”和“同时在线”从开启管理面板后开始记录，更早的日子只有新玩家数。</p>
    </div>
  );
}

// ---------------- model ----------------
const MODELS: { id: string; name: string; note: string; price: string }[] = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', note: '默认。猫说的话最有灵气', price: '$4 / $20' },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', note: '又快又好，便宜一半', price: '$2 / $10' },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', note: '最快、最省钱，玩家多时适合', price: '$0.10 / $0.50' },
  { id: 'claude-fable-5-1', name: 'Claude Fable 5.1', note: '最强，也最贵', price: '$10 / $50' },
];
const EFFORTS: [Effort, string][] = [['low', '低（推荐：又快又省）'], ['medium', '中'], ['high', '高']];

function ModelTab() {
  const [s, setS] = useState<LlmSettings | null>(null);
  const [u, setU] = useState<LlmUsage | null>(null);
  const [form, setForm] = useState<Partial<LlmSettings> & { newKey?: string; custom?: string }>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text?: string; error?: string; ms: number; model: string } | null>(null);
  const [busy, setBusy] = useState('');
  const load = (x: { settings: LlmSettings; usage: LlmUsage }) => {
    setS(x.settings);
    setU(x.usage);
    const known = MODELS.some((m) => m.id === x.settings.model);
    setForm({ enabled: x.settings.enabled, model: known ? x.settings.model : 'custom', custom: known ? '' : x.settings.model, baseURL: x.settings.baseURL, effort: x.settings.effort, rpm: x.settings.rpm, daily: x.settings.daily, userDaily: x.settings.userDaily, priceIn: x.settings.priceIn, priceOut: x.settings.priceOut, currency: x.settings.currency, newKey: '' });
  };
  useEffect(() => {
    adminApi<{ settings: LlmSettings; usage: LlmUsage }>('GET', '/llm').then(load, (e) => setMsg({ ok: false, text: e.message }));
    const t = setInterval(() => adminApi<{ settings: LlmSettings; usage: LlmUsage }>('GET', '/llm').then((x) => setU(x.usage), () => {}), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!s || !u) return <p class="muted">{msg?.text ?? '正在读取…'}</p>;
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));
  const payload = () => ({
    enabled: form.enabled,
    model: form.model === 'custom' ? form.custom?.trim() : form.model,
    baseURL: form.baseURL ?? '',
    effort: form.effort,
    rpm: form.rpm,
    daily: form.daily,
    userDaily: form.userDaily,
    priceIn: form.priceIn,
    priceOut: form.priceOut,
    currency: form.currency,
    ...(form.newKey?.trim() ? { apiKey: form.newKey.trim() } : {}),
  });
  const run = async (what: string, fn: () => Promise<void>) => {
    setBusy(what);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    } finally {
      setBusy('');
    }
  };
  const save = () => run('save', async () => {
    load(await adminApi('PUT', '/llm', payload()));
    setMsg({ ok: true, text: '保存好了，马上生效' });
  });
  const tryIt = () => run('test', async () => {
    setTest(null);
    setTest(await adminApi('POST', '/llm/test', payload()));
  });
  const useEnvKey = () => run('key', async () => {
    load(await adminApi('PUT', '/llm', { apiKey: '' }));
    setMsg({ ok: true, text: '改回使用 .env 里的 Key 了' });
  });
  const reset = () => {
    if (!confirm('把模型设置全部恢复成 .env 里的默认值？面板里保存的 Key 也会清掉。')) return;
    void run('reset', async () => {
      load(await adminApi('POST', '/llm/reset'));
      setMsg({ ok: true, text: '已经恢复默认' });
    });
  };
  const keyNote = s.keySource === 'panel' ? '用的是在面板里保存的 Key' : s.keySource === 'env' ? '用的是服务器 .env 里的 ANTHROPIC_API_KEY' : '还没有 Key：猫猫会用内置的句子说话';

  return (
    <div class="model">
      <section class="card">
        <div class="row between">
          <h3>Claude 生成猫猫说的话</h3>
          <label class="switch">
            <input type="checkbox" checked={!!form.enabled} onChange={(e) => set({ enabled: (e.target as HTMLInputElement).checked })} />
            <span>{form.enabled ? '开启' : '关闭'}</span>
          </label>
        </div>
        <p class="muted">开启后，猫说的话、猫和猫的对话、居民闲聊、探险日记和小纸条都由 Claude 结合性格和记忆生成；关闭或没有 Key 时用内置的句子，游戏照样完整可玩。</p>
        <p class={s.active ? 'ok' : 'off'}>● {s.active ? `现在正在使用 ${s.model}` : '现在没有使用模型'}</p>
      </section>

      <section class="card">
        <h3>API Key</h3>
        <p class="muted">{keyNote}{s.apiKey ? `：${s.apiKey}` : ''}</p>
        <input class="field" type="password" autocomplete="off" placeholder={s.apiKey ? '要换一个 Key 才填，留空就不变' : 'sk-ant-…'} value={form.newKey} onInput={(e) => set({ newKey: (e.target as HTMLInputElement).value })} />
        {s.keySource === 'panel' && <button class="link" onClick={useEnvKey} disabled={!!busy}>改回使用 .env 里的 Key</button>}
        <p class="muted small">Key 保存在服务器的数据库里（和存档放在一起），这个页面只会显示开头和结尾几位。</p>
      </section>

      <section class="card">
        <h3>模型</h3>
        <div class="models">
          {MODELS.map((m) => (
            <label key={m.id} class={form.model === m.id ? 'model-card on' : 'model-card'}>
              <input type="radio" name="model" checked={form.model === m.id} onChange={() => set({ model: m.id })} />
              <b>{m.name}</b>
              <span>{m.note}</span>
              <small>每百万 tokens 输入 / 输出 {m.price}</small>
            </label>
          ))}
          <label class={form.model === 'custom' ? 'model-card on' : 'model-card'}>
            <input type="radio" name="model" checked={form.model === 'custom'} onChange={() => set({ model: 'custom' })} />
            <b>其他模型</b>
            <span>兼容 Anthropic API 的模型也可以，比如 MiniMax：下面的 API 地址填服务商给的地址</span>
            <input class="field" placeholder="模型 ID，例如 MiniMax-M3.1" value={form.custom} onFocus={() => set({ model: 'custom' })} onInput={(e) => set({ custom: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
        {form.model === 'custom' && (
          <div class="grid3 price">
            <label><span>输入价格（每百万 tokens）</span><input class="field" type="number" min="0" step="0.01" value={form.priceIn || ''} placeholder="不填就不估算" onInput={(e) => set({ priceIn: Number((e.target as HTMLInputElement).value) })} /></label>
            <label><span>输出价格（每百万 tokens）</span><input class="field" type="number" min="0" step="0.01" value={form.priceOut || ''} placeholder="不填就不估算" onInput={(e) => set({ priceOut: Number((e.target as HTMLInputElement).value) })} /></label>
            <label><span>货币</span>
              <select class="field" value={form.currency} onChange={(e) => set({ currency: (e.target as HTMLSelectElement).value as '$' | '¥' })}>
                <option value="¥">人民币 ¥</option>
                <option value="$">美元 $</option>
              </select>
            </label>
          </div>
        )}
        <div class="grid3">
          <label>
            <span>思考力度（effort，只对 Claude 生效）</span>
            <select class="field" value={form.effort} onChange={(e) => set({ effort: (e.target as HTMLSelectElement).value as Effort })}>
              {EFFORTS.map(([v, n]) => <option key={v} value={v}>{n}</option>)}
            </select>
          </label>
          <label class="span2">
            <span>API 地址（用 Claude 官方接口时不用填）</span>
            <input class="field" placeholder="https://api.anthropic.com" value={form.baseURL} onInput={(e) => set({ baseURL: (e.target as HTMLInputElement).value })} />
          </label>
        </div>
      </section>

      <section class="card">
        <h3>用量上限</h3>
        <p class="muted">超过上限后猫猫会改用内置的句子说话，不会卡住，也不会多花钱。</p>
        <div class="grid3">
          <label><span>全服每分钟</span><input class="field" type="number" min="1" value={form.rpm} onInput={(e) => set({ rpm: Number((e.target as HTMLInputElement).value) })} /></label>
          <label><span>全服每天</span><input class="field" type="number" min="0" value={form.daily} onInput={(e) => set({ daily: Number((e.target as HTMLInputElement).value) })} /></label>
          <label><span>每位玩家每天</span><input class="field" type="number" min="0" value={form.userDaily} onInput={(e) => set({ userDaily: Number((e.target as HTMLInputElement).value) })} /></label>
        </div>
        <p class="muted small">.env 里的默认值：{s.defaults.model}，每分钟 {s.defaults.rpm}、每天 {s.defaults.daily}、每人每天 {s.defaults.userDaily}。</p>
      </section>

      <div class="actions">
        <button class="btn primary" onClick={save} disabled={!!busy}>{busy === 'save' ? '正在保存…' : '保存设置'}</button>
        <button class="btn" onClick={tryIt} disabled={!!busy}>{busy === 'test' ? '正在问 Claude…' : '用这些设置试一句'}</button>
        <span class="spacer" />
        <button class="link" onClick={reset} disabled={!!busy}>恢复 .env 默认</button>
      </div>
      {msg && <p class={msg.ok ? 'ok' : 'error'}>{msg.text}</p>}
      {test && (
        <div class={test.ok ? 'card test ok-box' : 'card test err-box'}>
          {test.ok ? (
            <>
              <p class="quote">“{test.text}”</p>
              <p class="muted small">{test.model} · {(test.ms / 1000).toFixed(1)} 秒 · 测试不会保存设置</p>
            </>
          ) : (
            <p>没成功：{test.error}<span class="muted small">（{test.model}）</span></p>
          )}
        </div>
      )}

      <section class="card">
        <h3>今天的用量</h3>
        <div class="stats small">
          <div class="stat"><div class="v">{fmt(u.calls)}</div><div class="l">调用次数</div><div class="s">成功 {u.ok} · 失败 {u.failed}</div></div>
          <div class="stat"><div class="v">{fmt(u.input + u.cacheRead + u.cacheWrite)}</div><div class="l">输入 tokens</div><div class="s">其中缓存命中 {fmt(u.cacheRead)}</div></div>
          <div class="stat"><div class="v">{fmt(u.output)}</div><div class="l">输出 tokens</div><div class="s">{u.avgMs ? `平均 ${(u.avgMs / 1000).toFixed(1)} 秒一次` : '—'}</div></div>
          <div class="stat"><div class="v">{u.cost != null ? `${u.currency}${u.cost.toFixed(2)}` : '—'}</div><div class="l">估算花费</div><div class="s">{u.cost != null ? '按标价粗算' : '其他模型：在上面填上价格就能估算'}</div></div>
        </div>
        <p class="muted small">这一分钟已用 {u.budget.minute}/{u.budget.rpm}，今天已用 {u.budget.today}/{u.budget.daily}。服务器重启后今天的用量从零开始算。</p>
        {u.lastError && <p class="error small">最近一次出错：{u.lastError}（{new Date(u.lastErrorAt!).toLocaleTimeString('zh-CN')}）</p>}
      </section>
    </div>
  );
}

// ---------------- reports ----------------
const KIND: Record<string, string> = { cat: '猫的名字', note: '门口的纸条', diary: '交换日记', user: '玩家' };
function ReportsTab() {
  const [list, setList] = useState<Report[] | null>(null);
  const [err, setErr] = useState('');
  const load = () => adminApi<Report[]>('GET', '/reports').then(setList, (e) => setErr(e.message));
  useEffect(() => {
    void load();
  }, []);
  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
    } catch (e) {
      alert((e as Error).message);
    }
  };
  if (!list) return <p class="muted">{err || '正在读取…'}</p>;
  if (!list.length) return <div class="card empty">没有待处理的举报，小镇很和平。</div>;
  return (
    <div class="reports">
      {list.map((r) => (
        <div key={r.id} class="card report">
          <div class="row between">
            <b>#{r.id} · {KIND[r.kind] ?? r.kind}</b>
            <span class="muted small">{new Date(r.ts).toLocaleString('zh-CN', { hour12: false })}</span>
          </div>
          {r.detail && <p class="quote">“{r.detail}”</p>}
          <p class="muted small">理由：{r.reason || '没写'} · 作者 {r.target_user ?? '—'} · 举报人 {r.reporter}</p>
          <div class="row">
            <button class="btn small" onClick={() => act(() => adminApi('POST', '/resolve', { id: r.id }))}>处理完了</button>
            {r.target_user && (
              <button class="btn small danger" onClick={() => confirm(`封禁这位玩家（${r.target_user}）？对方会马上下线。`) && act(() => adminApi('POST', '/ban', { user: r.target_user, reason: r.reason ?? '' }).then(() => adminApi('POST', '/resolve', { id: r.id })))}>
                封禁作者
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

render(<App />, document.getElementById('admin')!);
