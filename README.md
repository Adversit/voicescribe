# VoiceScribe

本地语音转文字工具，支持多种 ASR 模型和说话人识别。

## 🌟 功能特性

- 🎤 **全局快捷键录音** - 随时随地快速录音
- ⏱️ **长时间录音** - 支持会议级别的长时间录音
- 🔄 **多引擎支持** - Whisper、FunASR、Parakeet
- 👥 **说话人识别** - 自动识别不同说话人
- 🤖 **AI 文本优化** - 智能修正和优化转录结果
- 🔥 **热词增强** - 提高专有名词识别率
- 📝 **历史记录** - 自动保存和管理转录历史
- 📋 **自动复制** - 转录完成自动复制到剪贴板

## 📦 平台支持

### Windows
详细安装和使用说明请查看：[Windows 安装指南](README_WINDOWS.md)

**快速开始：**
```cmd
# 1. 克隆仓库
git clone https://github.com/your-username/voicescribe.git
cd voicescribe

# 2. 安装依赖
scripts\windows\install.bat

# 3. 启动应用
scripts\windows\dev.bat
```

### macOS
使用 SwiftUI 原生应用（位于 `app/` 目录）

**快速开始：**
```bash
# 1. 安装后端依赖
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt

# 2. 启动后端
python server.py

# 3. 使用 Xcode 打开并运行
cd ../app
open Package.swift
```

## 🎯 支持的 ASR 引擎

| 引擎 | 说明 | 推荐场景 |
|------|------|----------|
| **Whisper** | OpenAI 开源模型，多语言支持 | 通用场景 |
| **FunASR** | 阿里达摩院，中文效果极佳 | 中文转写 |
| **Parakeet** | NVIDIA NeMo，GPU 加速 | 高性能需求 |

## 📋 系统要求

### Windows
- Windows 10/11
- Anaconda/Miniconda
- Node.js 18+
- 8GB+ RAM

### macOS
- macOS 13+
- Python 3.10+
- Xcode 15+
- 8GB+ RAM

## 🚀 快速开始

1. 选择你的平台查看详细文档
2. 安装必需的依赖
3. 运行安装脚本
4. 启动应用
5. 选择 ASR 引擎和模型
6. 开始录音转写！

## 📚 文档

- [Windows 安装指南](README_WINDOWS.md) - Windows 用户必读
- [脚本说明](scripts/README.md) - 所有脚本的详细说明
- [API 文档](memory/API_COVERAGE_REPORT.md) - 后端 API 接口
- [开发指南](CLAUDE.md) - 开发者文档

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 🙏 致谢

- [OpenAI Whisper](https://github.com/openai/whisper)
- [FunASR](https://github.com/alibaba-damo-academy/FunASR)
- [NVIDIA NeMo](https://github.com/NVIDIA/NeMo)
- [faster-whisper](https://github.com/guillaumekln/faster-whisper)
