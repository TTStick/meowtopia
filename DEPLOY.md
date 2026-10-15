# 猫窝 · 服务器部署手册

用一台 Linux 服务器 + Docker 上线猫窝。整套服务是两个容器：

- **app**：游戏本体（网页、接口、实时小镇、数据库都在里面）
- **caddy**：对外的 HTTPS 入口，自动申请并续期证书

数据（数据库、密钥、每日备份）都在 Docker 卷里，重启、更新、重建容器都不会丢。

---

## 0. 准备

| 项目 | 要求 |
|---|---|
| 服务器 | Linux（Ubuntu 22.04/24.04、Debian 12、Rocky 9 等都可以），x86_64 或 ARM64 |
| 配置 | 起步 1 核 2G。只有 1G 内存的话，请用预构建镜像包（见第 6 节），或者先加 swap |
| 域名 | 一个域名（或子域名，例如 `cat.example.com`），**A 记录指向服务器公网 IP** |
| 端口 | 防火墙 / 云服务器安全组放行 **80/TCP、443/TCP、443/UDP** |

> **国内服务器请注意**：阿里云、腾讯云、华为云等国内机房要求域名完成 **ICP 备案** 才能使用 80/443 端口，否则 Caddy 申请不到证书、网站也打不开。境外服务器（香港、新加坡、日本等）不需要备案。

---

## 1. 上传并解压

在你自己的电脑上，把压缩包传到服务器（以 `/opt` 为例）：

```bash
scp catnest-2026-10-15.tar.gz root@你的服务器IP:/opt/
```

登录服务器后解压：

```bash
cd /opt && tar xzf catnest-2026-10-15.tar.gz && cd catnest
```

## 2. 安装 Docker

已经装过可以跳过。境外服务器：

```bash
curl -fsSL https://get.docker.com | sh
```

国内服务器（用阿里云镜像安装）：

```bash
curl -fsSL https://get.docker.com | sh -s -- --mirror Aliyun
```

确认版本（Compose 需要 v2.24 以上）：

```bash
docker compose version
```

## 3. 一键部署

把 `cat.example.com` 换成你的域名：

```bash
./deploy/setup.sh cat.example.com
```

脚本会自动：

1. 生成 `.env`（填好域名，随机生成管理口令，权限设为仅 root 可读）；
2. 构建镜像并启动两个容器（第一次需要几分钟）；
3. 等游戏服务健康检查通过后告诉你结果。

然后等几十秒让 Caddy 申请证书，用浏览器打开 `https://你的域名`，能看到「开始养猫」就成功了。

<details>
<summary>不想用脚本？手动部署的步骤</summary>

```bash
cp .env.example .env
```

编辑 `.env`，至少把 `CAT_DOMAIN` 改成你的域名，`CAT_ADMIN_TOKEN` 填一串随机字符（可以用 `openssl rand -hex 24` 生成），然后：

```bash
chmod 600 .env && docker compose up -d --build
```

</details>

## 4. 检查是否正常

```bash
docker compose ps
```

两个容器都应是 `Up`，其中 app 显示 `(healthy)`。

```bash
curl -s https://你的域名/healthz
```

返回 `ok` 就说明 HTTPS、反向代理和游戏服务都通了。

查看日志：

```bash
docker compose logs -f
```

## 5. 可选配置（都在 `.env` 里）

| 变量 | 作用 |
|---|---|
| `CAT_WORLD_TZ` | 小镇的统一时钟，默认 `8`（北京时间） |
| `ANTHROPIC_API_KEY` | 填写后猫猫的话由 Claude 生成；不填则用内置的句子，游戏完全可玩 |
| `CAT_LLM_MODEL` | 默认 `claude-opus-5-5`；想省钱可换 `claude-haiku-5-5` |
| `CAT_LLM_DAILY` / `CAT_LLM_USER_DAILY` | 全服每天、每位玩家每天的模型调用上限 |
| `NPM_REGISTRY` | 构建时的 npm 源，国内服务器可设为 `https://registry.npmmirror.com` |
| `CAT_APNS_*` | iOS App 推送（有 Apple 开发者账号后再配置，见 README） |

改完 `.env` 后让它生效：

```bash
docker compose up -d
```

## 6. 国内服务器下载慢 / 内存小

**方法一：换源。** 在 `.env` 里加上 `NPM_REGISTRY=https://registry.npmmirror.com`。如果拉取 Docker 基础镜像也很慢，可以在 `/etc/docker/daemon.json` 里配置你所用云厂商提供的镜像加速地址，然后重启 Docker。

**方法二：用预构建镜像包。** 如果拿到了 `catnest-images-amd64-*.tar.gz`（已经编译好的游戏镜像和 Caddy 镜像，适用于 x86_64 服务器），把它和项目放在同一目录（`/opt/catnest/` 或 `/opt/`），再运行 `./deploy/setup.sh 你的域名`。脚本会直接导入镜像，服务器上不需要联网下载依赖，也不需要编译，1G 内存也够用。

