# 2026-03-26 实现差距修复清单

更新时间：2026-03-29

上游基线：
- [0325第一阶段改造计划.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\0325第一阶段改造计划.md)
- [2026-03-25-voicescribe-windows-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-25-voicescribe-windows-spec.md)
- [2026-03-27-ui-imitation-plan.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-27-ui-imitation-plan.md)
- [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)

本文档不是新的技术方案，只负责记录当前代码与 `plan/spec` 的剩余差距。

## 状态定义
- `已完成`
- `代码已完成，待人工验收`
- `代码已完成，待远端验收`
- `部分完成`
- `未完成`

## 当前总结

已基本收口：
- 后端路径适配
- 模型目录统一到项目根 `models/`
- 所有引擎统一模型管理语义
- Tauri 基础工程与构建链
- 本地启动链与依赖安装脚本

当前主要剩余问题：
- 热键、录音、文本输出仍需人工桌面验收
- 安装态 embedded Python 冷启动仍需最终验收
  - 该项属于最后阶段的封装/打包验收，不作为当前前序功能调试阻塞项
- GitHub Actions 仍需远端验证
- Windows 开机自启仍需系统侧确认
- 实时转录、历史记录与快捷键录制专题代码已落地，仍需人工专题验收

## Phase 1
- `P1-01` 路径管理统一：`已完成`
- `P1-02` 注册表 rebasing 与自愈：`已完成`

## Phase 2
- `P2-01` Tauri 工程骨架与插件：`已完成`
- `P2-02` TypeScript 类型与默认值：`已完成`

## Phase 3
- `P3-01` 后端子进程与 embedded Python 初始化：`部分完成`
  - 已完成安装态模拟下的运行时目录创建、`backend/` 资源同步、`backend/venv` 创建与 `/health` 启动验证。
  - 当前最小闭环已足够支撑前序功能开发、联调与验收；剩余缺口只在最终封装阶段对真实 embedded payload 的安装态冷启动验证。
  - 现阶段保留 `部分完成` 的原因，不是前序功能不可继续，而是尚未进入“真实安装包 + 真实 python-embed 资源”这条最终交付链路。
- `P3-02` 全局热键完整行为：`代码已完成，待人工验收`
- `P3-03` 音频录制链路：`代码已完成，待人工验收`
- `P3-04` 文本输出能力：`代码已完成，待人工验收`

## Phase 4
- `P4-01` 主窗口结构与原生 app 对齐：`已完成`
  - 已完成窗口从初始尺寸到放大后的比例稳定性收口。
  - 已完成各页面视觉密度统一与滚动策略收口。
  - 已按人工验收结果确认当前界面方向可接受，不再作为剩余问题继续阻塞。
- `P4-02` 引擎页统一模型语义：`已完成`
- `P4-03` 托盘能力与图标：`代码已完成，待人工验收`
- `P4-04` 实时转录与历史记录专题：`代码已完成，待人工验收`
  - 该专题已拆分到 [2026-03-28-rt-history-hotkey-spec.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-28-rt-history-hotkey-spec.md)
  - 代码层已完成侧边栏新增页面、流式时间线、历史记录存储与下载能力。
  - 本轮自动化验证见 [2026-03-29-rt-history-hotkey-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-rt-history-hotkey\2026-03-29-rt-history-hotkey-test-report.md)。

## Feature Topic
- `F1-01` 实时转录页：`代码已完成，待人工验收`
  - 已基于 `/stream` 打通说话人时间线展示与 AI 摘要展示区域。
- `F1-02` 历史记录页：`代码已完成，待人工验收`
  - 已支持流式与非流式结果自动入库、复制、下载、删除与清空。
- `F1-03` 通用页流式传输/AI 摘要/保留音频开关：`代码已完成，待人工验收`
  - 已建立字段、默认值与约束关系，`AI 摘要总结` 受 `启用流式传输` 开关约束。
- `F1-04` 快捷键真实录制：`代码已完成，待人工验收`
  - 已替代旧数字 keycode 录入，支持单键、组合键与左右 `Alt` 区分。

## Phase 5
- `P5-01` embedded Python 资源与安装态闭环：`部分完成`
  - 已验证“无内置 embedded payload 时，安装态模拟可退回系统 Python 完成初始化并启动最小后端”。
  - 尚未验证“资源目录携带真实 `python-embed/python.exe` 或 `python-embed.zip` 时”的最终安装态闭环，因此继续保留为 `部分完成`。
  - 该项已明确后移到最后阶段，与 NSIS 封装、真实安装包冷启动、最终交付链路一起收口；在此之前不作为当前前序功能调试阻塞项。
- `P5-02` GitHub Actions CI/CD：`代码已完成，待远端验收`
- `P5-03` Windows 自动启动：`代码已完成，待人工验收`

## 当前结论

不能说 spec 已全部完成。当前更准确的状态是：
- 核心代码主链大部分已落地；
- 剩余工作主要分为两类：前序功能的人工作业验收，以及最后阶段的封装/打包交付链路验证。

## 2026-03-29 补充约束：模型与缓存目录

