// The website (home.html, deploy.html): pixel headings, the Android download details,
// the trial-server banner, copy buttons on commands, small touches.
import './home.css';

const INK = [0x4a, 0x3a, 0x34];

/** One line of pixel text: hard edges, then an outline (light) or a coral shadow (dark). */
function pixelLine(text: string, size: number, light: boolean) {
  const font = `700 ${size}px "PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",sans-serif`;
  const probe = document.createElement('canvas').getContext('2d')!;
  probe.font = font;
  const w = Math.ceil(probe.measureText(text).width) + 6;
  const h = size + 8;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.font = font;
  x.textBaseline = 'middle';
  x.fillStyle = '#000';
  x.fillText(text, 2, h / 2 + 1);
  const src = x.getImageData(0, 0, w, h);
  const on = (X: number, Y: number) => X >= 0 && Y >= 0 && X < w && Y < h && src.data[(Y * w + X) * 4 + 3] >= 120;
  const out = x.createImageData(w, h);
  const put = (X: number, Y: number, rgb: number[]) => {
    if (X < 0 || Y < 0 || X >= w || Y >= h) return;
    const i = (Y * w + X) * 4;
    out.data[i] = rgb[0];
    out.data[i + 1] = rgb[1];
    out.data[i + 2] = rgb[2];
    out.data[i + 3] = 255;
  };
  const fill = light ? [0xff, 0xf6, 0xe4] : INK;
  const edge = light ? INK : [0xf0, 0x8a, 0x5d];
  for (let Y = 0; Y < h; Y++)
    for (let X = 0; X < w; X++) {
      if (!on(X, Y)) continue;
      if (light) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1]]) put(X + dx, Y + dy, edge);
      else put(X + 1, Y + 1, edge);
    }
  for (let Y = 0; Y < h; Y++) for (let X = 0; X < w; X++) if (on(X, Y)) put(X, Y, fill);
  x.putImageData(out, 0, 0);
  return c;
}

/**
 * Headings become pixel text in the visitor's own font, scaled up by whole pixels.
 * A heading too wide for the screen breaks after a comma rather than shrinking.
 * The real text stays in the DOM for screen readers and search; without
 * JavaScript the heading simply shows as text.
 */
function pixelHeading(el: HTMLElement) {
  const text = el.dataset.text ?? el.textContent?.trim() ?? '';
  el.dataset.text = text;
  const size = Number(el.dataset.px || 18);
  const light = el.classList.contains('light');
  const avail = el.clientWidth || el.parentElement?.clientWidth || 320;
  const want = Number(getComputedStyle(el).getPropertyValue('--scale')) || 3;
  let lines = [pixelLine(text, size, light)];
  const cut = text.search(/[，、：]/);
  if (lines[0].width * Math.min(want, 2) > avail && cut > 0 && cut < text.length - 1) {
    lines = [pixelLine(text.slice(0, cut + 1), size, light), pixelLine(text.slice(cut + 1), size, light)];
  }
  const widest = Math.max(...lines.map((c) => c.width));
  const scale = Math.max(1, Math.min(want, Math.floor(avail / widest)));
  el.querySelectorAll('canvas').forEach((c) => c.remove());
  for (const c of lines) {
    c.style.width = `${c.width * scale}px`;
    c.style.height = `${c.height * scale}px`;
    c.setAttribute('aria-hidden', 'true');
    el.append(c);
  }
  el.classList.add('px-on');
}

function pixelHeadings() {
  document.querySelectorAll<HTMLElement>('.px').forEach((el) => {
    try {
      pixelHeading(el);
    } catch {
      /* plain text it is */
    }
  });
}

interface Download {
  file: string;
  version: string;
  size: number;
  sha256?: string;
  minOS?: string;
}
const downloads: Record<string, Promise<Download | null>> = {};
/** /download/android.json, /download/mac.json: what this server offers to download (null if nothing). */
function download(name: 'android' | 'mac'): Promise<Download | null> {
  return (downloads[name] ??= fetch(`/download/${name}.json`, { cache: 'no-cache' })
    .then((r) => (r.ok ? (r.json() as Promise<Download>) : null))
    .catch(() => null));
}
const mb = (n: number) => (n / 1048576).toFixed(1);

