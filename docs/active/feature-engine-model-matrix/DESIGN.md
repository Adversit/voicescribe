# Design: Engine Model Matrix Implementation

更新时间：2026-04-01

## 1. 设计目标

本次设计目标不是在现有引擎页上继续叠加零散按钮，而是把当前“ASR 模型单平面管理”收口为一套正式的三段组合系统：

1. `ASR 引擎 / ASR 模型`
2. `说话人分离模型`
3. `说话人映射模型`

并同时满足：

- 按引擎联动
- 默认组合可自动填充
- 用户可手动改
- 每个引擎记住自己的上次组合
- 组合失效时保留并标红
- 下载路径统一在 `models/`
- 需要 token 的下载走 Windows Credential Manager

## 2. 总体方案

### 2.1 架构方向

本次采用“后端目录定义 + 前端渲染组合 + 显式请求契约”的方案。

职责拆分如下：

- 后端
  - 维护引擎目录、模型分类、兼容矩阵、默认组合、下载状态、实际加载状态
- 前端
  - 渲染三块模型区域
  - 保存用户按引擎记住的组合
  - 发起下载、删除、加载、转录请求
- Tauri / Rust
  - 负责 Windows Credential Manager
  - 桥接桌面端转录调用与后端显式请求字段

进一步约束如下：

1. “哪个引擎能选哪些分离模型 / 映射模型”这一类产品规则，单一真相在后端。
2. 前端只根据后端返回的目录与兼容矩阵做联动展示、默认值填充、禁用与提示。
3. Tauri 不承载产品兼容规则，不在 Rust 层维护第二套“可选 / 不可选”判断。

### 2.2 为什么不能继续在现有逻辑上打补丁

当前系统的主问题不是少几个模型选项，而是数据模型和接口语义不够：

1. `ModelStatus` 只有 `engine + model`，无法区分 ASR / 分离 / 映射
2. `AppSettings` 只有 `selectedEngine + selectedModel + enableDiarization`，无法表达按引擎记住的组合
3. `/load` 只加载 ASR
4. `transcribeAudio -> backend.rs -> server.py` 只传 `engine / model`
5. `speaker.py` 当前是单套运行时对象，不是用户可选矩阵

所以这次必须先收口模型和接口结构，再落 UI。

## 3. 前端设计

### 3.1 页面结构

引擎页保持单页，但重构为 3 个固定区域：

1. `ASR 模型`
2. `说话人分离模型`
3. `说话人映射模型`

每个区域都包含：

- 当前选项选择器
- 模型列表
- 已下载 / 下载中 / 未下载 / 错误状态
- 下载 / 删除动作
- 当前所选模型的手动预加载入口

### 3.2 前端状态结构

现有 [index.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/types/index.ts) 和 [appStore.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/stores/appStore.ts) 需要从“单引擎 + 单模型”升级为“按引擎保存组合”。

建议新增结构：

```ts
type ModelCategory = "asr" | "diarization" | "speaker_mapping";

type EngineSelection = {
  asrModel: string;
  diarizationModel: string;
  speakerMappingModel: string;
};

type EngineSelections = Record<string, EngineSelection>;
```

设置层需要同时保留：

- 当前激活引擎 `selectedEngine`
- 各引擎的组合 `engineSelections`

当前引擎的 `selectedModel` 语义应迁入 `engineSelections[selectedEngine].asrModel`，避免继续保留第二套真相。

现有 [recordingFlow.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/lib/recordingFlow.ts) 仍直接读取：

- `settings.selectedEngine`
- `settings.selectedModel`
- `settings.enableDiarization`

并直接调用旧的 `transcribeAudio(...)` 契约。  
因此这次前端改动不能只停留在设置页与 store，还必须同步改主转录链与结果落库链路。

### 3.3 兼容矩阵驱动

前端不再从静态常量硬编码兼容关系。

前端应根据后端返回的目录数据，决定：

- 当前引擎可选的 ASR 模型
- 当前引擎可选的说话人分离模型
- 当前引擎可选的说话人映射模型
- 默认组合

前端只做 UI 联动和状态提示，不做第二套业务判断。

具体来说：

1. 当用户切换引擎时，前端根据后端返回的兼容矩阵，只展示或启用当前引擎可用的说话人分离模型与说话人映射模型。
2. “可用 / 不可用”的业务判断不写在 Tauri。
3. Tauri 只提供桌面原生能力，例如 Credential Manager，不负责引擎兼容规则。

### 3.4 迁移逻辑

旧设置迁移逻辑落在 [appStore.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/stores/appStore.ts)。

迁移规则：

