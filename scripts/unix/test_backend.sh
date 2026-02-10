#!/bin/bash
# VoiceScribe 后端测试脚本

set -e

echo "========================================"
echo "  VoiceScribe 后端测试"
echo "========================================"
echo

BASE_URL="http://127.0.0.1:8765"

# 检查服务状态
echo "1. 检查服务状态..."
STATUS=$(curl -s "$BASE_URL/" 2>/dev/null)
if [ -z "$STATUS" ]; then
    echo "❌ 后端未运行"
    echo ""
    echo "请先启动后端："
    echo "  cd backend && source venv/bin/activate && python server.py --mock"
    exit 1
fi
echo "✓ 服务状态: $STATUS"
echo

# 检查健康状态
echo "2. 检查健康状态..."
HEALTH=$(curl -s "$BASE_URL/health" 2>/dev/null)
echo "✓ 健康状态: $HEALTH"
echo

# 获取引擎列表
echo "3. 获取可用引擎..."
ENGINES=$(curl -s "$BASE_URL/engines" 2>/dev/null)
echo "✓ 引擎列表: $ENGINES"
echo

# 测试转录（需要音频文件）
echo "4. 测试转录..."
# 创建一个简单的测试音频文件（静音）
TEST_AUDIO="/tmp/test_audio.wav"
if command -v sox &> /dev/null; then
    sox -n -r 16000 -c 1 "$TEST_AUDIO" trim 0 1 2>/dev/null
    RESULT=$(curl -s -X POST "$BASE_URL/transcribe" \
        -F "audio=@$TEST_AUDIO" \
        -F "engine=mock" \
        -F "model=mock" \
        -F "language=zh" 2>/dev/null)
    echo "✓ 转录测试: $RESULT"
    rm -f "$TEST_AUDIO"
else
    echo "⚠ 跳过（需要 sox 来生成测试音频）"
fi
echo

echo "========================================"
echo "  测试完成！"
echo "========================================"
