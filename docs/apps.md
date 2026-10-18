# 各个客户端：构建、调试与发布

网页版不需要单独构建：服务器跑起来就能用浏览器玩（也可以「添加到主屏幕」当 App 用）。下面是四个原生客户端的做法。它们默认都连接公共服务器 **https://mycat.xioix.xin**；自己架了服务器的话，按各自的配置改成你的域名（见 [DEPLOY.md 第 11 节](../DEPLOY.md#11-让各个-app-连到你的服务器)）。

- [iOS App](#ios-app)
- [Android App](#android-app)
- [Mac 菜单栏 App](#mac-菜单栏-app)
- [Apple Watch App](#apple-watch-app)

## iOS App

`ios/` 是用 Capacitor 8 做的原生壳：游戏网页打包在 App 里，联网时连公共服务器 `https://mycat.xioix.xin`（或 `.env.ios` 里 `VITE_API_BASE` 指定的服务器）。和网页版相比，App 里多了这些：

- 登录凭证存在 iOS 钥匙串（Keychain）里，删掉重装 App 也还在；
- 通知走苹果的 APNs 推送，点通知会直接打开信箱；
- 呼噜、发现宝贝时有震动反馈；
- 导出数据、保存照片走系统的分享面板（可以存到「文件」）；
- 留出了刘海和灵动岛的安全区域，启动画面和图标就是游戏里画的那只三花猫。

### 装到自己的 iPhone 上（免费 Apple ID 也可以）

苹果不允许直接下载安装包，但可以用 Mac 上的 Xcode 把源代码装到自己的 iPhone。装好后连接公共服务器，和网页版、安卓版在同一个小镇里。

1. Mac 上安装 Xcode（App Store 里搜）和 Node.js 24，然后下载源代码：

```bash
git clone https://github.com/TTStick/meowtopia.git
```

2. 进入项目目录，安装依赖并构建 App 里的游戏：

```bash
npm install
```

```bash
npm run build:ios
```

3. 用 Xcode 打开 `ios/App/App.xcodeproj`。在左边选中 App 项目，打开 Signing & Capabilities，把 Team 选成你的 Apple ID（没有的话先在 Xcode → 设置 → Accounts 里登录）。
4. 用**免费 Apple ID** 时还要做两件事：
   - 在项目的 Build Settings 里搜索 `CATNEST_BUNDLE_ID`，改成一个独一无二的名字，比如 `com.你的名字.catnest`。手表 App 的 ID 会自动跟着改。
   - 在 App 这个 target 的 Signing & Capabilities 里，删掉 Push Notifications 这一项。免费账号不支持推送；猫猫的小纸条照样会出现在游戏的信箱里。
5. 用数据线连上 iPhone，在 iPhone 的「设置 → 隐私与安全性」里打开「开发者模式」。回到 Xcode，在顶部选中你的 iPhone，点 ▶ 运行。第一次打开时，到 iPhone 的「设置 → 通用 → VPN 与设备管理」里信任你的开发者证书。

免费 Apple ID 装的 App 7 天后会失效，再用 Xcode 运行一次就好：猫在服务器上，登录凭证在钥匙串里，什么都不会丢（保险起见，在游戏的「设置 → 账号与安全」里生成一个找回码）。付费开发者账号没有这些限制。

想连自己的服务器：把 `.env.ios.example` 复制成 `.env.ios`，把 `VITE_API_BASE` 改成你的域名，再 `npm run build:ios`。

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

1. **开发者账号**：在 Xcode 的 Signing & Capabilities 里选择你的 Team；在 Build Settings 里把 `CATNEST_BUNDLE_ID`（默认 `com.catnest.app`）换成你自己的，同时改 `capacitor.config.json` 里的 `appId`。
2. **推送**：在 Apple 开发者后台给这个 App ID 打开 Push Notifications，然后创建一个 APNs 密钥（`.p8` 文件）。把 `.p8` 放到服务器的 `secrets/` 目录，在 `.env` 里填 `CAT_APNS_KEY_ID`、`CAT_APNS_TEAM_ID`、`CAT_APNS_BUNDLE_ID`，再打开 `docker-compose.yml` 里挂载密钥的那几行注释。正式包的 `.env.ios` 要写 `VITE_APNS_ENV=production`。
3. **服务器地址**：默认连接公共服务器；连自己的服务器时，`.env.ios` 里的 `VITE_API_BASE` 改成你的正式域名，再 `npm run build:ios`。
4. **通行密钥**：App 里暂时只支持找回码登录（网页版可以添加通行密钥，App 里也能显示）。如果要在 App 里直接用面容 / 指纹登录，需要在域名上放 `apple-app-site-association` 文件并配置 Associated Domains，有了开发者账号以后可以接着做。

模拟器里可以这样模拟一条推送，看看样式和点开后的效果：

```bash
xcrun simctl push booted com.catnest.app push.apns
```

其中 `push.apns` 的内容是 `{"aps":{"alert":{"title":"汤圆探险回来啦","body":"带回了一片枫叶"}}}`。

`client/appicon.html` 是生成图标和启动图的小工具：开发服务器跑起来后，访问 `/appicon.html?pick=1` 可以挑猫，访问 `/appicon.html?seed=951` 会渲染出图标和启动图。

## Android App

`android/` 和 iOS 用的是同一套 Capacitor 8 原生壳（Android 7.0 以上），玩法、界面和 iPhone 版完全一样，安卓上的做法有这些不同：

- **登录凭证**用 Android Keystore 加密保存（相当于 iOS 的钥匙串），也不会被系统备份带走。
- **猫猫的小纸条（通知）不依赖谷歌服务**，国内手机也能收到。App 自己大约每半小时悄悄看一眼有没有新信，规则和服务器给 iPhone 的推送一样：只在设置里打开了通知时、不在安静时段、一天最多 4 条、两条之间至少隔 2 小时。刚打开时会先发一条示范小纸条；点通知直接打开信箱，App 被关掉了也一样。
- **返回键**一层层退：先收起键盘、对话框、面板和说话框，再从小镇回到猫窝，最后才把 App 放到后台，不会一下子退出。
- **照片**直接存进相册里的「猫窝」文件夹，同时弹出分享面板；导出数据也走分享面板。
- 状态栏和底部手势条跟着场景变色（夜里深色、小镇浅色）；呼噜、发现宝贝时有震动。
- 图标是自适应图标（支持 Android 13 起的主题图标），启动画面也是那只三花猫。
- Apple Watch 相关的功能只在 iPhone 上有。

### 在本机用模拟器调试

需要 Android Studio（或命令行 SDK）和 JDK 21。

1. 启动开发服务（API 在 8737 端口）：

```bash
npm run dev
```

2. 让模拟器（或用 USB 连着的手机）通过 `localhost:8737` 访问电脑上的服务：

```bash
adb reverse tcp:8737 tcp:8737
```

3. 配置并构建 App 里的网页（`.env.android` 里写 `VITE_API_BASE=http://localhost:8737`）：

```bash
cp .env.android.example .env.android
```

```bash
npm run build:android
```

4. 用 Android Studio 打开 `android/` 目录运行（也可以 `npm run android`，它会构建好再打开 Android Studio）。改了网页代码后，重新 `npm run build:android` 再运行一次。

调试版只允许用 http 连 `localhost`；正式版只能连 https。

### 打正式包

1. 构建 App 里的游戏：`npm run build:android`。默认连接公共服务器 `https://mycat.xioix.xin`；连自己的服务器时，先在 `.env.android` 里把 `VITE_API_BASE` 写成 `https://你的域名`。
2. 生成签名密钥（只需一次）。这个 `.jks` 文件和密码一定要保管好，以后每次更新都必须用同一把钥匙签名：

```bash
keytool -genkeypair -v -keystore android/catnest-release.jks -alias catnest -keyalg RSA -keysize 2048 -validity 10000
```

3. 把 `android/keystore.properties.example` 复制成 `android/keystore.properties`，填上密码（这两个文件都不会进 git）。然后打包：`./gradlew bundleRelease` 得到上架用的 `.aab`，`./gradlew assembleRelease` 得到可以直接安装的 `.apk`（都在 `android/app/build/outputs/` 下）。

```bash
cd android && ./gradlew bundleRelease assembleRelease
```

4. 想换包名时，同时改 `android/app/build.gradle` 里的 `applicationId` 和 `capacitor.config.json` 里的 `appId`。
5. 放到官网上给大家下载：见 [DEPLOY.md「发布 Android 安装包」](../DEPLOY.md#发布-android-安装包)。

小米、华为等系统的省电策略比较严，可能会推迟 App 在后台查信。在系统设置里允许猫窝「自启动 / 后台运行」，通知会更准时。

图标和启动图由 `scripts/make-android-icons.ts` 用游戏里的画法生成：

```bash
node --import tsx scripts/make-android-icons.ts
```

## Mac 菜单栏 App

`macos/` 是一个原生的 macOS App（Swift + AppKit + WKWebView，用 XcodeGen 生成工程，系统要求 macOS 14+）：

- **菜单栏里常驻你的猫**：图标就是你自己的猫（服务器用游戏里同一套画法画好），它会眨眼、甩尾巴、舔毛、打哈欠。到了晚上蜷成一团睡觉，出门探险时变成小爪印，有新信时图标上会亮一个小红点。
- **点一下打开陪伴面板**：可以看到会动的猫、它说的话、饱腹 / 精力 / 心情和今天的小心愿。能摸摸、喂食、逗猫、出门、叫它回家、说晚安，也能直接打字对它说话。右键图标有「开机时陪着你」和「退出」。
- **「打开完整游戏」**：在独立窗口里玩完整版，和面板共用同一个登录。窗口打开时 App 出现在 Dock，关掉后又安静地回到菜单栏。
- 有新信时会发系统通知（在游戏设置里打开「猫猫的小纸条」）。

构建与运行：

```bash
cd macos && xcodegen generate
```

```bash
open macos/CatNest.xcodeproj
```

调试版连接 `https://localhost`（本机 Docker）。正式版默认连接公共服务器 `https://mycat.xioix.xin`，在游戏里「设置 → 所在的小镇」可以换到任何一个小镇。想让 App 默认连你的小镇，把 `macos/project.yml` 里 Release 的 `CATNEST_SERVER` 改成你的域名，已经装好的 App 也可以这样改：

```bash
defaults write com.catnest.mac serverURL https://你的域名
```

第一次打开时，App 会顺便打开游戏窗口（之后只住在菜单栏里）。

### 打包给别人下载

用 Release 配置构建一个同时支持 Apple 芯片和 Intel 的 App：

```bash
xcodebuild -project macos/CatNest.xcodeproj -scheme CatNest -configuration Release -derivedDataPath build/mac ONLY_ACTIVE_ARCH=NO build
```

再放到服务器的下载目录（官网「下载」里的 Mac 卡片会显示版本、大小和 SHA-256；服务器上没有 Mac 版时，这张卡片自动隐藏）：

```bash
./deploy/publish-mac.sh build/mac/Build/Products/Release/CatNest.app 1.0 root@你的服务器IP:/opt/catnest
```

这样打出来的 App 是本机签名（ad-hoc），没有经过苹果公证，别人第一次打开时会看到「无法验证开发者」，要在「系统设置 → 隐私与安全性」里点「仍要打开」。有 Apple 开发者账号的话，用 Developer ID 签名并公证（`notarytool`）后就没有这一步了。

## Apple Watch App

`ios/App/CatNestWatch/` 是原生 SwiftUI 手表 App（watchOS 10+）。它随 iPhone App 一起安装（附属），但**可以完全脱离手机单独使用**：

- **打开就能看到你的猫**：画法和游戏里一模一样，会呼吸、眨眼、舔毛、打哈欠。白天是暖色背景，夜里是星空，猫会蜷着睡觉。
- **轻点猫猫是摸摸，转动表冠是顺毛**：每顺一下手腕会轻轻一震，顺够了会冒出小爱心，还能感觉到它呼噜呼噜。
- 底栏可以喂食（列出背包里的食物）、逗猫（夜里变成说晚安）。「更多」里有三个状态圆环、今天的心愿、语音或随手写对它说话、出门 / 叫它回家、信箱、生成找回码和退出登录。
- **登录方式**：装了 iPhone App 时，手机会自动把登录交给手表，什么都不用输；或者在手表上点「用手机或电脑登录」，把显示的 6 位码填到任意已登录设备的「设置 → 登录手表」；也可以直接在手表上开一个新猫窝，从三只小猫里领养一只。

在模拟器里运行：用 Xcode 选择 `CatNestWatch` scheme 和一台手表模拟器。调试版连接 `https://localhost`；正式版默认连接公共服务器，地址在 `CatNestWatch/Config.swift` 的 `defaultServer`。和 iPhone 一起使用时，手机会把自己的服务器地址一并告诉手表。


## 猫窝手表版（独立的 Apple Watch App）

`watchos/` 是另一个原生 SwiftUI 手表 App：**只装在手表上、不需要 iPhone**（watch-only，包名 `com.catnest.watch`，名字「猫窝手表版」，图标是夜空下的猫）。它和上面 iPhone App 附带的手表 App 是两个独立的 App，可以同时装在一块表上，各自登录。

功能像一个缩小的手机 App：

- **猫窝**：和附带版一样，轻点是摸摸，**转动表冠是顺毛**（每顺一下轻轻一震，顺五下它会呼噜）；新款手表上**捏两下手指**就是逗猫（夜里是说晚安）。猫出门时显示它在小镇的哪里、捡到了什么，可以叫它回家；去邻居家做客时也会显示。
- **菜单**（表冠滚动）：状态（饱腹、精力、心情、干净、陪伴五个圆环，羁绊等级，年纪、毛色、性格、小癖好、去过几个地方）、今天的小心愿、对它说话（语音或手写）、出门 / 回家、梳毛、信箱、日记（可以往前翻）、收藏册、衣柜、商店、小镇（时间天气、今晚的舞台、它这趟出门的经过）、邻居（看门牌，带它去串门）。
- **衣柜：转表冠一件件试穿**，猫当场戴上给你看；买过的点「戴上 / 摘下」，裁缝铺在卖的可以直接买下。
- **商店：转表冠选数量**，再点买下。
- **换小镇**：登录前的「小镇：… · 换一个」或「设置 → 换一个小镇」，默认官方体验服，可以加上自己小镇的网址；每个小镇的登录分开记着。
- **随身搬家包**：和手机 App 一样，每天在手表上存一份猫的搬家包，换小镇前也会更新一次。到了新小镇的领养页会出现「带某某搬过来」，提交后等那边的管理员同意，猫就到了。小镇暂停或关服时，主页会提示，可以照常带猫离开。
- **登录**：用已登录的手机 App、Mac 或网页「设置 → 登录手表」配对（手表上显示 6 位码），用找回码登录，或者直接在手表上开一个新猫窝领养小猫。

它和附带版共用 `ios/App/CatNestWatch/` 里的几份基础代码（`API.swift`、`Keychain.swift`、`Config.swift`、`CatView.swift`、`Debug.swift`），其余都在 `watchos/CatNestWatchSolo/`。服务端给它的接口在 `server/src/watch.ts`（`/api/watch`、`/api/watch/wardrobe`、`/api/watch/shop`、`/api/watch/collection`；物品名字、季节天气、舞台都在服务端算好，手表上不用带游戏的资料）。

工程用 XcodeGen 生成：

```bash
cd watchos && xcodegen generate
```

```bash
open watchos/CatNestWatchSolo.xcodeproj
```

调试版默认连 `https://localhost`；连本机开发服务器（`npm run dev`，http://localhost:8737）可以在模拟器里先写好地址：

```bash
xcrun simctl spawn booted defaults write com.catnest.watch server http://localhost:8737
```

调试版的启动参数：`-CatNestDebugCode 找回码`（直接登录）、`-CatNestDebugScreen menu|status|wardrobe|shop|town|neighbors|collection|journal|settings|towns|letters|feed|movein`（直接打开某一页）、`-CatNestDebugAct "buy:straw_hat,wear:straw_hat,feed:treat_fish,brush"`（依次做这些事）。图标由 `scripts/make-watch-icon.ts` 用游戏里的画法生成。
