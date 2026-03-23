# VoiceScribe 系统测试报告

日期：2026-03-18

## 2026-03-23 测试补充说明

- 已使用测试脚本 `scripts/windows/test_frontend_history_ingest.bat` 对超长 WAV 文件进行长时间测试。
- 该脚本测试中，后端转录成功，转录结果已返回测试入口，并已复制到可选输入框。
- 但该测试入口当前不能作为“正式系统历史记录验证”的口径：
  - 测试完成后，系统历史记录页面未稳定出现该条记录；
  - 说话人已分段，但未稳定映射到真实注册说话人。
- 因此，该测试脚本目前只用于验证：
  - 超长 WAV 输入；
  - 前端发起转录请求；
  - 后端长时转录完成；
  - 结果回到测试实例。
- 该测试脚本目前不用于验收：
  - 正式系统历史记录落库；
  - 注册说话人的实名映射。
- 用户已自行使用系统真实的非流式传输链路做补充验证：
  - 可完成转录；
  - 可映射真实说话人；
  - 但本次人工验证样本时长较短，约 `643s`。
- 用户已自行使用系统真实的流式传输链路做补充验证：
  - 时间：`2026/3/23 12:04:20`；
  - 时长：`220.0s`；
  - 引擎：`funasr`；
  - 模型：`seaco-paraformer`；
  - 说话人显示可用，至少出现 `连云波`、`江争达`、`Speaker 3`；
  - 但文本转录质量不理想，存在较明显识别误差和术语失真。
- 现阶段可采信结论：
  - 超长音频后端转录能力：已有正向证据；
  - 正式系统历史记录落库：仍需以真实系统入口继续验证；
  - 长音频注册说话人实名映射：仍需以真实系统入口继续验证。
  - 流式传输说话人展示：可用；
  - 流式传输文本质量：当前不理想，仍需继续优化。

## 1. 维护规则

- 本文件是当前有效测试口径下的唯一持续台账。
- 2026-03-18 起，测试方案按“可审计、可复现、可证明正确性”的新口径执行；旧口径结果全部作废，不再计入当前门控。
- “最新状态表”只记录当前口径下的有效结论。
- `PASS / FAIL / SKIP / BLOCKED` 是唯一正式状态。
- “最新状态”单元格留空不是状态，只表示该层级尚未按当前口径执行，因此没有有效结论。
- 历史旧口径结果不再保留在本台账中；如需追溯，应回看 git 历史而不是依赖本文件。

## 2. 当前复现基线

### 2.1 代码与应用版本

- Git commit: `3eb1d077fbc44a30cf4b50822459c89c358dae5e`
- 前端应用版本: `0.1.0`
- Electron 版本: `40.2.1`
- Next 版本: `16.1.6`
- Python 版本: `3.12.4`（`conda` 环境：`voicescribe`）

### 2.2 运行环境

- OS: `Windows-11-10.0.26100-SP0`
- OS build: `10.0.26100`
- CPU architecture: `AMD64`
- GPU: `NVIDIA GeForce RTX 4070 Laptop GPU`
- GPU driver: `566.07`
- GPU memory total: `8188 MiB`
- 正式测试 Python 解释器: `D:\Anaconda3\envs\voicescribe\python.exe`
- Torch 版本: `2.10.0+cu126`
- CUDA 版本: `12.6`
- `torch.cuda.is_available()`: `True`
- 备注: 默认 shell/base 环境下可能出现 `torch` DLL 导入异常；当前项目正式测试应固定在 `conda` 环境 `voicescribe` 中执行。

### 2.3 模型基线

- 模型注册文件: `models/voicescribe_models.json`
- 当前已记录模型:
  - `funasr / paraformer-zh`，更新于 `2026-03-10T23:02:27.350946`
  - `funasr / paraformer-zh-streaming`，更新于 `2026-03-10T23:02:27.356433`
  - `funasr / seaco-paraformer`，更新于 `2026-03-10T23:02:27.361104`
  - `funasr / sensevoice-small`，更新于 `2026-03-10T23:02:27.366684`
  - `qwen3asr / qwen3-asr-0.6b`，更新于 `2026-03-12T21:25:50.823273`
  - `speaker / cam++`，更新于 `2026-03-12T19:36:54.403615`
  - `speaker / eres2netv2`，更新于 `2026-03-12T19:37:41.056298`
  - `speaker / eres2net-large`，更新于 `2026-03-12T19:38:52.688180`
