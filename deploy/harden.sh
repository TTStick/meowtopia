#!/usr/bin/env bash
# 猫窝服务器加固（Debian 12 / 13），在服务器上用 root 运行。分三步，每一步都不会把你锁在门外：
#
#   ./deploy/harden.sh [新的SSH端口]   第一步：系统更新、自动安全更新、日志、交换分区、内核参数、
#                                      Docker 设置、防火墙；SSH 同时开放 22 和新端口。
#                                      不填端口就随机挑一个 40000–60000 之间的。
#                                      如果 10 分钟内没有完成第二步，SSH 和防火墙的改动会自动撤销。
#   ./deploy/harden.sh confirm         第二步：用新端口登录成功后运行，关掉 22 端口。
#   ./deploy/harden.sh keys-only       可选：确认能用自己的密钥登录后运行，关掉密码登录。
#   ./deploy/harden.sh status          查看当前状态。
set -euo pipefail

STATE=/etc/catnest
SSHD_DROPIN=/etc/ssh/sshd_config.d/10-catnest.conf
FW_FILE=$STATE/firewall.nft
FW_UNIT=/etc/systemd/system/catnest-firewall.service

say() { printf '\033[1;33m%s\033[0m\n' "$*"; }
ok() { printf '\033[1;32m✓ %s\033[0m\n' "$*"; }
die() { printf '\033[1;31m%s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" = 0 ] || die "请用 root 运行"
[ -r /etc/os-release ] && . /etc/os-release
[ "${ID:-}" = debian ] || die "这个脚本只在 Debian 上测试过"
CODENAME=${VERSION_CODENAME:-trixie}
mkdir -p "$STATE"
chmod 700 "$STATE"

# ---------- pieces ----------

write_sshd() { # ports...
  {
    echo "# 猫窝加固（deploy/harden.sh）。这个文件在 sshd_config 的最前面生效。"
    for p in "$@"; do echo "Port $p"; done
    echo "MaxAuthTries 3"
    echo "LoginGraceTime 30"
    echo "PermitEmptyPasswords no"
    echo "X11Forwarding no"
    echo "AllowAgentForwarding no"
    echo "ClientAliveInterval 300"
    echo "ClientAliveCountMax 2"
    if [ -f "$STATE/keys-only" ]; then
      echo "PasswordAuthentication no"
      echo "KbdInteractiveAuthentication no"
      echo "PermitRootLogin prohibit-password"
    fi
  } > "$SSHD_DROPIN.new"
  mv "$SSHD_DROPIN.new" "$SSHD_DROPIN"
  sshd -t || { rm -f "$SSHD_DROPIN"; die "SSH 配置检查没通过，已经撤回"; }
  systemctl restart ssh
}

write_firewall() { # ssh ports...
  local ports
  ports=$(IFS=,; echo "$*")
  # Only our own table: Docker's rules (and anything else) stay untouched.
  # Traffic to the game reaches the containers through Docker's forwarding, not this input chain.
  cat > "$FW_FILE" <<EOF
table inet catnest_fw
delete table inet catnest_fw
table inet catnest_fw {
  set ssh_v4 { type ipv4_addr; flags dynamic; timeout 10m; }
  set ssh_v6 { type ipv6_addr; flags dynamic; timeout 10m; }
  chain input {
    type filter hook input priority filter - 10; policy drop;
    iif lo accept
    ct state established,related accept
    ct state invalid drop
    iifname "docker0" accept
    iifname "br-*" accept
    meta l4proto icmp accept
    meta l4proto ipv6-icmp accept
    udp dport { 68, 546 } accept
    tcp dport { $ports } ct state new update @ssh_v4 { ip saddr limit rate over 10/minute burst 10 packets } drop
    tcp dport { $ports } ct state new update @ssh_v6 { ip6 saddr limit rate over 10/minute burst 10 packets } drop
    tcp dport { $ports } accept
    tcp dport { 80, 443 } accept
    udp dport 443 accept
  }
}
EOF
  nft -c -f "$FW_FILE" || die "防火墙规则检查没通过，没有启用"
  if [ ! -f "$FW_UNIT" ]; then
    cat > "$FW_UNIT" <<EOF
[Unit]
Description=猫窝 host firewall (deploy/harden.sh)
After=network-pre.target

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=/usr/sbin/nft -f $FW_FILE
ExecStop=-/usr/sbin/nft delete table inet catnest_fw

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable catnest-firewall.service >/dev/null 2>&1
  fi
  systemctl restart catnest-firewall.service
}

arm_rollback() {
  cat > "$STATE/rollback.sh" <<EOF
#!/bin/sh
# 自动撤销：第二步没有在时限内完成，回到加固前的 SSH 和防火墙
rm -f $SSHD_DROPIN
systemctl disable --now catnest-firewall.service 2>/dev/null
nft delete table inet catnest_fw 2>/dev/null
systemctl restart ssh
echo "rolled back at \$(date)" > $STATE/rolled-back
EOF
  chmod 700 "$STATE/rollback.sh"
  disarm_rollback
  local unit="catnest-harden-rollback-$(date +%s)"
  systemd-run --quiet --unit="$unit" --on-active=10min /bin/sh "$STATE/rollback.sh"
  echo "$unit" > "$STATE/rollback-unit"
}
disarm_rollback() {
  local unit
  unit=$(cat "$STATE/rollback-unit" 2>/dev/null) || return 0
  systemctl stop "$unit.timer" "$unit.service" 2>/dev/null || true
  rm -f "$STATE/rollback-unit"
}
rollback_pending() {
  local unit
  unit=$(cat "$STATE/rollback-unit" 2>/dev/null) || return 1
  systemctl is-active --quiet "$unit.timer"
}
# a key of the owner's own, not just the deploy key
own_key() {
  grep -E '^(ssh-|ecdsa-|sk-)' /root/.ssh/authorized_keys 2>/dev/null | grep -vq 'catnest-deploy'
}

# ---------- steps ----------

step1() {
  local port=${1:-}
  if [ -z "$port" ]; then port=$(( 40000 + RANDOM % 20000 )); fi
  [[ "$port" =~ ^[0-9]+$ ]] && [ "$port" -ge 1024 ] && [ "$port" -le 65535 ] || die "端口要在 1024–65535 之间"
  for busy in 80 443 8737; do [ "$port" != "$busy" ] || die "这个端口游戏在用，换一个"; done
  echo "$port" > "$STATE/ssh-port"

  say "1/8 安全更新源"
  if ! grep -rqs "${CODENAME}-security" /etc/apt/sources.list /etc/apt/sources.list.d/; then
    cat > /etc/apt/sources.list.d/catnest-security.list <<EOF
deb http://security.debian.org/debian-security ${CODENAME}-security main non-free-firmware
deb http://deb.debian.org/debian ${CODENAME}-updates main non-free-firmware
EOF
    ok "加上了 ${CODENAME}-security 和 ${CODENAME}-updates"
  else
    ok "已经有安全更新源"
  fi

  say "2/8 安装更新（可能要几分钟；Docker 更新时游戏会重启一下）"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get -y -qq -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
  apt-get -y -qq install unattended-upgrades nftables >/dev/null
  ok "系统已是最新"

  say "3/8 自动安全更新"
  cat > /etc/apt/apt.conf.d/20auto-upgrades <<EOF
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
  ok "每天自动安装安全更新（不会自动重启）"

  say "4/8 保存系统日志"
  mkdir -p /etc/systemd/journald.conf.d /var/log/journal
  cat > /etc/systemd/journald.conf.d/10-catnest.conf <<EOF
[Journal]
Storage=persistent
SystemMaxUse=300M
MaxRetentionSec=1month
EOF
  systemd-tmpfiles --create --prefix /var/log/journal >/dev/null 2>&1 || true
  systemctl restart systemd-journald
  ok "日志保存一个月，最多 300 MB（查看：journalctl -u ssh）"

  say "5/8 交换分区"
  if [ "$(swapon --show --noheadings | wc -l)" -eq 0 ]; then
    fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap -q /swapfile && swapon /swapfile
    grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    ok "加了 1 GB 交换文件"
  else
    ok "已经有交换分区"
  fi

  say "6/8 内核网络参数"
  cat > /etc/sysctl.d/90-catnest.conf <<EOF
# 猫窝加固。ip_forward 保持开着，Docker 需要它。
net.ipv4.conf.all.send_redirects = 0
net.ipv4.conf.default.send_redirects = 0
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv6.conf.all.accept_redirects = 0
net.ipv6.conf.default.accept_redirects = 0
net.ipv4.conf.all.accept_source_route = 0
net.ipv6.conf.all.accept_source_route = 0
net.ipv4.conf.all.rp_filter = 2
net.ipv4.conf.default.rp_filter = 2
net.ipv4.icmp_echo_ignore_broadcasts = 1
net.ipv4.tcp_syncookies = 1
kernel.kptr_restrict = 2
kernel.dmesg_restrict = 1
vm.swappiness = 10
EOF
  sysctl -q --system
  ok "已生效"

  say "7/8 Docker"
  if [ ! -f /etc/docker/daemon.json ]; then
    mkdir -p /etc/docker
    cat > /etc/docker/daemon.json <<EOF
{
  "log-driver": "json-file",
  "log-opts": { "max-size": "10m", "max-file": "3" },
  "no-new-privileges": true,
  "live-restore": true
}
EOF
    systemctl restart docker
    ok "容器默认不能提权、日志有上限；以后升级 Docker 时容器不中断（这次重启了一下）"
  else
    ok "已经有 /etc/docker/daemon.json，没有改动"
  fi

  say "8/8 SSH 和防火墙（10 分钟内不确认就自动撤销）"
  rm -f "$STATE/rolled-back"
  write_sshd 22 "$port"
  write_firewall 22 "$port"
  arm_rollback
  ok "SSH 现在同时开着 22 和 $port；防火墙只放行 SSH、80 和 443"

  cat <<EOF

────────────────────────────────────────────
接下来（10 分钟内）：
  1. 如果服务商（雨云）控制台有「安全组 / 防火墙」，先放行 TCP $port。
  2. 不要关掉这个窗口，另开一个终端，用新端口登录：
       ssh -p $port root@这台服务器的IP
  3. 能登录的话，在新窗口里运行：
       cd /opt/catnest && ./deploy/harden.sh confirm
     这会关掉 22 端口，并取消自动撤销。
如果新端口登录不上，什么都不用做：10 分钟后会自动恢复原样，22 端口照常能用。
────────────────────────────────────────────
EOF
  if ! own_key; then
    say "提示：root 还没有你自己的 SSH 密钥（只有部署用的 catnest-deploy）。加上之后可以运行 keys-only 关掉密码登录。"
  fi
}

step_confirm() {
  local port
  port=$(cat "$STATE/ssh-port" 2>/dev/null) || die "还没有运行第一步"
  if [ -f "$STATE/rolled-back" ] || ! rollback_pending; then
    [ -f "$SSHD_DROPIN" ] && grep -q "^Port 22$" "$SSHD_DROPIN" || die "加固已经自动撤销了（超过 10 分钟没有确认），请重新运行第一步"
  fi
  disarm_rollback
  write_sshd "$port"
  write_firewall "$port"
  ok "22 端口已经关闭，SSH 只在 $port。自动撤销已取消，加固会一直保留（重启后也是）。"
  echo "以后登录：ssh -p $port root@这台服务器的IP"
}

step_keys_only() {
  local port
  port=$(cat "$STATE/ssh-port" 2>/dev/null) || die "先运行第一步和 confirm"
  own_key || die "root 还没有你自己的密钥：先把公钥加到 /root/.ssh/authorized_keys，并确认能用它登录"
  if [ -t 0 ]; then
    read -r -p "确认你已经用自己的密钥成功登录过了吗？关掉密码登录后只能用密钥（或服务商的网页控制台）。[y/N] " yes
    [ "$yes" = y ] || [ "$yes" = Y ] || die "已取消"
  fi
  touch "$STATE/keys-only"
  write_sshd "$port"
  ok "密码登录已关闭，只能用密钥登录"
}

step_status() {
  echo "SSH 端口：$(sshd -T 2>/dev/null | awk '/^port /{print $2}' | paste -sd' ' -)"
  echo "密码登录：$(sshd -T 2>/dev/null | awk '/^passwordauthentication /{print $2}')"
  echo "防火墙：$(systemctl is-active catnest-firewall.service 2>/dev/null || true)"
  echo "自动撤销：$(rollback_pending && echo 等待确认中 || echo 没有)"
  echo "自动安全更新：$(grep -c 'Unattended-Upgrade "1"' /etc/apt/apt.conf.d/20auto-upgrades 2>/dev/null || echo 0)"
  echo "需要重启（内核更新后）：$([ -f /var/run/reboot-required ] && echo 是 || echo 否)"
}

case "${1:-}" in
  confirm) step_confirm ;;
  keys-only) step_keys_only ;;
  status) step_status ;;
  -h|--help) sed -n '2,12p' "$0" ;;
  *) step1 "${1:-}" ;;
esac