## 7. 日常运维

所有命令都在项目目录（例如 `/opt/catnest`）里执行。

| 做什么 | 命令 |
|---|---|
| 看日志 | `docker compose logs -f app` |
| 看在线、注册等统计 | `docker compose exec app node scripts/admin.mjs stats` |
| 看举报 | `docker compose exec app node scripts/admin.mjs reports` |
| 处理完一条举报 | `docker compose exec app node scripts/admin.mjs resolve <编号>` |
| 封禁（可以填用户 ID 或猫 ID） | `docker compose exec app node scripts/admin.mjs ban <ID> 原因` |
| 解封 | `docker compose exec app node scripts/admin.mjs unban <用户ID>` |
| 给不合适的猫改名 | `docker compose exec app node scripts/admin.mjs rename-cat <猫ID> 新名字` |
| 删除纸条 / 交换日记 | `docker compose exec app node scripts/admin.mjs delete-note <编号>`（日记用 `delete-diary`） |
| 重启 | `docker compose restart` |
| 停止 | `docker compose down`（数据不会丢） |

**追加屏蔽词**：写一个 `blocklist.txt`（一行一个词），复制进去，立即生效：

```bash
docker compose cp blocklist.txt app:/app/data/blocklist.txt
```

## 8. 备份与恢复

服务每天自动在数据卷里做一份数据库快照（`backups/cats-日期.db`），保留最近 7 天。建议定期再拷到服务器之外：

```bash
docker compose cp app:/app/data/backups ./catnest-backups
```

**完整打包整个数据卷**（迁移服务器时用）。卷名一般是「目录名_catnest-data」，可以用 `docker volume ls` 确认：

```bash
docker run --rm -v catnest_catnest-data:/d -v "$PWD":/b alpine tar czf /b/catnest-data.tgz -C /d .
```

**在新服务器上恢复**：先按第 1～3 步部署一遍，然后：

```bash
docker compose down
```

```bash
docker run --rm -v catnest_catnest-data:/d -v "$PWD":/b alpine sh -c "rm -rf /d/* && tar xzf /b/catnest-data.tgz -C /d && chown -R 1000:1000 /d"
```

```bash
docker compose up -d
```

> 数据卷里的 `secret.json` 用来校验找回码，`vapid.json` 用于网页推送。迁移时必须连同数据库一起搬，否则玩家的找回码会失效、通知需要重新开启。

## 9. 更新到新版本

把新的压缩包传到服务器，解压**覆盖**原目录（`.env` 和数据不在压缩包里，不会被覆盖），然后重新运行脚本：

```bash
cd /opt && tar xzf catnest-新版本.tar.gz && cd catnest && ./deploy/setup.sh
```

## 10. 常见问题

**打不开网站 / 证书申请失败**：查看 `docker compose logs caddy`。常见原因有：DNS 还没生效（`ping 你的域名` 看解析出的 IP 对不对）；安全组没放行 80/443；国内服务器的域名没有备案。

**80/443 已被占用**（服务器上已经有 Nginx 等）：二选一。
- 停掉原来的服务，让 Caddy 接管；
- 删掉 `docker-compose.yml` 里的 `caddy` 服务，给 `app` 加上 `ports: ["127.0.0.1:8737:8737"]`，由你现有的反向代理转发到 `127.0.0.1:8737`。注意要支持 WebSocket（路径 `/ws`，转发 `Upgrade` / `Connection` 头），并传递 `Host`、`X-Forwarded-For`、`X-Forwarded-Proto`。

**构建时卡住或报内存不足**：用第 6 节的预构建镜像包，或者给服务器加 2G swap 后再构建：

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
```

**页面能打开但小镇连不上**：通常是自己加的反向代理没有转发 WebSocket，见上面「80/443 已被占用」。

## 11. 让各个 App 连到你的服务器

服务器上线后，各客户端需要知道你的域名：

| 客户端 | 在哪里改 |
|---|---|
| 网页版 | 不用改，直接访问 `https://你的域名` |
| iPhone App | 项目根目录的 `.env.ios` 里写 `VITE_API_BASE=https://你的域名`，再 `npm run build:ios` |
| Mac App | `macos/project.yml` 里 Release 的 `CATNEST_SERVER`；装好的 App 也可以执行 `defaults write com.catnest.mac serverURL https://你的域名` |
| Apple Watch | `ios/App/CatNestWatch/Config.swift` 里的 `defaultServer`；和 iPhone 配对使用时会自动跟随手机 |

## 12. 安全提醒

- `.env` 里有管理口令，保持 `chmod 600`，不要提交或发给别人。
- 不要把 8737 端口直接暴露到公网，所有流量都应经过 Caddy。
- 游戏容器以非 root、只读文件系统运行，只有数据卷可写。
- 服务器本身记得开启自动安全更新，并只开放 22、80、443 端口。