- 当前仍缺少模型校验值或不可变版本标识；未补齐前，只能视为“部分复现基线”。

### 2.4 测试数据基线

- 主测试音频: `artifacts/test-audio/20260313135647-信通院云大所市场部预定的会议-纯音频-1.m4a`
- 当前缺口:
  - 未建立当前口径下的金标转写或关键词基线
  - 未建立当前口径下的说话人参考结果
  - 未建立当前口径下的标准评测切片清单

## 3. 最新状态表

| 层级 | 最新状态 | 最近执行日期 | 启动入口 | 测试环境 | 结论摘要 | 下一步 |
|------|----------|--------------|----------|----------|----------|--------|
| L1 | `PASS` | 2026-03-18 | `scripts/windows/test_backend.ps1 -NoPause` / `scripts/windows/test_backend.bat` | 真实后端 + grouped pytest | 接口检查通过；grouped pytest `84 passed in 2.69s`；`startup -> lifespan` 后已无原先 deprecation warnings | 进入 L2 |
| L2 | `PASS` | 2026-03-18 | `conda run -n voicescribe pytest backend/tests/test_streaming_protocol.py -q` | Mock 后端（`MOCK_MODE=True`） | `17 passed`；`MOCK_MODE` 下已隔离真实 VAD/真实音频处理链路；`startup` 已迁移到 `lifespan` 并完成 `/health` 与 L2 回归验证 | 进入 L3 |
| L3 | `PASS` | 2026-03-18 | `pytest backend/tests/test_streaming_boundary.py -q` | Mock 后端（`MOCK_MODE=True`） | 修复 mock `/stream` 的 odd-byte 与 tiny chunk 边界处理后，`18 passed in 2.61s` | 进入 L5 |
| L5 | `BLOCKED` | 2026-03-18 | `scripts/windows/test_real_inference.bat --mode stream` | 真实后端 + 真实音频 | 本轮真实流式矩阵已执行；`12/12` 组合通过当前脚本的建连、`utterance`、`session_end` 与 speaker-model 回显检查；其中 `funasr/paraformer-zh-streaming@cam++` 的 `'timestamp'` 问题已修复并回归通过；但当前脚本仍未证明文本、时间戳、说话人归属正确，因此不能写 `PASS` | 先补首条时延、时间戳、说话人正确性校验，再重测 |
| L6 |  |  | `scripts/windows/dev.bat` / `scripts/windows/test_recording.bat` | Electron + 后端联调 | 测试项已按业务场景矩阵定义（见 spec 5.6 节）；尚未执行 | 按 spec 5.6 节顺序执行：先配置约束 C-01~C-23，再 3min 矩阵，再 2h 长样本，最后异常场景 E-01~E-09 |
| L7 |  |  | `scripts/windows/test_long_stream.py` | 真实后端 + 长时流式链路 | 尚未按当前口径执行；当前方案已更新为长时递增压力测试 | 先补性能阈值与观测项，再按 `S1-S5` 执行 |

## 4. 待重测队列

### 4.1 必须按顺序重测的层级

1. `L5`
2. `L6`
3. `L7`

### 4.2 重测前必须补齐的前置项

- 为 `L5/L7` 建立可证明正确性的参考数据:
  - 金标转写文本，或
  - 关键词命中清单，或
  - 明确的 CER/WER 评估基线
- 为流式测试建立说话人参考输出或最小可验证规则。
- 为自动化脚本统一补充:
  - 单用例超时保护
  - 原始日志落盘路径
  - 复现基线自动采集
  - 缺陷编号回填字段
  - 性能指标输出字段

## 5. 当前缺陷与处置建议

