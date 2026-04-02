# VoiceScribe SPEC

更新时间：2026-04-02

## 1. Single Source Of Truth

产品与模块边界：
- `docs/PRD.md`

技术契约、运行链和接口：
- `docs/SPEC.md`

已执行测试：
- `docs/TEST.md`

已知问题与待修项：
- `docs/BUGS.md`

代码真相：
- 以当前仓库实现为准，但新增或跨层改动必须先回写本文件

## 2. 关键技术约束

- 模型与缓存主目录固定为 `<repo>/models/`
- 后端状态、下载、删除、加载都必须基于项目内模型目录
- 桌面端通过 Tauri Rust 命令启动和管理后端
- 跨层功能必须明确检查前端、Tauri、后端、持久化对象和日志
- `backend/server.py` 是高风险中心文件；新增复杂业务规则时要优先评估是否下沉到 service 模块

## 3. 关键数据契约

### 3.1 HotkeyBinding

唯一正式结构：

```ts
type HotkeyBinding = {
  keys: number[]
  display: string
}
```

约束：
- `keys.length` 只能是 `1` 或 `2`
- `keys` 必须唯一且排序
- 左右键位保留 Windows 原生区分

### 3.2 Model Status

后端 `/models` 返回的模型状态至少要表达：
- `available`
- `downloaded`
- `downloading`
- `path`
- `size_bytes`
- `error`

约束：
- “目录存在”不等于“可用”
- 某些模型需要模型专属完整性检查
- 当前已对 `pyannote-3.1` 做完整目录校验

### 3.3 Persisted Objects

需要同步检查的持久化对象：
- 前端设置
- 模型注册表 `models/voicescribe_models.json`
- 历史记录
- 转录结果对象
- token 存储
- 共享日志文件

## 4. 运行链

### 4.1 引擎与模型管理

主要链路：
- `EngineSettings.tsx -> modelStore.ts -> backend.ts -> backend.rs -> server.py -> model registry / runtime services`

关键责任：
- 前端展示完整模型清单与状态叠加
- 后端负责模型状态判定、目录校验、下载和注册表修正

### 4.2 录音与转录

主要链路：
- `UI / hotkey -> recordingFlow.ts -> tauri.ts -> audio.rs -> backend.rs -> server.py -> transcription_service.py -> engines/*.py`

关键责任：
- Rust 负责录音设备、音频流和桌面能力
- 后端负责模型加载、转录、说话人分离和结果组合

### 4.3 热键

主要链路：
- `HotkeySettings.tsx -> appStore.ts -> useHotkey.ts -> tauri.ts -> hotkey.rs`

当前原则：
- 设置页只负责录制和更新设置
- 正式注册入口只保留在 `useHotkey.ts`
- 运行时全局监听在 Rust `WH_KEYBOARD_LL`

### 4.4 历史记录

主要链路：
- `recordingFlow.ts / stream flow -> backend.ts -> server.py -> history_service.py -> history.json`

责任：
- 后端负责最终落盘
- 前端负责展示、筛选、复制、下载和删除

## 5. 关键接口

### 5.1 Backend HTTP

主要接口：
- `GET /health`
- `GET /engines`
- `GET /models`
- `POST /models/download`
- `POST /models/delete`
- `POST /transcribe`
- `WS /stream`
- `GET /history`
- `POST /history`
- `DELETE /history/{record_id}`
- `DELETE /history`
- `POST /summary`

### 5.2 Tauri Commands

主要命令：
- `start_backend`
- `stop_backend`
- `backend_status`
- `transcribe`
- `register_hotkey_binding`
- `suspend_hotkey_runtime`
- `resume_hotkey_runtime`
- `start_recording`
- `stop_recording`
- `cancel_recording`
- `output_text`
- token 读写相关命令

## 6. 模型路径与完整性规则

- 项目内模型根：`<repo>/models/`
- Hugging Face 缓存：`models/huggingface/`
- Torch 缓存：`models/torch/`
- jieba 缓存：`models/jieba/`

当前特殊规则：
- `pyannote-3.1` 仅在目录包含 `config.yaml` 和 checkpoint 文件时才允许视为本地可用
- 不完整目录不得标记为 `available=true`
- 指向不完整目录的 stale registry 必须自动清掉

## 7. 失败分支

必须显式考虑：
- 后端未就绪
- 模型目录存在但不完整
- gated repo token 存在但下载不完整
- 热键注册成功但冷启动后运行时未恢复
- Apply 后 register/resume 存在延迟
- 空录音、过短音频、无有效语音
- Windows 专属路径、DLL、运行时依赖异常

## 8. 当前未收口项

- 冷启动 `Right Alt` 不触发的真实断点和行为修复
- 热键 Apply 后恢复慢的真实延迟点与行为修复
- `pyannote-3.1` 真实完整下载与真实 diarization 验收
- `Qwen3-ASR` 真实预加载与真实转录验收
- `3D-Speaker` 下载后真实加载与转录验收
- 快速测试启动脚本
- 启动期 `ffmpeg / jieba / whisper.cpp / Parakeet` warning 收口
