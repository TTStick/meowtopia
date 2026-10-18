// 搬家: packing the cat up to take to another 猫窝 town (from settings), and
// moving in here with a package from another town (from the adopt screen).
import { useEffect, useRef, useState } from 'preact/hooks';
import { ui, toast } from '../game/state';
import { useStore } from '../game/store';
import { game } from '../game/game';
import * as acc from '../game/account';
import { Sheet, when } from './Sheet';
import { API_BASE, isNative } from '../game/platform';
import { keepsakeHere, keepsakesFromElsewhere, saveKeepsakeFile } from '../game/keepsake';
import { LiveCat } from './LiveCat';
import { confirmBox } from './Dialog';
import { coatName } from '../../../shared/genes';
import { ageOf } from '../../../shared/stats';
import type { CatGenes } from '../../../shared/types';

const hostOf = (origin: string) => {
  try {
    return new URL(origin).host;
  } catch {
    return '别的小镇';
  }
};

/** The how-to for opening your own town, on the website of the server we're on. */
export const GUIDE_URL = `${API_BASE}/deploy/`;

/** On a trial server (体验服): a gentle note, with the way to a town of your own. */
export function TrialNote(p: { short?: boolean }) {
  const trial = useStore(ui, (s) => s.trial);
  if (!trial) return null;
  return (
    <div class="trial-note">
      <b>这里是猫窝的体验服</b>
      <span>
        {p.short ? '不保证会一直开着。' : '欢迎先来玩玩看。它不保证会一直开着，'}
        {p.short ? '' : '不过'}猫猫随时可以带走，搬到你自己或别人开的小镇上。
      </span>
      <a href={GUIDE_URL} target={isNative ? undefined : '_blank'} rel="noopener">
        开服教程 →
      </a>
    </div>
  );
}

// ---------------- moving out ----------------
export function MoveOutPanel() {
  const me = useStore(ui, (s) => s.me)!;
  const [st, setSt] = useState<acc.MoveStatus | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    acc.moveStatus().then(setSt, () => {});
  }, []);
  const trial = useStore(ui, (s) => s.trial);
  const kept = keepsakeHere();
  const own = me.cats.find((c) => c.ownerId === me.user.id && !c.coOwnerId);
  const left = me.cats.filter((c) => c.coOwnerId).map((c) => c.name);
  const name = own?.name ?? '猫猫';
  const pack = async () => {
    if (!own) return;
    setBusy(true);
    try {
      await acc.packForMove(own.name);
      setSt(await acc.moveStatus());
      toast(`${own.name}的搬家包打好啦`, '📦');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title="搬家去别的小镇" onClose={() => ui.set({ panel: 'settings' })}>
      <div class="move">
        <p style={{ marginTop: 0 }}>
          {trial && '这里是体验服，不保证会一直开着。'}猫窝是开源的，谁都可以搭一个自己的小镇（
          <a href={GUIDE_URL} target={isNative ? undefined : '_blank'} rel="noopener">
            开服教程
          </a>
          ）。想带{name}去别的小镇住，可以把它打包成一个「搬家包」带过去。
        </p>
        <ol class="steps">
          <li>
            <b>在这里打包</b>：保存一个「猫窝搬家包」文件。
          </li>
          <li>
            <b>去新小镇</b>：用浏览器打开新小镇的网址，点「开始养猫」，在领养页选「从别的小镇搬过来」，选这个文件。
          </li>
          <li>
            <b>等新小镇的管理员同意</b>：同意以后，{name}就会带着它的东西出现在那里。
          </li>
        </ol>
        <div class="sec">会一起带走</div>
        <p class="muted">{name}本身（样子、性格、年龄、和你的羁绊）、猫窝的布置、背包和衣服、收藏图鉴、小鱼干、去过的地方，和最近 200 篇日记。</p>
        <div class="sec">会留在这里</div>
        <p class="muted">
          朋友和小区邻居、纸条、交换日记、和居民们的熟悉度。
          {left.length > 0 && `和别人一起养的${left.join('、')}也会留下，继续由你们照顾。`}
        </p>
        <div class="sec">要知道的</div>
        <ul class="muted">
          <li>搬家包是一份拷贝，这里的{name}不会消失。搬好以后，如果不再回来，可以在「账号与安全」里删除这边的账号。</li>
          <li>搬家包里有{name}的日记，别发给不认识的人。它带着这个小镇的签名，改过就用不了了。</li>
          {st && (
            <li>
              新小镇的管理员可能会问这个小镇的「指纹」：<code class="fp">{st.fingerprint}</code>
            </li>
          )}
        </ul>
        {own ? (
          <button class="btn primary" style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={pack}>
            {busy ? '正在打包…' : `打包${name}`}
          </button>
        ) : (
          <p class="muted">你还没有自己的猫猫可以带走（一起养的猫会留在这里）。</p>
        )}
        {st?.out && <p class="muted" style={{ fontSize: 13, textAlign: 'center' }}>上次打包：{when(st.out.at)}</p>}
        {kept && (
          <div class="keep-note">
            <b>这台设备上随身带着{kept.cat.name}</b>
            <span>
              App 每天会自动存一份{kept.cat.name}的搬家包（最近一次：{when(kept.at)}）。就算这个小镇哪天关了，在「换一个小镇」后的领养页，也能直接用它把{kept.cat.name}搬过去。
            </span>
            <button class="btn small" onClick={() => saveKeepsakeFile(kept).catch((e) => toast((e as Error).message))}>
              存成文件
            </button>
          </div>
        )}
      </div>
    </Sheet>
  );
}

