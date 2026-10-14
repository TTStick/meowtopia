// Account UI: protecting the nest (passkey / recovery code), signing back in,
// devices, data export, deletion, reports and the privacy note.
import { useEffect, useState } from 'preact/hooks';
import { ui, toast } from '../game/state';
import { useStore } from '../game/store';
import { game } from '../game/game';
import * as acc from '../game/account';
import { api } from '../game/net';
import { isNative } from '../game/platform';
import { Sheet, when } from './Sheet';
import { confirmBox, promptBox } from './Dialog';

async function attempt(f: () => Promise<unknown>, setBusy?: (b: boolean) => void) {
  setBusy?.(true);
  try {
    await f();
  } catch (e) {
    const m = (e as Error).message;
    if (m !== '已取消') toast(m);
  } finally {
    setBusy?.(false);
  }
}

function markSecured() {
  ui.set((s) => ({ me: s.me ? { ...s.me, user: { ...s.me.user, secured: true } } : s.me }));
}

/** Shows a freshly generated recovery code exactly once. */
function CodeReveal(p: { code: string; onDone: () => void }) {
  return (
    <div>
      <div class="code" style={{ userSelect: 'all' }}>
        {p.code}
      </div>
      <p class="muted" style={{ fontSize: 13 }}>这串码只显示这一次。抄在纸上、存进备忘录或截图都可以，别发给别人。</p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          class="btn small"
          onClick={() =>
            navigator.clipboard
              ?.writeText(p.code)
              .then(() => toast('复制好啦', '📋'))
              .catch(() => toast('复制不了，手动抄一下吧'))
          }
        >
          复制
        </button>
        <button class="btn small primary" onClick={p.onDone}>
          我收好了
        </button>
      </div>
    </div>
  );
}

