# VoiceScribe Windows 迁移正式 Spec

更新时间：2026-03-28

基线文档：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md)
- [0325项目初始.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\0325项目初始.md)
- 现有 macOS 实现目录 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)
- 界面专项计划 [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-27-ui-imitation-plan.md)
- 专题需求文档 [2026-03-28-rt-history-hotkey-requirements.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- 专题 Spec [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)

本文档是当前唯一正式 spec。如与当前代码、临时说明或旧版 spec 冲突，一律以 [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md) 与本文档为准。

## 1. Source of Truth

优先级从高到低如下：
1. [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md)
2. 本正式 spec
3. 原始 macOS 行为基线 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)
4. 当前实现代码
5. 旧版 spec 与历史说明文档

## 2. 全局硬约束

### 2.1 模型目录与状态

1. 所有模型必须下载到项目根目录 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)。
2. 所有模型状态只从项目根目录 `models/` 读取。
3. 模型注册表固定为 `models/voicescribe_models.json`。
4. 历史旧绝对路径必须 rebasing 到当前项目 `models/`。
5. 不允许存在第二套模型根目录语义。

### 2.2 统一模型管理语义

1. `/engines` 返回完整模型清单。
2. `/models` 返回模型状态。
3. 前端必须采用“完整模型清单 + 状态叠加”显示。
4. 未下载模型必须显示且保留下载入口。
5. 已下载模型必须保留删除入口。
6. 所有引擎必须遵循同一模型管理语义，不能只对 FunASR 特判。

### 2.3 行为对齐

以下行为必须以 macOS 版为基线对齐：
1. 长按快捷键开始录音，释放结束录音。
2. 双击快捷键切换录音开始/停止。
3. 录音中按 `ESC` 取消。
4. 输出模式支持 `clipboard`、`directInput`、`both`。
5. 主窗口关闭时进入托盘，而不是直接退出。

## 3. Phase 1: 后端跨平台适配

必须完成：
1. 路径集中管理到 `backend/config.py`。
2. `server.py`、`whispercpp_engine.py`、`speaker.py`、`ai_refiner.py` 全部去除 macOS 硬编码路径。
3. `/models`、`/models/download`、`/models/delete` 统一遵循项目根 `models/` 目录。
4. 本地已有模型但注册表缺失时，必须能自愈识别并重建注册表。
5. 旧路径命中 `models/` 子路径时，必须自动 rebasing。

## 4. Phase 2: Tauri 工程骨架

必须完成：
1. `tauri-app/` 作为新前端根目录。
2. Rust commands 至少拆分为 `backend.rs`、`audio.rs`、`hotkey.rs`、`text_input.rs`。
3. `tauri.conf.json` 明确声明前端构建目录、资源目录和窗口配置。
4. TypeScript 类型、默认值和存储结构与原 Swift `AppState` 对齐。
5. `store`、`clipboard-manager`、`global-shortcut` 等基础插件接入并可构建。

## 5. Phase 3: 核心功能迁移

### 5.1 后端子进程与 embedded Python

1. 桌面端负责启动/停止后端子进程。
2. 首次运行需准备 Python 运行时与最小依赖。
3. 安装态必须支持 embedded Python 或等价方案。

### 5.2 全局热键

1. 完整支持长按、双击、取消。
2. 350ms 双击阈值保持一致。
3. 快捷键事件需完整桥接到前端录音流。

### 5.3 音频录制

1. 固定为 16kHz、单声道、16-bit PCM WAV。
2. 支持临时文件录制。
3. 支持实时音量反馈与取消删除录音文件。

### 5.4 文本输出

1. 支持剪贴板、直接输入、两者都执行。
2. 支持前台窗口恢复。
3. 支持失败时回退到剪贴板模式。

### 5.5 实时转录、历史记录与快捷键录制专题

该专题的正式需求与实现约束由以下两份文档单独管理：
- [2026-03-28-rt-history-hotkey-requirements.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)

主线要求同步补充如下：
1. 当前主窗口侧边栏允许扩展为 7 个页面：通用、引擎、实时转录、历史记录、热词、说话人、快捷键。
2. 通用页允许增加 `启用流式传输`、`AI 摘要总结`、`保留音频` 三个全局开关。
3. `启用流式传输` 开启后，历史记录需要自动记录流式和非流式结果。
4. `AI 摘要总结` 只有在 `启用流式传输` 开启时才可开启，并且只作用于流式结果。
5. 快捷键页必须从手工输入 keycode 迁移到真实按键录制能力，支持单键、组合键，并区分左右 `Alt`。

