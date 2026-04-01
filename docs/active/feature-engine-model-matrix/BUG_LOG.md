# Bug Log: Engine Model Matrix

更新时间：2026-04-01

## 1. 记录范围

本文件用于记录 `feature-engine-model-matrix` 专题实现过程中已经明确复现、需要跟踪修复的 bug。

不把下列内容混进 bug：

- 尚未执行的人工验收项
- 仅有风险但未复现的问题
- 已知能力边界但符合当前 spec 的受限行为

## 2. 已确认 Bug

### BUG-001 3D-Speaker 下载失败，错误指向不存在的 Hugging Face 仓库

- 日期：2026-04-01
- 状态：Fixed
- 严重度：High
- 模块：
  - 引擎页模型下载
  - 后端模型下载链路
- 影响范围：
  - `3D-Speaker` 无法通过当前下载入口完成下载
  - 相关默认组合会停留在“未下载”状态
- 复现现象：
  - 模型：`3D-Speaker`
  - 状态：`未下载`
  - 下载时报错：

```text
401 Client Error. (Request ID: Root=1-69cccd43-0218aa52021038212fb1fa13;8cad5448-a9ae-438f-a36b-d11d7073f657)
Repository Not Found for url: https://huggingface.co/api/models/3D-Speaker/3D-Speaker/revision/main.
Please make sure you specified the correct `repo_id` and `repo_type`.
If you are trying to access a private or gated repo, make sure you are authenticated.
For more details, see https://huggingface.co/docs/huggingface_hub/authentication
Invalid username or password.
```

- 当前判断：
  - 当前配置的 `repo_id = 3D-Speaker/3D-Speaker` 不能被公开直接下载
  - 可能是仓库地址错误、仓库已迁移、仓库受限，或当前下载方式不适用于该模型
- 修复动作：
  - 移除错误的 Hugging Face `repo_id`
  - 根据 `modelscope/3D-Speaker` 官方 diarization recipe，改为下载 ModelScope 组件 bundle
  - 当前 bundle 至少包含：
    - `iic/speech_campplus_sv_zh_en_16k-common_advanced`
    - `iic/speech_fsmn_vad_zh-cn-16k-common-pytorch`
  - 下载结果落到 `models/diarization/3d-speaker`
- 修复后行为：
  - 引擎页重新支持 `3D-Speaker` 自动下载
  - 下载逻辑不再触发错误的 Hugging Face 401
  - 后端 registry 会把 `3D-Speaker` 记为一个本地 bundle
- 备注：
  - 这条 bug 修复的是“错误下载源”
  - 当前接入的是官方 recipe 所需组件 bundle，不等于 `3D-Speaker` 运行时链路已经完整验收

### BUG-002 引擎页失效提示文案与实际值显示不准确

- 日期：2026-04-01
- 状态：Open
- 严重度：Medium
- 模块：
  - 引擎页组合状态展示
  - 引擎页失效提示文案
- 影响范围：
  - 用户难以判断到底是哪一项失效
  - 下拉框可能显示正常模型名，但实际保存值是旧的失效值
- 复现现象：
  - 页面出现：
    - `tiny / funasr_builtin / campp`
    - `ASR：当前引擎下不再兼容该模型`
  - 同时 ASR 下拉框表面显示为 `paraformer-zh`
  - 造成“看起来当前选中的是正常值，但提示又说不兼容”的错觉
- 当前判断：
  - 失效提示文案过于泛化，没有带出具体字段、具体模型名和当前引擎
  - 当保存值已失效且不在选项列表中时，前端展示可能与真实保存值不一致
- 修复目标：
  - 失效提示必须带出：
    - 字段
    - 具体模型名
    - 当前引擎名
  - 当前保存值失效时，显示内容必须与真实保存值一致，不能伪装成列表第一项
- 备注：
  - 这是显示/提示层 bug
  - 不是兼容矩阵本身一定错误

### BUG-003 引擎选择与 ASR 选择未按同一引擎目录对齐

- 日期：2026-04-01
- 状态：Open
- 严重度：High
- 模块：
  - 设置迁移
  - 引擎目录同步
  - 引擎页当前保存组合
- 影响范围：
  - 当前引擎可能挂着别的引擎 ASR 模型
  - 用户看到的“当前保存组合”与当前引擎目录不一致
  - 进一步触发连锁的失效提示和误导显示
- 复现现象：
  - 当前引擎为 `FunASR`
  - 页面却出现类似：
    - `tiny / funasr_builtin / campp`
    - `ASR：当前引擎下不再兼容该模型`
  - 同时 ASR 区域表面又可能显示 `paraformer-zh`
- 当前判断：
  - 旧设置迁移或目录同步后，只做了“补缺”
  - 没有严格校正“每个引擎保存的 asrModel / diarizationModel / speakerMappingModel 是否仍属于该引擎目录”
- 修复目标：
  - 每次与后端引擎目录同步时，按引擎逐项校正保存组合
  - 若某项不属于该引擎，就回到该引擎默认值
  - 保证“当前引擎”和“当前保存组合”至少先在兼容目录层面对齐
- 备注：
  - 这是组合状态一致性 bug
  - 不等同于“模型未下载/已删除”的失效保留规则

### BUG-004 切换 FunASR ASR 模型时短暂闪回 `tiny`

