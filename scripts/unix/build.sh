#!/bin/bash

# VoiceScribe 构建脚本

set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_NAME="VoiceScribe"
BUILD_DIR="$ROOT_DIR/app/build"
APP_DIR="$BUILD_DIR/$APP_NAME.app"

BUILD_CONFIG="${VOICESCRIBE_BUILD_CONFIG:-debug}"
SKIP_INSTALL="${VOICESCRIBE_SKIP_INSTALL:-0}"
RUNTIME_SRC="$ROOT_DIR/runtime/python"

for arg in "$@"; do
    case "$arg" in
        --release)
            BUILD_CONFIG="release"
            ;;
        --debug)
            BUILD_CONFIG="debug"
            ;;
        --no-install)
            SKIP_INSTALL="1"
            ;;
        --install)
            SKIP_INSTALL="0"
            ;;
    esac
done

cd "$ROOT_DIR/app"

echo "🔨 编译中..."
swift build -c "$BUILD_CONFIG"

echo "📦 创建 .app bundle..."
rm -rf "$BUILD_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# 复制可执行文件
cp ".build/$BUILD_CONFIG/$APP_NAME" "$APP_DIR/Contents/MacOS/"

# 复制后端到 Resources
echo "📁 打包后端..."
BACKEND_SRC="$ROOT_DIR/backend"
BACKEND_DST="$APP_DIR/Contents/Resources/backend"
mkdir -p "$BACKEND_DST"

# 复制后端源文件
cp "$BACKEND_SRC/server.py" "$BACKEND_DST/"
cp -r "$BACKEND_SRC/engines" "$BACKEND_DST/" 2>/dev/null || true
cp -r "$BACKEND_SRC/diarization" "$BACKEND_DST/" 2>/dev/null || true
cp -r "$BACKEND_SRC/postprocess" "$BACKEND_DST/" 2>/dev/null || true
cp "$BACKEND_SRC/requirements"*.txt "$BACKEND_DST/" 2>/dev/null || true

# 复制嵌入式 Python 运行时（如果存在）
if [ -d "$RUNTIME_SRC" ]; then
    echo "🐍 打包嵌入式 Python 运行时..."
    rm -rf "$APP_DIR/Contents/Resources/python"
    cp -R "$RUNTIME_SRC" "$APP_DIR/Contents/Resources/python"
else
    echo "⚠️  未找到嵌入式 Python 运行时: $RUNTIME_SRC"
fi

# 注意：不复制 venv（包含绝对路径，复制后无法使用）
# 应用会在 backend 目录下查找或创建 venv

# 生成应用图标
ICON_SRC="VoiceScribe/Assets.xcassets/AppIcon.appiconset"
ICONSET_DIR="$BUILD_DIR/AppIcon.iconset"

if [ -d "$ICON_SRC" ]; then
    echo "🎨 生成应用图标..."
    mkdir -p "$ICONSET_DIR"

    # 复制并重命名为 iconutil 所需格式
    cp "$ICON_SRC/icon_16x16.png" "$ICONSET_DIR/icon_16x16.png"
    cp "$ICON_SRC/icon_32x32.png" "$ICONSET_DIR/icon_16x16@2x.png"
    cp "$ICON_SRC/icon_32x32.png" "$ICONSET_DIR/icon_32x32.png"
    cp "$ICON_SRC/icon_64x64.png" "$ICONSET_DIR/icon_32x32@2x.png"
    cp "$ICON_SRC/icon_128x128.png" "$ICONSET_DIR/icon_128x128.png"
    cp "$ICON_SRC/icon_256x256.png" "$ICONSET_DIR/icon_128x128@2x.png"
    cp "$ICON_SRC/icon_256x256.png" "$ICONSET_DIR/icon_256x256.png"
    cp "$ICON_SRC/icon_512x512.png" "$ICONSET_DIR/icon_256x256@2x.png"
    cp "$ICON_SRC/icon_512x512.png" "$ICONSET_DIR/icon_512x512.png"
    cp "$ICON_SRC/icon_1024x1024.png" "$ICONSET_DIR/icon_512x512@2x.png"

    # 使用 iconutil 生成 .icns
    iconutil -c icns "$ICONSET_DIR" -o "$APP_DIR/Contents/Resources/AppIcon.icns"
    rm -rf "$ICONSET_DIR"
fi

# 创建 Info.plist
cat > "$APP_DIR/Contents/Info.plist" << EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>CFBundleName</key>
    <string>VoiceScribe</string>
    <key>CFBundleDisplayName</key>
    <string>VoiceScribe</string>
    <key>CFBundleIdentifier</key>
    <string>com.voicescribe.app</string>
    <key>CFBundleVersion</key>
    <string>1</string>
    <key>CFBundleShortVersionString</key>
    <string>0.1.0</string>
    <key>CFBundlePackageType</key>
    <string>APPL</string>
    <key>CFBundleExecutable</key>
    <string>VoiceScribe</string>
    <key>LSMinimumSystemVersion</key>
    <string>13.0</string>
    <key>NSMicrophoneUsageDescription</key>
    <string>VoiceScribe 需要访问麦克风来录制音频进行语音转文字</string>
    <key>NSAppleEventsUsageDescription</key>
    <string>VoiceScribe 需要控制系统事件来注册全局快捷键</string>
    <key>LSUIElement</key>
    <false/>
    <key>NSHighResolutionCapable</key>
    <true/>
    <key>CFBundleIconFile</key>
    <string>AppIcon</string>
</dict>
</plist>
EOF

echo "✅ 构建完成: $APP_DIR"

if [ "$SKIP_INSTALL" != "1" ]; then
    # 自动安装到 /Applications（保留已安装的 venv）
    echo "📲 安装到 /Applications..."
    pkill -f "VoiceScribe" 2>/dev/null || true
    sleep 1

    INSTALLED_APP="/Applications/VoiceScribe.app"
    INSTALLED_VENV="$INSTALLED_APP/Contents/Resources/backend/venv"

    # 如果已安装的 app 存在 venv，先备份
    if [ -d "$INSTALLED_VENV" ]; then
        echo "📦 保留已安装的 venv..."
        mv "$INSTALLED_VENV" "/tmp/voicescribe_venv_backup"
    fi

    # 替换 app
    rm -rf "$INSTALLED_APP"
    cp -r "$APP_DIR" "$INSTALLED_APP"

    # 恢复 venv
    if [ -d "/tmp/voicescribe_venv_backup" ]; then
        mv "/tmp/voicescribe_venv_backup" "$INSTALLED_VENV"
        echo "✅ venv 已恢复"
    fi

    echo "✅ 已安装到 /Applications/VoiceScribe.app"
    echo ""
    echo "运行: open /Applications/VoiceScribe.app"
else
    echo "⏭️  跳过安装到 /Applications（SKIP_INSTALL=1）"
fi
