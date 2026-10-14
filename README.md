# 猫窝 · TheCatGame

一只只属于你的线条小猫，一个只属于它的小窝。窝外面，是一整个热闹又温柔的猫猫小镇。

所有画面都是代码实时“手绘”出来的（Canvas 程序化线条画，带手绘抖动的“呼吸线”效果），没有任何图片素材。

## 玩法一览

**猫窝**
- 领养一只随机生成的小奶猫：12 种毛色 × 9 种花纹 × 眼睛/耳朵/尾巴/胖瘦/长毛等基因，外加性格、说话风格和小癖好。小猫会在约两周里慢慢长大。
- 它有自己的生活：按时间、心情、性格和家里的家具决定做什么——晒太阳、踩奶、蹲纸箱、上爬架、趴窗台看风景、追毛线球、傍晚跑酷、半夜蜷成团子睡觉。
- 摸摸（点按）、顺毛（拖动）、喂零食、羽毛逗猫棒（举高它会站起来抓）、叫它过来、对它说话（“去睡觉”“去河边看看”）。
- 装修：27 种家具、7 种墙饰、8 种墙纸、5 种地板，网格摆放、拖动、翻转、收起。窗户会在地板上投下随时间移动的阳光。
- 衣柜：13 种小装扮。拍照：把它拍成一张拍立得。
- 每天一个「小心愿」（想吃罐罐、想去河边看看、想被摸摸……），实现了它会很开心；没实现也没关系，第二天会有新的。
- 晚上可以「晚安」哄它睡觉：它会去最喜欢的床，踩踩奶、打个哈欠、团成一团睡着。
- 它会长大（小奶猫 → 少年猫 → 成年猫），和你的羁绊会一级级加深，这些都会写进它的日记。
- 收藏柜会摆出它在外面捡回来的宝贝。

**猫猫小镇（多人同屏）**
- 120×90 格的大地图：喷泉广场、面包房、咖啡馆、图书馆、邮局、杂货铺、花店、裁缝铺、住宅区、公园池塘、游乐场、森林、小河与三座桥、花田风车、山顶大树、草地、沙滩、码头和灯塔。
- 13 位拟人猫猫居民按作息过日子：面包房老板娘清晨揉面、邮递员送信、老渔夫在码头钓鱼、音乐家傍晚在喷泉边弹琴、奶奶在巷口织毛线、深夜还有阿月的热羊奶摊……居民之间也会聊天。
- 所有玩家的猫都在同一个小镇里。你不在的时候，猫会自己出门探险、捡回宝贝（32 种收藏品，按季节/天气/昼夜出现）、和别的猫碰鼻子交朋友，晚上一定回家。
- 可以看它自己逛，也可以「接管」亲自带着走（键盘 WASD / 拖动摇杆 / 点地面），或者点别的猫、居民去打招呼。
- 实时昼夜（路灯、窗光、萤火虫、灯塔光束）、天气（雨、雪、云影）、四季（樱花、枫叶、雪顶，以及广场上的花拱门、遮阳伞、南瓜灯笼、猫耳雪人）。
- 你亲自带它出门时，它想待多晚都可以；它自己出门的话，天黑前一定回家。

**不焦虑的社交**
- 没有好友数、点赞、排行榜、在线状态、已读回执。
- 猫友是猫自己交的；可以去别人家串门、在门口贴张纸条。
- 「共养」：和一位陌生人（或用邀请码和朋友）一起养一只新的小猫，只有一本每天一页的交换日记。解除共养时，小猫会搬去小镇生活，大家还能在街上遇见它。
- 文字有温柔过滤：不能留联系方式、链接或骂人。

**让人每晚想回来，但不催**
- 回来时有「欢迎回来」卡片：你不在时它做了什么。
- 可选的通知（Web Push）：探险归来、交到朋友、交换日记新的一页……一天最多 4 条，有安静时段，从不说“你好久没来了”。

**猫猫的语言由模型生成**
- 配置 `ANTHROPIC_API_KEY` 后，猫说的话、猫与猫的对话、居民的闲聊、探险日记、通知文案、文字指令理解都由 Claude 实时生成，并结合它的性格、记忆、时间、天气和地点。
- 没有 key 时会使用内置的程序化语句生成器，游戏完全可玩。

## 运行

需要 Node.js 24（或 22.13+，使用内置的 `node:sqlite`）。

```bash
npm install
```

开发（同时启动 API/WebSocket 服务 :8737 和 Vite :5199）：

