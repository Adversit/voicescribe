# Spec: Engine / Diarization / Speaker-Mapping Matrix

更新时间：2026-04-01

## 1. 文档目标

本文档用于定义本次“引擎 / 说话人分离 / 说话人映射模型矩阵”功能的正式产品规则、跨层契约、旧逻辑删除范围与验收标准。

本次修改不是单点 UI 调整，而是一次跨前端、Tauri、后端、模型下载管理、运行时加载与转录执行链路的大改。

## 2. Source of Truth

本专题的优先级从高到低如下：

1. 本文档
2. [FEATURE_REQUEST.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\FEATURE_REQUEST.md)
3. 后续配套的 [DESIGN.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\DESIGN.md)
4. 当前代码实现
5. 已归档的一阶段文档

如果本文档与现有实现冲突，应先修正文档明确后的代码，而不是继续保留双逻辑。

## 3. 单一真相

### 3.1 模型目录与下载路径

1. 所有 ASR / 说话人分离 / 说话人映射模型的下载、删除、状态判定都必须统一落在仓库根 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)。
2. 不允许把本次新增模型的主下载路径切回用户目录默认缓存。
3. 历史缓存迁移、运行时副缓存与 provider 细节可在设计阶段细化，但不能改变“主模型资产统一落在 `models/`”这一硬约束。

### 3.2 模型目录、兼容矩阵与默认组合

1. 引擎、模型分类、兼容矩阵、默认组合的单一真相在后端目录定义中。
2. 前端不自行硬编码第二套兼容矩阵，不自行拼装默认组合。
3. 前端只持久化用户选择结果，并根据后端返回的目录信息渲染页面与校验状态。

### 3.3 用户选择状态

1. 用户当前选择的组合由前端设置持久化层保存。
2. 该持久化状态按 ASR 引擎分别记住。
3. 后端运行时只执行前端当前显式传入的组合，不再隐式猜测说话人分离模型或说话人映射模型。

### 3.4 运行时加载状态

1. 模型是否已实际加载，由后端运行时持有。
2. 前端只展示运行时返回的已加载状态与错误状态，不自行推断“应该已经加载”。

### 3.5 Token 状态

1. 需要凭据的模型下载 token 使用 Windows Credential Manager 保存。
2. token 按模型记住，而不是做全局统一 token。
3. 前端只负责触发输入窗口与发起下载，不把 token 作为普通设置项持久化到 JSON 或 `.env`。

## 4. 术语定义

### 4.1 ASR 引擎

负责语音转文字主链路的引擎。  
本轮支持：

- `funasr`
- `qwen3_asr`
- `whisper`
- `whispercpp`
- `parakeet`

### 4.2 ASR 模型

挂在某个 ASR 引擎下的可选转录模型。  
本轮范围：

- `funasr`
  - `paraformer-zh`
  - `paraformer-zh-streaming`
  - `seaco-paraformer`
  - `sensevoice-small`
- `qwen3_asr`
  - `qwen3-asr-1.7b`
- `whisper`
  - 沿用当前已存在的 Whisper 模型目录
- `whispercpp`
  - 沿用当前已存在的 whisper.cpp 模型目录
- `parakeet`
  - 沿用当前已存在的 Parakeet 模型目录

### 4.3 说话人分离模型

负责产出说话人时间段或分离结果的模型 / 能力。  
本轮范围：

- `funasr_builtin`
- `campplus-diarization`
- `sond-diarization`
- `3d-speaker`
- `pyannote-3.1`

其中：

- `funasr_builtin` 的显示名称为“FunASR 内置分离”
- `funasr_builtin` 只能在 `funasr` 引擎下使用
- `campplus-diarization` 的显示名称为 `CampPlus Diarization`
- `campplus-diarization` 对应当前本地已存在的离线模型 `speech_campplus_speaker-diarization_common`
- `sond-diarization` 的显示名称为 `SOND Diarization`
- `sond-diarization` 对应当前本地已存在的离线模型 `speech_diarization_sond-zh-cn-alimeeting-16k-n16k4-pytorch`