// ---------------- settings section ----------------
export function SecuritySection() {
  const me = useStore(ui, (s) => s.me)!;
  const [st, setSt] = useState<acc.AuthState | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = () => acc.authState().then(setSt).catch(() => {});
  useEffect(() => void load(), []);
  const canPasskey = acc.passkeysSupported();

  return (
    <>
      <div class="sec">账号与安全</div>
      <p class="muted" style={{ marginTop: 0, fontSize: 13 }}>
        {me.user.secured ? '猫窝已经上锁：换手机、清了浏览器数据，也能用通行密钥或找回码回来。' : '猫窝还没上锁：现在只有这台设备认得你。清除浏览器数据或换手机后，可能就找不到它了。'}
      </p>

      <div class="toggle">
        <span>
          通行密钥
          <div class="muted" style={{ fontSize: 12 }}>
            用面容、指纹或设备密码登录，不用记任何东西
          </div>
        </span>
        {canPasskey ? (
          <button class="btn small" disabled={busy} onClick={() => attempt(async () => (await acc.addPasskey(), markSecured(), toast('通行密钥绑好啦', '🔑'), load()), setBusy)}>
            添加
          </button>
        ) : (
          <span class="muted" style={{ fontSize: 12, textAlign: 'right' }}>{isNative ? '可以在网页版添加' : '这个浏览器不支持'}</span>
        )}
      </div>
      {st?.passkeys.map((k) => (
        <div key={k.id} class="row" style={{ padding: '6px 2px' }}>
          <span style={{ fontSize: 20 }}>🔑</span>
          <div class="grow">
            <div class="t1">{k.name}</div>
            <div class="t2" style={{ fontSize: 11 }}>
              {when(k.created)} 添加{k.synced ? ' · 会同步到你的其他设备' : ''}
            </div>
          </div>
          <button
            class="btn small ghost"
            onClick={async () => {
              if (!(await confirmBox('删除这个通行密钥？之后就不能用它登录了。', { ok: '删除', danger: true }))) return;
              void attempt(async () => (await api('DELETE', `/api/auth/passkey/${encodeURIComponent(k.id)}`), load(), game.refreshMe()));
            }}
          >
            删除
          </button>
        </div>
      ))}

      <div class="toggle">
        <span>
          找回码
          <div class="muted" style={{ fontSize: 12 }}>
            {st?.hasCode ? `已设置${st.codeAt ? `（${when(st.codeAt)}）` : ''}，重新生成后旧的会作废` : '一串 12 位的字符，在任何设备上都能用它回来'}
          </div>
        </span>
        <button
          class="btn small"
          disabled={busy}
          onClick={async () => {
            if (st?.hasCode && !(await confirmBox('重新生成后，旧的找回码就不能用了。继续吗？', { ok: '重新生成' }))) return;
            void attempt(async () => (setCode(await acc.newRecoveryCode()), markSecured()), setBusy);
          }}
        >
          {st?.hasCode ? '重新生成' : '生成'}
        </button>
      </div>
      {code && <CodeReveal code={code} onDone={() => (setCode(null), load())} />}

      {st && st.sessions.length > 0 && (
        <>
          <div class="sec">登录着的设备</div>
          {st.sessions.map((s) => (
            <div key={s.id} class="row" style={{ padding: '6px 2px' }}>
              <span style={{ fontSize: 20 }}>{s.kind === 'app' ? '📱' : '💻'}</span>
              <div class="grow">
                <div class="t1">
                  {s.agent || '某台设备'}
                  {s.current ? '（这台）' : ''}
                </div>
                <div class="t2" style={{ fontSize: 11 }}>
                  最近：{when(s.lastUsed)}
                </div>
              </div>
              {!s.current && (
                <button class="btn small ghost" onClick={() => attempt(async () => (await api('DELETE', `/api/auth/session/${encodeURIComponent(s.id)}`), load()))}>
                  退出
                </button>
              )}
            </div>
          ))}
          {st.sessions.length > 1 && (
            <button class="btn small ghost" style={{ marginTop: 4 }} onClick={() => attempt(async () => (await api('POST', '/api/auth/logout-others'), toast('其他设备都退出啦'), load()))}>
              退出其他所有设备
            </button>
          )}
        </>
      )}

      <div class="sec">我的数据</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button class="btn small" onClick={() => attempt(acc.exportData)}>
          导出我的数据
        </button>
        <button class="btn small ghost" onClick={() => ui.set({ panel: 'privacy' })}>
          隐私说明
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 16 }}>
        <button
          class="btn ghost"
          onClick={async () => {
            const warn = me.user.secured ? '要退出登录吗？之后可以用通行密钥或找回码回来。' : '猫窝还没上锁，退出后就回不来了！真的要退出吗？';
            if (await confirmBox(warn, { ok: '退出', danger: !me.user.secured })) void acc.logout();
          }}
        >
          退出登录
        </button>
        <button
          class="btn ghost"
          style={{ color: '#b4553a' }}
          onClick={async () => {
            const typed = await promptBox('删除账号后，你的猫猫、猫窝和所有记录都会永久消失，无法恢复。\n（和别人共养的猫会留给对方照顾）\n\n如果确定，请输入“删除”：', { placeholder: '删除', mustEqual: '删除' }, { ok: '永久删除', danger: true });
            if (typed?.trim() === '删除') void attempt(acc.deleteAccount);
          }}
        >
          删除账号
        </button>
      </div>
    </>
  );
}

// ---------------- guided protection sheet ----------------
export function ProtectPanel() {
  const cat = useStore(ui, (s) => s.me?.cats[0]);
  const [code, setCode] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const canPasskey = acc.passkeysSupported();
  const name = cat?.name ?? '猫猫';
  if (done)
    return (
      <Sheet title="上好锁啦">
        <p>以后换手机、换浏览器，都能回到{name}身边。</p>
        <p class="muted" style={{ fontSize: 13 }}>想再加一种方式，可以在「设置 → 账号与安全」里添加。</p>
        <button class="btn primary" style={{ width: '100%' }} onClick={() => ui.set({ panel: null })}>
          好的
        </button>
      </Sheet>
    );
  return (
    <Sheet title="给猫窝上把锁">
      <p style={{ marginTop: 0 }}>
        现在只有这台设备认得你。上把锁，换手机或清了浏览器数据，也能回到{name}身边。
      </p>
      {code ? (
        <CodeReveal code={code} onDone={() => setDone(true)} />
      ) : (
        <div class="list" style={{ gap: 10 }}>
          {canPasskey && (
            <button class="btn primary" disabled={busy} style={{ width: '100%' }} onClick={() => attempt(async () => (await acc.addPasskey(), markSecured(), setDone(true)), setBusy)}>
              用通行密钥（面容 / 指纹）
            </button>
          )}
          <button class={`btn ${canPasskey ? '' : 'primary'}`} disabled={busy} style={{ width: '100%' }} onClick={() => attempt(async () => (setCode(await acc.newRecoveryCode()), markSecured()), setBusy)}>
            生成一串找回码
          </button>
          <button class="btn ghost" style={{ width: '100%' }} onClick={() => ui.set({ panel: null })}>
            以后再说
          </button>
        </div>
      )}
    </Sheet>
  );
}