```bash
npm run dev
```

然后打开 http://localhost:5199 。

本地跑生产版：

```bash
npm run build && npm run build:server && npm start
```

## 部署到服务器（Linux + Docker）

一台 1 核 2G 的 Linux 云服务器就够起步（60 个同时在线的压测里 CPU < 5%、内存 ~140MB）。整套服务是两个容器：游戏本身，和前面负责 HTTPS 的 Caddy。

1. **准备**：域名解析（A 记录）指向服务器 IP；服务器防火墙 / 安全组放行 80、443（TCP）和 443（UDP，HTTP/3）。安装 Docker：

```bash
curl -fsSL https://get.docker.com | sh
```

2. **拷贝项目并配置**：

```bash
git clone <你的仓库地址> catnest && cd catnest
```

```bash
cp .env.example .env
```

编辑 `.env`：至少填 `CAT_DOMAIN`（你的域名），建议填 `CAT_ADMIN_TOKEN`（`openssl rand -hex 24` 生成）。

3. **启动**：

```bash
docker compose up -d --build
```

几十秒后打开 `https://你的域名` 即可。证书由 Caddy 自动申请、自动续期。

4. **更新版本**：

```bash
git pull && docker compose up -d --build
```

数据在名为 `catnest-data` 的 Docker 卷里（数据库、加密密钥、推送密钥、每日备份），更新、重启、重建容器都不会丢。

**已经有自己的 Nginx / Caddy？** 删掉 `docker-compose.yml` 里的 `caddy` 服务，给 `app` 加上 `ports: ["127.0.0.1:8737:8737"]`，再让你的反向代理转发到 `127.0.0.1:8737`（WebSocket 路径是 `/ws`，需要转发 Upgrade 头），并传递 `X-Forwarded-For` / `X-Forwarded-Proto` / `Host`。

### 日常运维

```bash
docker compose logs -f app
```

```bash
docker compose exec app node scripts/admin.mjs stats
```

`admin.mjs` 还支持：`reports`（看举报）、`resolve <id>`、`ban <用户id或猫id> [原因]`、`unban <用户id>`、`rename-cat <猫id> <名字>`、`delete-note <id>`、`delete-diary <id>`。被封禁的账号会立即下线，它的猫回家，不再出现在小镇和串门列表里。

**屏蔽词**：内置了一份常见的联系方式、链接、辱骂和诈骗词表；要追加，在数据卷里放一个 `blocklist.txt`（一行一个，改完自动生效）：

```bash
docker compose cp blocklist.txt app:/app/data/blocklist.txt
```

**备份**：服务每天自动在 `data/backups/` 生成一份一致的数据库快照，保留最近 7 天。拷到服务器外面：

```bash
docker compose cp app:/app/data/backups ./catnest-backups
```

恢复时停掉服务，把某天的 `cats-YYYY-MM-DD.db` 复制成卷里的 `cats.db`（并删除 `cats.db-wal`、`cats.db-shm`），再启动。

## 账号与安全

- **先玩后注册**：第一次打开只需要起个称呼，就有了一个游客账号。为了防止被脚本批量注册，浏览器会在后台做一道几百毫秒的计算题（工作量证明），注册多了难度会自动变高；每个 IP 每小时也有上限。
- **给猫窝上锁**：玩了一会儿后会温柔地提醒一次。可以绑定**通行密钥**（面容 / 指纹 / 设备密码，会随 iCloud 钥匙串或谷歌密码管理器同步），也可以生成一串 12 位的**找回码**。找回码只显示一次，服务器只存它的加密摘要。不需要邮箱和手机号。
- **登录状态**：每台设备一个独立的登录会话，存在 HttpOnly + Secure 的 Cookie 里（网页脚本读不到）。设置里能看到所有登录着的设备，可以单独退出或一键退出其他设备。会话 180 天有效，常来会自动续期。
- **防护**：所有改动类请求都检查来源（防 CSRF），WebSocket 只认自家页面带来的 Cookie（防跨站劫持）；全站限流（按 IP 和按账号），模型调用有全服和单人每日额度；严格的 CSP、HSTS、禁止嵌入；推送地址只接受浏览器官方推送服务（防 SSRF）；容器以非 root、只读文件系统、去掉全部权限运行。
- **社区**：名字、纸条、交换日记都会过滤联系方式（包括“加 我 V 信”“一三八……”这类变体）、链接和不友善的话；玩家可以举报猫、纸条和日记，管理员用 `admin.mjs` 处理。
- **你的数据**：设置里可以导出全部数据（JSON），或者删除账号（共养的猫会留给对方）。隐私说明在设置里。

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

