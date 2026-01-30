# VoiceScribe

macOS 本地语音转文字工具，支持多种 ASR 模型和说话人识别。

## 功能

- 🎤 快捷键录音（⌘⇧R）
- ⏱️ 长时间录音支持（会议级别）
- 🔄 多模型支持：Whisper、FunASR
- 👥 说话人识别（Speaker Diarization）
- 🎵 声纹特征学习
- 📋 自动复制到剪贴板

## 架构

```
VoiceScribe/
├── app/                    # SwiftUI macOS 应用
│   ├── Package.swift       # Swift Package Manager
│   └── VoiceScribe/
│       ├── VoiceScribeApp.swift
│       ├── Models/
│       │   └── AppState.swift
│       ├── Views/
│       │   ├── ContentView.swift
│       │   ├── SettingsView.swift
│       │   └── MenuBarView.swift
│       └── Services/
│           ├── AudioRecorder.swift
│           ├── BackendService.swift
│           └── HotkeyManager.swift
├── backend/                # Python ASR 后端
│   ├── server.py          # FastAPI 服务
│   ├── engines/           # ASR 引擎
│   │   ├── whisper_engine.py
│   │   ├── parakeet_engine.py
│   │   └── funasr_engine.py
│   ├── diarization/       # 说话人识别
│   │   └── speaker.py
│   └── requirements.txt
└── README.md
```

## 快速开始

### 1. 启动后端（Mock 模式）

Mock 模式无需安装 ASR 引擎，可用于前端开发测试：

```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install fastapi uvicorn python-multipart numpy soundfile python-dotenv
python server.py --mock
```

后端将在 http://127.0.0.1:8765 启动。

### 2. 启动后端（完整模式）

需要安装 ASR 引擎：

```bash
cd backend
source venv/bin/activate

# 安装 faster-whisper（推荐）
pip install faster-whisper

# 或安装完整依赖（可能需要较多内存）
pip install -r requirements.txt

python server.py
```

### 3. 运行 Swift 应用

使用 Xcode：
```bash
cd app
open Package.swift
# 在 Xcode 中编译运行
```

或使用命令行：
```bash
cd app
swift build
.build/debug/VoiceScribe
```

## API 端点

| 端点 | 方法 | 描述 |
|------|------|------|
| `/` | GET | 服务状态 |
| `/health` | GET | 健康检查 |
| `/engines` | GET | 可用引擎列表 |
| `/load` | POST | 预加载模型 |
| `/transcribe` | POST | 转录音频 |
| `/stream` | WebSocket | 实时流式转录 |
| `/speakers` | GET | 已注册说话人 |
| `/speakers/register` | POST | 注册声纹 |

## 配置

### 快捷键

默认快捷键：⌘⇧R（Command + Shift + R）

可在设置中自定义。

### ASR 模型

| 引擎 | 模型 | 说明 |
|------|------|------|
| Whisper | tiny/base/small/medium/large-v2/large-v3 | OpenAI Whisper，支持多语言 |
| FunASR | paraformer-zh | 阿里达摩院，中文效果极佳 |

## 开发状态

- [x] 后端 API 框架
- [x] Mock 模式支持
- [x] Whisper 引擎集成
- [x] FunASR 引擎集成
- [x] Swift 应用框架
- [x] 录音功能
- [x] 全局快捷键
- [ ] 说话人识别（需要 HF Token）
- [ ] 声纹学习
- [ ] 本地存储历史

## 系统要求

- macOS 13+
- Python 3.10+
- Xcode 15+（编译 Swift 应用）
- 8GB+ RAM（运行 ASR 模型）

## 故障排除

### 后端无法启动

1. 检查端口 8765 是否被占用
2. 尝试 Mock 模式：`python server.py --mock`

### ASR 模型加载失败

1. 确保有足够内存（large-v3 需要约 6GB）
2. 尝试使用小模型：base 或 small

### 快捷键不工作

1. 确保应用有辅助功能权限
2. 检查 系统偏好设置 > 安全与隐私 > 辅助功能

## License

MIT
