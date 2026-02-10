#!/bin/bash

# VoiceScribe 完整打包脚本
# 将应用、后端和模型打包成可移植的安装包

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PACKAGE_NAME="VoiceScribe-Package"
OUTPUT_DIR="/Volumes/2T SSD - Data/Users/lyb/projects/voicescribe"
PACKAGE_DIR="$OUTPUT_DIR/$PACKAGE_NAME"

echo "🎯 VoiceScribe 打包工具"
echo "======================="
echo ""

# 清理旧的打包目录
rm -rf "$OUTPUT_DIR"
mkdir -p "$PACKAGE_DIR"

# 1. 构建前端 App
echo "📱 步骤 1/4: 构建前端应用..."
cd "$SCRIPT_DIR"
./build.sh

# 2. 复制 App
echo "📦 步骤 2/4: 复制应用文件..."
cp -r "$SCRIPT_DIR/app/build/VoiceScribe.app" "$PACKAGE_DIR/"

# 3. 复制后端代码（排除 venv 和 __pycache__）
echo "🐍 步骤 3/4: 复制后端代码..."
mkdir -p "$PACKAGE_DIR/backend"
rsync -av --exclude='venv' --exclude='__pycache__' --exclude='.DS_Store' \
    "$SCRIPT_DIR/backend/" "$PACKAGE_DIR/backend/"

# 4. 复制模型文件
echo "🧠 步骤 4/4: 复制模型文件..."
MODEL_CACHE="$HOME/.cache/modelscope/hub/models/iic"

