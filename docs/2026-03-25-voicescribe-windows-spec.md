# VoiceScribe Windows 迁移 Spec

> 日期：2026-03-25  
> 基线文档：`docs/0325第一阶段改造计划.md`、`docs/0325项目初始.md`

## 1. 摘要

本 spec 定义 VoiceScribe 从 macOS SwiftUI 前端迁移到 Windows Tauri 前端的实施规范。目标是在保持 Python FastAPI 后端接口稳定的前提下，完成 Windows 桌面壳层、核心录音热键链路、设置页与打包流程迁移。

本 spec 明确以下硬约束：

1. 安装包不内置任何 ASR 模型权重。
2. 模型目录由运行时决定，开发态允许仓库内目录，安装态必须使用用户可写目录。
3. 模型下载继续使用系统内现有下载逻辑与后端 `/models*` 接口，不由安装包预置。
4. Windows v1 行为基线以现有 macOS 版本为准：长按录音、双击录音、ESC 取消、剪贴板/直接输入/两者都执行。

## 2. 目标与非目标

### 2.1 目标

- 保持后端 HTTP 合约不变，完成路径与运行时目录跨平台适配。
- 新建 `tauri-app/`，使用 Rust + React + TypeScript 承接 Windows 桌面能力。
- 完成以下核心用户链路：
  - 全局快捷键触发录音
  - 录音结束后调用后端转录
  - 将结果输出到目标应用或剪贴板
  - 管理引擎、模型、热词、说话人、快捷键设置
- 支持安装包交付：程序、后端代码、Python 运行环境、静态资源。

### 2.2 非目标

- 首版不要求替代 macOS 原生前端。
- 首版不要求安装包内置模型。
- `/stream` WebSocket 接口保留，但不作为 v1 主流程。
- 本 spec 不覆盖云端同步、账号系统或在线模型托管。

## 3. 架构决策

### 3.1 后端

- 后端继续使用 `backend/server.py` 作为唯一入口。
- 新增 `backend/config.py` 统一管理：
  - `VOICESCRIBE_RUNTIME_DIR`
  - `VOICESCRIBE_MODEL_DIR`
  - `VOICESCRIBE_CONFIG_DIR`
  - `VOICESCRIBE_SPEAKER_DIR`
  - `VOICESCRIBE_WHISPERCPP_MODEL_DIR`
  - `VOICESCRIBE_WHISPERCPP_CLI`
- `server.py`、`whispercpp_engine.py`、`speaker.py`、`ai_refiner.py` 不允许再直接写死 macOS 路径。
- 运行时目录规则：
  - 开发态：默认使用仓库根下 `models/`、`config/`、`data/speakers/`
  - 安装态：默认使用 `%LOCALAPPDATA%/VoiceScribe/runtime/` 下的同名目录

### 3.2 Windows/Tauri 壳层

- 新增 `tauri-app/` 作为 Windows 桌面前端工程。
- Rust 负责：
  - Python 子进程启动与停止
  - Win32 低级键盘钩子
  - 麦克风录音
  - 前台窗口追踪与文本注入
  - 与后端的重型本地文件转录请求
- React 前端负责：
  - 设置页与状态展示
  - 模型状态轮询与下载触发
  - 说话人样本上传
  - 热键事件监听与状态联动

### 3.3 模型与数据策略

- 安装包包含：
  - Tauri 可执行文件
  - `backend/` 代码
  - Python 运行环境
  - 静态图标与页面资源
- 安装包不包含：
  - `models/` 下任何文件
  - 任意 HuggingFace、ModelScope、Whisper.cpp 权重
- 模型由用户首次使用时，通过系统现有逻辑下载；桌面端只负责调用与展示，不改变下载源。

## 4. 关键接口与行为规范

### 4.1 后端接口

以下接口保持现状，不新增破坏性变更：

- `GET /`
- `GET /health`
- `GET /engines`
- `GET /models`
- `POST /models/download`
- `POST /models/delete`
- `POST /load`
- `POST /transcribe`
- `WS /stream`
- `GET /speakers`
- `POST /speakers/register`
- `DELETE /speakers/{speaker_id}`

### 4.2 Tauri Commands

