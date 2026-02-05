#!/bin/bash

# 构建嵌入式 Python 运行时（用于 DMG 分发）
# 默认安装完整依赖（包含 FunASR）
#
# 可选参数：
#   --core         仅安装 requirements-core.txt
#   --full         安装 requirements.txt（默认）
#   --clean        清理现有 runtime
#   --skip-install 跳过依赖安装（仅准备 Python 运行时）
#
# 环境变量：
#   PYTHON_STANDALONE_URL  指定 python-build-standalone 的下载 URL

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUNTIME_DIR="$ROOT_DIR/runtime/python"
DIST_DIR="$ROOT_DIR/dist"
ARCH="$(uname -m)"

INSTALL_MODE="full"
CLEAN=0
SKIP_INSTALL=0

for arg in "$@"; do
    case "$arg" in
        --core)
            INSTALL_MODE="core"
            ;;
        --full)
            INSTALL_MODE="full"
            ;;
        --clean)
            CLEAN=1
            ;;
        --skip-install)
            SKIP_INSTALL=1
            ;;
    esac
done

if [ "$CLEAN" -eq 1 ]; then
    echo "🧹 清理旧的 runtime..."
    rm -rf "$RUNTIME_DIR"
fi

mkdir -p "$DIST_DIR"
mkdir -p "$ROOT_DIR/runtime"

PYTHON_URL="${PYTHON_STANDALONE_URL:-}"
if [ -z "$PYTHON_URL" ]; then
    # 默认使用 python-build-standalone (install_only)
    # 如需变更版本/架构，可设置 PYTHON_STANDALONE_URL
    if [ "$ARCH" = "arm64" ]; then
        PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240224/cpython-3.11.8+20240224-aarch64-apple-darwin-install_only.tar.gz"
    elif [ "$ARCH" = "x86_64" ]; then
        PYTHON_URL="https://github.com/indygreg/python-build-standalone/releases/download/20240224/cpython-3.11.8+20240224-x86_64-apple-darwin-install_only.tar.gz"
    else
        echo "❌ 不支持的架构: $ARCH"
        exit 1
    fi
fi

TARBALL="$DIST_DIR/python-standalone.tar.gz"

if [ ! -d "$RUNTIME_DIR" ]; then
    echo "⬇️  下载 Python 运行时..."
    curl -L "$PYTHON_URL" -o "$TARBALL"

    echo "📦 解压 Python 运行时..."
    rm -rf "$RUNTIME_DIR"
    mkdir -p "$ROOT_DIR/runtime"
    tar -xzf "$TARBALL" -C "$ROOT_DIR/runtime"

    # 统一路径为 runtime/python
    if [ ! -d "$RUNTIME_DIR" ]; then
        # python-build-standalone 通常会解压出 python/ 目录
        if [ -d "$ROOT_DIR/runtime/python" ]; then
            :
        else
            # 尝试寻找单一目录并重命名为 python
            subdir="$(find "$ROOT_DIR/runtime" -maxdepth 1 -type d -not -name runtime -not -name .)"
            if [ -n "$subdir" ]; then
                mv "$subdir" "$RUNTIME_DIR"
            fi
        fi
    fi
fi

PY_BIN="$RUNTIME_DIR/bin/python3"
if [ ! -x "$PY_BIN" ]; then
    echo "❌ 未找到 Python 可执行文件: $PY_BIN"
    exit 1
fi

echo "🐍 Python 运行时准备完毕: $PY_BIN"

if [ "$SKIP_INSTALL" -eq 1 ]; then
    echo "⏭️  跳过依赖安装"
    exit 0
fi

echo "📦 安装依赖..."
REQ_FILE="$ROOT_DIR/backend/requirements.txt"
if [ "$INSTALL_MODE" = "core" ]; then
    REQ_FILE="$ROOT_DIR/backend/requirements-core.txt"
fi

"$PY_BIN" -m ensurepip --upgrade || true
"$PY_BIN" -m pip install --upgrade pip
"$PY_BIN" -m pip install -r "$REQ_FILE"

echo "✅ 依赖安装完成 ($INSTALL_MODE)"
