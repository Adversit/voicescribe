#!/bin/bash

# VoiceScribe 构建脚本

set -e

APP_NAME="VoiceScribe"
BUILD_DIR="./build"
APP_DIR="$BUILD_DIR/$APP_NAME.app"

cd "$(dirname "$0")/app"

echo "🔨 编译中..."
swift build -c debug

echo "📦 创建 .app bundle..."
rm -rf "$BUILD_DIR"
mkdir -p "$APP_DIR/Contents/MacOS"
mkdir -p "$APP_DIR/Contents/Resources"

# 复制可执行文件
cp ".build/debug/$APP_NAME" "$APP_DIR/Contents/MacOS/"

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
echo ""
echo "运行方式:"
echo "  open $APP_DIR"
echo ""
echo "或安装到 Applications:"
echo "  cp -r $APP_DIR /Applications/"