Rust 端必须暴露以下命令：

- `start_backend`
- `stop_backend`
- `backend_status`
- `transcribe`
- `register_hotkey`
- `unregister_hotkey`
- `get_hotkey_display`
- `start_recording`
- `stop_recording`
- `cancel_recording`
- `get_recording_status`
- `output_text`

### 4.3 热键行为

- 默认热键为 `Ctrl+Shift+R`。
- 双击阈值固定为 `350ms`。
- 行为必须与 macOS 版一致：
  - 单次长按超过 350ms：开始录音
  - 长按释放：停止录音并转录
  - 快速双击：切换录音开始/停止
  - 录音中按 `ESC`：取消录音，不转录
- Rust 端通过事件推送前端：
  - `hotkey-start-recording`
  - `hotkey-stop-recording`
  - `hotkey-cancel`

### 4.4 音频录制行为

- 录音参数固定：
  - 16kHz
  - 单声道
  - 16-bit PCM WAV
- 录音文件输出到系统临时目录。
- 录音开始时必须保存当前前台窗口句柄。
- 录音过程中通过 `audio-level` 事件推送 0-1 音量值。
- `cancel_recording` 必须删除临时录音文件。

### 4.5 文本输出行为

- 输出模式支持：
  - `clipboard`
  - `directInput`
  - `both`
- `directInput`/`both` 必须遵循：
  1. 先写剪贴板
  2. 恢复录音前保存的前台窗口
  3. 等待约 `200ms`
  4. 模拟 `Ctrl+V`
- 若当前前台窗口仍是 VoiceScribe 自身，必须强制退化为 `clipboard`。

## 5. 前端状态与页面规范

### 5.1 状态模型

前端 Zustand store 至少维护：

- `settings`
- `backendConnected`
- `availableEngines`
- `backendRuntime`
- `speakers`
- `isRecording`
- `isTranscribing`
- `audioLevel`
- `lastResult`
- `toast`

### 5.2 页面

主窗口保留五个设置页：

- 通用设置
- 引擎设置
- 热词管理
- 说话人管理
- 快捷键设置

页面行为要求：

- 通用设置：语言、输出方式、说话人识别、AI 优化、后端状态
- 引擎设置：展示可用引擎、当前模型、FunASR 模型下载/删除/状态
- 热词管理：逗号分隔热词编辑
- 说话人管理：列举已注册说话人、上传 WAV 样本注册
- 快捷键设置：配置修饰键掩码与主键码，并调用 `register_hotkey`

## 6. 打包与发布规范

- 目标安装器：NSIS
- 安装模式：`perMachine`
- 安装目录仅存放程序与只读资源
- 运行时数据不得依赖安装目录可写
- 首次启动可执行：
  - 解析 Python 路径
  - 初始化运行时目录
  - 启动后端
- 若未找到内嵌 Python，可回退到系统 `python`

## 7. 验收标准

### 7.1 后端

- `python -m compileall backend` 通过
- Windows 下 `python server.py --mock` 可启动
- 运行时目录能自动创建 `models/`、`config/`、`data/speakers/`

### 7.2 前端

- `npm run build` 通过
- 应用能显示后端连接状态
- 能列出引擎与模型
- 能上传说话人 WAV 样本并刷新列表
- 能保存热词、语言、输出方式与快捷键设置

### 7.3 核心交互

- 全局热键支持长按、双击、ESC 取消
- 录音结束后可转录
- 转录结果能按配置输出到剪贴板或目标应用
- 若目标应用恢复失败，至少保证剪贴板有结果

## 8. 当前实现状态

截至当前代码基线：

- 后端跨平台路径适配：已实现
- Tauri 项目脚手架：已实现
- Phase 3.2 全局快捷键：已补命令层与事件链路
- Phase 3.3 音频录制：已补 `cpal + hound` 录音实现
- Phase 3.5 文本输出：已补前台窗口恢复与 `Ctrl+V` 注入
- 模型随包分发：明确不做

待环境补齐后继续验证的唯一高风险项：Rust/Tauri 本地编译链当前未在本机安装 `cargo`，因此需要在具备 Rust toolchain 的机器上执行最终编译验证。
