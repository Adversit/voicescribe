# VoiceScribe PRD

更新时间：2026-04-02

## 1. 产品目标

VoiceScribe 是一个 Windows 桌面端本地语音转写工具，目标是提供从录音、转写、说话人分离、结果输出到历史记录管理的一体化闭环。

核心价值：
- 用全局热键快速开始和停止录音
- 在桌面端完成本地语音转文字
- 支持说话人分离与说话人映射
- 支持实时转录、历史记录、文本输出与模型管理
- 所有模型与缓存统一落到仓库内 `models/`

## 2. 用户场景

主要用户场景：
- 用户通过主窗口点击按钮开始录音并转录
- 用户通过全局热键开始、停止或取消录音
- 用户在设置页管理 ASR 引擎、模型、说话人分离模型和说话人映射模型
- 用户查看实时转录结果、AI 摘要和历史记录
- 用户把结果输出到剪贴板、直接输入或两者同时输出

## 3. 模块结构

### 3.1 桌面壳层

职责：
- 启动和停止后端
- 管理托盘、主窗口、悬浮窗
- 处理全局热键、音频录制、文本输出

主要模块：
- `tauri-app/src-tauri/src/lib.rs`
- `tauri-app/src-tauri/src/commands/backend.rs`
- `tauri-app/src-tauri/src/commands/hotkey.rs`
- `tauri-app/src-tauri/src/commands/audio.rs`
- `tauri-app/src-tauri/src/commands/text_input.rs`

### 3.2 前端界面层

职责：
- 展示设置页、引擎页、实时转录页、历史记录页
- 维护应用设置与运行时状态
- 组织录音和转录流程

主要模块：
- `tauri-app/src/pages/*`
- `tauri-app/src/stores/appStore.ts`
- `tauri-app/src/stores/modelStore.ts`
- `tauri-app/src/lib/recordingFlow.ts`
- `tauri-app/src/api/backend.ts`
- `tauri-app/src/api/tauri.ts`

### 3.3 后端服务层

职责：
- 暴露 HTTP/WebSocket 接口
- 管理模型状态、下载、加载与转录
- 执行说话人分离、说话人映射、历史记录持久化

主要模块：
- `backend/server.py`
- `backend/services/transcription_service.py`
- `backend/services/model_registry.py`
- `backend/services/model_catalog.py`
- `backend/services/history_service.py`
- `backend/diarization/speaker.py`
- `backend/engines/*.py`

### 3.4 模型与运行时层

职责：
- 所有模型、缓存、注册表统一放到 `<repo>/models/`
- 维护 Hugging Face、ModelScope、Torch、jieba 等运行时缓存目录
- 支持本地模型状态自愈与目录校验

主要对象：
- `models/voicescribe_models.json`
- `models/huggingface/`
- `models/diarization/`
- `models/torch/`

## 4. 当前功能边界

当前已落地主链：
- 桌面端启动后端与健康检查
- 主窗口设置页、引擎页、实时转录页、历史记录页
- 多引擎模型目录管理
- 全局热键注册与录音流桥接
- 历史记录存储、查询、删除与导出
- 说话人分离与说话人映射基础链路

当前仍在收口：
- 冷启动与 Apply 后的热键恢复体验
- `pyannote-3.1` 真实下载与真实运行时验收
- `Qwen3-ASR` 和 `3D-Speaker` 的真实预加载与真实转录验收
- Windows 自动启动、托盘、安装态 embedded Python 的最终验收

## 5. 产品级约束

- 模型和缓存主根目录必须保持在 `<repo>/models/`
- 前端不得把“路径存在”直接视为“模型可用”
- 热键录制、持久化和运行时匹配必须遵守同一套数据契约
- 已测试与已修复必须以 `docs/TEST.md` 和 `docs/BUGS.md` 为准

## 6. 文档约定

当前工作树只维护以下文档：
- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/TEST.md`
- `docs/BUGS.md`

历史阶段文档与截图不再保留在工作树中，需要时从 Git 历史查看。