### 4.4 说话人映射 / 识别模型

负责把分离结果映射到已注册说话人身份的模型。  
本轮范围：

- `campp`
- `eres2netv2`

其中：

- `campp` 的显示名称为 `CAM++`
- `eres2netv2` 的显示名称为 `ERes2NetV2`

## 5. 支持范围

### 5.1 ASR 引擎 / 模型范围

1. `FunASR` 当前已存在的 ASR 模型体系保持不拆分、不重命名、不降级。
2. 本轮新增独立引擎 `Qwen3-ASR`。
3. `Qwen3-ASR` 当前先只支持一个模型：`Qwen3-ASR-1.7B`。
4. `Whisper`、`WhisperCpp`、`Parakeet` 继续保留在产品中，不因本次改造下线。
5. `Whisper`、`WhisperCpp`、`Parakeet` 也要进入完整 `ASR + 说话人分离 + 说话人映射` 体系。

### 5.2 说话人分离模型范围

本轮纳入引擎页下载 / 删除 / 状态管理体系的说话人分离模型包括：

- `FunASR 内置分离`
- `CampPlus Diarization`
- `SOND Diarization`
- `3D-Speaker`
- `pyannote 3.1`

其中：

1. `CampPlus Diarization` 与 `SOND Diarization` 已在本地 `models/` 中存在离线模型资产。
2. 本轮需要把它们作为正式可选项直接接入系统，而不是只做隐藏兼容项。

### 5.3 说话人映射模型范围

本轮纳入引擎页下载 / 删除 / 状态管理体系的说话人映射模型包括：

- `CAM++`
- `ERes2NetV2`

### 5.4 主开关范围

1. 现有 `enableDiarization` 继续作为“是否启用说话人相关链路”的总开关。
2. 当 `enableDiarization=false` 时：
   - 当前引擎下选中的分离模型与映射模型继续保留
   - 但本次转录请求不执行说话人分离与说话人映射链路
3. 当 `enableDiarization=true` 时：
   - 当前选中的分离模型与映射模型必须显式参与请求与运行时执行

## 6. 产品规则

### 6.1 引擎联动规则

1. 引擎页采用“按引擎分层联动”模式。
2. 用户先选择 ASR 引擎与 ASR 模型。
3. 然后只允许选择该引擎兼容的说话人分离模型与说话人映射模型。
4. 不兼容项必须禁用或隐藏，不能让用户保存不可执行组合。
5. `Whisper`、`WhisperCpp`、`Parakeet` 不再作为“仅 ASR 引擎”特殊处理，而是和 `Qwen3-ASR` 一样进入完整外部能力矩阵。

### 6.2 默认组合规则

1. 用户切换到某个引擎时，系统必须自动填入该引擎下的默认可用组合。
2. 用户可以直接使用默认组合，也可以在兼容范围内手动改。
3. 默认策略固定为“引擎原生优先”。

### 6.3 用户记忆规则

1. 每个引擎记住自己的上次组合。
2. 用户从 `FunASR` 切到 `Qwen3-ASR`，再切回 `FunASR` 时，应恢复 `FunASR` 上次保存的组合。
3. 如果该引擎还没有用户保存记录，才使用系统默认组合。

### 6.4 失效组合规则

1. 如果用户已记住的组合后来失效，系统不得静默切回默认值。
2. 失效后应保留原选择，并在引擎页明确标红提示。
3. 用户必须手动修复或重新选择。
4. “失效”至少包括：
   - 模型未下载
   - 模型已被删除
   - 当前运行环境无法加载
   - 当前引擎与该模型不兼容

## 7. 兼容矩阵

### 7.1 FunASR

`funasr` 兼容：

- ASR 模型
  - `paraformer-zh`
  - `paraformer-zh-streaming`
  - `seaco-paraformer`
  - `sensevoice-small`