- 日期：2026-04-01
- 状态：FixedPendingManualVerify
- 严重度：High
- 模块：
  - 设置迁移
  - 前端 store 状态归一化
- 影响范围：
  - 在 `FunASR` 下切换 ASR 模型时，界面会短暂出现 `tiny`
  - 几秒或一次后台同步后才恢复成刚刚选择的模型
  - 容易让用户误判为“切换没生效”或“当前引擎被别的引擎模型污染”
- 复现现象：
  - 当前引擎：`FunASR`
  - 用户切换 `paraformer-zh / seaco-paraformer / sensevoice-small` 等模型时
  - 下拉框或当前保存组合会短暂跳成 `tiny`
  - 之后又自动恢复
- 当前判断：
  - 本地持久化设置里仍残留旧字段 `selectedModel`
  - `normalizeSettings(...)` 每次执行时都会把这个旧字段再次迁移到当前引擎
  - 如果该旧值是 `tiny`，就会在用户刚切换模型后把 `FunASR` 的 `asrModel` 瞬时改回 `tiny`
  - 后续目录同步或重新渲染再把它纠正，因此表现为“闪一下又恢复”
- 修复动作：
  - 改写 `normalizeSettings(...)`
  - 不再通过对象展开保留未知旧字段
  - 仅显式保留当前受支持的 `AppSettings` 字段
  - 旧 `selectedModel` 只允许参与一次迁移，不再继续驻留到运行时 settings 对象
- 待验证：
  - 需要在真实桌面界面里重复切换 `FunASR` 下多个 ASR 模型
  - 确认不再出现 `tiny` 瞬时闪回

### BUG-005 预加载当前组合未显式启用说话人链路

- 日期：2026-04-01
- 状态：FixedPendingManualVerify
- 严重度：High
- 模块：
  - 引擎页“预加载当前组合”
  - `/load` 前后端契约
- 影响范围：
  - 选择了外部分离模型后，点击“预加载当前组合”时后端日志仍显示 `diarization=False`
  - 造成预加载只走 ASR，不会真正预加载当前选择的分离 / 映射模型
  - 对 `Qwen3-ASR + pyannote-3.1 + CAM++` 这类组合尤其误导
- 复现现象：
  - 后端日志显示：
    - `[Load:manual_preload] Loading engine=qwen3_asr model=qwen3-asr-1.7b diarization=False diarization_model=pyannote-3.1 speaker_mapping_model=campp`
  - 随后 `/load` 返回 `400`
- 当前判断：
  - 前端 `loadEngineSelection(...)` 发送了 `diarization_model / speaker_mapping_model`
  - 但没有显式发送 `enable_diarization=true`
  - 后端 `/load` 默认把缺失的 `enable_diarization` 解释为 `False`
- 修复动作：
  - 前端 `tauri-app/src/api/backend.ts` 在 `loadEngineSelection(...)` 中显式发送 `enable_diarization`
  - 后端 `backend/server.py` 在 `/load` 中增加兜底：
    - 当 `enable_diarization` 缺失但 `diarization_model` 存在时，自动按 `True` 处理
- 待验证：
  - 真实桌面界面再次点击“预加载当前组合”
  - 确认日志中的 `diarization=` 变为 `True`
  - 若仍返回 `400`，再继续定位真实运行时缺依赖还是模型加载失败

### BUG-006 Qwen3-ASR 按裸 `transformers` pipeline 接入失败

- 日期：2026-04-01
- 状态：FixedPendingManualVerify
- 严重度：High
- 模块：
  - `Qwen3-ASR` 运行时接入
  - 后端可用性探针
- 影响范围：
  - 即使安装了 `transformers`，`Qwen3-ASR` 仍可能在加载阶段报架构不识别
  - 错误信息会指向 `model type qwen3_asr not recognized`
- 复现现象：
  - 加载 `Qwen/Qwen3-ASR-1.7B` 时抛出：
    - `ValueError: The checkpoint you are trying to load has model type qwen3_asr but Transformers does not recognize this architecture`
- 当前判断：
  - 当前版本不能继续用 `transformers.pipeline(task="automatic-speech-recognition", ...)` 直接接 `Qwen3-ASR`
  - 官方提供的是 `qwen-asr` 运行时封装，需要使用 `Qwen3ASRModel.from_pretrained(...)`
- 修复动作：
  - 在后端虚拟环境安装 `qwen-asr`
  - 将 `backend/engines/qwen3_asr_engine.py` 改为官方 `qwen-asr` 用法
  - 将后端可用性探针从 `transformers` 改为 `qwen_asr`
  - 将运行时错误文案改为 `Install qwen-asr first.`
- 待验证：
  - 重启后端进程
  - 重新在桌面端执行 `Qwen3-ASR` 的预加载和真实转录
  - 确认不再出现 `qwen3_asr` 架构不识别错误

## 3. 当前结论

截至 2026-04-01，本专题当前已明确记录的确认 bug 为 1 条：

1. `3D-Speaker` 错误 Hugging Face 下载源已替换为 ModelScope 组件 bundle 下载逻辑

其余未完成项继续留在：

- [TASKS.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/active/feature-engine-model-matrix/TASKS.md)
- [TEST_CASES.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/active/feature-engine-model-matrix/TEST_CASES.md)
