#!/usr/bin/env bash
# 把 Mac 版放到服务器的 downloads/ 目录，官网的「下载 Mac 版」就会指向它。
#   ./deploy/publish-mac.sh <CatNest.app> <版本号> root@你的服务器:/opt/catnest
# 也可以只生成文件不上传（第三个参数写一个本地目录）。需要指定 SSH 密钥或端口时：SSH_OPTS='-o Port=2222' ./deploy/publish-mac.sh …
# App 用 Release 配置构建（见 docs/apps.md「Mac 菜单栏 App」），压缩包里叫「猫窝.app」。
set -euo pipefail
app=${1:?用法：publish-mac.sh <CatNest.app> <版本号> <服务器:目录 或 本地目录>}
version=${2:?需要版本号，比如 1.0}
dest=${3:?需要目标：root@服务器:/opt/catnest 或 本地目录}
read -r -a opts <<< "${SSH_OPTS:-}"
[ -d "$app/Contents/MacOS" ] || { echo "这不是一个 .app：$app" >&2; exit 1; }

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
ditto "$app" "$tmp/猫窝.app"
codesign --verify --deep --strict "$tmp/猫窝.app"
minos=$(/usr/libexec/PlistBuddy -c 'Print :LSMinimumSystemVersion' "$tmp/猫窝.app/Contents/Info.plist" 2>/dev/null || echo 14.0)
(cd "$tmp" && ditto -c -k --sequesterRsrc --keepParent "猫窝.app" meowtopia-mac.zip)
size=$(wc -c < "$tmp/meowtopia-mac.zip" | tr -d ' ')
sha=$(shasum -a 256 "$tmp/meowtopia-mac.zip" | cut -d' ' -f1)
printf '{"file":"meowtopia-mac.zip","version":"%s","size":%s,"sha256":"%s","minOS":"%s","date":"%s"}\n' "$version" "$size" "$sha" "${minos%.0}" "$(date +%Y-%m-%d)" > "$tmp/mac.json"

case "$dest" in
  *:*)
    host=${dest%%:*}; dir=${dest#*:}
    ssh ${opts[@]+"${opts[@]}"} "$host" "mkdir -p '$dir/downloads'"
    # 先传到临时名字再改名，下载到一半的人不会拿到半个文件
    scp ${opts[@]+"${opts[@]}"} -q "$tmp/meowtopia-mac.zip" "$host:$dir/downloads/.meowtopia-mac.zip.new"
    scp ${opts[@]+"${opts[@]}"} -q "$tmp/mac.json" "$host:$dir/downloads/.mac.json.new"
    ssh ${opts[@]+"${opts[@]}"} "$host" "cd '$dir/downloads' && mv .meowtopia-mac.zip.new meowtopia-mac.zip && mv .mac.json.new mac.json && chmod 644 meowtopia-mac.zip mac.json"
    ;;
  *)
    mkdir -p "$dest"
    cp "$tmp/meowtopia-mac.zip" "$tmp/mac.json" "$dest/"
    ;;
esac
echo "已发布 Mac 版 $version（$size 字节，SHA-256 $sha）"