- 说话人分离模型
  - `funasr_builtin`
  - `campplus-diarization`
  - `sond-diarization`
  - `3d-speaker`
  - `pyannote-3.1`
- 说话人映射模型
  - `campp`
  - `eres2netv2`

### 7.2 Qwen3-ASR

`qwen3_asr` 兼容：

- ASR 模型
  - `qwen3-asr-1.7b`
- 说话人分离模型
  - `campplus-diarization`
  - `sond-diarization`
  - `3d-speaker`
  - `pyannote-3.1`
- 说话人映射模型
  - `campp`
  - `eres2netv2`

### 7.3 Whisper

`whisper` 兼容：

- ASR 模型
  - 沿用当前已存在的 Whisper 模型目录
- 说话人分离模型
  - `campplus-diarization`
  - `sond-diarization`
  - `3d-speaker`
  - `pyannote-3.1`
- 说话人映射模型
  - `campp`
  - `eres2netv2`

### 7.4 WhisperCpp

`whispercpp` 兼容：

- ASR 模型
  - 沿用当前已存在的 whisper.cpp 模型目录
- 说话人分离模型
  - `campplus-diarization`
  - `sond-diarization`
  - `3d-speaker`
  - `pyannote-3.1`
- 说话人映射模型
  - `campp`
  - `eres2netv2`

### 7.5 Parakeet

`parakeet` 兼容：

- ASR 模型
  - 沿用当前已存在的 Parakeet 模型目录
- 说话人分离模型
  - `campplus-diarization`
  - `sond-diarization`
  - `3d-speaker`
  - `pyannote-3.1`
- 说话人映射模型
  - `campp`
  - `eres2netv2`

### 7.6 Parakeet 本轮受限规则

1. `Parakeet` 本轮进入完整模型矩阵。
2. 用户可以为 `Parakeet` 选择说话人分离模型和说话人映射模型。
3. 但当前 `Parakeet` 引擎输出分段能力受限，本轮允许其“进入矩阵”与“说话人结果能力完全对齐”之间存在差距。
4. 本轮不要求 `Parakeet` 必须达到与 `FunASR / Whisper / WhisperCpp / Qwen3-ASR` 完全同等级的说话人文本对齐效果。
5. 后续若需要稳定输出按说话人对齐的文本段，应再单独补齐 `Parakeet` 文本结果与外部分离结果的对齐链路。

### 7.7 FunASR 内置分离的当前开放规则

1. 当前阶段先把 `funasr` 的 4 个 ASR 模型都定义为允许选择 `funasr_builtin`。
2. 这是一条先行产品口径，不等于四个模型都已被真实验收通过。
3. 后续若人工测试确认某个 `funasr` ASR 模型不支持 `funasr_builtin`，则再回收该模型的兼容矩阵，不保留错误开放状态。

### 7.8 显式二选一规则

1. `FunASR` 下如果用户选择 `funasr_builtin`，运行时就严格走 FunASR 内置分离。
2. `FunASR` 下如果用户选择 `3d-speaker` 或 `pyannote-3.1`，运行时就严格走对应外部分离模型。
3. `FunASR` 下如果用户选择 `campplus-diarization` 或 `sond-diarization`，运行时就严格走对应离线外部分离模型。
4. 不允许“内置优先，失败时自动回退外部”的隐式逻辑。
5. 不允许“外部优先，失败时自动回退内置”的隐式逻辑。

## 8. 默认组合

### 8.1 FunASR 默认组合

`funasr` 默认组合固定为：

- ASR 模型：按当前已存在的默认 ASR 模型规则执行
- 说话人分离模型：`funasr_builtin`
- 说话人映射模型：`campp`

### 8.2 Qwen3-ASR 默认组合

`qwen3_asr` 默认组合固定为：

- ASR 模型：`qwen3-asr-1.7b`
- 说话人分离模型：`3d-speaker`
- 说话人映射模型：`campp`