/** /download/android.json: { file, version, size, sha256 } */
async function androidDownload() {
  try {
    const a = await download('android');
    if (!a) return;
    const link = document.querySelector<HTMLAnchorElement>('[data-apk-link]');
    if (link) {
      link.href = `/download/${encodeURIComponent(a.file)}`;
    }
    const meta = document.querySelector('[data-apk-meta]');
    if (meta) meta.textContent = `版本 ${a.version} · ${mb(a.size)} MB · Android 7.0 以上`;
    const hash = document.querySelector<HTMLElement>('[data-apk-hash]');
    if (hash && a.sha256) {
      hash.textContent = `SHA-256：${a.sha256}`;
      hash.hidden = false;
    }
  } catch {
    /* keep the static text */
  }
}

/**
 * On a trial server (体验服) the banner at the top says so, and the hero points to
 * opening your own town. A self-hosted town's homepage invites people to play instead.
 */
async function trialBanner() {
  let trial: boolean;
  try {
    const r = await fetch('/api/status', { cache: 'no-cache' });
    if (!r.ok) return;
    trial = !!(await r.json()).trial;
  } catch {
    return; // keep the page as it is
  }
  const bar = document.querySelector<HTMLElement>('[data-trial]');
  if (bar) bar.hidden = !trial;
  document.querySelectorAll<HTMLElement>('[data-cta]').forEach((el) => (el.hidden = el.dataset.cta !== (trial ? 'trial' : 'town')));
  const label = document.querySelector('[data-play-label]');
  if (label) label.textContent = trial ? '体验服' : '开始玩';
}

/** Every command box gets a 复制 button. */
function copyButtons() {
  document.querySelectorAll<HTMLElement>('pre.cmd').forEach((pre) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'copy';
    b.textContent = '复制';
    b.addEventListener('click', async () => {
      const text = pre.querySelector('code')?.textContent ?? '';
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        // older browsers: select the text so a long-press / Ctrl+C copies it
        const range = document.createRange();
        range.selectNodeContents(pre.querySelector('code') ?? pre);
        getSelection()?.removeAllRanges();
        getSelection()?.addRange(range);
        return;
      }
      b.textContent = '已复制';
      b.classList.add('done');
      setTimeout(() => ((b.textContent = '复制'), b.classList.remove('done')), 1600);
    });
    pre.append(b);
  });
}

/** The Mac app's card: version and checksum, or hidden when this server doesn't offer one. */
async function macDownload() {
  const card = document.querySelector<HTMLElement>('[data-mac-card]');
  if (!card) return;
  const m = await download('mac');
  if (!m) return void (card.hidden = true);
  const link = document.querySelector<HTMLAnchorElement>('[data-mac-link]');
  if (link) link.href = `/download/${encodeURIComponent(m.file)}`;
  const meta = document.querySelector('[data-mac-meta]');
  if (meta) meta.textContent = `版本 ${m.version} · ${mb(m.size)} MB · macOS ${m.minOS ?? '14'} 以上 · Apple 芯片和 Intel 都能用`;
  const hash = document.querySelector<HTMLElement>('[data-mac-hash]');
  if (hash && m.sha256) {
    hash.textContent = `SHA-256：${m.sha256}`;
    hash.hidden = false;
  }
}

// ---------- phones and Macs: there's an app for this ----------
type Device = 'android' | 'mac' | 'ios';
function device(): Device | null {
  const ua = navigator.userAgent;
  if (/CatNestMac|CatNestApp/.test(ua)) return null; // already in one of our apps
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return 'ios'; // iPadOS says it's a Mac
  if (/Macintosh/.test(ua)) return 'mac';
  return null;
}
const WEB_OK = 'catnest.webOK';
const webChosen = () => {
  try {
    return Date.now() - Number(localStorage.getItem(WEB_OK) || 0) < 30 * 86400_000;
  } catch {
    return false;
  }
};
function chooseWeb() {
  try {
    localStorage.setItem(WEB_OK, String(Date.now()));
  } catch {
    /* fine */
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {}, ...kids: (Node | string)[]) {
  const e = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) e.className = cls;
  Object.assign(e, rest);
  e.append(...kids);
  return e;
}

