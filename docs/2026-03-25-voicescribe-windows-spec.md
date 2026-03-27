# VoiceScribe Windows 迁移正式 Spec

更新时间：2026-03-26

基线文档：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md)
- [0325项目初始.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325项目初始.md)
- 现有 macOS 实现目录 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)

本文件是当前唯一正式 spec。若与其他 spec、实现现状或临时说明冲突，一律以 [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md) 和本文件为准。

## 目录

- [文档定位](#文档定位)
- [Source Of Truth](#source-of-truth)
- [总体策略](#总体策略)
- [Phase 1: 后端跨平台适配](#phase-1-后端跨平台适配)
- [Phase 2: Tauri 项目脚手架](#phase-2-tauri-项目脚手架)
- [Phase 3: 核心功能迁移](#phase-3-核心功能迁移)
- [Phase 4: UI 实现](#phase-4-ui-实现)
- [Phase 5: 构建与打包](#phase-5-构建与打包)
- [阶段依赖与排期](#阶段依赖与排期)
- [Codex Worktree 并行开发方案](#codex-worktree-并行开发方案)
- [风险与缓解](#风险与缓解)
- [测试与验收](#测试与验收)
- [执行顺序](#执行顺序)
- [历史文档索引](#历史文档索引)

## 文档定位

本文档的目的不是描述“当前代码是什么样”，而是把 [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md) 落成可执行的实施约束、验收标准和修复顺序。

本文档解决以下问题：

1. 统一迁移目标，避免按当前代码反推需求。
2. 将计划文档中的阶段目标转化为必须达到的结果约束。
3. 为后续“plan -> spec -> 代码 -> 测试”提供唯一判断标准。
4. 将并行开发方式、测试方式和历史偏差索引纳入正式规范。

## Source Of Truth

优先级从高到低如下：

1. [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md)
2. 本正式 spec
3. 原始 macOS 行为基线 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)
4. 当前实现代码
5. 旧版 spec 和历史说明文档

说明：

- 如果当前代码与改造计划冲突，应修代码，而不是改计划来迁就代码。
- 如果旧版 spec 与改造计划冲突，以改造计划和本正式 spec 为准。

## 总体策略

### 核心原则

- **后端几乎不变**：Python FastAPI 后端仅做路径适配，API 接口保持不变
- **前端完全重写**：Swift → Tauri (Rust + React/TypeScript)
- **行为 100% 对齐**：长按/双击快捷键、输出模式、模型管理等行为与 macOS 版完全一致
- **模型目录迁移**：从 `~/Library/Application Support/VoiceScribe/models` 改为项目根目录下 `models/`

### 全局硬约束

#### 模型目录与状态

以下约束必须在所有模块中统一：

1. 所有模型必须下载到项目根目录 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)。
2. 所有模型状态必须只从项目根目录 `models/` 读取。
3. 模型注册表固定为 `models/voicescribe_models.json`。
4. 历史旧绝对路径必须 rebasing 到当前项目 `models/`。
5. 不允许存在第二套模型根目录语义。

#### 模型管理页面语义

以下语义必须固定：

1. `/engines` 返回完整模型清单。
2. `/models` 返回模型状态。
3. 前端显示必须采用“完整模型清单 + 状态叠加”。
4. 未下载模型必须显示。
5. 未下载模型必须保留下载入口。
6. 已下载模型必须保留删除入口。
7. 所有引擎都必须遵循同一模型管理语义，不能只做 FunASR。

#### 安装包边界

安装包必须包含：

- Tauri 可执行文件
- Rust 命令层
- `backend/` 代码
- 必要静态资源
- Python 运行环境或其初始化逻辑

安装包不得包含：

- 任意预置模型权重

#### 行为对齐

以下行为必须以 macOS 版为基线对齐：

1. 长按快捷键开始录音，释放结束录音。
2. 双击快捷键切换录音开始/停止。
3. 录音中按 `ESC` 取消。
4. 输出模式支持：
   - `clipboard`
   - `directInput`
   - `both`
5. 主窗口关闭时进入托盘，而不是直接退出。

### macOS → Windows 技术映射总表

| macOS 技术 | 用于 | Windows/Tauri 替代方案 |
|---|---|---|
| SwiftUI | UI 框架 | React + TypeScript + Tailwind CSS |
| AVFoundation (`AVAudioRecorder`) | 录音 16kHz WAV | Rust `cpal` + `hound` crate |
| CGEventTap (`CFMachPort`) | 全局快捷键拦截 | Win32 `SetWindowsHookExW(WH_KEYBOARD_LL)` |
| CGEvent 键盘模拟 | 文本直接输入 | Rust `enigo` crate (`SendInput`) |
| NSPasteboard | 剪贴板 | `tauri-plugin-clipboard-manager` |
| MenuBarExtra | 菜单栏常驻图标 | Tauri 内置 `tray-icon` |
| AXIsProcessTrusted | 辅助功能权限检查 | 无需（Windows 无此限制） |
| NSProcess | Python 子进程管理 | Rust `std::process::Command` |
| NSWorkspace.frontmostApplication | 获取前台应用 | Win32 `GetForegroundWindow()` |
| Bundle.main.resourcePath | App Bundle 资源 | Tauri `app.path()` 资源目录 |
| @AppStorage (UserDefaults) | 持久化设置 | `tauri-plugin-store` (JSON 文件) |
| RecordingOverlayWindow (NSWindow) | 悬浮录音指示 | Tauri WebviewWindow (`always_on_top`, `decorations: false`) |
| Carbon keyCode (0=A, 15=R...) | 键码映射 | Windows Virtual Key Code (VK_A=0x41, VK_R=0x52...) |
| Info.plist 权限声明 | 麦克风/辅助功能权限 | `tauri.conf.json` + Windows 自动弹窗 |
| `/tmp/` | 临时文件 | `%TEMP%` / `std::env::temp_dir()` |
| `~/Library/Application Support/` | 应用数据 | `%APPDATA%` / Tauri `app_data_dir()` |

## Phase 1: 后端跨平台适配

### 1.1 新建 `backend/config.py` — 集中路径管理

目的：用一个模块统一管理所有目录路径，替换散落在各文件中的硬编码 macOS 路径。

[config.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\config.py) 必须统一管理：

- `PROJECT_ROOT`
- `RUNTIME_ROOT`
- `MODEL_CACHE_DIR`
- `MODELSCOPE_CACHE`
- `MODEL_REGISTRY_PATH`
- `WHISPER_CPP_MODEL_DIR`
- `SPEAKER_DATA_DIR`
- `CONFIG_DIR`
- `find_whisper_cli()`
- `ensure_dirs()`

目录布局对比如下：

| 用途 | macOS 旧路径 | 新路径（项目根目录相对） | 环境变量覆盖 |
|---|---|---|---|
| 模型缓存 | `~/Library/Application Support/VoiceScribe/models` | `<ROOT>/models/` | `VOICESCRIBE_MODEL_DIR` |
| ModelScope 缓存 | 同上 | 同上 | `MODELSCOPE_CACHE` |
| 模型注册表 | 同上 `/voicescribe_models.json` | `<ROOT>/models/voicescribe_models.json` | — |
| Whisper.cpp 模型 | `~/.whisper-models/` | `<ROOT>/models/whisper-cpp/` | `VOICESCRIBE_WHISPERCPP_MODEL_DIR` |
| Whisper.cpp CLI | `/opt/homebrew/bin/whisper-cli` | `PATH` 搜索 + 平台回退 | `VOICESCRIBE_WHISPERCPP_CLI` |
| 说话人声纹 | `~/.voicescribe/speakers/` | `<ROOT>/data/speakers/` | `VOICESCRIBE_SPEAKER_DIR` |
| 配置文件 | `~/.voicescribe/` | `<ROOT>/config/` | `VOICESCRIBE_CONFIG_DIR` |
| 项目根目录 | — | `backend/` 的父目录 | `VOICESCRIBE_ROOT` |

### 1.2 修改 `backend/server.py`

[server.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\server.py) 必须满足：

1. 不再硬编码 macOS 路径。
2. 所有路径都从 `config.py` 导入。
3. `/engines` 返回完整引擎和模型清单。
4. `/models` 返回完整模型状态。
5. `/models/download` 和 `/models/delete` 遵循统一语义。
6. 本地已有模型但注册表缺失时，能自动补录。
7. 注册表路径失效时，能自动清理无效记录。
8. 旧路径命中 `models/` 子路径时，必须 rebasing 到当前项目 `models/`。

必须覆盖的改动点：

- 导入 `config` 模块
- `whispercpp` 检测函数改为依赖 `find_whisper_cli()` 与 `WHISPER_CPP_MODEL_DIR`
- `MODEL_CACHE_DIR` 初始化改为依赖 `MODELSCOPE_CACHE` 与 `ensure_dirs()`
- `/load` 中 `whispercpp` 模型路径改为从运行时模型目录拼接
- FunASR 下载 `cache_dir` 使用 `str(MODEL_CACHE_DIR)`

### 1.3 修改 `backend/engines/whispercpp_engine.py`

[whispercpp_engine.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\engines\whispercpp_engine.py) 必须：

- 默认模型路径来自 `WHISPER_CPP_MODEL_DIR`
- CLI 路径来自 `find_whisper_cli()`
- 路径缺失时给出清晰错误

### 1.4 修改 `backend/diarization/speaker.py`

[speaker.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\diarization\speaker.py) 必须：

- 默认数据目录来自 `SPEAKER_DATA_DIR`
- 自动创建目录

### 1.5 修改 `backend/postprocess/ai_refiner.py`

[ai_refiner.py](D:\learn\AIGC\voicescribe\0324\voicescribe\backend\postprocess\ai_refiner.py) 必须：

- 配置目录来自 `CONFIG_DIR`

### 1.6 向后兼容性保证

| 场景 | 行为 |
|---|---|
| macOS 原生 app（BackendManager 设置 `VOICESCRIBE_MODEL_DIR`） | 环境变量优先，继续使用 `~/Library/Application Support/` |
| Windows Tauri 不设置环境变量 | 自动使用 `<项目根>/models/` |
| 开发者手动运行 `python server.py` | 自动使用 `<项目根>/models/` |
| 设置 `VOICESCRIBE_ROOT` | 所有路径基于该目录 |

说明：

- 该兼容性保证来源于 plan。
- 若与你后续明确收紧的产品口径冲突，以“模型只认 `models/`”为最终产品约束执行。

### 1.7 Phase 1 测试方案

必须至少覆盖以下验证：

```powershell
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements-minimal.txt
python server.py --mock
```

验证点：

1. 启动无报错
2. `GET http://127.0.0.1:8765/` 返回 `status: ok`
3. `GET http://127.0.0.1:8765/engines` 返回引擎列表
4. `models/` 目录被自动创建
5. `config/` 目录被自动创建
6. `data/speakers/` 目录被自动创建

## Phase 2: Tauri 项目脚手架

### 2.1 技术选型

| 决策点 | 选择 | 理由 |
|---|---|---|
| 前端框架 | React 18 + TypeScript | 生态最大，Tauri 集成最成熟 |
| 样式方案 | Tailwind CSS 3 | 原子化 CSS，适合深色主题 |
| UI 组件库 | Radix UI | 无样式原语，完全可定制 |
| 状态管理 | Zustand | 轻量，模式与 AppState 单例一致 |
| 构建工具 | Vite 5 | Tauri v2 默认，HMR 快速 |
| 音频录制 | Rust `cpal` + `hound` | 原生 Windows WASAPI 支持，16kHz WAV |
| 全局快捷键 | Win32 低级键盘钩子 | 支持 keydown/keyup 事件（长按检测需要） |
| 剪贴板 | `tauri-plugin-clipboard-manager` | Tauri 官方插件 |
| 系统托盘 | Tauri v2 内置 `tray-icon` | 一等公民支持 |
| 文本输入模拟 | Rust `enigo` crate | 跨平台 `SendInput` 封装 |
| 持久化存储 | `tauri-plugin-store` | JSON 文件，替代 `@AppStorage` |
| HTTP 客户端 | Rust `reqwest` + 前端 `fetch` | 转录上传二进制走 Rust，轻量查询走前端 |

### 2.2 项目结构

[tauri-app](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app) 必须具备：

- `src-tauri/`
- `src/`
- `index.html`
- `overlay.html`
- `package.json`
- `vite.config.ts`

Rust 命令文件必须明确拆分为：

- [backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs)
- [audio.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\audio.rs)
- [hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs)
- [text_input.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\text_input.rs)

前端页面和模块至少包括：

- `GeneralSettings.tsx`
- `EngineSettings.tsx`
- `VocabularySettings.tsx`
- `SpeakerSettings.tsx`
- `HotkeySettings.tsx`
- `appStore.ts`
- `modelStore.ts`
- `backend.ts`
- `tauri.ts`

### 2.3 `tauri.conf.json` 关键配置

[tauri.conf.json](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\tauri.conf.json) 必须至少包含：

1. `frontendDist = ../dist`
2. `devUrl = http://localhost:5173`
3. `beforeBuildCommand = npm run build`
4. `beforeDevCommand = npm run dev`
5. 主窗口配置
6. 托盘图标配置
7. 打包资源里的 `backend/**/*`
8. `nsis` 作为目标安装器

### 2.4 Rust 依赖 `Cargo.toml`

必须覆盖以下依赖类别：

- `tauri` / `tray-icon`
- `tauri-plugin-global-shortcut`
- `tauri-plugin-clipboard-manager`
- `tauri-plugin-store`
- `serde` / `serde_json`
- `tokio`
- `reqwest`
- `cpal`
- `hound`
- `enigo`
- `windows`

### 2.5 TypeScript 类型定义

[types/index.ts](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\types\index.ts) 必须对齐：

- `EngineInfo`
- `TranscribeResult`
- `Segment`
- `Transcription`
- `ModelStatus`
- `SpeakerInfo`
- `AppSettings`

必须明确这些默认值与约束：

- 默认引擎：`funasr`
- 默认模型：`seaco-paraformer`
- 默认语言：`zh`
- 默认输出方式：`directInput`
- 默认快捷键：Windows `Ctrl+Shift+R`

## Phase 3: 核心功能迁移

### 3.1 Python 子进程管理

[backend.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\backend.rs) 必须负责：

1. 启动 Python 后端
2. 检查后端健康
3. 停止后端
4. 传递运行时环境变量

必须传入：

- `VOICESCRIBE_ROOT`
- `VOICESCRIBE_RUNTIME_DIR`
- `VOICESCRIBE_MODEL_DIR`

其中 `VOICESCRIBE_MODEL_DIR` 必须始终指向项目根目录 `models/`。

### 3.2 全局快捷键

[hotkey.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\hotkey.rs) 必须完整复刻：

- 长按开始录音
- 释放结束录音
- 双击切换录音
- `ESC` 取消
- 350ms 双击阈值

必须向前端发出：

- `hotkey-start-recording`
- `hotkey-stop-recording`
- `hotkey-cancel`

修饰键映射必须遵循：

| macOS 修饰键 | 掩码值 | Windows 等价键 | VK 码 |
|---|---|---|---|
| ⌘ Command | 0x100000 | Ctrl | VK_CONTROL |
| ⇧ Shift | 0x020000 | Shift | VK_SHIFT |
| ⌥ Option | 0x080000 | Alt | VK_MENU |
| ⌃ Control | 0x040000 | Win | VK_LWIN |

### 3.3 音频录制

[audio.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\audio.rs) 必须严格保持：

- 16kHz
- 单声道
- 16-bit PCM WAV
- 临时文件输出
- 实时音量事件
- 取消时删除录音文件

### 3.4 后端 API 客户端

分工必须固定：

- 重型转录上传由 Rust 发起
- 轻量接口查询由前端 `fetch` 发起

转录请求必须覆盖：

- `audio`
- `engine`
- `model`
- `language`
- `enable_diarization`
- `hotwords`
- `enable_ai_refine`

### 3.5 文本输出

[text_input.rs](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src-tauri\src\commands\text_input.rs) 必须支持：

- `clipboard`
- `directInput`
- `both`

必须包含：

- 保存录音前前台窗口
- 恢复前台窗口
- `Ctrl+V` 模拟
- 当目标窗口仍是 VoiceScribe 时自动回退为剪贴板模式

## Phase 4: UI 实现

### 4.1 主窗口 — 设置页

Windows 版设置页必须与 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app) 的结构和体验保持一致，不要求像素级复刻，但不允许退化成后台管理页语义。

这里额外补充一条来自 [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\0325第一阶段改造计划.md) 的硬约束：

- Windows 主窗口必须采用“左侧导航 + 右侧内容区”的侧边栏设置页布局。
- 不允许用顶部 tab 条、胶囊按钮横排、dashboard 卡片入口来替代这一结构。
- 即使原始 [SettingsView.swift](D:\learn\AIGC\voicescribe\0324\voicescribe\app\VoiceScribe\Views\SettingsView.swift) 使用 `TabView`，本项目在 Phase 4 仍以 plan 的“侧边栏导航”要求为准。
还必须补充以下原生界面约束：

- 各设置页应以“尽量单屏可见”为优先目标，不能默认依赖整页上下滚动。
- `GeneralSettings.tsx` 必须在默认窗口尺寸下尽量做到不需要整页滚动即可看完主要信息。
- 其他设置页也必须优先保证一屏内看到主要信息；只有模型列表、说话人列表等天然可增长内容允许滚动。
- 如需滚动，应优先使用局部滚动区域，而不是把整个右侧页面拉成长页面。
- 右侧内容区必须采用高信息密度、低装饰性的原生设置页组织方式，不允许使用大块 dashboard 式卡片堆叠作为默认布局。
- 视觉取舍优先级固定为：信息可见性 > 单屏可读性 > 装饰性卡片感。

布局必须保留：

- 左侧侧边栏导航
- 通用设置
- 引擎设置
- 热词管理
- 说话人管理
- 快捷键设置

主窗口骨架必须满足：

1. 顶部标题栏显示应用名和连接状态。
2. 左侧为固定导航区，承载 5 个设置入口。
3. 右侧为当前页面内容区。
4. `Layout.tsx` 的职责仍然是“侧边栏布局”，不能退化成顶部切页容器。

### 4.2 各页面字段

#### 通用设置

必须包含：

| 字段 | 组件 | 选项/说明 | 默认值 |
|---|---|---|---|
| 语言 | Select | zh / en / ja / ko / auto | zh |
| 输出方式 | Radio | 直接输入 / 剪贴板 / 两者 | directInput |
| 说话人识别 | Switch | on/off | off |
| AI 文本优化 | Switch | on/off | off |
| 后端状态 | 状态指示 | 运行中 / 启动中 / 未连接 | — |

#### 引擎设置

[EngineSettings.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\pages\EngineSettings.tsx) 必须满足：

1. 引擎选择来自 `/engines`
2. 模型选择来自当前引擎完整模型清单
3. 模型状态来自 `/models`
4. 页面显示必须是“完整模型清单 + 状态叠加”
5. 未下载模型必须显示为“未下载”
6. 已下载模型必须显示为“已就绪”
7. 下载中模型必须显示实时下载状态
8. 所有引擎必须走同一套逻辑，不允许只对某一个引擎特判

#### 热词设置

必须包含：

| 字段 | 组件 | 说明 |
|---|---|---|
| 热词输入 | TagInput | 逗号分隔，flow 布局标签 |
| 说明文本 | Text | 解释热词用法和格式 |

#### 说话人管理

必须包含：

| 字段 | 组件 | 说明 |
|---|---|---|
| 说话人列表 | List | 显示已注册说话人和删除按钮 |
| 注册新说话人 | Form | 名称输入 + 录音/上传入口 + 音量指示 |

#### 快捷键设置

必须包含：

| 字段 | 组件 | 说明 |
|---|---|---|
| 修饰键 | Checkboxes | Ctrl / Shift / Alt / Win |
| 主键 | Select | A-Z、0-9、F1-F12 等 |
| 预览 | Text | 如 `Ctrl+Shift+R` |
| 应用 | Button | 重新注册快捷键 |

### 4.3 录音悬浮窗

[RecordingOverlay.tsx](D:\learn\AIGC\voicescribe\0324\voicescribe\tauri-app\src\components\RecordingOverlay.tsx) 必须支持：

- 录音中
- 转录中
- 已取消

### 4.4 系统托盘

必须满足：

1. 主窗口关闭时隐藏到托盘
2. 托盘图标可见
3. 托盘左键可恢复主窗口
4. 托盘菜单至少包含：
   - 显示主窗口
   - 退出 VoiceScribe

## Phase 5: 构建与打包

### 5.1 Python 打包策略

推荐方案固定为：嵌入式 Python（`python-embed`）。

方案比较：

| 方案 | 打包大小 | 用户体验 | 复杂度 |
|---|---|---|---|
| A. 要求用户安装 Python | 最小 | 差 | 低 |
| B. 嵌入 python-embed | 约 +15MB | 好 | 中 |
| C. PyInstaller 打包 | 500MB+ | 好 | 高 |

正式方案采用 B。

首次启动流程必须支持：

1. 检查 `backend/venv/` 是否存在
2. 若不存在：
   - 解压嵌入式 Python
   - 创建 venv
   - 安装最小依赖
   - 启动后端

### 5.2 NSIS 安装程序配置

必须采用：

- `installMode = perMachine`
- `languages = ["SimpChinese", "English"]`

安装目录为：

- `C:\Program Files\VoiceScribe\`

### 5.3 开机自启动

必须使用 Windows 注册表或启动文件夹方案实现，不允许沿用 macOS 特有语义作为最终实现。

### 5.4 构建命令

必须支持：

```powershell
cd tauri-app
npm install
npm run tauri dev
npm run tauri build
```

### 5.5 CI/CD

必须具备 Windows 构建工作流，至少覆盖：

- checkout
- setup-node
- rust-toolchain
- `npm install`
- `npm run tauri build`
- 上传 NSIS 安装包产物

## 阶段依赖与排期

### 阶段依赖

- Phase 1 完成后，再进入 Phase 2
- Phase 3.4 API 客户端依赖 Phase 3.1 子进程管理
- Phase 4 联调依赖 Phase 3 核心链路完成
- Phase 5 打包依赖 Phase 4 联调稳定

### 并行开发说明

Phase 3 中以下模块可以并行开发：

- 3.2 全局快捷键
- 3.3 音频录制
- 3.5 文本输出

因为这些模块不依赖彼此的写路径，也不阻塞同一轮接口语义收敛。

## Codex Worktree 并行开发方案

为避免再次出现“同一条主线里边做边修、互相覆盖、口径漂移”的问题，后续并行开发固定采用 **Codex + Git worktree** 模式。

### 目标

1. 将互不重叠的子任务拆到独立 worktree。
2. 每个 worktree 只负责一组明确文件。
3. 主工作区只做集成、验收、冲突解决和最终提交。

### 基本规则

1. 主分支固定为 `0325main`。
2. 主工作区只做：
   - spec 更新
   - 差异清单维护
   - 集成测试
   - 最终合并
3. 每个并行任务使用独立 branch + 独立 worktree。
4. 不允许两个 worktree 修改同一核心文件集合。

### 推荐拆分

#### Worktree A: Phase 3.2 全局快捷键

- 分支建议：`wt/phase3-hotkey`
- 负责文件：
  - `tauri-app/src-tauri/src/commands/hotkey.rs`
  - `tauri-app/src/hooks/useHotkey.ts`
  - 相关事件桥接文件

#### Worktree B: Phase 3.3 音频录制

- 分支建议：`wt/phase3-audio`
- 负责文件：
  - `tauri-app/src-tauri/src/commands/audio.rs`
  - 录音状态桥接文件
  - `RecordingOverlay.tsx` 的音量状态联动部分

#### Worktree C: Phase 3.5 文本输出

- 分支建议：`wt/phase3-text-input`
- 负责文件：
  - `tauri-app/src-tauri/src/commands/text_input.rs`
  - 输出模式设置相关前端文件

#### Worktree D: 模型管理与引擎页

- 分支建议：`wt/model-management`
- 负责文件：
  - `backend/server.py`
  - `backend/config.py`
  - `tauri-app/src/pages/EngineSettings.tsx`
  - `tauri-app/src/stores/modelStore.ts`
  - `tauri-app/src/api/backend.ts`

#### Worktree E: 文档与测试

- 分支建议：`wt/docs-and-tests`
- 负责文件：
  - `docs/*.md`
  - `scripts/*` 中的测试辅助脚本

### 集成流程

1. 主工作区先更新正式 spec。
2. 按 spec 生成修复清单。
3. 每个 worktree 只拿一组明确职责。
4. 各 worktree 在本地先完成最小可验证测试。
5. 回到主工作区逐个 cherry-pick 或 merge。
6. 主工作区统一跑：
   - 构建测试
   - 接口测试
   - 语义测试
   - 交互测试

### Worktree 命名建议

```powershell
git worktree add ..\\voicescribe-wt-hotkey wt/phase3-hotkey
git worktree add ..\\voicescribe-wt-audio wt/phase3-audio
git worktree add ..\\voicescribe-wt-text wt/phase3-text-input
git worktree add ..\\voicescribe-wt-models wt/model-management
git worktree add ..\\voicescribe-wt-docs wt/docs-and-tests
```

### 禁止事项

1. 不允许多个 worktree 同时改 `backend/server.py`。
2. 不允许多个 worktree 同时改 `EngineSettings.tsx`。
3. 不允许在子 worktree 直接重写正式 spec。
4. 不允许“先写代码再决定需求”。

## 风险与缓解

| 风险 | 影响 | 缓解方案 |
|---|---|---|
| `cpal` 在 Windows 录音延迟 | 录音质量 | 使用 WASAPI exclusive mode；如不行回退 Web Audio API |
| 低级键盘钩子被安全软件拦截 | 快捷键失效 | 提供 `tauri-plugin-global-shortcut` 降级方案（仅支持双击模式） |
| Python 子进程在 Windows 无 SIGTERM | 进程残留 | 使用 `TerminateProcess` + Job Object 确保子进程随主进程退出 |
| PyTorch/CUDA Windows 兼容性 | 部分引擎不可用 | 默认使用 `requirements-minimal.txt`（仅 faster-whisper）；FunASR 需额外安装 |
| 模拟 `Ctrl+V` 部分应用无响应 | 输出失败 | 提供可配置延迟（默认 200ms），并在输出失败时自动回退剪贴板模式 |
| 嵌入式 Python 体积增大 | 安装包过大 | `python-embed` 仅约 15MB；依赖按需安装，首次启动下载 |

## 测试与验收

### 构建级

必须覆盖：

- `python -m compileall backend`
- `npm run build`
- `cargo check`
- `npm run tauri:build`

### 接口级

必须覆盖：

- `/health`
- `/engines`
- `/models`
- `/speakers`
- `/load`
- `/transcribe`

### 语义级

必须明确验证：

1. 本地已有模型是否被识别
2. 未下载模型是否显示
3. 删除模型后是否回到未下载
4. 所有引擎是否遵循同一模型管理口径
5. 前端显示与后端状态是否一致

### 桌面交互级

必须明确验证：

1. 长按录音
2. 双击录音
3. `ESC` 取消
4. 托盘图标
5. 托盘最小化
6. 文本输出到剪贴板
7. 文本直接注入外部窗口

## 执行顺序

后续严格按以下顺序推进：

1. 先用本 spec 和改造计划生成差异清单
2. 按差异清单逐项修复代码
3. 每修一项就补一项测试
4. 更新 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\第一阶段测试.md)
5. 若过程中出现问题，更新 [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-session-bug-log.md)

如果某个问题无法一次修复成功，应记录：

- 问题表现
- 原因判断
- 已尝试修复
- 当前阻塞点
- 是否需要用户辅助

## 历史文档索引

### 旧版 spec

旧版 spec 已归档到：

- [2026-03-25-voicescribe-windows-spec-v1-archived.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-voicescribe-windows-spec-v1-archived.md)

旧版 spec 的主要问题摘要：

1. 没有完全按改造计划组织。
2. 混入了过多“当前实现状态”，而不是“必须达到的要求”。
3. 没有把“为什么之前没一次成功”与“如何避免重复偏差”明确隔离。

### 偏差分析

Phase 1 与改造计划的对照分析见：

- [2026-03-25-phase1-plan-comparison.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-phase1-plan-comparison.md)
- [2026-03-26-plan-spec-consistency-check.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-26-plan-spec-consistency-check.md)

摘要：

1. Phase 1 主干大体已落地。
2. 但执行顺序不严，计划项没有逐条变成验收项。
3. 模型目录和模型管理语义最初都没有一次收死。

### Session Bug Log

历史失败与偏差记录见：

- [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\2026-03-25-session-bug-log.md)

摘要：

1. 本地模型识别、未下载模型展示、托盘行为、托盘图标等问题，均是在实现过程中由用户指出后回补。
2. 这些问题后续都必须作为“不可再重复出现的偏差”处理。

