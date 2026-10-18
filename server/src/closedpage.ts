// What the homepage shows while the website is turned off (admin panel → 小镇状态).
export function siteClosedPage(web: boolean): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex" />
<meta name="theme-color" content="#231d3f" />
<link rel="icon" href="/icon.svg" type="image/svg+xml" />
<title>猫窝</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px 16px; box-sizing: border-box; background: #231d3f; color: #4a3a34;
    font: 16px/1.8 -apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif; }
  main { width: min(440px, 100%); padding: 28px 26px 22px; text-align: center; background: #fffaf0;
    box-shadow: 0 -4px 0 0 #4a3a34, 0 4px 0 0 #4a3a34, -4px 0 0 0 #4a3a34, 4px 0 0 0 #4a3a34, 4px 10px 0 0 rgba(0, 0, 0, 0.35); }
  h1 { font-size: 21px; margin: 10px 0 8px; }
  p { margin: 0 0 10px; color: #7d6b61; }
  a { color: #d9673a; }
  .fine { font-size: 13px; margin-top: 16px; }
</style>
</head>
<body>
<main>
  <img src="/icon.svg" width="64" height="64" alt="" />
  <h1>猫窝的官网暂时关闭了</h1>
  <p>已经在用猫窝 App 的玩家，打开 App 就能照常玩。</p>
  ${web ? '<p><a href="/play/">进入网页版</a></p>' : ''}
  <p class="fine">猫窝是开源的：<a href="https://github.com/TTStick/meowtopia" rel="noopener">github.com/TTStick/meowtopia</a></p>
</main>
</body>
</html>`;
}
