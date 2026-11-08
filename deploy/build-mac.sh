#!/usr/bin/env bash
# 构建给别人下载的 Mac 版（Release，Apple 芯片和 Intel 都能用），结果在 build/mac/Build/Products/Release/CatNest.app。
#   ./deploy/build-mac.sh
# 需要 Xcode。App 和桌面小组件共用一个 App Group，Xcode 不肯用自签名（ad-hoc）直接打这种包，
# 所以这里让 Xcode 只构建，再自己签名：先签里面的小组件，再签外面的 App。
set -euo pipefail
cd "$(dirname "$0")/.."
export DEVELOPER_DIR="${DEVELOPER_DIR:-/Applications/Xcode.app/Contents/Developer}"

xcodebuild -project macos/CatNest.xcodeproj -scheme CatNest -configuration Release -derivedDataPath build/mac \
  ONLY_ACTIVE_ARCH=NO CODE_SIGNING_ALLOWED=NO build | tail -1

app=build/mac/Build/Products/Release/CatNest.app
codesign --force --sign - --options runtime --entitlements macos/CatNestWidgets/CatNestWidgets.entitlements "$app/Contents/PlugIns/CatNestWidgets.appex"
codesign --force --sign - --options runtime --entitlements macos/CatNest/CatNest.entitlements "$app"
codesign --verify --deep --strict "$app"
echo "已构建：$app"