/** Suggest the app (or, on iPhone, the home screen); the web version is always one tap away. */
function suggest(kind: Device, info: Download | null, play: string) {
  const close = () => (box.remove(), removeEventListener('keydown', onKey));
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const web = el('button', { class: 'later', type: 'button', textContent: kind === 'ios' ? '' : '继续用网页版 →' });
  web.addEventListener('click', () => (chooseWeb(), (location.href = play)));
  const card = el('div', { class: 'modal-card pbox' });
  if (kind === 'android' && info) {
    card.append(
      el('img', { class: 'icon', src: '/site/icon-phone.png', alt: '' }),
      el('h3', { textContent: '装个 Android App 吧' }),
      el('p', {}, 'App 里玩更顺手：猫猫的小纸条准时送到，返回键一层层退，拍的照片直接存进相册。', el('span', { class: 'meta', textContent: `版本 ${info.version} · ${mb(info.size)} MB · Android 7.0 以上` })),
      el('a', { class: 'pbtn', href: `/download/${encodeURIComponent(info.file)}`, download: '猫窝.apk' }, el('img', { src: '/site/icon-down.png', alt: '' }), '下载 Android App'),
      el('p', { class: 'fine', textContent: '安装时如果提示“未知来源”，在系统设置里允许浏览器安装应用就好。以后自己开了小镇，在 App 的登录页换个小镇就能去。' }),
      web,
    );
  } else if (kind === 'mac' && info) {
    card.append(
      el('img', { class: 'icon', src: '/site/icon-paw.png', alt: '' }),
      el('h3', { textContent: '装个 Mac 版吧' }),
      el('p', {}, '小猫会住在屏幕右上角的菜单栏里：点一下就能摸摸、喂食、和它说话，也能打开完整的游戏窗口。', el('span', { class: 'meta', textContent: `版本 ${info.version} · ${mb(info.size)} MB · macOS ${info.minOS ?? '14'} 以上` })),
      el('a', { class: 'pbtn', href: `/download/${encodeURIComponent(info.file)}` }, el('img', { src: '/site/icon-down.png', alt: '' }), '下载 Mac 版'),
      el('p', { class: 'fine', textContent: '解压后把「猫窝」拖进「应用程序」。第一次打开时，macOS 会提示无法验证开发者：到「系统设置 → 隐私与安全性」点「仍要打开」（macOS 14 也可以右键点 App，选「打开」）。' }),
      web,
    );
  } else {
    const open = el('a', { class: 'pbtn', href: play }, el('img', { src: '/site/icon-play.png', alt: '' }), '打开网页版');
    open.addEventListener('click', chooseWeb);
    const how = el('a', { href: '/#download', textContent: '看看怎么装' });
    how.addEventListener('click', close);
    card.append(
      el('img', { class: 'icon', src: '/site/icon-phone.png', alt: '' }),
      el('h3', { textContent: '把猫窝放到主屏幕' }),
      el('p', { textContent: 'iPhone 版暂时不能直接下载（苹果只允许从 App Store 安装）。网页版可以像 App 一样用：在 Safari 里点底部的分享按钮，选「添加到主屏幕」。' }),
      open,
      el('p', { class: 'fine' }, '会用 Mac 上的 Xcode？也可以从源代码把 iPhone 版装到自己的手机上（', how, '）。'),
    );
  }
  const box = el('div', { class: 'modal' }, card);
  box.setAttribute('role', 'dialog');
  box.setAttribute('aria-modal', 'true');
  box.addEventListener('click', (e) => e.target === box && close());
  addEventListener('keydown', onKey);
  document.body.append(box);
  (card.querySelector('.pbtn') as HTMLElement | null)?.focus();
}

/** Links into the trial town ([data-play]) first suggest the app to phone and Mac visitors. */
function suggestApps() {
  const kind = device();
  if (!kind) return;
  const info = kind === 'ios' ? Promise.resolve(null) : download(kind);
  document.querySelectorAll<HTMLAnchorElement>('a[data-play]').forEach((a) =>
    a.addEventListener('click', async (e) => {
      if (webChosen() || e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      const d = await info;
      if (kind !== 'ios' && !d) return void (location.href = a.href); // nothing to download here
      suggest(kind, d, a.href);
    }),
  );
}

pixelHeadings();
copyButtons();
void macDownload();
suggestApps();
void trialBanner();
document.fonts?.ready.then(pixelHeadings).catch(() => {});
let resize = 0;
addEventListener('resize', () => {
  clearTimeout(resize);
  resize = window.setTimeout(pixelHeadings, 200);
});
void androidDownload();
const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
