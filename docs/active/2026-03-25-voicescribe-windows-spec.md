# VoiceScribe Windows 迁移正式 Spec

更新时间：2026-03-29

基线文档：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md)
- [0325项目初始.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\archive\0325项目初始.md)
- 现有 macOS 实现目录 [app](D:\learn\AIGC\voicescribe\0324\voicescribe\app)
- 界面专项计划 [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-27-ui-imitation-plan.md)
- 专题需求文档 [2026-03-28-rt-history-hotkey-requirements.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-requirements.md)
- 专题 Spec [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)
- 专题测试报告 [2026-03-29-rt-history-hotkey-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-29-rt-history-hotkey-test-report.md)

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
4. 该能力属于最终封装/安装验收项；在 Phase 1-4 功能调试阶段，允许先使用系统 Python 回退链路完成开发态与安装态模拟联调，但不得据此宣称安装包闭环已最终验收。

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
6. 本专题的自动化测试结果必须额外写入专题测试报告，再回写主测试文档与主 checklist。

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

本章属于最后阶段任务，默认在 Phase 1-4 的功能调试、联调和人工验收收口后再推进；未进入该阶段前，封装与打包相关未完成项不视为当前前序功能调试阻塞项。

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
  说明：该项属于 Phase 5 最终封装阶段人工验收，不作为当前前序功能调试完成与否的判断条件。
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
- 实时转录专题测试报告： [2026-03-29-rt-history-hotkey-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-29-rt-history-hotkey-test-report.md)
- 录音悬浮窗专题需求： [2026-03-29-overlay-recording-requirements.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-overlay-recording\2026-03-29-overlay-recording-requirements.md)
- 录音悬浮窗专题 Spec： [2026-03-29-overlay-recording-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-overlay-recording\2026-03-29-overlay-recording-spec.md)
- 录音悬浮窗专题测试报告： [2026-03-29-overlay-recording-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-overlay-recording\2026-03-29-overlay-recording-test-report.md)

## 2026-03-29 录音悬浮窗专题补充

- 录音悬浮窗本轮不再按“单独 UI 卡片”处理，而是作为录音流状态机、事件桥接、实时音量反馈与浮层视觉的一体化专题收口。
- 悬浮窗中的波纹必须来自真实录音电平事件，不能继续使用与录音无关的模拟动画。
- 悬浮窗显示/隐藏、快捷键停止、点击取消/停止，都必须回到主录音流统一处理，不能由悬浮窗自身隐式维护状态。

## 2026-03-29 录音兼容与说话人模型加载补充
1. Windows 录音链路不得强制要求输入设备原生支持 16kHz + mono；允许按设备原生输入配置采集，再在本地统一转换为 16kHz / 16-bit / mono WAV 供后续转录链路使用。
2. 说话人相关能力必须拆分为三条显式加载链路：转录模型加载、说话人分离模型加载、说话人识别（声纹）模型加载，不能再依赖隐式副作用。
3. 当启用说话人分离时，必须能明确记录当前到底走了 FunASR 内置 speaker 标签，还是走外部 SpeakerDiarizer 的 diarization / speaker verification 链路。
4. 说话人注册、说话人识别、带说话人标签的转录，必须都能证明各自依赖的模型已实际加载并被使用，而不是仅在健康检查里显示依赖包可用。
## 2026-03-29 FunASR / Torch 运行时探测补充

- Windows 下不能只用 importlib.find_spec() 判断 FunASR / 说话人模型可用性；必须补充真实运行时探测，至少覆盖 	orch 导入、unasr.AutoModel 导入，以及对应异常日志。
- /health 与模型状态展示必须区分“包存在”和“运行时可加载”。出现 	orch DLL 初始化失败时，不能继续把 FunASR / speaker feature 标记为可用。
- 说话人识别、说话人分离、转录三条链路都要给出明确日志：模型名、加载入口、运行时探测结果、失败异常。
- 当前已定位的 Windows 真实风险是 	orch 导入阶段抛出 WinError 1114，需要在模型链路验收前先收口该运行时问题。

## 2026-03-29 外部分离模型路径补充

- SpeakerDiarizer 的外部分离模型不能继续用 unasr.AutoModel 直接加载 speaker-diarization 仓库 ID；当前可验证可用的路径是 modelscope 的 SegmentationClusteringPipeline。
- iic/speech_campplus_speaker-diarization_common 在本机已验证可初始化 pipeline，但 Windows 下必须先提供 16kHz / mono wav，否则会触发 	orchaudio sox extension is not supported on Windows。
- 因此外部分离链路在实现上需要：补齐 modelscope 运行时依赖、Windows 侧输入预重采样到 16k、把 pipeline 输出统一转换为 [{start,end,speaker}] 结构。
- 主转录链路仍优先使用 FunASR 内置 speaker 标签；外部分离链路作为补充能力和回退路径，需要能独立加载并可单独验证。

## 2026-03-29 Whisper Windows 运行时回退补充

- Windows 下不能把 `Whisper available=true` 直接视为“Whisper 稳定可用”；本轮已发现 `faster-whisper / ctranslate2` 在 `WhisperModel(...)` 初始化阶段可触发 native 崩溃。
- 因此 Windows 端允许对 Whisper 引擎增加实现级回退：优先尝试 `faster-whisper`，若运行时探测或真实加载失败，则切换到 `openai-whisper`，优先保证存在一条稳定的 Whisper 转录链路。
- 测试与汇报时必须区分 “FunASR 稳定链路” 与 “Whisper 稳定链路”；未写入 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md) 的，仍视为未验证。

## 2026-03-29 FunASR GPU 运行时补充

- FunASR 的设备选择策略保持为 `CUDA > MPS > CPU`，但这只是代码层优先级；最终是否能进入 GPU 取决于后端虚拟环境安装的 `torch / torchaudio` 是否为 CUDA 构建。
- 如果本机 `nvidia-smi` 正常、但 `torch.cuda.is_available()` 为 `False`，应优先判定为运行时构建错误，而不是业务代码错误。
- FunASR GPU 验收必须至少同时满足三点：`torch.cuda.is_available() == True`、加载日志显示 `[FunASR] Using device: cuda:0`、真实转录请求可在该设备链路下完成。
