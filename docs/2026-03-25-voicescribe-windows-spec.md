# VoiceScribe Windows 迁移 Spec

更新时间：2026-03-25

基线文档：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md)
- [0325项目初始.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325项目初始.md)
- 现有 macOS 实现目录 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)

## 1. 文档目的

本文档不是阶段计划摘要，而是实施约束文档。后续开发必须以本文档为准，明确：

- 哪些行为必须与 macOS 版一致
- 哪些路径和目录策略是硬约束
- 哪些后端接口必须保持兼容
- 每个 Phase 的完成标准和测试标准是什么

## 2. 硬约束

### 2.1 模型目录

本项目模型目录统一为项目根目录下的 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)。

硬约束如下：

1. 所有模型必须下载到项目根目录 `models/`。
2. 所有模型状态必须只从项目根目录 `models/` 读取。
3. 模型注册表固定为 `models/voicescribe_models.json`。
4. 历史注册表中的旧绝对路径必须自动 rebasing 到当前项目的 `models/`。
5. 不允许桌面端、后端或前端再引入第二套模型根目录语义。

### 2.2 模型管理语义

1. `/engines` 提供每个引擎的完整模型清单。
2. `/models` 提供每个引擎、每个模型的当前状态。
3. 前端模型页必须以“完整模型清单 + 当前状态”合并渲染。
4. 未下载模型必须显示，并保留下载入口。
5. 已下载模型必须显示为“已就绪”，并保留删除入口。
6. 模型管理逻辑不能只对 FunASR 生效，Whisper、WhisperCpp、Parakeet 也必须遵循同一套语义。

### 2.3 安装包与模型分发

1. 安装包不内置任何模型权重。
2. 模型下载由系统现有逻辑负责，不由安装包预置。
3. APP 的职责是：
   - 展示模型状态
   - 提供下载和删除入口
   - 调用后端接口
4. 用户第一次使用时，可在系统内按需下载模型。

### 2.4 行为基线

Windows 版行为基线以 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app) 的现有 macOS 实现为准。

必须对齐的核心行为：

1. 长按快捷键开始录音，释放后停止。
2. 双击快捷键切换录音开始/停止。
3. 录音中按 `ESC` 取消。
4. 输出模式支持：
   - `clipboard`
   - `directInput`
   - `both`
5. 关闭主窗口时隐藏到托盘，而不是直接退出。

## 3. 总体架构

### 3.1 架构分层

- Python FastAPI：ASR、模型管理、说话人管理、文本后处理
- Rust / Tauri：系统能力、进程管理、热键、录音、文本注入、托盘
- React / TypeScript：设置页、状态展示、模型页、说话人页、热词页、快捷键页

### 3.2 目录结构

关键目录如下：

- [backend](D:\learn\AIGC\voicescribe\0324\voicescribe\backend)
- [tauri-app](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app)
- [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)
- [config](D:\learn\AIGC\voicescribe\0324\voicescribe\config)
- [data](D:\learn\AIGC\voicescribe\0324\voicescribe\data)
- [docs](D:\learn\AIGC\voicescribe\0324\voicescribe\docs)

### 3.3 关键接口

必须保持兼容的后端接口：

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

## 4. Phase 1: 后端跨平台适配

### 4.1 `backend/config.py`

[config.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\config.py) 是后端路径与运行时策略的唯一来源。

必须提供并统一管理：

- `PROJECT_ROOT`
- `RUNTIME_ROOT`
- `MODEL_CACHE_DIR`
- `MODEL_REGISTRY_PATH`
- `MODELSCOPE_CACHE`
- `WHISPER_CPP_MODEL_DIR`
- `SPEAKER_DATA_DIR`
- `CONFIG_DIR`
- `find_whisper_cli()`
- `ensure_dirs()`

### 4.2 `backend/server.py`

[server.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\server.py) 必须满足：

1. 不再写死 macOS 路径。
2. 统一从 `config.py` 读取路径。
3. `/engines` 返回所有引擎的完整模型清单。
4. `/models` 返回所有引擎的完整状态列表。
5. `/models/download` 与 `/models/delete` 对所有受支持引擎都有效。
6. 模型已存在但注册表缺失时，应自动补录到注册表。
7. 注册表路径失效时，应自动清理无效记录。
8. 旧路径命中 `models/` 子路径时，应 rebasing 到当前项目 `models/`。

### 4.3 引擎文件

#### WhisperCpp

[whispercpp_engine.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\engines\whispercpp_engine.py) 必须：

- 默认从 `models/whisper-cpp/` 读取模型
- 通过 `find_whisper_cli()` 解析 CLI
- 在路径缺失时给出清晰错误

#### Whisper

[whisper_engine.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\engines\whisper_engine.py) 必须：

- 允许使用模型名称加载
- 允许使用本地目录路径加载
- 默认下载根目录落到 `models/whisper/`

#### Parakeet

[parakeet_engine.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\engines\parakeet_engine.py) 必须：

- 允许使用模型名称加载
- 允许使用本地目录路径加载
- 与注册表记录保持一致

### 4.4 说话人与 AI 配置目录

- [speaker.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\diarization\speaker.py) 默认使用 `data/speakers/`
- [ai_refiner.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\postprocess\ai_refiner.py) 默认使用 `config/`

### 4.5 Phase 1 验收

必须至少通过：

1. `python -m compileall backend`
2. `python server.py --mock`
3. `GET /health`
4. `GET /engines`
5. `GET /models`
6. 自动创建：
   - `models/`
   - `config/`
   - `data/speakers/`
7. 本地已有模型时，`/models` 能正确识别为 `available=true`

## 5. Phase 2: Tauri 项目脚手架

### 5.1 技术选型

- React 18 + TypeScript
- Vite
- Tailwind CSS
- Zustand
- Rust + Tauri v2