if [ -d "$MODEL_CACHE" ]; then
    mkdir -p "$PACKAGE_DIR/models/modelscope/hub/models/iic"

    # 复制 FunASR 相关模型
    for model in "$MODEL_CACHE"/*; do
        if [ -d "$model" ]; then
            model_name=$(basename "$model")
            echo "   复制模型: $model_name"
            cp -r "$model" "$PACKAGE_DIR/models/modelscope/hub/models/iic/"
        fi
    done
else
    echo "   ⚠️  未找到模型缓存目录，跳过模型打包"
fi

# 5. 创建安装脚本
echo "📝 创建安装脚本..."
cat > "$PACKAGE_DIR/install.sh" << 'INSTALL_SCRIPT'
#!/bin/bash

# VoiceScribe 安装脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_DIR="$HOME/Applications/VoiceScribe"

echo "🚀 VoiceScribe 安装程序"
echo "======================="
echo ""

# 检查 Python
if ! command -v python3 &> /dev/null; then
    echo "❌ 错误: 未找到 Python3，请先安装 Python 3.10+"
    exit 1
fi

PYTHON_VERSION=$(python3 -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")')
echo "✓ Python 版本: $PYTHON_VERSION"

# 创建安装目录
echo ""
echo "📁 安装目录: $INSTALL_DIR"
mkdir -p "$INSTALL_DIR"

# 1. 安装 App
echo ""
echo "📱 步骤 1/4: 安装应用..."
if [ -d "/Applications/VoiceScribe.app" ]; then
    rm -rf "/Applications/VoiceScribe.app"
fi
cp -r "$SCRIPT_DIR/VoiceScribe.app" /Applications/
echo "   ✓ VoiceScribe.app 已安装到 /Applications/"

# 2. 安装后端
echo ""
echo "🐍 步骤 2/4: 安装后端..."
cp -r "$SCRIPT_DIR/backend" "$INSTALL_DIR/"

# 3. 创建 Python 虚拟环境并安装依赖
echo ""
echo "📦 步骤 3/4: 配置 Python 环境..."
cd "$INSTALL_DIR/backend"

if [ ! -d "venv" ]; then
    python3 -m venv venv
fi

source venv/bin/activate
pip install --upgrade pip -q

echo "   安装依赖中（可能需要几分钟）..."
pip install -r requirements.txt -q

deactivate
echo "   ✓ Python 环境配置完成"

# 4. 安装模型
echo ""
echo "🧠 步骤 4/4: 安装模型..."
MODEL_TARGET="$HOME/.cache/modelscope/hub/models/iic"

if [ -d "$SCRIPT_DIR/models/modelscope/hub/models/iic" ]; then
    mkdir -p "$MODEL_TARGET"

    for model in "$SCRIPT_DIR/models/modelscope/hub/models/iic"/*; do
        if [ -d "$model" ]; then
            model_name=$(basename "$model")
            if [ ! -d "$MODEL_TARGET/$model_name" ]; then
                echo "   安装模型: $model_name"
                cp -r "$model" "$MODEL_TARGET/"
            else
                echo "   跳过已存在: $model_name"
            fi
        fi
    done
    echo "   ✓ 模型安装完成"
else
    echo "   ⚠️  未找到模型文件，首次使用时会自动下载"
fi

# 5. 创建启动脚本
echo ""
echo "📝 创建启动脚本..."
cat > "$INSTALL_DIR/start.sh" << 'START_SCRIPT'
#!/bin/bash
cd "$(dirname "$0")/backend"
source venv/bin/activate
python server.py
START_SCRIPT
chmod +x "$INSTALL_DIR/start.sh"

# 6. 创建桌面快捷方式（启动后端）
cat > "$HOME/Desktop/VoiceScribe-Backend.command" << DESKTOP_SCRIPT
#!/bin/bash
cd "$INSTALL_DIR/backend"
source venv/bin/activate
echo "🎙️ VoiceScribe 后端服务"
echo "========================"
echo "服务地址: http://127.0.0.1:8765"
echo "按 Ctrl+C 停止服务"
echo ""
python server.py
DESKTOP_SCRIPT
chmod +x "$HOME/Desktop/VoiceScribe-Backend.command"

echo ""
echo "✅ 安装完成！"
echo ""
echo "使用方法:"
echo "  1. 双击桌面上的 'VoiceScribe-Backend.command' 启动后端服务"
echo "  2. 打开 /Applications/VoiceScribe.app"
echo "  3. 使用快捷键录音转文字"
echo ""
echo "或手动启动后端:"
echo "  $INSTALL_DIR/start.sh"
echo ""
INSTALL_SCRIPT
chmod +x "$PACKAGE_DIR/install.sh"

# 6. 创建 README
cat > "$PACKAGE_DIR/README.txt" << 'README'
VoiceScribe 安装包
==================

系统要求:
- macOS 13.0+
- Python 3.10+
- 8GB+ 内存

安装步骤:
1. 打开终端
2. cd 到此目录
3. 运行: ./install.sh

安装后使用:
1. 先启动后端服务（双击桌面上的 VoiceScribe-Backend.command）
2. 再打开 VoiceScribe.app
3. 使用快捷键 ⌘⇧R 开始/停止录音

目录说明:
- VoiceScribe.app  - 前端应用
- backend/         - 后端服务代码
- models/          - ASR 模型文件
- install.sh       - 安装脚本

README
chmod +x "$PACKAGE_DIR/README.txt"

# 7. 计算包大小并打包
echo ""
echo "📊 打包信息:"
PACKAGE_SIZE=$(du -sh "$PACKAGE_DIR" | cut -f1)
echo "   目录大小: $PACKAGE_SIZE"

echo ""
echo "🗜️  压缩打包中..."
cd "$OUTPUT_DIR"
tar -czvf "${PACKAGE_NAME}.tar.gz" "$PACKAGE_NAME" 2>/dev/null

ARCHIVE_SIZE=$(du -sh "${PACKAGE_NAME}.tar.gz" | cut -f1)

echo ""
echo "✅ 打包完成！"
echo ""
echo "输出文件: $OUTPUT_DIR/${PACKAGE_NAME}.tar.gz"
echo "压缩后大小: $ARCHIVE_SIZE"
echo ""
echo "在目标机器上解压并运行 install.sh 即可安装"