| 缺陷编号 | 层级 | 严重级别 | 问题摘要 | 当前结论 | 先改什么 | 责任方向 | 影响范围 | 临时规避 | 重测条件 |
|------|------|------|------|------|------|------|------|------|------|
| VS-TEST-001 | L2 | 高 | `/stream` 在收到二进制音频后，多个用例等待 `session_end` 或后续事件超时 | 已修复，L2 回归通过 | 已完成项目修复 | 后端流式链路 | L2、L5、L7 | 无 | 后续在 L5/L7 真实链路继续观察 |
| VS-TEST-002 | L3 | 高 | Mock `/stream` 对 odd-byte chunk 与多次小 chunk 的边界处理不稳定：前者会挂起，后者在测试窗口内拿不到 `session_end` | 已修复，L3 回归通过 | 已完成项目修复 | 后端流式链路 | L3、L5、L7 | 无 | 后续在 L5/L7 真实链路继续观察 |
| VS-TEST-004 | L5 | 高 | 当前流式脚本仍只证明建连、收到 utterance、正常结束与 speaker-model 回显，无法证明流式文本、时间戳、说话人归属正确 | 本轮真实流式矩阵已跑通，但当前口径下仍不能接受为正式 `PASS` | 先改测试脚本与评测数据 | 测试脚本 / 数据基线 | L5、L6、L7 | 本轮可继续做调试验证，但不写正式通过 | 建立首条时延、utterance 正确性、speaker 正确性校验后再测 |
| VS-TEST-005 | 全局 | 中 | 复现基线字段不完整，缺少模型校验值、实际 Torch/CUDA 版本、测试版本快照 | 当前口径下不完整 | 先改测试脚本 | 测试脚本 / 台账 | L1-L7 | 手工补录最低限度字段 | 自动采集或手工补齐复现基线 |

## 6. 当前阻塞

- 当前 `L1/L2/L3` 已按新口径得到有效最新状态，均为 `PASS`。
- `L5` 目前最大问题不是“先跑不跑”，而是“没有足够证据证明结果正确”，因此应先补测试脚本和评测数据。
- `L6` 已按新方案改为 Electron 联调 + 业务流程测试，当前仍需先按新口径补界面可见状态、快捷键 / 悬浮窗触发链路、切页持续显示与 `AI 摘要` 测试。
- `L7` 已按新方案改为长时递增压力测试，执行前仍需补性能阈值与观测项。

## 7. 台账重置记录

### 2026-03-18 / Reset 01 / 测试口径重置

- 原因：测试方案从“能跑通”升级为“可审计、可复现、可证明正确性”的新口径。
- 处理：
  - 删除旧口径下的“最新状态”结论
  - 保留 `L1-L7` 行，但最新状态留空
  - 不再使用 `PASS* / 待执行 / 未执行 / EXCLUDED`
  - 所有层级必须按新口径重新执行后才能重新写入正式状态
- 影响：
  - 旧 `L1/L4/L5` 通过记录不再计入门控
  - 旧 `L2/L3` 超时定位只作为缺陷线索，不作为当前结论

### 2026-03-18 / Run 01 / L1 新口径重测

- 启动入口：
  - `D:\Anaconda3\Scripts\conda.exe run -n voicescribe powershell -NoProfile -ExecutionPolicy Bypass -File scripts/windows/test_backend.ps1 -NoPause`
  - `pytest backend/tests/test_backend_core.py backend/tests/test_backend_meeting.py backend/tests/test_backend_speaker.py -q`
- 测试环境：
  - 后端接口检查：真实后端 + `conda` 环境 `voicescribe`
  - grouped pytest：本机 `pytest 7.4.4`
- 结果：
  - 接口检查：`/`、`/health`、`/engines`、`/models`、`/speakers`、`/load`、空音频/坏 WAV/静音 WAV 拒绝行为全部通过
  - grouped pytest：`84 passed, 2 warnings`
- 偏差说明：
  - `voicescribe` 环境中的 `python -m pytest` 当前不可用，报 `No module named pytest`
  - 因此 grouped pytest 由系统 `pytest 7.4.4` 单独补跑
