# Feature Request: Engine Model Matrix

更新时间：2026-04-01

## 1. 背景

当前 VoiceScribe 的引擎页主要还是围绕“ASR 引擎 + ASR 模型”工作，模型管理、加载和转录请求的核心语义也都是围绕单一 `engine / model` 构建的。

但本轮需求已经从“新增一个 ASR 模型”扩大为“把 ASR、说话人分离、说话人映射/识别一起纳入正式产品能力”：

- 新增独立引擎 `Qwen3-ASR`
- 保留 `FunASR / Whisper / WhisperCpp / Parakeet`
- 引擎页新增说话人分离模型与说话人映射模型的选择、下载、删除、状态管理
- 转录链路不再只根据 `enableDiarization` 做隐式判断，而是执行用户显式选择的模型组合

这意味着本次改动本质上是一次“模型矩阵系统”改造，而不是局部加几个按钮。

## 2. 当前问题

### 2.1 产品层问题

1. 当前用户只能稳定感知 ASR 模型，无法在产品层面清楚选择说话人分离模型与说话人映射模型。
2. 默认组合、兼容关系、模型状态、错误状态都没有形成统一产品规则。
3. 旧引擎与新引擎之间的能力边界不清晰，容易出现“某些引擎只有 ASR，某些引擎又有额外能力”的隐式差异。

### 2.2 实现层问题

1. 现有状态结构主要围绕 `selectedEngine / selectedModel`，不适合表达一套完整组合。
2. `/load` 只加载 ASR，`/transcribe` 只显式传 `engine / model`。
3. 说话人分离与映射链路当前更多依赖环境变量、默认逻辑或单套运行时对象，缺少正式矩阵。
4. 需要 token 的模型下载当前没有正式产品入口，也没有与 UI 连通的凭据输入链路。

### 2.3 用户体验问题

1. 用户无法明确知道当前到底用了哪套说话人链路。
2. 切换引擎后没有正式的“默认组合 + 可手动修改 + 按引擎记忆”机制。
3. 失效模型、未下载模型、已删除模型、需要 token 的模型缺少统一的引导体验。
4. 当前历史记录与结果对象只稳定保存 `engine / model`，无法完整回看一次转录实际用了哪套分离 / 映射组合。

## 3. 本次目标

### 3.1 建立正式模型矩阵

把以下三类资源正式纳入产品系统：

1. `ASR 模型`
2. `说话人分离模型`
3. `说话人映射 / 识别模型`

### 3.2 建立统一引擎页

把引擎页重构为三个固定区域：

1. `ASR 模型`
2. `说话人分离模型`
3. `说话人映射模型`

并让这三类模型都进入统一的：

- 选择
- 下载
- 删除
- 状态展示
- 预加载

### 3.3 建立显式组合执行链路

把当前“单一 `engine / model` + `enableDiarization`”的链路升级为：

- `asr_engine`
- `asr_model`
- `diarization_model`
- `speaker_mapping_model`

由前端显式传给后端执行。

### 3.4 建立默认组合与记忆机制

1. 切换引擎时自动填入该引擎的默认组合
2. 用户可以手动修改
3. 每个引擎记住自己的上次组合
4. 组合失效时保留原值并标红，不静默回退

### 3.5 建立正式凭据下载体验

对需要 token 的模型：

1. 提供正式 token 输入窗口
2. token 按模型记住
3. token 存 Windows Credential Manager
4. 下载主路径继续统一到本地 `models/`

## 4. 用户价值

### 4.1 对普通使用者

1. 可以直接看到当前支持哪些 ASR、分离、映射模型
2. 可以不理解底层实现，也能直接使用默认可用组合
3. 需要更高可控性时，也可以自己切换组合

### 4.2 对高阶使用者

1. 可以针对不同引擎选不同说话人方案
2. 可以保留自己习惯的组合，不会因为切换引擎或升级版本被偷偷改掉
3. 可以清楚知道当前到底是哪套模型在工作

### 4.3 对后续维护

1. 引擎能力边界会更清楚
2. 新增模型时不再只能继续打补丁
3. 测试、日志、验收的口径会明显稳定下来

## 5. 本次范围

### 5.1 ASR 引擎 / 模型

本轮范围包括：

- `FunASR`
  - 继续保留当前已有 ASR 模型体系
- `Qwen3-ASR`
  - 新增独立引擎
  - 当前先支持 `Qwen3-ASR-1.7B`
- `Whisper`
- `WhisperCpp`
- `Parakeet`

其中：

- `Whisper / WhisperCpp / Parakeet` 不下线
- 这三个旧引擎也进入完整模型矩阵，而不再停留在“只有 ASR”的旧口径

### 5.2 说话人分离模型

本轮正式可选项包括：

- `FunASR 内置分离`
- `CampPlus Diarization`
- `SOND Diarization`
- `3D-Speaker`
- `pyannote 3.1`

其中：

- `CampPlus Diarization` 对应本地已存在的 `speech_campplus_speaker-diarization_common`
- `SOND Diarization` 对应本地已存在的 `speech_diarization_sond-zh-cn-alimeeting-16k-n16k4-pytorch`

### 5.3 说话人映射 / 识别模型

本轮正式可选项包括：

- `CAM++`
- `ERes2NetV2`

### 5.4 默认组合

本轮默认组合规则：

- `FunASR` → `FunASR 内置分离 + CAM++`
- `Qwen3-ASR` → `3D-Speaker + CAM++`
- `Whisper / WhisperCpp / Parakeet` → `3D-Speaker + CAM++`

### 5.5 UI 与交互

本轮包括：

- 引擎页三块固定区域
- 按引擎联动
- 按引擎记住组合
- 失效标红
- token 输入窗口

### 5.6 下载与凭据

本轮包括：

- 三类模型统一下载 / 删除 / 状态管理
- 下载主路径统一到 `models/`
- 需要 token 的模型下载支持 token 输入与保存

### 5.7 迁移范围

本轮包括旧设置迁移：

- 原 `selectedEngine / selectedModel` 保留
- 未下载状态保留
- 迁移时补入分离模型、映射模型与按引擎记忆结构

## 6. 本次不做

本轮明确不做：

1. 不做全局 provider token 设置中心
2. 不做“失败时自动回退到另一套说话人链路”的隐式智能切换
3. 不把 token 写进 `.env` 或普通设置文件
4. 不把 `Parakeet` 本轮直接要求做到与其他引擎完全同等级的说话人文本对齐效果
5. 不在本轮把所有底层模型实现抽象成完全通用的插件系统

## 7. 成功标准

从产品视角，本轮成功标准是：

1. 用户能在引擎页看到完整三类模型，而不只是 ASR 模型
2. 用户切换引擎时，系统能自动带出该引擎默认组合
3. 用户可以修改组合，并且每个引擎都能记住自己的上次选择
4. 模型未下载、已删除、不可用时，页面会明确提示，而不是偷偷改默认值
5. 需要 token 的模型可以通过正式弹窗输入 token 后下载
6. 转录时系统按当前显式选择的组合执行，而不是走隐式默认路径
7. 旧引擎、新引擎都进入统一模型矩阵
8. 一次转录完成后，结果记录与历史记录能够保留实际执行的模型组合，而不只保留 `engine / model`

## 8. 相关文档

- [协作约定.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\协作约定.md)
- [2026-03-31-phase-status.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\2026-03-31-phase-status.md)
- [SPEC.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\SPEC.md)
- [DESIGN.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\DESIGN.md)
- [TASKS.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\TASKS.md)
- [TEST_CASES.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\TEST_CASES.md)