1. 保留旧 `selectedEngine`
2. 保留旧 `selectedModel`
3. 根据该引擎默认组合补入：
   - `diarizationModel`
   - `speakerMappingModel`
4. 为未曾保存过的其他引擎写入默认组合
5. 如果旧模型在新目录中找不到，则保留原值并标红，不自动回退

### 3.5 token 弹窗设计

前端新增一个受控弹窗组件，用于：

- 展示当前目标模型名称
- 输入 token
- 提交 token
- 显示 token 错误

弹窗不负责长期存储逻辑，只调用 Tauri 命令完成写入和读取。

### 3.6 转录结果与历史记录结构

现有 [index.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/types/index.ts) 中：

- `TranscribeResult`
- `Transcription`
- `HistoryRecord`

都主要围绕 `engine / model` 组织。  
现有 [recordingFlow.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/lib/recordingFlow.ts) 也只把 `engine / model` 写入历史记录。

这会导致一个真实问题：  
页面已经按新矩阵执行，但历史记录无法回看当时实际用了哪套说话人分离模型与说话人映射模型。

因此本轮需要同步扩展：

1. `TranscribeResult`
2. `Transcription`
3. `HistoryRecord`

至少补入：

- `diarization_model`
- `speaker_mapping_model`

兼容要求如下：

1. 新写入的历史记录使用新字段
2. 旧历史记录读取时允许字段缺失
3. UI 不因旧历史缺少新字段而崩溃

## 4. 后端接口设计

### 4.1 模型目录接口

当前的 `/engines` 与 `/models` 仍偏 ASR 中心视角。  
本次需要扩展后端目录接口，使其能同时表达：

- 引擎
- 模型分类
- 兼容矩阵
- 默认组合
- 当前加载状态

推荐方向：

1. `/engines`
   - 返回每个引擎的 ASR 模型、可选分离模型、可选映射模型、默认组合
2. `/models`
   - 返回所有分类模型的状态列表

这里的目的就是让后端成为兼容矩阵的唯一来源，避免前端和 Tauri 再各自维护一份规则。

### 4.2 下载 / 删除接口

现有 `/models/download` 与 `/models/delete` 只有 `engine + model` 语义。  
本次应扩展为显式分类下载：

- `category`
- `engine`
- `model`

否则同名模型或跨分类模型会出现歧义。

### 4.3 加载接口

现有 `/load` 只加载 ASR 模型。  
本次推荐把 `/load` 收口为“加载当前整套组合”，输入至少包括：

- `asr_engine`
- `asr_model`
- `diarization_model`
- `speaker_mapping_model`

这样手动预加载与首次使用自动加载能复用同一套后端语义。

### 4.4 转录接口

当前 `/transcribe` 只通过 `engine / model / enable_diarization` 推导说话人链路。  
本次必须改成显式输入：

- `asr_engine`
- `asr_model`
- `diarization_model`
- `speaker_mapping_model`
- `enable_diarization`

后端不再做隐式默认猜测。

## 5. 模型注册与状态设计

### 5.1 现状问题

当前 [server.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/server.py) 的目录主要围绕：

- `ENGINE_MODEL_CATALOG`
- `/models`
- 注册表文件

它只适合 ASR 模型。

### 5.2 新目录结构

建议引入统一目录定义，至少包含：

```python
{
  "engine": "funasr",
  "category": "diarization",
  "model": "campplus-diarization",
  "display_name": "CampPlus Diarization",
  "downloadable": True,
  "requires_token": False,
  "default_for_engine": False,
}
```

后端需能够把三类模型都映射到统一状态结构：

- `category`
- `engine_scope`
- `model`
- `display_name`
- `available`
- `downloadable`
- `downloading`
- `error`

### 5.3 本地已存在模型接入

两个本地已存在的离线分离模型不能继续只存在于目录中而不进入正式系统：

- `speech_campplus_speaker-diarization_common`
- `speech_diarization_sond-zh-cn-alimeeting-16k-n16k4-pytorch`

本次需要把它们映射成正式产品项：

- `campplus-diarization`
- `sond-diarization`

并纳入统一模型状态体系。

## 6. 下载链路设计

### 6.1 下载主路径

所有新分类模型下载主路径统一写入 [models](/D:/learn/AIGC/voicescribe/0324/voicescribe/models)。

### 6.2 分类下载

下载逻辑必须按分类分流：

- ASR 模型
- 说话人分离模型
- 说话人映射模型

不能继续共用仅适合 ASR 的下载路径拼装逻辑。

### 6.3 本地已存在模型的状态识别

对于 `CampPlus Diarization` 和 `SOND Diarization` 这类本地已存在模型：