### 8.3 Whisper 默认组合

`whisper` 默认组合固定为：

- ASR 模型：沿用当前已存在的默认 Whisper 模型规则
- 说话人分离模型：`3d-speaker`
- 说话人映射模型：`campp`

### 8.4 WhisperCpp 默认组合

`whispercpp` 默认组合固定为：

- ASR 模型：沿用当前已存在的默认 whisper.cpp 模型规则
- 说话人分离模型：`3d-speaker`
- 说话人映射模型：`campp`

### 8.5 Parakeet 默认组合

`parakeet` 默认组合固定为：

- ASR 模型：沿用当前已存在的默认 Parakeet 模型规则
- 说话人分离模型：`3d-speaker`
- 说话人映射模型：`campp`

## 9. UI 行为

### 9.1 引擎页结构

引擎页固定拆成三块区域：

1. `ASR 模型`
2. `说话人分离模型`
3. `说话人映射模型`

每块都纳入：

- 选择器
- 下载 / 删除
- 已下载 / 下载中 / 错误状态
- 手动预加载入口

### 9.2 引擎切换行为

1. 切换引擎后，页面必须先切到该引擎可兼容的模型范围。
2. 如果该引擎存在已记住组合，则恢复该组合。
3. 如果不存在已记住组合，则套用默认组合。
4. `Whisper`、`WhisperCpp`、`Parakeet` 切换时也必须遵守同一规则，不能继续走旧的单引擎平面逻辑。

### 9.3 标红提示行为

1. 组合失效时必须在页面显式标红。
2. 标红必须明确指出失效原因，而不是只显示通用错误。
3. 失效时不自动重写用户选择。

### 9.4 token 交互行为

1. 下载需要凭据的模型时，点击下载必须先弹出 token 输入窗口。
2. token 输入窗口与当前要下载的模型绑定。
3. token 输入成功并保存后，再继续发起下载。
4. 如果 token 无效，必须保留失败信息并允许用户重试输入。

## 10. 下载与删除规则

### 10.1 下载路径规则

1. 本轮新增模型的下载路径统一固定在 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)。
2. 不允许把本轮新增模型的主下载路径写到 `%USERPROFILE%` 默认缓存目录。

### 10.2 分类下载规则

1. `ASR 模型`、`说话人分离模型`、`说话人映射模型` 都进入统一下载 / 删除 / 状态管理体系。
2. 不能继续只把 ASR 模型纳入列表，而把分离 / 映射模型藏成隐式依赖。

### 10.3 删除规则

1. 删除模型后，状态必须及时反映为未下载或不可用。
2. 删除模型不能自动改写用户当前选择；若当前选择被删，应标红并提示用户修复。
3. 删除模型文件不等于删除已保存 token；token 是否保留由安全存储规则单独管理。

## 11. Token 行为

### 11.1 触发时机

1. 仅当当前模型被定义为“下载需要 token”时，才弹 token 输入窗口。
2. 已保存 token 且仍可用时，不重复弹窗。

### 11.2 输入窗口行为

1. token 输入入口按模型触发，不做全局统一 token 设置页。
2. token 输入窗口必须明确显示当前目标模型名称。
3. 用户取消输入时，本次下载不继续执行。

### 11.3 持久化规则

1. token 按模型记住。
2. token 使用 Windows Credential Manager 保存。
3. 不把 token 写进应用设置 JSON。
4. 不把 token 写进 `.env`。

## 12. 加载行为

### 12.1 手动预加载

1. 引擎页保留手动预加载入口。
2. 手动预加载时，必须按当前显式选中的三段组合执行：
   - `asr_engine / asr_model`
   - `diarization_model`
   - `speaker_mapping_model`

### 12.2 首次使用自动加载

1. 如果用户未手动预加载，则在首次使用当前组合转录时自动加载。
2. 自动加载不改变用户当前选择。

### 12.3 日志要求

