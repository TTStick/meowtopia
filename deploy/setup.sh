#!/usr/bin/env bash
# 猫窝 一键部署 / 更新
#   首次：  ./deploy/setup.sh cat.example.com
#   更新：  ./deploy/setup.sh            （已有 .env 时直接重建并重启）
# 如果同目录或上一级目录里有 catnest-images-*.tar.gz（预先构建好的镜像），
# 会直接导入它，服务器上不需要再下载依赖、编译。
set -euo pipefail
cd "$(dirname "$0")/.."

say() { printf '\033[1;33m%s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "没有找到 docker。先安装：curl -fsSL https://get.docker.com | sh"
docker compose version >/dev/null 2>&1 || die "没有找到 docker compose 插件，请升级 Docker（需要 Compose v2.24 以上）"
docker info >/dev/null 2>&1 || die "无法连接 Docker：请用 root 运行，或把当前用户加入 docker 组"

# ---------- .env ----------
if [ ! -f .env ]; then
  domain="${1:-}"
  if [ -z "$domain" ]; then
    read -r -p "你的域名（已解析到这台服务器，例如 cat.example.com）：" domain
  fi
  [ -n "$domain" ] || die "需要一个域名"
  if command -v openssl >/dev/null 2>&1; then
    token=$(openssl rand -hex 24)
  else
    token=$(head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n')
  fi
  sed -e "s|^CAT_DOMAIN=.*|CAT_DOMAIN=${domain}|" \
      -e "s|^CAT_ADMIN_TOKEN=.*|CAT_ADMIN_TOKEN=${token}|" \
      -e "s|^# CAT_VAPID_SUBJECT=.*|CAT_VAPID_SUBJECT=https://${domain}|" \
      .env.example > .env
  chmod 600 .env
  say "已生成 .env（域名 ${domain}，管理口令已随机生成，保存在 .env 里）"
else
  say "沿用现有的 .env"
fi
domain=$(grep -E '^CAT_DOMAIN=' .env | cut -d= -f2-)
[ -n "$domain" ] && [ "$domain" != "cat.example.com" ] || die ".env 里的 CAT_DOMAIN 还没改成你的域名"

if command -v getent >/dev/null 2>&1 && ! getent hosts "$domain" >/dev/null; then
  say "提醒：现在还解析不到 ${domain}，证书会申请失败。请确认 DNS 已指向这台服务器。"
fi

# ---------- 镜像 ----------
bundle=$(ls -1 catnest-images-*.tar.gz ../catnest-images-*.tar.gz 2>/dev/null | head -1 || true)
if [ -n "$bundle" ]; then
  say "导入预构建镜像：$bundle"
  docker load -i "$bundle"
  docker compose up -d
else
  say "构建镜像并启动（第一次大约需要几分钟）"
  docker compose up -d --build
fi

# ---------- 等待就绪 ----------
say "等待服务就绪…"
for _ in $(seq 1 60); do
  status=$(docker inspect -f '{{.State.Health.Status}}' "$(docker compose ps -q app)" 2>/dev/null || echo starting)
  [ "$status" = healthy ] && break
  sleep 2
done
docker compose ps
[ "${status:-}" = healthy ] || die "游戏服务没有正常启动，用 docker compose logs app 查看原因"

cat <<MSG

好了！稍等几十秒让 Caddy 申请证书，然后打开： https://${domain}

常用命令：
  查看日志      docker compose logs -f
  后台状态      docker compose exec app node scripts/admin.mjs stats
  处理举报      docker compose exec app node scripts/admin.mjs reports
  停止          docker compose down        （数据保存在 Docker 卷里，不会丢）
MSG