1. 启动时应自动识别状态
2. 若本地目录存在，应显示已下载
3. 不应要求用户重新下载后才显示为可用

## 7. Token / Credential Manager 设计

### 7.1 新能力链路

当前桌面端没有 Credential Manager 命令链。  
本次要新增 Tauri 命令，用于：

- 查询当前模型是否已有 token
- 保存当前模型 token
- 删除或覆盖当前模型 token

注意：

1. 这些命令只处理凭据读写。
2. 不在 Tauri 层决定“某个引擎能不能选某个说话人分离模型”。
3. 兼容矩阵仍由后端提供，前端负责渲染。

### 7.2 存储粒度

存储粒度按模型，而不是全局 provider。

### 7.3 前端调用方式

前端点击下载时：

1. 先问后端 / Tauri：该模型是否需要 token
2. 如果需要且本地无 token，则弹窗输入
3. 保存成功后再执行下载

## 8. 加载链路设计

### 8.1 整套组合加载

手动预加载与首次自动加载都走“整套组合加载”。

后端需要拆出三个显式加载职责：

1. ASR 模型加载
2. 说话人分离模型加载
3. 说话人映射模型加载

### 8.2 FunASR 特例

`FunASR` 需要支持两类路径：

1. `funasr_builtin`
   - 走内置 speaker 相关能力
2. 外部分离模型
   - `campplus-diarization`
   - `sond-diarization`
   - `3d-speaker`
   - `pyannote-3.1`

这两类路径必须显式二选一，不能自动回退。

### 8.3 非 FunASR 引擎

`Whisper / WhisperCpp / Qwen3-ASR / Parakeet` 统一走外部说话人能力矩阵：

- `campplus-diarization`
- `sond-diarization`
- `3d-speaker`
- `pyannote-3.1`
- `campp`
- `eres2netv2`

## 9. 转录执行链路设计

### 9.1 正常路径

一次转录执行按以下顺序：

1. 读取当前引擎组合
2. 校验模型状态
3. 按需自动加载整套组合
4. 执行 ASR
5. 若 `enable_diarization=true`，执行当前选中的分离路径
6. 若存在映射模型与说话人库，则执行映射
7. 返回文本、分段、说话人信息与日志

### 9.2 Parakeet 受限路径

当前 [parakeet_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/parakeet_engine.py) 返回 `segments: []`。  
所以本轮设计要求：

1. `Parakeet` 仍进入完整矩阵
2. 但说话人文本对齐结果允许受限
3. 日志和测试必须明确表述其受限状态
4. 不把“进入矩阵”误报成“结果完全对齐”

### 9.3 输出与日志

日志至少记录：

- 当前引擎
- 当前 ASR 模型
- 当前分离模型
- 当前映射模型
- 是手动预加载还是自动加载
- 最终走了哪条执行路径

## 10. 日志与可观测性

本次建议新增或扩展以下日志点：

1. 模型目录生成日志
2. 模型状态识别日志
3. token 读取 / 保存日志
4. 整套组合预加载日志
5. 转录实际执行组合日志
6. `FunASR` 内置分离与外部分离的分支命中日志
7. `Parakeet` 受限路径日志

## 11. 数据迁移

### 11.1 前端设置迁移

迁移目标：

- 从 `selectedEngine + selectedModel`
- 升级到 `selectedEngine + engineSelections`

### 11.2 迁移结果要求

1. 原 `selectedEngine / selectedModel` 不丢
2. 未下载状态保留
3. 旧引擎也补入默认的分离模型和映射模型
4. 不静默改写失效项
5. 旧历史记录允许继续读取，即使其缺少 `diarization_model / speaker_mapping_model`

## 12. 风险与取舍

### 12.1 主要风险

1. 现有模型状态结构太扁平，改动面大
2. 现有 `/load` 与 `/transcribe` 契约都要同步变更
3. `FunASR` 内置分离并非所有模型都已实测
4. `Parakeet` 缺分段能力，导致说话人文本对齐受限
5. Credential Manager 属于新增 native 能力

### 12.2 关键取舍

1. 先让 `FunASR` 四个模型都开放内置分离入口，再靠实测回收不支持项
2. 先让 `Parakeet` 进入完整矩阵，但允许结果能力受限
3. 先把已有离线分离模型作为正式选项接入，而不是延后到后续专题

### 12.3 `server.py` 渐进式拆分策略

当前 [server.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/server.py) 已同时承担：

1. FastAPI 路由入口
2. 模型目录与模型状态计算
3. 模型 registry 与路径归一化
4. 下载与删除逻辑
5. 引擎加载与转录编排
6. 历史记录读写与导出
7. 说话人运行时的上层调度

