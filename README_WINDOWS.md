# VoiceScribe - Windows 安装指南

VoiceScribe 是一个本地语音转文字工具，支持多种 ASR 引擎和说话人识别。

## ✨ 功能特性

- 🎤 全局快捷键录音
- ⏱️ 长时间录音支持（会议级别）
- 🔄 多引擎支持：Whisper、FunASR、Parakeet
- 👥 说话人识别（Speaker Diarization）
- 🎵 声纹特征学习
- 🤖 AI 文本优化（去除语气词、修正错别字）
- 📋 自动复制到剪贴板
- 📝 历史记录管理
- 🔥 热词增强识别

## 📋 系统要求

### 必需
- Windows 10/11
- [Anaconda](https://www.anaconda.com/download) 或 [Miniconda](https://docs.conda.io/en/latest/miniconda.html)
- [Node.js](https://nodejs.org/) 18+
- 8GB+ RAM
- 10GB+ 磁盘空间

### 可选（GPU 加速）
- NVIDIA GPU（支持 CUDA）
- [NVIDIA 驱动](https://www.nvidia.com/Download/index.aspx)

## 🚀 快速开始

### 1. 克隆仓库

```bash
git clone https://github.com/your-username/voicescribe.git
cd voicescribe
```

### 2. 安装依赖

#### 方式 A：一键安装（推荐）

```cmd
# 安装所有依赖（CPU 版本）
scripts\windows\install.bat

# 如果有 NVIDIA GPU，可选安装 GPU 支持
scripts\windows\install_gpu.bat
```

#### 方式 B：分步安装

```cmd
# 1. 创建 conda 环境
conda create -n voicescribe python=3.12 -y
conda activate voicescribe

# 2. 安装 Python 依赖
cd backend
pip install -r requirements.txt

# 3. 安装 PyTorch（CPU 版本）
pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu

# 4. 安装前端依赖
cd ../frontend
npm install
```

### 3. 启动应用

#### 方式 A：一键启动（推荐）

```cmd
# 自动启动后端和前端
scripts\windows\dev.bat
```

#### 方式 B：手动启动

```cmd
# 终端 1：启动后端
conda activate voicescribe
cd backend
python server.py

# 终端 2：启动前端
cd frontend
npm run dev:electron
```

### 4. 首次使用

1. 应用启动后，点击左侧 "引擎设置"
2. 选择一个 ASR 引擎（推荐 FunASR）
3. 选择一个模型（推荐 paraformer-zh）
4. 如果是 FunASR，首次使用会自动下载模型（约 1-2 GB）
5. 下载完成后，点击 "加载模型"
6. 开始录音转写！

## 🎯 支持的 ASR 引擎

| 引擎 | 模型 | 说明 | GPU 要求 |
|------|------|------|----------|
| **Whisper** | tiny/base/small/medium/large-v2/large-v3 | OpenAI Whisper，支持多语言 | 可选 |
| **FunASR** | paraformer-zh | 阿里达摩院，中文效果极佳 | 可选 |
| **FunASR** | seaco-paraformer | 热词增强版，推荐使用热词时选择 | 可选 |
| **FunASR** | sensevoice-small | 支持更多语种 | 可选 |
| **Parakeet** | parakeet-ctc-1.1b/tdt-1.1b | NVIDIA NeMo，速度最快 | **必需** |

### 推荐配置

- **中文转写**：FunASR - paraformer-zh
- **热词场景**：FunASR - seaco-paraformer
- **多语言**：Whisper - medium 或 large-v3
- **GPU 加速**：Parakeet（需要 NVIDIA GPU）

## ⚙️ 功能说明

### 录音模式

- **按住录音**：按住快捷键录音，松开停止
- **点击录音**：点击一次开始，再点击一次停止

### 输出模式

- **仅文本**：只输出转录文本
- **带时间戳**：输出文本 + 时间戳
- **带说话人**：输出文本 + 说话人标识（需启用说话人识别）

### 热词功能

支持设置热词提高专有名词识别率，格式：`词语 权重`

```
claude 50, deepseek 30, 江争达 30
```

- 权重范围 1-100，越大越优先
- 中文热词效果好
- 英文专有名词建议配合 AI 优化使用

### AI 智能优化

启用"AI 文本优化"后，系统会智能判断是否需要调用 AI：

| 场景 | 行为 |
|------|------|
| 文本有英文 | 调用 AI 修正可能的专有名词误识别 |
| 纯中文文本 | 跳过 AI，直接返回 |

### 说话人识别

- 基于 FunASR CAM++ 模型
- 自动识别不同说话人
- 支持声纹学习（未来功能）

### 历史记录

- 自动保存所有转录记录
- 支持搜索和过滤
- 支持导出为 JSON

## 🔧 故障排除

### 安装问题

**Q: Conda 命令未找到**
```cmd
# 安装 Anaconda 或 Miniconda 后，重启终端
# 或手动添加到 PATH：
# C:\Users\YourName\anaconda3\Scripts
```

**Q: Node.js 命令未找到**
```cmd
# 下载安装 Node.js：https://nodejs.org/
# 安装后重启终端
```

**Q: PyTorch 安装失败**
```cmd
# 检查网络连接
# 或使用国内镜像：
pip install torch torchvision torchaudio -i https://pypi.tuna.tsinghua.edu.cn/simple
```

### 运行问题

**Q: 后端启动失败 - 端口 8765 被占用**
```cmd
# 查找占用端口的进程
netstat -ano | findstr :8765

# 结束进程（替换 PID）
taskkill /PID <PID> /F
```

**Q: 前端无法连接后端**
```cmd
# 1. 确认后端已启动（访问 http://127.0.0.1:8765/health）
# 2. 检查防火墙设置
# 3. 重启应用
```

**Q: 模型下载失败**
```cmd
# 1. 检查网络连接
# 2. 检查磁盘空间（需要 5GB+）
# 3. 手动删除缓存重试：
rmdir /s /q %USERPROFILE%\.cache\modelscope
```

**Q: GPU 不可用**
```cmd
# 1. 检查 NVIDIA 驱动
nvidia-smi

# 2. 重新安装 GPU 支持
scripts\windows\install_gpu.bat

# 3. 验证 PyTorch CUDA
conda activate voicescribe
python -c "import torch; print(torch.cuda.is_available())"
```

### 性能问题

**Q: 转录速度慢**
- 使用更小的模型（tiny/base）
- 安装 GPU 支持（`install_gpu.bat`）
- 使用 Parakeet 引擎（需要 GPU）

**Q: 内存占用高**
- 使用更小的模型
- 转录完成后卸载模型
- 关闭不需要的功能（说话人识别、AI 优化）

## 📚 更多文档

- [脚本说明](scripts/README.md) - 所有脚本的详细说明
- [API 文档](memory/API_COVERAGE_REPORT.md) - 后端 API 接口文档
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

---

## 📞 支持

如有问题，请：
1. 查看 [故障排除](#-故障排除) 部分
2. 搜索 [Issues](https://github.com/your-username/voicescribe/issues)
3. 提交新的 Issue

---

**享受语音转文字的便利！** 🎉
