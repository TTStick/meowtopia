# 开发者文档

- [运行](#运行)
- [配置](#配置)
- [测试](#测试)
- [调试小工具](#调试小工具)
- [结构](#结构)
- [账号与安全](#账号与安全)

客户端的构建见 [apps.md](apps.md)，服务器部署见 [DEPLOY.md](../DEPLOY.md)。

## 运行

需要 Node.js 24（或 22.13+，使用内置的 `node:sqlite`）。

```bash
npm install
```

开发（同时启动 API/WebSocket 服务 :8737 和 Vite :5199）：

```bash
npm run dev
```

然后打开 http://localhost:5199 是官网，http://localhost:5199/play/ 是游戏。

本地跑生产版：

```bash
npm run build && npm run build:server && npm start
```

## 配置

见 `.env.example`，每一项都有中文说明。常用的：

| 变量 | 作用 |
|---|---|
| `CAT_DOMAIN` | 部署用的域名 |
| `CAT_ADMIN_TOKEN` | 管理口令，留空则管理功能关闭 |
| `CAT_WORLD_TZ` | 小镇的统一时钟（相对 UTC 的小时数），面向国内玩家设为 `8` |
| `ANTHROPIC_API_KEY` | 开启 Claude 生成猫语 |
| `CAT_LLM_MODEL` | 默认 `claude-opus-5-5`；想省钱可换 `claude-haiku-5-5` |
| `CAT_LLM_RPM` / `CAT_LLM_DAILY` / `CAT_LLM_USER_DAILY` | 全服限速与每人每日额度 |
| `CAT_VAPID_SUBJECT` | Web Push 联系方式 |

模型相关的配置也可以在管理面板（`/admin/` →「模型」）里在线修改，保存在数据库的 `kv` 表里，优先于环境变量。

模型调用做了“台词池”缓存：每次按场景批量生成几句，玩家拿到的永远是现成的一句，后台再补货，所以不会卡顿，也不会每句话都花钱。模型生成的句子在展示给其他玩家前同样会经过屏蔽词过滤。

## 测试

```bash
npm test
```

包括：小镇每个地点从家门口都走得到、寻路、猫窝布局校验、数值“温柔”约束（一周没人管也不会饿坏）、每日心愿、兜底猫语覆盖所有场景、物品表一致性；以及真实启动服务器的接口测试：工作量证明注册、Cookie 会话、CSRF 与跨站 WebSocket 拦截、找回码、通行密钥（用软件模拟的密钥完成绑定与登录）、设备管理、共养、删号移交、导出、举报与封禁、静态文件越权访问。

## 调试小工具

- `http://localhost:5199/play/?hour=21&weather=rain&season=3`：预览夜晚 / 雨天 / 冬天的画面（只影响本地显示）。
- `http://localhost:5199/gallery.html?scale=4&only=sit,loaf,walk,sleep`：猫咪姿态画廊。

## 结构

```
shared/   客户端与服务端共用：基因、物品、地图生成、寻路、时间天气、数值、猫语兜底、协议
client/   Vite + Preact 界面；Canvas 渲染引擎、程序化美术、猫窝与小镇场景、Service Worker
server/   Node HTTP + WebSocket；SQLite 存储、REST API、小镇模拟、居民作息、Claude 猫语、推送
```

- `client/src/art/`：猫（6 种视角、30+ 动作、9 种花纹、装扮）、家具、小镇物件、居民、图标。
- `client/src/game/actor.ts`：猫的动画控制器（姿态插值、眨眼、耳朵抖动、呼吸、视角切换的挤压过渡）。
- `client/src/game/nestBrain.ts`：猫在窝里的效用 AI。
- `server/src/world.ts`：小镇模拟（路径、探险行程、发现与拾取、相遇与对话、居民作息）。
- `client/home.html`：官网（像素图由 `scripts/make-site-art.ts` 生成）；`client/admin.html` + `client/src/admin/`：管理面板，接口在 `server/src/admin.ts`。

## 账号与安全

- **先玩后注册**：第一次打开只需要起个称呼，就有了一个游客账号。为了防止被脚本批量注册，浏览器会在后台做一道几百毫秒的计算题（工作量证明），注册多了难度会自动变高；每个 IP 每小时也有上限。
- **给猫窝上锁**：玩了一会儿后会温柔地提醒一次。可以绑定**通行密钥**（面容 / 指纹 / 设备密码，会随 iCloud 钥匙串或谷歌密码管理器同步），也可以生成一串 12 位的**找回码**。找回码只显示一次，服务器只存它的加密摘要。不需要邮箱和手机号。
- **登录状态**：每台设备一个独立的登录会话，存在 HttpOnly + Secure 的 Cookie 里（网页脚本读不到）。设置里能看到所有登录着的设备，可以单独退出或一键退出其他设备。会话 180 天有效，常来会自动续期。
- **防护**：所有改动类请求都检查来源（防 CSRF），WebSocket 只认自家页面带来的 Cookie（防跨站劫持）；全站限流（按 IP 和按账号），模型调用有全服和单人每日额度；严格的 CSP、HSTS、禁止嵌入；推送地址只接受浏览器官方推送服务（防 SSRF）；容器以非 root、只读文件系统、去掉全部权限运行。
- **社区**：名字、纸条、交换日记都会过滤联系方式（包括“加 我 V 信”“一三八……”这类变体）、链接和不友善的话；玩家可以举报猫、纸条和日记，管理员用 `admin.mjs` 处理。
- **你的数据**：设置里可以导出全部数据（JSON），或者删除账号（共养的猫会留给对方）。隐私说明在设置里。