- 结论：
  - `L1 PASS`
  - 该偏差已记录，但不影响本轮 L1 接口契约结论

### 2026-03-18 / Run 02 / L2 新口径重测

- 启动入口：
  - `D:\Anaconda3\Scripts\conda.exe run -n voicescribe pytest backend/tests/test_streaming_protocol.py --collect-only -q`
  - `D:\Anaconda3\Scripts\conda.exe run -n voicescribe pytest backend/tests/test_streaming_protocol.py -vv`
  - `D:\Anaconda3\Scripts\conda.exe run -n voicescribe pytest <single-test> -q`
- 测试环境：
  - `conda` 环境 `voicescribe`
  - Mock 后端（`MOCK_MODE=True`）
- 首轮结果：
  - collect-only：`17 tests collected`
  - 整文件执行：180s 内超时
- 单用例补跑结果：
  - 通过：`10`
  - 超时：`7`
- 通过用例：
  - `TestWSLifecycle::test_started_payload_required_fields`
  - `TestWSLifecycle::test_session_id_is_non_empty_string`
  - `TestWSLifecycle::test_session_end_required_fields`
  - `TestWSErrorHandling::test_missing_action_does_not_crash`
  - `TestWSErrorHandling::test_audio_before_start_silently_ignored`
  - `TestWSErrorHandling::test_double_start_no_crash`
  - `TestWSErrorHandling::test_unknown_engine_returns_error_or_started_in_mock`
  - `TestWSConfig::test_start_full_config_accepted`
  - `TestWSConfig::test_engine_field_reflected_in_started`
  - `TestWSConcurrency::test_two_concurrent_sessions_independent`
- 超时用例：
  - `TestWSLifecycle::test_connect_start_end_receives_started_and_session_end`
  - `TestWSAudio::test_binary_audio_accepted_no_crash`
  - `TestWSAudio::test_utterance_structure_when_emitted`
  - `TestWSAudio::test_speaker_active_follows_utterance`
  - `TestWSErrorHandling::test_invalid_json_closes_gracefully`
  - `TestWSAIRefiner::test_refiner_utterance_refined_event`
  - `TestWSCleanup::test_repeated_sessions_no_exception`
- 日志定位结论：
  - `L2` 不是导入或收集阶段失败，而是执行期挂起。
  - 一旦进入“发送二进制音频后等待后续事件”的路径，多个用例会超时。
  - 问题主要落在 `/stream` 的音频处理、tail flush、refiner 或 session cleanup 路径。
- 结论：
  - `L2 FAIL`

### 2026-03-18 / Run 03 / L2 修复后回归

- 背景：
  - `/stream` 的 `MOCK_MODE` 之前只 mock 了 ASR，没有隔离真实 Silero VAD
  - 非法 JSON 路径也没有稳定返回 `error`
- 代码修复：
  - `MOCK_MODE` 下的二进制音频改为走协议级 mock 事件，不再进入真实 VAD / 真实音频处理链路
  - 非法 JSON 现在明确返回 `error` 并结束会话
- 启动入口：
  - `D:\Anaconda3\Scripts\conda.exe run -n voicescribe pytest backend/tests/test_streaming_protocol.py -q`
  - `D:\Anaconda3\Scripts\conda.exe run -n voicescribe pytest backend/tests/test_streaming_protocol.py -vv`
- 测试环境：
  - `conda` 环境 `voicescribe`
  - Mock 后端（`MOCK_MODE=True`）
- 结果：
  - `17 passed, 2 warnings`
- 结论：
  - `L2 PASS`

### 2026-03-18 / Run 04 / startup 迁移到 lifespan 后验证

- 背景：
  - `backend/server.py` 原先使用 `@app.on_event("startup")`
  - FastAPI 已对该写法给出 deprecation warning，需要迁移到 `lifespan`
- 代码调整：
  - 将启动初始化逻辑收敛到 `_preload_models_on_startup()`
  - 使用 `lifespan` 在应用接收请求前执行模型扫描与按配置预加载