- 新增硬约束：模型本体、ModelScope/HuggingFace/Transformers/Torch 缓存、`jieba.cache` 等运行时缓存，必须统一落到仓库根 `models/` 下。
- 当前收口要求：不仅要保证“新下载写入 `models/`”，还要保证“运行时读取和生成缓存也不再落到 C 盘默认目录”。
- 当前待验项：清点并迁移历史 `C:\Users\DingK\.cache\modelscope`、`C:\Users\DingK\.cache\huggingface` 与 `%LOCALAPPDATA%\Temp\jieba.cache`，确认迁移后可继续被当前后端链路复用，再清理 C 盘残留。

## 2026-03-29 本轮修复范围补充
- P3-03 音频录制链路：补修为“设备原生输入配置采集 + 本地重采样/混音到 16k 单声道 wav”，解决当前麦克风不支持固定请求流配置时无法启动录音的问题。
- P4-02 / P4-04 相关后端加载语义：补修 ASR 模型、说话人分离模型、说话人识别模型的显式加载与日志确认，避免出现“依赖包可用但模型未实际加载或未被实际使用”的假闭环。
- 本轮完成前，不再把“热键没反应”视为主要阻塞；当前主阻塞是录音设备兼容性，以及说话人分离 / 识别链路的加载职责不够显式。
## 2026-03-29 Torch 运行时补充

- P4-02 / P4-04 除了接口级加载职责拆分，还需补充 Windows 下 	orch / FunASR 真实运行时探测，避免 /health 误报“可用”。
- 当前新增阻塞不是业务状态机，而是 	orch 在本机 Python 环境中出现 WinError 1114，导致 FunASR、说话人分离、说话人识别都无法进入真实加载阶段。
- 本轮验收需要同时给出：运行时探测结果、模型实际加载结果、失败日志，以及修复后的真实接口测试结果。

## 2026-03-29 外部分离实现补充

- P4-04 当前已确认主路径为 FunASR + spk_model，但 SpeakerDiarizer 的外部分离实现需要从 AutoModel 切换到 modelscope segmentation-clustering pipeline。
- 当前 Windows 额外约束已确认：外部分离 pipeline 若输入不是 16kHz，会因为 	orchaudio sox 在 Windows 不受支持而失败，因此需要本地预处理后再送入 pipeline。
- 本轮验收标准增加：验证外部分离 pipeline 可初始化、可对 16kHz 测试音频输出 diarization 片段。

## 2026-03-29 Whisper Windows 回退补充

- P4-02 转录模型链路新增 Windows 子问题：`faster-whisper / ctranslate2` 在本机对 `WhisperModel(...)` 初始化会发生 native 崩溃，不能继续把 Whisper 标记为“稳定可验收”。
- 本轮若继续收口 Whisper，需要优先验证 `openai-whisper` 是否可作为 Windows 下的稳定实现回退；若可行，再把默认实现调整为“优先 faster-whisper，失败时回退 openai-whisper”。
- 在该回退链路未写入 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md) 前，Whisper 仍视为未完成验收。

## 2026-03-29 Whisper Windows 回退结果

- P4-02 已补入 `openai-whisper` 作为 Windows 默认稳定实现，`faster-whisper` 不再作为当前平台的验收阻塞项。
- 当前转录模型结论应表述为：FunASR 主链已验收通过；Whisper 已通过 Windows 回退链路验收通过；`faster-whisper / ctranslate2` 的原生崩溃保留在 bug log 中，后续单独收口。

## 2026-03-29 FunASR GPU 运行时补充

- P4-02 当前新增环境级阻塞：本机虽有 NVIDIA GPU，但 `backend/venv` 仍安装 `torch / torchaudio` 的 CPU 构建，导致 FunASR 无法进入 `cuda:0`。
- 该项的正确结论目前应是：设备选择代码已具备“CUDA 优先”逻辑，但 GPU 运行时尚未完成；在切换为 CUDA 版 PyTorch 并完成验收前，不能把 “FunASR GPU 已完成” 视为已交付。

## 2026-03-29 FunASR GPU 运行时结果

- P4-02 的 GPU 运行时阻塞已解除：`backend/venv` 现已切换为 CUDA 版 `torch 2.5.1+cu124 / torchaudio 2.5.1+cu124`。
- 当前结论应更新为：FunASR 在本机已完成 GPU 运行时验收，日志可见 `Using device: cuda:0`，且真实转录请求已通过。

## 2026-03-29 录音悬浮窗专题补充

- P4-02 录音悬浮窗当前新增专题级问题：首次不稳定显示、显示后无法稳定通过快捷键或按钮关闭、实时音量反馈不可信、视觉形态偏离目标。
- 该项不再视为“单纯样式优化”，而是“overlay 事件桥接 + 录音流状态收口 + 真实音量反馈 + 视觉重构”的组合工作。
- 在该专题测试结果写入 [2026-03-29-overlay-recording-test-report.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-overlay-recording\2026-03-29-overlay-recording-test-report.md) 和 [第一阶段测试.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\第一阶段测试.md) 前，不得视为已验收。