## 6. Phase 4: UI 实现

### 6.1 主窗口布局

Windows 版设置窗口必须采用“侧边栏 + 原生设置页”结构，并遵守以下硬约束：
1. 必须采用左侧导航 + 右侧内容区，不允许顶部 tab 条替代。
2. 必须采用单层主表面，不允许再出现 `outer shell + inner panel` 双层结构。
3. 如果视觉上存在统一背景表面，页面内容必须直接落在该主表面上，不允许再额外套一层内容壳。
4. 左侧侧边栏宽度基本稳定，右侧内容区随窗口放大自然扩展。
5. 不允许继续使用“中间固定内容壳居中，放大后四周露出底板”的网页式布局。
6. 窗口高度不能死锁为单一固定值，应采用有上下限约束的自适应窗口策略。
7. 默认窗口下优先保证各页主要信息尽量单屏可见；允许滚动，但应优先局部滚动而非整页滚动。
8. 视觉优先级固定为：信息可见性 > 单屏可读性 > 装饰性卡片感。

### 6.2 通用页面

通用页面必须尽量复刻原生 `app` 的 `Form + Section` 组织方式：
1. 单列优先，不使用双列 dashboard 信息板。
2. 分组顺序固定为：语言、输出方式、其他、关于。
3. 每个设置项优先采用“左侧标题/说明，右侧控件”的行式布局。
4. 关于分组中的版本和后端状态必须轻量呈现，不做独立大卡片。
5. 默认窗口下，通用页主要信息应尽量无需整页上下滚动即可读完。

### 6.3 其他页面

1. 引擎页：顶部保留引擎与模型选择，长列表采用局部滚动。
2. 实时转录页：按说话人时间线展示流式结果，每条只显示说话人名、文本、时间戳；AI 摘要显示在页面中。
3. 历史记录页：按整次任务展示历史记录，支持复制文本、下载文本、下载音频、删除单条、清空全部。
2. 词汇页：输入区与热词列表紧凑排列，列表局部滚动。
3. 说话人页：已注册列表与录制/注册区分层，列表局部滚动。
4. 快捷键页：当前快捷键、修饰键、主键与使用说明尽量单屏呈现。

### 6.4 视觉风格

1. 保留圆角米色原生感。
2. 降低阴影、渐变和网页背景氛围。
3. 分组之间以轻边框、轻背景或分隔线区分，不做厚卡片堆叠。
4. 按钮、输入框、开关、文字层级必须统一。

## 7. Phase 5: 构建与打包

1. 安装包包含 Tauri 可执行文件、后端代码和运行时初始化逻辑。
2. 安装包不包含预置模型。
3. 首次启动必须能完成运行时初始化。
4. Windows 自动启动使用系统级实现，不沿用 macOS 语义。
5. GitHub Actions 必须提供 Windows 构建工作流。

## 8. 测试与验收

### 8.1 自动化与代码层验证

至少覆盖：
- `python -m compileall backend`
- `npm run build`
- `cargo check`
- `npm run tauri:build`
- `/health`
- `/engines`
- `/models`
- 真实下载/删除主链路

### 8.2 人工验收

至少覆盖：
- 全局热键真实行为
- 麦克风录音与转录
- 实时转录页的说话人时间线展示
- 历史记录页的复制、下载、删除、清空行为
- 流式结果与非流式结果进入历史记录的自动记录行为
- AI 摘要在实时转录页和历史记录详情中的显示
- 外部应用文本输出
- 托盘与托盘图标
- Windows 开机自启
- 安装态 embedded Python 冷启动
- 主窗口与各设置页的界面一致性
- 窗口从初始尺寸到放大尺寸的比例稳定性

### 8.3 测试文档规则

没有写进 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md) 的，一律视为没测。

## 9. 历史文档索引

- 旧版 spec： [2026-03-25-voicescribe-windows-spec-v1-archived.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\2026-03-25-voicescribe-windows-spec-v1-archived.md)
- Session Bug Log： [2026-03-25-session-bug-log.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-session-bug-log.md)
- Phase 1 对照： [2026-03-25-phase1-plan-comparison.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\2026-03-25-phase1-plan-comparison.md)
- Plan/Spec 一致性核对： [2026-03-26-plan-spec-consistency-check.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\2026-03-26-plan-spec-consistency-check.md)
- 实时转录专题需求： [2026-03-28-rt-history-hotkey-requirements.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- 实时转录专题 Spec： [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)