- 执行命令：
  - `D:\Anaconda3\Scripts\conda.exe run -n voicescribe python -c "import sys; sys.path.insert(0, r'D:\learn\AIGC\voicescribe\voicescribe\backend'); import server; from starlette.testclient import TestClient; c = TestClient(server.app); r = c.get('/health'); print(r.status_code); print(r.json()['status'])"`
  - `D:\Anaconda3\Scripts\conda.exe run -n voicescribe pytest backend/tests/test_streaming_protocol.py -q`
- 结果：
  - `/health` 返回 `200`，状态为 `healthy`
  - `L2` 回归：`17 passed in 4.46s`
- 结论：
  - `startup -> lifespan` 迁移未引入行为回归

### 2026-03-18 / Run 05 / L3 新口径重测

- 执行命令：
  - `pytest backend/tests/test_streaming_boundary.py -q`
  - `pytest backend/tests/test_streaming_boundary.py::TestStreamAudioBoundaries::test_multiple_small_chunks_no_crash -q`
  - `pytest backend/tests/test_streaming_boundary.py::TestStreamAudioBoundaries::test_odd_byte_count_chunk_no_crash -vv -s`
- 测试环境：
  - Mock 后端（`MOCK_MODE=True`）
  - 使用当前工作区代码，包含 `/stream` mock 协议修复与 `startup -> lifespan` 迁移
- 结果：
  - 整套 `L3` 在 180s 内未跑完，整文件执行超时
  - `test_multiple_small_chunks_no_crash` 明确失败：发送 20 个 10ms PCM chunk 后，测试窗口内拿不到 `session_end`
  - `test_odd_byte_count_chunk_no_crash` 在单测重跑时持续挂起，30s 内未结束
  - 其余边界项沿用本轮拆分执行结果，累计为 `16 passed, 1 failed, 1 timeout`
- 初步定位：
  - 当前问题在项目代码，不在测试脚本本身
  - odd-byte chunk 很可能仍会撞到 mock 音频分支的 `int16` 对齐假设
  - 多次小 chunk 会持续产生协议事件，导致 `session_end` 不能在当前测试窗口内稳定出现
- 结论：
  - `L3 FAIL`
  - 下一步先修 mock `/stream` 的 chunk 边界处理，再回归 L3

### 2026-03-18 / Run 06 / L3 修复后回归

- 代码调整：
  - mock `/stream` 增加最小 chunk 缓冲，多个超小 chunk 合并后再发协议事件
  - odd-byte chunk 在 mock 分支中不再直接撞 `int16` 对齐假设，尾部残留字节延迟到 flush 时处理
  - `end` 时会先 flush mock 缓冲，再发送 `session_end`
- 执行命令：
  - `pytest backend/tests/test_streaming_protocol.py -q`
  - `pytest backend/tests/test_streaming_boundary.py -q`
- 结果：
  - `L2` 回归：`17 passed in 0.61s`
  - `L3` 回归：`18 passed in 2.61s`
- 结论：
  - `L3 PASS`
  - `VS-TEST-002` 已修复

### 2026-03-18 / Run 07 / L1 warnings 回归确认

- 执行命令：
  - `pytest backend/tests/test_backend_core.py backend/tests/test_backend_meeting.py backend/tests/test_backend_speaker.py`
- 结果：
  - `84 passed in 2.69s`
  - 本轮未出现此前 FastAPI `startup` 弃用相关 warnings
- 结论：
  - `L1 PASS`
  - 原先的两个 warning 已消除

### 2026-03-18 / Archive Note / L4 历史记录已迁出主线

- `L4` 已从当前测试计划移除。
- 原 `Run 08` 与 `Run 09` 的完整记录已移至“L4 归档记录”章节，仅供问题追溯，不再作为当前门控依据。

### 2026-03-18 / Run 10 / L5 真实流式矩阵首轮 + `cam++` 定点回归

