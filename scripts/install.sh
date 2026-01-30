#!/bin/bash
# VoiceScribe 安装脚本

set -e

echo "========================================"
echo "  VoiceScribe 安装脚本"
echo "========================================"
echo

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR/.."
BACKEND_DIR="$PROJECT_DIR/backend"

# 检查 Python
echo "检查 Python..."
if ! command -v python3 &> /dev/null; then
    echo "❌ 未找到 Python3，请先安装"
    exit 1
fi
PYTHON_VERSION=$(python3 --version)
echo "✓ $PYTHON_VERSION"

# 检查 pip
echo "检查 pip..."
if ! python3 -m pip --version &> /dev/null; then
    echo "❌ 未找到 pip，请先安装"
    exit 1
fi
echo "✓ pip 可用"

# 创建虚拟环境
echo
echo "创建虚拟环境..."
cd "$BACKEND_DIR"
if [ ! -d "venv" ]; then
    python3 -m venv venv
    echo "✓ 虚拟环境已创建"
else
    echo "✓ 虚拟环境已存在"
fi

# 激活并安装依赖
echo
echo "安装 Python 依赖..."
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
echo "✓ 依赖安装完成"

# 下载模型
echo
echo "下载 ASR 模型..."
echo "(这可能需要一些时间，取决于网络速度)"
echo

# Whisper 模型（会在首次使用时自动下载）
echo "Whisper 模型将在首次使用时自动下载"

# FunASR 模型
echo "下载 FunASR 模型..."
python3 -c "
from funasr import AutoModel
print('下载 Paraformer-zh...')
AutoModel(model='iic/speech_paraformer-large-vad-punc_asr_nat-zh-cn-16k-common-vocab8404-pytorch')
print('✓ FunASR 模型下载完成')
" 2>/dev/null || echo "⚠ FunASR 模型下载失败（可稍后手动下载）"

# 说话人识别模型
echo
echo "下载说话人识别模型..."
echo "注意：pyannote 模型需要 Hugging Face token"
echo "请设置环境变量 HF_TOKEN 或在首次使用时登录"

echo
echo "========================================"
echo "  安装完成！"
echo "========================================"
echo
echo "使用方法："
echo "  1. 启动后端: ./scripts/start_backend.sh"
echo "  2. 用 Xcode 打开 app/VoiceScribe 目录"
echo "  3. 编译运行应用"
echo
echo "或者直接使用命令行测试后端："
echo "  curl http://127.0.0.1:8765/"
echo
