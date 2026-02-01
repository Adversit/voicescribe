#!/bin/bash
# VoiceScribe 一键安装脚本
# 安装前后端、下载 FunASR 模型

set -e

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_header() {
    echo
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}  $1${NC}"
    echo -e "${BLUE}════════════════════════════════════════════════════════════${NC}"
    echo
}

print_step() {
    echo -e "${GREEN}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

# 获取脚本目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
APP_DIR="$SCRIPT_DIR/app"
BUILD_DIR="$SCRIPT_DIR/build"
INSTALL_DIR="/Applications"

print_header "VoiceScribe 一键安装"

echo "本脚本将执行以下操作："
echo "  1. 检查系统要求（Python 3.10+, Xcode）"
echo "  2. 创建 Python 虚拟环境并安装依赖"
echo "  3. 下载 FunASR 模型（ASR + 说话人识别）"
echo "  4. 编译 Swift 前端应用"
echo "  5. 创建 .app 包"
echo "  6. 可选：安装到 /Applications"
echo

# ============================================
# 步骤 1: 检查系统要求
# ============================================
print_header "步骤 1/6: 检查系统要求"

# 检查 macOS 版本
print_step "检查 macOS 版本..."
MACOS_VERSION=$(sw_vers -productVersion)
MACOS_MAJOR=$(echo "$MACOS_VERSION" | cut -d. -f1)
if [ "$MACOS_MAJOR" -lt 13 ]; then
    print_error "需要 macOS 13 或更高版本（当前: $MACOS_VERSION）"
    exit 1
fi
print_success "macOS $MACOS_VERSION"

# 检查 Python
print_step "检查 Python..."
if ! command -v python3 &> /dev/null; then
    print_error "未找到 Python3，请先安装"
    echo "  brew install python@3.11"
    exit 1
fi
PYTHON_VERSION=$(python3 --version 2>&1 | grep -oE '[0-9]+\.[0-9]+')
PYTHON_MAJOR=$(echo "$PYTHON_VERSION" | cut -d. -f1)
PYTHON_MINOR=$(echo "$PYTHON_VERSION" | cut -d. -f2)
if [ "$PYTHON_MAJOR" -lt 3 ] || ([ "$PYTHON_MAJOR" -eq 3 ] && [ "$PYTHON_MINOR" -lt 10 ]); then
    print_error "需要 Python 3.10+（当前: $PYTHON_VERSION）"
    echo "  brew install python@3.11"
    exit 1
fi
print_success "Python $PYTHON_VERSION"

# 检查 Xcode 命令行工具
print_step "检查 Xcode 命令行工具..."
if ! xcode-select -p &> /dev/null; then
    print_warning "未安装 Xcode 命令行工具，正在安装..."
    xcode-select --install
    echo "请等待安装完成后重新运行此脚本"
    exit 1
fi
print_success "Xcode 命令行工具已安装"

# 检查 Swift
print_step "检查 Swift..."
if ! command -v swift &> /dev/null; then
    print_error "未找到 Swift，请安装 Xcode"
    exit 1
fi
SWIFT_VERSION=$(swift --version 2>&1 | head -1 | grep -oE '[0-9]+\.[0-9]+' | head -1)
print_success "Swift $SWIFT_VERSION"

# ============================================
# 步骤 2: 创建 Python 虚拟环境
# ============================================
print_header "步骤 2/6: 创建 Python 虚拟环境"

cd "$BACKEND_DIR"

if [ -d "venv" ]; then
    print_step "虚拟环境已存在，检查是否需要更新..."
else
    print_step "创建虚拟环境..."
    python3 -m venv venv
    print_success "虚拟环境已创建"
fi

# 激活虚拟环境
source venv/bin/activate

# 升级 pip
print_step "升级 pip..."
pip install --upgrade pip -q

# 安装依赖
print_step "安装 Python 依赖（这可能需要几分钟）..."
pip install -r requirements.txt -q
print_success "Python 依赖安装完成"

# ============================================
# 步骤 3: 下载 FunASR 模型
# ============================================
print_header "步骤 3/6: 下载 FunASR 模型"

print_step "下载模型（首次下载约 2-3GB，请耐心等待）..."
echo

python3 << 'EOF'
import sys

def download_models():
    print("  [1/3] 加载 FunASR...")
    try:
        from funasr import AutoModel
    except ImportError as e:
        print(f"  ✗ FunASR 导入失败: {e}")
        return False

    # 下载 Paraformer ASR 模型
    print("  [2/3] 下载 Paraformer ASR 模型...")
    try:
        asr_model = AutoModel(
            model="iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch",
            disable_update=True
        )
        print("  ✓ Paraformer ASR 模型下载完成")
    except Exception as e:
        print(f"  ⚠ Paraformer 模型下载失败: {e}")
        print("  （将在首次使用时自动下载）")

    # 下载 CAM++ 说话人验证模型
    print("  [3/3] 下载 CAM++ 说话人识别模型...")
    try:
        sv_model = AutoModel(
            model="damo/speech_campplus_sv_zh-cn_16k-common",
            disable_update=True
        )
        print("  ✓ CAM++ 说话人识别模型下载完成")
    except Exception as e:
        print(f"  ⚠ 说话人识别模型下载失败: {e}")
        print("  （将在首次使用时自动下载）")

    return True

if __name__ == "__main__":
    success = download_models()
    sys.exit(0 if success else 1)
EOF

if [ $? -eq 0 ]; then
    print_success "FunASR 模型下载完成"
else
    print_warning "部分模型下载失败，将在首次使用时自动下载"
fi

# 退出虚拟环境
deactivate

# ============================================
# 步骤 4: 编译 Swift 前端
# ============================================
print_header "步骤 4/6: 编译 Swift 前端"

cd "$APP_DIR"

print_step "编译 Swift 应用（这可能需要几分钟）..."
swift build -c release 2>&1 | while read line; do
    if [[ "$line" == *"error:"* ]]; then
        echo "  $line"
    elif [[ "$line" == *"warning:"* ]]; then
        : # 忽略警告
    elif [[ "$line" == *"Build complete!"* ]]; then
        echo "  $line"
    fi
done

if [ -f ".build/release/VoiceScribe" ]; then
    print_success "Swift 应用编译完成"
else
    print_error "编译失败"
    exit 1
fi

# ============================================
# 步骤 5: 创建 .app 包
# ============================================
print_header "步骤 5/6: 创建 .app 包"

APP_NAME="VoiceScribe"
APP_BUNDLE="$BUILD_DIR/$APP_NAME.app"

print_step "创建 .app 目录结构..."
rm -rf "$BUILD_DIR"
mkdir -p "$APP_BUNDLE/Contents/MacOS"
mkdir -p "$APP_BUNDLE/Contents/Resources"

# 复制可执行文件
cp ".build/release/$APP_NAME" "$APP_BUNDLE/Contents/MacOS/"

# 生成应用图标
ICON_SRC="VoiceScribe/Assets.xcassets/AppIcon.appiconset"
ICONSET_DIR="$BUILD_DIR/AppIcon.iconset"

if [ -d "$ICON_SRC" ]; then
    print_step "生成应用图标..."
    mkdir -p "$ICONSET_DIR"

    cp "$ICON_SRC/icon_16x16.png" "$ICONSET_DIR/icon_16x16.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_32x32.png" "$ICONSET_DIR/icon_16x16@2x.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_32x32.png" "$ICONSET_DIR/icon_32x32.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_64x64.png" "$ICONSET_DIR/icon_32x32@2x.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_128x128.png" "$ICONSET_DIR/icon_128x128.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_256x256.png" "$ICONSET_DIR/icon_128x128@2x.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_256x256.png" "$ICONSET_DIR/icon_256x256.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_512x512.png" "$ICONSET_DIR/icon_256x256@2x.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_512x512.png" "$ICONSET_DIR/icon_512x512.png" 2>/dev/null || true
    cp "$ICON_SRC/icon_1024x1024.png" "$ICONSET_DIR/icon_512x512@2x.png" 2>/dev/null || true

    iconutil -c icns "$ICONSET_DIR" -o "$APP_BUNDLE/Contents/Resources/AppIcon.icns" 2>/dev/null || true
    rm -rf "$ICONSET_DIR"
fi

# 创建 Info.plist
print_step "创建 Info.plist..."
cat > "$APP_BUNDLE/Contents/Info.plist" << EOF
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
    <string>1.0.0</string>
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

# 移除隔离属性
xattr -cr "$APP_BUNDLE" 2>/dev/null || true

print_success ".app 包创建完成: $APP_BUNDLE"

# ============================================
# 步骤 6: 创建启动脚本
# ============================================
print_header "步骤 6/6: 创建启动脚本"

# 创建启动脚本
print_step "创建启动脚本..."

cat > "$SCRIPT_DIR/start.sh" << 'EOF'
#!/bin/bash
# VoiceScribe 启动脚本

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/backend"
APP_PATH="$SCRIPT_DIR/build/VoiceScribe.app"

# 检查是否安装到 /Applications
if [ -d "/Applications/VoiceScribe.app" ]; then
    APP_PATH="/Applications/VoiceScribe.app"
fi

echo "🚀 启动 VoiceScribe..."
echo

# 启动后端
echo "▶ 启动后端服务..."
cd "$BACKEND_DIR"
source venv/bin/activate
python server.py &
BACKEND_PID=$!
echo "  后端 PID: $BACKEND_PID"

# 等待后端启动
echo "  等待后端启动..."
for i in {1..10}; do
    if curl -s http://127.0.0.1:8765/health > /dev/null 2>&1; then
        echo "✓ 后端已启动"
        break
    fi
    sleep 1
done

# 启动前端
echo
echo "▶ 启动前端应用..."
open "$APP_PATH"

echo
echo "════════════════════════════════════════"
echo "  VoiceScribe 已启动"
echo "════════════════════════════════════════"
echo
echo "使用方法："
echo "  • 按 ⌘⇧R 开始/停止录音"
echo "  • 录音完成后自动转文字并复制到剪贴板"
echo
echo "停止服务："
echo "  • 关闭 VoiceScribe 应用窗口"
echo "  • 或按 Ctrl+C 停止后端"
echo
echo "后端日志："
echo "────────────────────────────────────────"

# 前台显示后端日志
wait $BACKEND_PID
EOF

chmod +x "$SCRIPT_DIR/start.sh"
print_success "启动脚本已创建: start.sh"

# 创建仅启动后端的脚本
cat > "$SCRIPT_DIR/start_backend.sh" << 'EOF'
#!/bin/bash
# 仅启动后端服务

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/backend"
source venv/bin/activate
echo "🚀 启动 VoiceScribe 后端..."
python server.py
EOF

chmod +x "$SCRIPT_DIR/start_backend.sh"

# ============================================
# 安装选项
# ============================================
print_header "安装完成！"

echo "VoiceScribe 已构建成功！"
echo
echo "应用位置: $APP_BUNDLE"
echo
echo -e "${YELLOW}是否安装到 /Applications？(y/n)${NC}"
read -r INSTALL_CHOICE

if [[ "$INSTALL_CHOICE" =~ ^[Yy]$ ]]; then
    print_step "安装到 /Applications..."
    rm -rf "$INSTALL_DIR/VoiceScribe.app"
    cp -r "$APP_BUNDLE" "$INSTALL_DIR/"
    print_success "已安装到 /Applications/VoiceScribe.app"
fi

# ============================================
# 使用说明
# ============================================
print_header "使用说明"

echo "启动方式："
echo "  方式 1: 运行 ./start.sh（同时启动后端和前端）"
echo "  方式 2: 分别启动"
echo "          ./start_backend.sh  # 启动后端"
if [[ "$INSTALL_CHOICE" =~ ^[Yy]$ ]]; then
echo "          打开 /Applications/VoiceScribe.app"
else
echo "          open $APP_BUNDLE"
fi
echo
echo "快捷键："
echo "  ⌘⇧R - 开始/停止录音"
echo
echo "首次使用："
echo "  1. 需要授予麦克风权限"
echo "  2. 需要授予辅助功能权限（用于全局快捷键）"
echo
echo -e "${GREEN}安装完成！${NC}"
echo