// ---------------- moving in ----------------
interface Preview {
  name: string;
  genes: CatGenes | null;
  born: number;
  host: string;
  diary: number;
  fish: number;
}

function peek(pkg: acc.MovePackage): Preview {
  try {
    const b = JSON.parse(pkg.body);
    return { name: String(b.cat?.name ?? '猫猫'), genes: b.cat?.genes ?? null, born: Number(b.cat?.born) || Date.now(), host: hostOf(b.source?.origin ?? ''), diary: b.cat?.journal?.length ?? 0, fish: Number(b.fish) || 0 };
  } catch {
    throw new Error('这个搬家包读不出来');
  }
}

/** On the adopt screen: hand in a moving package and wait for the admin. */
export function MoveIn(p: { onBack: () => void }) {
  const [st, setSt] = useState<acc.MoveStatus | null>(null);
  const [picked, setPicked] = useState<{ pkg: acc.MovePackage; pv: Preview } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const load = async () => {
    const s = await acc.moveStatus();
    setSt(s);
    if (s.request?.status === 'approved') {
      await game.arrive();
      setTimeout(() => toast(`欢迎搬来，${s.request!.summary.cat.name}！`, '🏡', 5000), 600);
    }
  };
  useEffect(() => {
    load().catch(() => {});
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') load().catch(() => {});
    }, 20_000);
    return () => clearInterval(t);
  }, []);
  const run = async (f: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await f();
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const choose = (f: File | undefined) =>
    f &&
    run(async () => {
      const pkg = await acc.readMoveFile(f);
      setPicked({ pkg, pv: peek(pkg) });
    });
  const submit = () =>
    run(async () => {
      await acc.requestMove(picked!.pkg);
      setPicked(null);
      await load();
    });
  const req = st?.request;
  const pending = req?.status === 'pending';
  const kept = keepsakesFromElsewhere();

  return (
    <div class="onboard">
      <h1 style={{ fontSize: '26px', letterSpacing: '1px' }}>从别的小镇搬过来</h1>
      {!st ? (
        <p class="muted">正在看看…</p>
      ) : pending ? (
        <div class="card move-wait">
          <div style={{ fontSize: 34 }}>📦</div>
          <b>{req.summary.cat.name}的搬家申请交上去啦</b>
          <p class="muted">
            从 {hostOf(req.origin)} 搬来 · {when(req.created)}交的
            <br />
            这个小镇的管理员看过、同意以后，{req.summary.cat.name}就会出现在这里。不用一直开着{isNative ? ' App' : '页面'}，过一会儿再回来看看就好。
          </p>
          <p class="muted" style={{ fontSize: 13 }}>这个账号还没上锁，等待的时候{isNative ? '别卸载 App' : '别清除浏览器数据'}；搬好以后，记得在设置里给猫窝上个锁。</p>
          <button
            class="btn ghost small"
            disabled={busy}
            onClick={async () => {
              if (await confirmBox('撤回这份搬家申请吗？', { ok: '撤回' })) void run(async () => (await acc.withdrawMove(), await load()));
            }}
          >
            撤回申请
          </button>
        </div>
      ) : picked ? (
        <div class="card move-wait">
          {picked.pv.genes && <LiveCat genes={picked.pv.genes} height={130} age={ageOf(picked.pv.born)} cycle={['sit_happy', 'sit', 'loaf']} />}
          <b>
            {picked.pv.name}
            {picked.pv.genes && <span class="muted">（{coatName(picked.pv.genes)}）</span>}
          </b>
          <p class="muted">
            来自 {picked.pv.host}
            <br />
            日记 {picked.pv.diary} 篇 · 小鱼干 {picked.pv.fish}
            <br />
            交上去以后，这个小镇的管理员会看一看，同意了就搬进来。
          </p>
          <button class="btn primary" disabled={busy} onClick={submit}>
            申请搬进来
          </button>
          <button class="btn ghost small" disabled={busy} onClick={() => setPicked(null)}>
            换一个
          </button>
        </div>
      ) : (
        <div class="actions">
          {req?.status === 'rejected' && (
            <div class="card move-wait">
              <b>上次的搬家申请没有通过</b>
              <p class="muted">{req.reason ? `管理员说：${req.reason}` : '可以问问这个小镇的管理员。'}</p>
            </div>
          )}
          {kept.map((k) => (
            <div key={k.server} class="card move-wait">
              {k.cat.genes && <LiveCat genes={k.cat.genes} height={100} age={ageOf(k.cat.born)} cycle={['sit', 'sit_happy', 'loaf']} />}
              <b>这台设备上带着{k.cat.name}</b>
              <p class="muted">
                来自 {hostOf(k.server)} · {when(k.at)}存的
              </p>
              <button class="btn primary small" disabled={busy} onClick={() => run(async () => setPicked({ pkg: k.pkg, pv: peek(k.pkg) }))}>
                带{k.cat.name}搬过来
              </button>
            </div>
          ))}
          <p class="sub" style={{ margin: 0 }}>
            {kept.length ? '或者用一个搬家包文件：' : '在原来的小镇里打开「设置 → 账号与安全 → 搬家去别的小镇」，打包好猫猫，再在这里选那个「猫窝搬家包」文件。'}
          </p>
          <input ref={file} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={(e) => (choose((e.target as HTMLInputElement).files?.[0]), ((e.target as HTMLInputElement).value = ''))} />
          <button class={kept.length ? 'btn' : 'btn primary'} disabled={busy} onClick={() => file.current?.click()}>
            选择搬家包文件
          </button>
        </div>
      )}
      {!pending && (
        <button class="btn ghost" style={{ marginTop: 10 }} onClick={p.onBack}>
          返回，领养一只新的小猫
        </button>
      )}
    </div>
  );
}