- 启动入口：
  - `D:\Anaconda3\envs\voicescribe\python.exe scripts/windows/test_real_inference.py --mode stream --audio logs/system-tests/audio/20260313135647-信通院云大所市场部预定的会议-纯音频-1_offset3600s_len60s_16k_mono.wav`
  - `D:\Anaconda3\envs\voicescribe\python.exe scripts/windows/test_real_inference.py --mode stream --audio logs/system-tests/audio/20260313135647-信通院云大所市场部预定的会议-纯音频-1_offset3600s_len60s_16k_mono.wav --speaker-model cam++`
- 测试环境：
  - `dev.bat` 启动的真实后端 + Electron 可见终端
  - 输入音频为已缓存的 `1h` 偏移 `60s`、`16k/mono WAV`
- 首轮矩阵结果：
  - `PASS`：`11`
  - `FAIL`：`1`
  - 失败项：`funasr/paraformer-zh-streaming@cam++`，后端返回 `stream error: 'timestamp'`
- 根因定位：
  - `cam++` 会触发 FunASR 内部 diarization
  - `paraformer-zh-streaming` 不提供 FunASR 内部 diarization 所需的 `timestamp`
  - 因此该组合会在后端内部抛出 `KeyError: 'timestamp'`
- 项目修复：
  - `server.py`：仅对支持 `timestamp` 的 FunASR 模型启用内部 diarization
  - `paraformer-zh-streaming@cam++` 改为走外部 speaker tracker，不再进入 FunASR 内部 diarization
- `cam++` 定点回归：
  - `funasr/paraformer-zh-streaming@cam++`：`PASS`
  - `funasr/paraformer-zh@cam++`：`PASS`
  - `funasr/seaco-paraformer@cam++`：`PASS`
  - `firered/firered-aed-l@cam++`：`PASS`
- 当前 `L5` 结论：
  - 本轮已证明真实流式链路在当前矩阵下可跑通，且 `'timestamp'` 兼容问题已修复
  - 但当前脚本仍未校验首条时延、文本正确性、时间戳正确性、说话人归属正确性
  - 因此 `L5` 正式状态维持为 `BLOCKED`，不能写 `PASS`
## 2026-03-21 快捷键与录音控制测试总结

### 测试范围

本轮测试主要覆盖以下功能：

- 托盘点击开始/停止录音
- 快捷键短按开始/停止录音
- 快捷键长按开始、松开停止录音
- `Esc` 取消录音
- 悬浮窗点击取消录音
- 单键与组合键快捷键录制
- 左右修饰键区分
- 未手动加载 ASR 时自动加载后再开始录音
- `RIGHT ALT` 与 Windows 默认菜单冲突回归

### 测试环境

- 系统：Windows
- 启动方式：`scripts/windows/dev.bat`
- 后端状态：已连接
- 测试对象：快捷键与录音控制链路
- 测试依据：
  - 原系统测试方案
  - [2026-03-21-hotkey-and-recording-control-test-addendum.md](D:/learn/AIGC/voicescribe/voicescribe/docs/superpowers/specs/2026-03-21-hotkey-and-recording-control-test-addendum.md)

### 测试项结果

| 用例 ID | 测试项 | 结果 | 备注 |
|---|---|---|---|
| C-17 | 托盘开始/停止 |  |  |
| C-18 | 未预加载 ASR 自动加载 |  |  |
| C-19 | 长按录音 |  |  |
| C-20 | 短按切换录音 |  |  |
| C-21 | 左右修饰键区分 |  |  |
| C-22 | 托盘停止 / 悬浮窗取消 |  |  |
| C-23 | `Esc` 取消 |  |  |
| C-24 | 单键快捷键录制 |  |  |
| C-25 | 组合键快捷键录制 |  |  |
| C-26 | `RIGHT ALT` 菜单冲突回归 |  |  |

### 结果判定

- 通过标准：
- `C-17` 至 `C-26` 全部 `PASS`
  - 或个别项明确标记为 `BLOCKED`，并给出具体原因与后续处理建议

### 结论

本轮主要验证了快捷键录音、托盘控制、取消路径以及录音前模型自动准备逻辑是否符合预期。  
若上述测试项全部通过，则可以认为“快捷键与录音控制”相关回归已完成，可继续进入后续 L6 录音场景测试。