1. 日志必须能区分“手动预加载”与“首次使用自动加载”。
2. 日志必须能明确记录最终实际加载了哪三段组合。

### 12.4 设置迁移规则

1. 旧设置中的 `selectedEngine / selectedModel` 先原样保留。
2. 即使该旧模型当前未下载，也不自动改写；页面只显示未下载状态。
3. 迁移时补入新增字段：
   - 当前引擎下的 `diarization_model`
   - 当前引擎下的 `speaker_mapping_model`
   - 按引擎分别记住组合的数据结构
4. 如果旧的 `selectedEngine / selectedModel` 在新模型目录里仍合法：
   - 保留旧值
   - 再补该引擎默认的分离模型和映射模型
5. 对其他尚无历史记录的引擎：
   - 直接写入系统默认组合
6. 如果旧的 `selectedEngine / selectedModel` 在新目录里已不存在：
   - 不自动切默认
   - 保留原值并标红，要求用户手动修复
7. `Whisper`、`WhisperCpp`、`Parakeet` 这些旧引擎的历史设置，也必须纳入同一迁移规则。

## 13. 转录请求契约

### 13.1 输入字段

一次转录请求必须显式带上以下字段：

- `asr_engine`
- `asr_model`
- `diarization_model`
- `speaker_mapping_model`

如果继续保留旧字段名，也必须保证语义等价，并在同一轮改造中统一到单一正式契约，不保留长期双口径。

### 13.2 输出与执行语义

1. 输出结果继续返回转录文本、分段与说话人信息。
2. 后端日志必须明确记录：
   - 选择的 ASR 引擎 / 模型
   - 选择的说话人分离模型
   - 选择的说话人映射模型
   - 实际执行路径
3. 不允许继续由后端根据 `enable_diarization=true` 隐式猜一个默认说话人链路。
4. 转录结果对象与历史记录对象必须能够保留本次实际执行的：
   - `asr_engine`
   - `asr_model`
   - `diarization_model`
   - `speaker_mapping_model`
5. 如果本轮保留旧的历史记录字段结构，也必须同步补迁移或兼容读取逻辑，不能出现“页面按新组合执行，但历史里只剩旧 `engine / model`”的断层。

## 14. 错误与失败分支

### 14.1 未下载

- 模型未下载时，页面必须显示未下载状态，不允许伪装成可用。

### 14.2 下载失败

- 下载失败后必须保留失败信息，并允许用户重试。

### 14.3 token 缺失或无效

- token 缺失时必须先弹窗输入。
- token 无效时必须明确提示认证失败，而不是泛化为“下载失败”。

### 14.4 模型加载失败

- 预加载或自动加载失败时，必须明确提示是哪个模型失败。
- 失败后不能偷偷切到另一条路径继续执行。

### 14.5 组合不兼容

- 引擎与模型组合不兼容时，不允许继续执行。
- 前端必须尽量在选择阶段就拦住不兼容组合。

### 14.6 运行时环境缺失

- 若当前环境缺少依赖、provider runtime 或系统能力，必须把该模型标为不可用或加载失败。
- 不能继续显示“已就绪”。

## 15. Affected File List

本次至少需要同步修改以下文件：