// ---------- a paused or closed town ----------
/** Instead of the game: what's happened, and packing the cat up to take along. */
export function TownShut() {
  const me = useStore(ui, (s) => s.me)!;
  const tm = useStore(ui, (s) => s.townMode);
  const [busy, setBusy] = useState(false);
  const [packed, setPacked] = useState(false);
  const own = me.cats.find((c) => c.ownerId === me.user.id && !c.coOwnerId);
  const kept = keepsakeHere();
  const pack = async () => {
    if (!own) return;
    setBusy(true);
    try {
      await acc.packForMove(own.name);
      setPacked(true);
      toast(`${own.name}的搬家包打好啦`, '📦');
    } catch (e) {
      toast((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div class="onboard">
      {own && <LiveCat genes={own.genes} outfit={own.outfit} age={ageOf(own.born)} height={140} cycle={['sit', 'loaf', 'groom']} />}
      <h1 style={{ fontSize: '26px', letterSpacing: '1px' }}>{tm.mode === 'paused' ? '小镇暂停开放' : '小镇要关门了'}</h1>
      <p class="sub" style={{ maxWidth: 360 }}>{tm.notice}</p>
      <div class="card move-wait">
        {own ? (
          <>
            <b>把{own.name}带走</b>
            <p class="muted">打包成一个「搬家包」，带到你自己或别人开的小镇：在那边的领养页选「从别的小镇搬过来」。猫窝、背包、收藏和日记都会一起过去。</p>
            <button class="btn primary" disabled={busy} onClick={pack}>
              {busy ? '正在打包…' : packed ? '再打包一次' : `打包${own.name}`}
            </button>
            {isNative && kept && (
              <p class="muted" style={{ fontSize: 13 }}>
                这台设备上也带着{kept.cat.name}的搬家包（{when(kept.at)}）。换到别的小镇后，领养页会直接列出它。
              </p>
            )}
            {isNative && (
              <button class="btn small" onClick={() => ui.set({ towns: true })}>
                换一个小镇
              </button>
            )}
          </>
        ) : (
          <p class="muted">你在这里没有自己的猫猫要带走（一起养的猫会留在这里）。</p>
        )}
        <a class="guide-link" href={GUIDE_URL} target={isNative ? undefined : '_blank'} rel="noopener">
          还没有小镇？看看怎么开一个 →
        </a>
      </div>
      {tm.mode === 'paused' && <p class="muted" style={{ fontSize: 13, marginTop: 14 }}>小镇重新开放以后，回到这里就能接着玩。</p>}
    </div>
  );
}

/** On the welcome screen of a paused or closed town: no new players, but old ones can come for their cat. */
export function ShutNote() {
  const tm = useStore(ui, (s) => s.townMode);
  if (tm.mode === 'open') return null;
  return (
    <div class="trial-note shut">
      <b>{tm.mode === 'paused' ? '小镇暂停开放' : '小镇要关门了'}</b>
      <span>{tm.notice}</span>
      <span>已经在这里养猫的，用「找回我的猫窝」登录，就能把猫猫打包带走。</span>
    </div>
  );
}
