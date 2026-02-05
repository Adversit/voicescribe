#!/bin/bash

# VoiceScribe DMG 打包脚本
# 生成带背景与布局的 .dmg 文件（包含应用与 Applications 快捷方式）

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
APP_NAME="VoiceScribe"
BUILD_CONFIG="${VOICESCRIBE_BUILD_CONFIG:-release}"
OUTPUT_DIR="$ROOT_DIR/dist"
STAGING_DIR="$OUTPUT_DIR/dmg"
DMG_NAME="${APP_NAME}.dmg"
VOLUME_NAME="${APP_NAME}"
TEMP_DMG="$OUTPUT_DIR/${APP_NAME}-rw.dmg"
BACKGROUND_DIR="$STAGING_DIR/.background"
BACKGROUND_IMG="$BACKGROUND_DIR/background.png"

SKIP_BUILD=0

for arg in "$@"; do
    case "$arg" in
        --skip-build)
            SKIP_BUILD=1
            ;;
        --debug)
            BUILD_CONFIG="debug"
            ;;
        --release)
            BUILD_CONFIG="release"
            ;;
    esac
done

echo "📦 VoiceScribe DMG 打包"
echo "======================"
echo "构建配置: $BUILD_CONFIG"
echo "输出目录: $OUTPUT_DIR"
echo ""

if [ "$SKIP_BUILD" -ne 1 ]; then
    echo "🔨 构建应用..."
    VOICESCRIBE_BUILD_CONFIG="$BUILD_CONFIG" VOICESCRIBE_SKIP_INSTALL=1 \
        "$ROOT_DIR/build.sh" --"$BUILD_CONFIG" --no-install
else
    echo "⏭️  跳过构建"
fi

APP_SRC="$ROOT_DIR/app/build/$APP_NAME.app"
if [ ! -d "$APP_SRC" ]; then
    echo "❌ 未找到应用: $APP_SRC"
    exit 1
fi

echo "🧹 清理旧的打包目录..."
rm -rf "$STAGING_DIR"
rm -f "$OUTPUT_DIR/$DMG_NAME" "$TEMP_DMG"
mkdir -p "$STAGING_DIR" "$BACKGROUND_DIR"

echo "📁 准备 DMG 内容..."
cp -R "$APP_SRC" "$STAGING_DIR/"
ln -s /Applications "$STAGING_DIR/Applications"

cat > "$STAGING_DIR/README.txt" << 'README'
VoiceScribe 安装说明
==================

1. 将 VoiceScribe.app 拖到 Applications 文件夹
2. 打开 VoiceScribe.app
3. 首次启动会提示下载默认模型（FunASR SeACo-Paraformer）

如需麦克风权限，请在 系统设置 -> 隐私与安全性 -> 麦克风 中开启。
README

echo "🎨 生成 DMG 背景..."
python3 - <<PY
import struct, zlib, os
path = "$BACKGROUND_IMG"
os.makedirs(os.path.dirname(path), exist_ok=True)
w, h = 640, 420
r, g, b = (246, 246, 244)
raw = b''.join([b'\\x00' + bytes([r, g, b]) * w for _ in range(h)])
def chunk(tag, data):
    return struct.pack("!I", len(data)) + tag + data + struct.pack("!I", zlib.crc32(tag + data) & 0xffffffff)
png = b'\\x89PNG\\r\\n\\x1a\\n'
png += chunk(b'IHDR', struct.pack("!IIBBBBB", w, h, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress(raw, 9))
png += chunk(b'IEND', b'')
with open(path, "wb") as f:
    f.write(png)
PY

echo "💿 创建可写 DMG..."
mkdir -p "$OUTPUT_DIR"
hdiutil create \
    -volname "$VOLUME_NAME" \
    -srcfolder "$STAGING_DIR" \
    -ov -format UDRW \
    "$TEMP_DMG"

echo "📌 挂载 DMG 并设置布局..."
MOUNT_POINT=$(hdiutil attach -readwrite -nobrowse -noverify "$TEMP_DMG" | tail -n 1 | awk '{print $3}')
sleep 1

osascript <<OSA
tell application "Finder"
    tell disk "${VOLUME_NAME}"
        open
        set current view of container window to icon view
        set toolbar visible of container window to false
        set statusbar visible of container window to false
        set bounds of container window to {200, 200, 840, 640}
        set viewOptions to the icon view options of container window
        set arrangement of viewOptions to not arranged
        set icon size of viewOptions to 104
        set background picture of viewOptions to file ".background:background.png"
        set position of item "${APP_NAME}.app" to {170, 260}
        set position of item "Applications" to {470, 260}
        close
        open
        update without registering applications
        delay 1
    end tell
end tell
OSA

sync
sleep 1
hdiutil detach "$MOUNT_POINT"

echo "🗜️  压缩 DMG..."
hdiutil convert "$TEMP_DMG" -format UDZO -imagekey zlib-level=9 -ov -o "$OUTPUT_DIR/$DMG_NAME"
rm -f "$TEMP_DMG"

echo "✅ DMG 生成完成: $OUTPUT_DIR/$DMG_NAME"