### 遗留问题

- 若存在 `FAIL` 或 `BLOCKED`，请在此补充具体现象、日志和根因分析。

## 8. L4 归档记录

说明：

- 本节仅保留 `L4` 被移出当前测试计划前的历史执行记录。
- 这些内容只用于问题追溯，不再参与当前正式门控。

### 2026-03-18 / Run 08 / L4 新口径首轮重测

- 输入音频：
  - `logs/system-tests/audio/20260313135647-信通院云大所市场部预定的会议-纯音频-1_offset3600s_len60s_16k_mono.wav`
- 测试入口：
  - `D:\Anaconda3\envs\voicescribe\python.exe scripts\windows\test_real_inference.py --mode batch --audio <cached-wav> --batch-seconds 0`
- 当前已确认结果：
  - `funasr/paraformer-zh`：`PASS`，`text_len=387 duration=60.0`
  - `funasr/seaco-paraformer`：`PASS`，`text_len=386 duration=60.0`
  - `firered/firered-aed-l`：`PASS`，`text_len=276 duration=60.0`
  - `funasr/paraformer-zh-streaming`：`SKIP`，流式专用模型，不纳入 `L4`
  - `funasr/sensevoice-small`：`FAIL`，`duration=0.0`
  - `qwen3asr/qwen3-asr-0.6b`：`FAIL`，`duration=0.0`
- 过程修正：
  - `L4` 批量脚本已改为严格串行：先复用缓存音频，再逐模型加载与测试
  - `duration=0.0` 现在会判定为 `FAIL`
  - `paraformer-zh-streaming` 已从 `L4` 非流式矩阵中改为 `SKIP`
- 根因定位：
  - 问题不在测试脚本，而在项目引擎适配层
  - [funasr_engine.py](D:/learn/AIGC/voicescribe/voicescribe/backend/engines/funasr_engine.py) 当前只在 `sentence_info` 存在时构造 `segments`，随后用最后一个 segment 的 `end` 作为 `duration`
  - [qwen3asr_engine.py](D:/learn/AIGC/voicescribe/voicescribe/backend/engines/qwen3asr_engine.py) 当前只在 `time_stamps` 存在时构造 `segments`，随后用最后一个 segment 的 `end` 作为 `duration`
  - [server.py](D:/learn/AIGC/voicescribe/voicescribe/backend/server.py) 只是透传 `result.get("duration", 0)` 到响应，因此 `duration=0.0` 是引擎结果/适配层问题，不是接口封装问题
- 结论：
  - `L4 FAIL`
  - 下一步先修 `sensevoice-small` 与 `qwen3-asr-0.6b` 的时长/时间戳回填

### 2026-03-18 / Run 09 / L4 适配层修复后回归

- 代码调整：
  - `funasr_engine.py`：当有文本但没有 `sentence_info/segments` 时，用输入音频真实时长回填 `duration`
  - `qwen3asr_engine.py`：当有文本但没有 `time_stamps/segments` 时，用输入音频真实时长回填 `duration`
  - `test_real_inference.py`：`duration=0.0` 不再记为 `PASS`；`paraformer-zh-streaming` 在 `L4` 中改为 `SKIP`
- 单模型回归：
  - `funasr/sensevoice-small`：`PASS`，`text_len=701 duration=60.0`
  - `qwen3asr/qwen3-asr-0.6b`：`PASS`，`text_len=287 duration=60.0`
  - `funasr/paraformer-zh-streaming`：`SKIP`
- 当前 `L4` 汇总：
  - `PASS`：`paraformer-zh` / `seaco-paraformer` / `sensevoice-small` / `firered-aed-l` / `qwen3-asr-0.6b`
  - `SKIP`：`paraformer-zh-streaming`
  - `BLOCKED`：`firered2/fireredasr2-aed`
- 结论：
  - `VS-TEST-003` 已修复
  - `L4` 当前整体状态调整为 `BLOCKED`，阻塞点为 `firered2` 的设备资源限制

