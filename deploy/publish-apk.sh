#!/usr/bin/env bash
# 把签名好的 Android 安装包放到服务器的 downloads/ 目录，官网的「下载 APK」就会指向它。
#   ./deploy/publish-apk.sh <app-release.apk> <版本号> root@你的服务器:/opt/catnest
# 也可以只生成文件不上传（第三个参数写一个本地目录）。需要指定 SSH 密钥时：SSH_OPTS='-i ~/.ssh/key' ./deploy/publish-apk.sh …
set -euo pipefail
apk=${1:?用法：publish-apk.sh <apk> <版本号> <服务器:目录 或 本地目录>}
version=${2:?需要版本号，比如 1.0}
dest=${3:?需要目标：root@服务器:/opt/catnest 或 本地目录}
read -r -a opts <<< "${SSH_OPTS:-}"

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
cp "$apk" "$tmp/meowtopia.apk"
size=$(wc -c < "$tmp/meowtopia.apk" | tr -d ' ')
if command -v sha256sum >/dev/null; then sha=$(sha256sum "$tmp/meowtopia.apk" | cut -d' ' -f1); else sha=$(shasum -a 256 "$tmp/meowtopia.apk" | cut -d' ' -f1); fi
printf '{"file":"meowtopia.apk","version":"%s","size":%s,"sha256":"%s","date":"%s"}\n' "$version" "$size" "$sha" "$(date +%Y-%m-%d)" > "$tmp/android.json"

case "$dest" in
  *:*)
    host=${dest%%:*}; dir=${dest#*:}
    ssh ${opts[@]+"${opts[@]}"} "$host" "mkdir -p '$dir/downloads'"
    # 先传到临时名字再改名，下载到一半的人不会拿到半个文件
    scp ${opts[@]+"${opts[@]}"} -q "$tmp/meowtopia.apk" "$host:$dir/downloads/.meowtopia.apk.new"
    scp ${opts[@]+"${opts[@]}"} -q "$tmp/android.json" "$host:$dir/downloads/.android.json.new"
    ssh ${opts[@]+"${opts[@]}"} "$host" "cd '$dir/downloads' && mv .meowtopia.apk.new meowtopia.apk && mv .android.json.new android.json && chmod 644 meowtopia.apk android.json"
    ;;
  *)
    mkdir -p "$dest"
    cp "$tmp/meowtopia.apk" "$tmp/android.json" "$dest/"
    ;;
esac
echo "已发布 版本 $version（$size 字节，SHA-256 $sha）"