模型调用做了“台词池”缓存：每次按场景批量生成几句，玩家拿到的永远是现成的一句，后台再补货，所以不会卡顿，也不会每句话都花钱。模型生成的句子在展示给其他玩家前同样会经过屏蔽词过滤。

## 测试

```bash
npm test
```

包括：小镇每个地点从家门口都走得到、寻路、猫窝布局校验、数值“温柔”约束（一周没人管也不会饿坏）、每日心愿、兜底猫语覆盖所有场景、物品表一致性；以及真实启动服务器的接口测试：工作量证明注册、Cookie 会话、CSRF 与跨站 WebSocket 拦截、找回码、通行密钥（用软件模拟的密钥完成绑定与登录）、设备管理、共养、删号移交、导出、举报与封禁、静态文件越权访问。

## 调试小工具

- `http://localhost:5199/?hour=21&weather=rain&season=3`：预览夜晚 / 雨天 / 冬天的画面（只影响本地显示）。
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

## iOS App

`ios/` 是用 Capacitor 8 做的原生壳：游戏网页打包在 App 里，联网时连 `.env.ios` 里 `VITE_API_BASE` 指定的服务器。和网页版相比，App 里多了这些：

- 登录凭证存在 iOS 钥匙串（Keychain）里，删掉重装 App 也还在；
- 通知走苹果的 APNs 推送，点通知会直接打开信箱；
- 呼噜、发现宝贝时有震动反馈；
- 导出数据、保存照片走系统的分享面板（可以存到「文件」）；
- 留出了刘海和灵动岛的安全区域，启动画面和图标就是游戏里画的那只三花猫。

### 在本机用 Docker + 模拟器调试

1. `.env` 里写 `CAT_DOMAIN=localhost`，然后启动服务（Caddy 会给 localhost 签一张本机证书）：

```bash
docker compose up -d --build
```

2. 让模拟器信任这张本机证书（只需做一次）：

```bash
docker compose cp caddy:/data/caddy/pki/authorities/local/root.crt ./caddy-root.crt
```

```bash
xcrun simctl keychain booted add-root-cert ./caddy-root.crt
```

3. 配置并构建 App 里的网页（`.env.ios` 里写 `VITE_API_BASE=https://localhost`）：

```bash
cp .env.ios.example .env.ios
```

```bash
npm run build:ios
```

4. 用 Xcode 打开 `ios/App/App.xcodeproj`，选一台模拟器运行（也可以 `npm run ios`，它会构建好再打开 Xcode）。改了网页代码后，重新 `npm run build:ios`，再在 Xcode 里运行一次即可。

### 上架 TestFlight / App Store 前

1. **开发者账号**：在 Xcode 的 Signing & Capabilities 里选择你的 Team；把 Bundle ID `com.catnest.app` 换成你自己的（同时改 `capacitor.config.json` 里的 `appId`）。
2. **推送**：在 Apple 开发者后台给这个 App ID 打开 Push Notifications，然后创建一个 APNs 密钥（`.p8` 文件）。把 `.p8` 放到服务器的 `secrets/` 目录，在 `.env` 里填 `CAT_APNS_KEY_ID`、`CAT_APNS_TEAM_ID`、`CAT_APNS_BUNDLE_ID`，再打开 `docker-compose.yml` 里挂载密钥的那几行注释。正式包的 `.env.ios` 要写 `VITE_APNS_ENV=production`。
3. **服务器地址**：`.env.ios` 里的 `VITE_API_BASE` 改成你的正式域名，再 `npm run build:ios`。
4. **通行密钥**：App 里暂时只支持找回码登录（网页版可以添加通行密钥，App 里也能显示）。如果要在 App 里直接用面容 / 指纹登录，需要在域名上放 `apple-app-site-association` 文件并配置 Associated Domains，有了开发者账号以后可以接着做。

模拟器里可以这样模拟一条推送，看看样式和点开后的效果：

```bash
xcrun simctl push booted com.catnest.app push.apns
```

其中 `push.apns` 的内容是 `{"aps":{"alert":{"title":"汤圆探险回来啦","body":"带回了一片枫叶"}}}`。

`client/appicon.html` 是生成图标和启动图的小工具：开发服务器跑起来后，访问 `/appicon.html?pick=1` 可以挑猫，访问 `/appicon.html?seed=951` 会渲染出图标和启动图。
