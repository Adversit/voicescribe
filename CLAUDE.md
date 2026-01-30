# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

VoiceScribe 是一个 macOS 原生语音转文字应用，前端使用 SwiftUI，后端使用 Python FastAPI。支持多种 ASR 引擎（Whisper、FunASR）和说话人识别。默认快捷键：⌘⇧R。

## 构建与运行命令

### 后端

```bash
# Mock 模式（无需 ASR 依赖，用于前端开发）
cd backend
python3 -m venv venv && source venv/bin/activate
pip install -r requirements-minimal.txt
python server.py --mock

# 核心模式（仅 faster-whisper）
pip install -r requirements-core.txt
python server.py

# 完整模式（包含所有 ASR 引擎和说话人识别）
pip install -r requirements.txt
python server.py
```

后端运行于 http://127.0.0.1:8765

### 前端 (Swift)

```bash
cd app
swift build                    # Debug 构建
swift build -c release         # Release 构建
.build/debug/VoiceScribe       # 运行

# 或在 Xcode 中打开
open Package.swift
```

### 构建 .app 包

```bash
./build.sh                     # 创建 ./build/VoiceScribe.app
```

### 测试后端

```bash
./scripts/test_backend.sh      # 测试端点（需要后端运行中）
```

## 架构

**前端** (`app/`)：使用 Swift Package Manager 的 SwiftUI macOS 应用
- `VoiceScribeApp.swift`：入口点，包含主窗口、设置窗口、菜单栏
- `AppState.swift`：单例状态管理，使用 @Published 和 @AppStorage
- `BackendService.swift`：基于 Actor 的异步 HTTP 客户端
- `AudioRecorder.swift`：AVFoundation 封装，录制 16kHz 单声道 WAV
- `HotkeyManager.swift`：Carbon API 全局快捷键处理

**后端** (`backend/`)：FastAPI 服务
- `server.py`：主 FastAPI 应用，提供 `/transcribe`、`/engines`、`/load` 端点
- `engines/`：ASR 引擎实现（whisper_engine.py、funasr_engine.py、whispercpp_engine.py）
- `diarization/speaker.py`：使用 pyannote.audio 的说话人识别

**数据流**：快捷键 → AudioRecorder → WAV 文件 → BackendService.transcribe() → ASR 引擎 → 结果复制到剪贴板

## 关键模式

- **状态管理**：全局单例 `AppState.shared`，配合 SwiftUI 响应式绑定
- **后端 API**：Actor `BackendService` 确保线程安全的 API 调用
- **Mock 模式**：`python server.py --mock` 返回硬编码响应，用于开发测试
- **引擎加载**：引擎通过 `/load` 端点按需加载

## 系统要求

- macOS 13+、Python 3.10+、Xcode 15+
- 8GB+ 内存用于 ASR 模型（large-v3 需要约 6GB）
- 辅助功能权限（用于全局快捷键）
- 麦克风权限（用于录音）

## API 端点

| 端点 | 方法 | 用途 |
|------|------|------|
| `/` | GET | 服务状态 |
| `/health` | GET | 健康检查 |
| `/engines` | GET | 列出可用引擎 |
| `/load` | POST | 预加载引擎/模型 |
| `/transcribe` | POST | 转录音频（multipart） |
| `/stream` | WebSocket | 实时流式转录 |
| `/speakers` | GET | 已注册说话人列表 |
| `/speakers/register` | POST | 注册说话人声纹 |