1. [FEATURE_REQUEST.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\FEATURE_REQUEST.md)
2. [SPEC.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\SPEC.md)
3. [DESIGN.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\DESIGN.md)
4. [TASKS.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\TASKS.md)
5. [TEST_CASES.md](D:\learn\AIGC\voicescribe\0324\voicescribe\docs\active\feature-engine-model-matrix\TEST_CASES.md)
6. [index.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/types/index.ts)
7. [appStore.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/stores/appStore.ts)
8. [modelStore.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/stores/modelStore.ts)
9. [EngineSettings.tsx](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/pages/EngineSettings.tsx)
10. [backend.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/api/backend.ts)
11. [tauri.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/api/tauri.ts)
12. [recordingFlow.ts](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/lib/recordingFlow.ts)
13. [GeneralSettings.tsx](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src/pages/GeneralSettings.tsx)
14. [lib.rs](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src-tauri/src/lib.rs)
15. [backend.rs](/D:/learn/AIGC/voicescribe/0324/voicescribe/tauri-app/src-tauri/src/commands/backend.rs)
16. [server.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/server.py)
17. [funasr_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/funasr_engine.py)
18. [speaker.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/diarization/speaker.py)
19. [whisper_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/whisper_engine.py)
20. [whispercpp_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/whispercpp_engine.py)
21. [parakeet_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/parakeet_engine.py)
22. [qwen3_asr_engine.py](/D:/learn/AIGC/voicescribe/0324/voicescribe/backend/engines/qwen3_asr_engine.py)

允许新增文件，但不能绕开以上主路径形成第二套正式逻辑。

## 16. Old-Logic Removal List

以下旧逻辑必须在本轮一起收口，不能半删半留：

1. 引擎页只围绕 `selectedEngine / selectedModel` 的单平面模型管理口径
2. `/load` 只加载 ASR 模型、不显式加载说话人分离 / 映射模型的旧语义
3. Tauri `transcribeAudio(...)` 只传 `engine / model` 的旧请求结构
4. 后端依据 `enable_diarization=true` 隐式选择默认说话人分离 / 映射路径的旧逻辑
5. 只把 ASR 模型纳入下载 / 删除 / 状态管理，而把分离 / 映射模型做成隐式依赖的旧逻辑
6. 仅通过环境变量或硬编码选择说话人分离 / 映射模型的旧逻辑
7. 把 token 写入普通设置文件或 `.env` 的方案
8. 下载模型默认写到用户目录缓存的回退语义
9. `Whisper`、`WhisperCpp`、`Parakeet` 继续停留在“只管 ASR，不进入说话人能力矩阵”的旧口径
10. 转录结果与历史记录只保存旧 `engine / model`、不记录实际分离 / 映射组合的旧口径

## 17. Acceptance Criteria

以下全部满足，才可宣称本专题完成：

1. 引擎页存在 3 个固定区域：`ASR 模型`、`说话人分离模型`、`说话人映射模型`
2. 新增独立引擎 `Qwen3-ASR`
3. `Qwen3-ASR` 下可选 `Qwen3-ASR-1.7B`
4. `FunASR` 现有 ASR 模型体系未被破坏
5. `FunASR` 默认组合为 `FunASR 内置分离 + CAM++`
6. `Qwen3-ASR` 默认组合为 `3D-Speaker + CAM++`
7. `Whisper / WhisperCpp / Parakeet` 默认组合为 `3D-Speaker + CAM++`
8. `CampPlus Diarization` 与 `SOND Diarization` 作为正式可选项出现在引擎页
9. 每个引擎能记住自己的上次组合
10. 旧设置迁移后，原 `selectedEngine / selectedModel` 保留，不被静默重写
11. 组合失效时保留原值并标红，不自动回退
12. 说话人分离模型与说话人映射模型都进入下载 / 删除 / 状态管理体系
13. 需要凭据的模型下载时会弹出 token 输入窗口
14. token 按模型记住并保存在 Windows Credential Manager
15. 所有模型下载主路径保持在 [models](D:\learn\AIGC\voicescribe\0324\voicescribe\models)
16. 手动预加载可用
17. 首次使用自动加载可用
18. 一次转录请求显式带上 `asr_engine / asr_model / diarization_model / speaker_mapping_model`
19. 日志可明确证明最终实际执行的是哪一套组合
20. 测试结果先写入正式测试记录，再对外汇报
21. `Parakeet` 已进入完整模型矩阵；若本轮说话人文本对齐能力仍受限，也必须在产品行为、日志与测试记录中如实表述，不能伪装成已完全对齐
22. 一次转录完成后，前端结果对象与历史记录都能保留实际执行的分离模型与映射模型