/** Welcome screen: get back in with a passkey or a recovery code. */
export function RecoverForm(p: { onBack: () => void }) {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const canPasskey = acc.passkeysSupported();
  return (
    <div class="actions">
      {canPasskey && (
        <>
          <button class="btn primary" disabled={busy} onClick={() => attempt(() => game.loginPasskey(), setBusy)}>
            用通行密钥回来
          </button>
          <div class="muted" style={{ fontSize: 12, textAlign: 'center' }}>
            或者输入找回码
          </div>
        </>
      )}
      <input class="field" placeholder="XXXX-XXXX-XXXX" autocomplete="off" autocapitalize="characters" value={code} onInput={(e) => setCode((e.target as HTMLInputElement).value)} />
      <button class={`btn ${canPasskey ? '' : 'primary'}`} disabled={busy || code.replace(/[^0-9a-z]/gi, '').length < 12} onClick={() => attempt(() => game.login(code), setBusy)}>
        用找回码回来
      </button>
      <button class="btn ghost" onClick={p.onBack}>
        返回
      </button>
    </div>
  );
}

// ---------------- reports ----------------
export function ReportLink(p: { kind: 'cat' | 'note' | 'diary' | 'user'; target: string; label?: string }) {
  const [sent, setSent] = useState(false);
  return (
    <button
      class="btn small ghost"
      style={{ fontSize: 12, minHeight: 28, padding: '0 8px', opacity: 0.7 }}
      disabled={sent}
      onClick={async () => {
        const reason = await promptBox('哪里让你不舒服？（可不填）', { placeholder: '比如：名字不友善' }, { ok: '举报' });
        if (reason === null) return;
        void attempt(async () => {
          await acc.report(p.kind, p.target, reason.slice(0, 100));
          setSent(true);
          toast('收到啦，谢谢你让小镇更温柔', '🌷');
        });
      }}
    >
      {sent ? '已举报' : p.label ?? '举报'}
    </button>
  );
}

// ---------------- privacy ----------------
export function PrivacyPanel() {
  const llm = useStore(ui, (s) => s.llm);
  return (
    <Sheet title="隐私说明" onClose={() => ui.set({ panel: 'settings' })}>
      <div class="list" style={{ fontSize: 14, lineHeight: 1.8 }}>
        <div>
          <b>我们保存什么</b>：你的称呼、猫猫和猫窝、日记、收藏、给别人的纸条与交换日记，以及登录过的设备（只记浏览器类型和最近使用时间）。找回码只存加密后的摘要，连我们也看不到原文。
        </div>
        <div>
          <b>我们不收集</b>：手机号、邮箱、真实姓名、位置、通讯录。没有广告，也不做跨站追踪。IP 地址只在内存里短暂用来防刷，不写进数据库。
        </div>
        <div>
          <b>猫猫说的话</b>：{llm ? '为了让猫猫说出不重样的话，猫猫的性格、心情、所在地点，以及你对它说的话，会发送给 AI 模型服务来生成回应。请不要在里面写个人隐私。' : '目前猫猫的话由游戏内置的句子生成，不会发送到外部服务。'}
        </div>
        <div>
          <b>通知</b>：只有你开启后才会发送，保存的是浏览器给的推送地址，随时可以关闭。
        </div>
        <div>
          <b>别人能看到什么</b>：在小镇里，别人能看到你的猫、你的称呼，以及你留下的纸条。共养伙伴能看到你们的交换日记。
        </div>
        <div>
          <b>你的权利</b>：随时可以在「设置 → 账号与安全」导出全部数据或删除账号。删除后数据会立即从游戏中移除，备份会在 7 天内自然轮换掉。
        </div>
        <div>
          <b>社区</b>：不当的名字、纸条或日记可以举报。为了保护大家，我们会自动拦截联系方式、链接和不友善的词。
        </div>
      </div>
    </Sheet>
  );
}
