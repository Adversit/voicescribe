#!/bin/bash
# VoiceScribe 后端启动脚本

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$SCRIPT_DIR/../backend"

cd "$BACKEND_DIR"

# 检查虚拟环境
if [ ! -d "venv" ]; then
    echo "创建虚拟环境..."
    python3 -m venv venv
fi

# 激活虚拟环境
source venv/bin/activate

# 安装依赖
if [ ! -f ".deps_installed" ]; then
    echo "安装依赖..."
    pip install -r requirements.txt
    touch .deps_installed
fi

# 启动服务
echo "启动 VoiceScribe 后端服务..."
echo "访问 http://127.0.0.1:8765"
python server.py