这说明问题已经不只是“文件行数偏多”，而是入口层、服务层、存储层、下载层和转录编排层混在一个文件里。  
如果本次继续把引擎矩阵、默认组合、token 下载和整套组合加载全部直接堆进 `server.py`，后续维护成本会继续上升。

但本轮不建议先做一次“大重构后再做功能”。原因如下：

1. 本次功能本身已经跨前端、Tauri、后端与模型运行时
2. `/load`、`/transcribe`、模型状态和旧设置迁移都要同步变更
3. 如果先整体重排 `server.py`，很容易把“功能新增”和“结构迁移”混在一起，增加回归风险

因此本轮采用“入口保留、服务外提”的渐进式策略：

1. `server.py` 继续保留为 FastAPI 入口层
2. 优先把纯服务逻辑从 `server.py` 抽出
3. 路由签名和外部接口尽量保持稳定，再逐步迁移内部实现

建议优先抽出的模块如下：

1. `backend/services/model_catalog.py`
   - 负责引擎目录、模型分类、兼容矩阵、默认组合、模型状态组装
2. `backend/services/model_registry.py`
   - 负责 registry 读写、路径归一化、`models/` 目录状态识别
3. `backend/services/transcription_service.py`
   - 负责整套组合加载、引擎复用、转录执行编排
4. `backend/services/history_service.py`
   - 负责历史记录读写、排序、导出文本/音频

保留在原位置的内容：

1. `speaker.py`
   - 继续作为说话人分离 / 识别运行时核心
2. 各 `engines/*.py`
   - 继续作为具体 ASR 引擎实现
3. `server.py`
   - 只保留路由、请求解析、错误映射与服务调用编排

本轮拆分边界要求：

1. 不追求一次把所有 helper 全部迁走
2. 先迁移与“模型矩阵 / 下载 / 加载 / 转录”直接相关的逻辑
3. 历史记录、摘要、流式转录等次要区域，可以在本轮后半段或下一轮继续收口

完成后的目标状态不是“`server.py` 变成极小文件”，而是：

1. 新增业务规则不再优先写进 `server.py`
2. `server.py` 主要负责 API 入口与调用编排
3. 模型矩阵与转录链路有独立服务层可测试、可替换、可继续扩展

## 13. 文件级改动说明

### 13.1 前端文件

- [index.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/types/index.ts)
  - 扩展模型分类、组合结构、目录结构
- [appStore.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/stores/appStore.ts)
  - 增加按引擎记住组合与迁移逻辑
- [modelStore.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/stores/modelStore.ts)
  - 改为按分类管理状态与下载动作
- [EngineSettings.tsx](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/pages/EngineSettings.tsx)
  - 重构为三块固定区域并增加 token 弹窗
- [GeneralSettings.tsx](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/pages/GeneralSettings.tsx)
  - 调整 `enableDiarization` 文案，使其从“说话人识别”升级为更准确的说话人链路总开关口径
- [backend.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/api/backend.ts)
  - 扩展目录、下载、加载接口
- [tauri.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/api/tauri.ts)
  - 增加 Credential Manager 与新转录契约命令
- [recordingFlow.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/lib/recordingFlow.ts)
  - 改主转录调用、日志和历史记录写入结构，保留实际执行的完整模型组合

### 13.2 Tauri / Rust 文件

- [lib.rs](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src-tauri/src/lib.rs)
  - 注册新增凭据与下载命令
- [backend.rs](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src-tauri/src/commands/backend.rs)
  - 扩展整套组合转录调用

### 13.3 后端 Python 文件

- [server.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/server.py)
  - 改模型目录、下载、加载、转录正式契约
- [qwen3_asr_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/qwen3_asr_engine.py)
  - 新增 `Qwen3-ASR` 引擎实现与加载入口
- [funasr_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/funasr_engine.py)
  - 显式支持内置分离与外部分离并行矩阵
- [speaker.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/diarization/speaker.py)
  - 从单套运行时对象扩展成可选分离 / 映射矩阵
- [whisper_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/whisper_engine.py)
  - 对接外部分离 / 映射矩阵
- [whispercpp_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/whispercpp_engine.py)
  - 对接外部分离 / 映射矩阵
- [parakeet_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/parakeet_engine.py)
  - 进入矩阵并明确受限路径

### 13.4 文档文件

- [FEATURE_REQUEST.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\FEATURE_REQUEST.md)
- [SPEC.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\SPEC.md)
- [DESIGN.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\DESIGN.md)
- [TASKS.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\TASKS.md)
- [TEST_CASES.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\TEST_CASES.md)
