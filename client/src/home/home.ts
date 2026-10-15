// The website (home.html): pixel headings, the Android download details, small touches.
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

/** /download/android.json: { file, version, size, sha256 } */
async function androidDownload() {
  try {
    const r = await fetch('/download/android.json', { cache: 'no-cache' });
    if (!r.ok) return;
    const a = (await r.json()) as { file: string; version: string; size: number; sha256?: string };
    const link = document.querySelector<HTMLAnchorElement>('[data-apk-link]');
    if (link) {
      link.href = `/download/${encodeURIComponent(a.file)}`;
    }
    const meta = document.querySelector('[data-apk-meta]');
    if (meta) meta.textContent = `版本 ${a.version} · ${(a.size / 1048576).toFixed(1)} MB · Android 7.0 以上`;
    const hash = document.querySelector<HTMLElement>('[data-apk-hash]');
    if (hash && a.sha256) {
      hash.textContent = `SHA-256：${a.sha256}`;
      hash.hidden = false;
    }
  } catch {
    /* keep the static text */
  }
}

pixelHeadings();
document.fonts?.ready.then(pixelHeadings).catch(() => {});
let resize = 0;
addEventListener('resize', () => {
  clearTimeout(resize);
  resize = window.setTimeout(pixelHeadings, 200);
});
void androidDownload();
const year = document.querySelector('[data-year]');
if (year) year.textContent = String(new Date().getFullYear());