### 5.2 工程结构

[tauri-app](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app) 必须包含：

- `src-tauri/`
- `src/`
- `package.json`
- `vite.config.ts`
- `overlay.html`
- `index.html`

Rust 命令文件必须明确分层：

- [backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs)
- [audio.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\audio.rs)
- [hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs)
- [text_input.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\text_input.rs)

### 5.3 Tauri 配置

[tauri.conf.json](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\tauri.conf.json) 必须保证：

1. `beforeBuildCommand = npm run build`
2. `frontendDist = ../dist`
3. 配置主窗口
4. 配置托盘图标资源
5. 打包时包含 `backend/**/*`

## 6. Phase 3: 核心功能迁移

### 6.1 Python 子进程管理

[backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs) 必须负责：

- 启动 Python 后端
- 检查后端健康
- 停止后端
- 为后端设置运行环境变量

必须传入并固定：

- `VOICESCRIBE_ROOT`
- `VOICESCRIBE_RUNTIME_DIR`
- `VOICESCRIBE_MODEL_DIR`

其中 `VOICESCRIBE_MODEL_DIR` 必须始终指向项目根目录 `models/`。

### 6.2 全局快捷键

[hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs) 必须完整复刻：

- 长按开始录音
- 释放结束录音
- 双击切换录音
- `ESC` 取消
- 350ms 双击阈值

必须向前端发送事件：

- `hotkey-start-recording`
- `hotkey-stop-recording`
- `hotkey-cancel`

### 6.3 音频录制

[audio.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\audio.rs) 必须满足：

- 16kHz
- 单声道
- 16-bit PCM WAV
- 临时文件输出
- 实时音量事件
- 取消时删除临时文件

### 6.4 转录请求

- 重型音频上传由 Rust 发起
- 轻量查询由前端 `fetch` 发起
- 前后端数据结构必须与 `types/index.ts` 对齐

### 6.5 文本输出

[text_input.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\text_input.rs) 必须支持：

- `clipboard`
- `directInput`
- `both`

必须包含：

- 前台窗口保存
- 转录完成后恢复前台窗口
- `Ctrl+V` 模拟
- VoiceScribe 自身窗口保护逻辑

## 7. Phase 4: UI 实现

### 7.1 页面结构

Windows 版设置页必须与原版 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app) 在结构和体验上保持一致。

固定页面：

- 通用设置
- 引擎设置
- 热词设置
- 说话人设置
- 快捷键设置

### 7.2 引擎页规范

[EngineSettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\EngineSettings.tsx) 必须满足：

1. 引擎选择来自 `/engines`
2. 模型选择来自当前引擎完整模型清单
3. 模型状态来自 `/models`
4. 页面显示必须是“完整模型清单 + 状态叠加”
5. 未下载模型必须显示为“未下载”
6. 已下载模型必须显示为“已就绪”
7. 下载中模型必须显示实时下载状态
8. 所有引擎必须走同一套逻辑，不允许只对 `funasr` 特判

### 7.3 托盘与主窗口

主窗口与托盘必须满足：

1. 关闭主窗口时隐藏到托盘
2. 托盘左键可恢复主窗口
3. 托盘菜单至少包含：
   - 显示主窗口
   - 退出 VoiceScribe
4. 托盘必须显示图标

### 7.4 录音悬浮窗

[RecordingOverlay.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\RecordingOverlay.tsx) 必须支持三种状态：

- 录音中
- 转录中
- 已取消

## 8. Phase 5: 构建与打包

### 8.1 构建命令

必须通过：

1. `npm run build`
2. `cargo check`
3. `npm run tauri:build`

### 8.2 安装包

目标产物：

- `voicescribe-desktop.exe`
- NSIS 安装包

安装包必须包含：

- Tauri 可执行文件
- `backend/` 代码
- 必要静态资源

安装包必须不包含：

- 任意预置模型

### 8.3 启动脚本

[start_windows_system.bat](D:\learn\AIGC\voicescribe\0324\voicescribe\scripts\start_windows_system.bat) 必须：

1. 可选跳过构建
2. 默认先构建再启动
3. 启动前能清理残留进程
4. 启动后能拉起桌面端和 Python 后端

## 9. 测试与验收矩阵

### 9.1 构建级

- `python -m compileall backend`
- `npm run build`
- `cargo check`
- `npm run tauri:build`

### 9.2 接口级

- `/health`
- `/engines`
- `/models`
- `/speakers`
- `/load`
- `/transcribe`

### 9.3 语义级

必须明确验证：

1. 本地已有模型是否被识别
2. 未下载模型是否显示
3. 删除模型后状态是否回到“未下载”
4. 所有引擎是否遵循同一模型管理逻辑
5. 前端显示与后端状态是否一致

### 9.4 交互级

必须验证：

1. 长按录音
2. 双击录音
3. `ESC` 取消
4. 托盘最小化
5. 托盘图标
6. 文本输出到剪贴板
7. 文本直接注入外部窗口

## 10. 当前实现状态约束

截至本次修订，以下内容必须被视为“已经纳入规范，后续不得回退”：

1. 模型目录统一为项目根目录 `models/`
2. `/models` 必须覆盖所有引擎
3. 前端必须显示未下载模型
4. 其他引擎也必须有下载和删除逻辑
5. 关闭主窗口时必须转托盘

## 11. 不允许再出现的偏差

后续实现中，以下行为视为不符合 spec：

1. 只把 FunASR 当成特殊引擎处理，而其他引擎不遵循同一套模型管理逻辑
2. 模型目录再次出现第二套来源
3. 接口通过但前端语义不一致
4. 构建通过但没有验证行为口径
5. 先写实现、后补 spec、最后再靠用户指出问题回修
