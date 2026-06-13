# VoiceScribe TEST

更新时间：2026-06-13（Typeless 文本处理首轮验证已回写）

## 1. 文档用途

本文件用于把 [PRD.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/PRD.md) 的业务验收口径和 [SPEC.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/SPEC.md) 的模块契约口径，落成可执行的测试方案与测试记录。

本文件回答三类问题：

- 端到端业务流程是否成立
- 模块内、接口级、状态级逻辑是否正确
- 哪些我可自行测试，哪些必须由你在 Windows 真机上手动测试

使用规则：

- 只有写在本文件中的结果，才视为已测试。
- `PRD` 定义“什么算业务通过”。
- `SPEC` 定义“模块、接口、状态、持久化对象应如何工作”。
- 构建通过不等于功能完成。
- Windows 真机行为、全局热键、托盘、Overlay、文本注入、真实模型运行时，不得只用静态检查代替人工验收。

状态字段统一使用：

- `未测试`
- `已通过`
- `未通过`
- `待人工验收`

## 2. 测试分工

### 2.1 我可自行测试

适用于当前代理可直接执行和回写的验证：

- `cargo fmt`
- `cargo check`
- `npm run build`
- `python -m compileall`
- 本地 API 调用
- 本地状态对象、接口返回、错误分类、目录与文件校验
- 非 GUI 的脚本和命令链回归

### 2.2 你手动测试

适用于必须在 Windows 真机桌面环境中完成的验证：

- 全局热键真实命中
- 录音、悬浮窗、波纹、托盘、窗口交互
- 文本输出到外部输入框
- 自动启动
- 真实模型下载、真实加载、真实转录、真实 diarization
- embedded Python 安装态闭环

## 3. 业务验收测试

本节直接映射 [PRD.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/PRD.md) `10.1.1 ~ 10.1.8`。

### 3.1 `PRD 10.1.1` 录音与转录

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| 前端录音链可编译 | `npm run build` | 已通过 | 2026-04-03：`tauri-app` 执行 `npm run build` 通过 |
| Tauri 录音命令可编译 | `cargo check` | 已通过 | 2026-04-03：`tauri-app/src-tauri` 执行 `cargo check` 通过 |
| 后端转录链可导入 | `backend/venv/Scripts/python.exe -m compileall backend` | 已通过 | 2026-04-03：`backend/venv/Scripts/python.exe -m compileall backend` 通过 |
| `/transcribe` 错误分类清晰 | 本地 API / 单点调用 | 已通过 | 2026-04-03：mock backend 下合法请求返回 `200`，非法 `engine=invalid-engine` 返回 `400` 和明确 detail=`Unknown engine: invalid-engine` |
| `Qwen3-ASR` 可真实转录 | 直接加载本地模型并转录测试音频 | 已通过 | 2026-04-03：`Qwen3ASREngine.load(<repo>/models/qwen3_asr/qwen3-asr-1.7b)` 成功，对本地生成的 1 秒 wav 返回真实结果 `"嗯。"` |
| 转录结果对象符合当前契约 | 类型与返回结构校验 | 已通过 | 2026-04-03：mock `/transcribe` 返回字段包含 `text/segments/duration/engine/model/asr_engine/asr_model/diarization_model/speaker_mapping_model/speaker_text_alignment_limited`，与当前契约一致 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 主窗口开始录音 | 成功进入录音态 | 待人工验收 | - |
| 主窗口停止录音 | 结束录音并得到结果 | 待人工验收 | - |
| 主窗口取消录音 | 不写错误历史，不输出残缺结果 | 待人工验收 | - |
| 过短录音 | 给出明确提示，不进入长失败链 | 待人工验收 | - |
| 完整录音转录闭环 | 结果进入文本输出和历史写入 | 待人工验收 | - |

### 3.2 `PRD 10.1.2` 热键

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| `HotkeyBinding` 类型与前端调用可编译 | `npm run build` | 已通过 | 2026-04-03：`tauri-app` 执行 `npm run build` 通过，`HotkeyBinding` 类型与前端 invoke 调用链可编译 |
| Rust 热键运行时代码可编译 | `cargo check` | 已通过 | 2026-04-03：`tauri-app/src-tauri` 执行 `cargo check` 通过 |
| suspend/register/resume 日志链存在 | 读 hotkey 日志 / trace 输出 | 已通过 | 2026-04-03：确认 `HotkeySettings.tsx -> tauri.ts -> hotkey.rs` 存在 suspend/register/resume trace，且 `voicescribe-hotkey.log` 保留毫秒级时间线 |
| persisted binding 恢复链存在 | 代码与日志校验 | 已通过 | 2026-04-03：确认 `appStore.ts` 会持久化当前 `hotkeyBinding`，`useHotkey.ts` 在 `settingsHydrated` 后按持久化 binding 重新注册 runtime |
| Apply 后 runtime 调用顺序可定位 | 日志与 trace 校验 | 已通过 | 2026-04-03：确认设置页与 Rust runtime 同时记录 `capture apply requested/state-updated -> register_hotkey_binding -> resume_hotkey_runtime` trace 链 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 设置页录制热键 | 能录制并显示正确按键 | 待人工验收 | - |
| 保存并应用热键 | Apply 后配置真正生效 | 待人工验收 | - |
| 重启后自动恢复 | 冷启动后无需重新 Apply | 待人工验收 | - |
| 外部应用中按热键 | 可开始/停止录音 | 待人工验收 | - |
| `Right Alt` 单键路径 | 冷启动后可真实命中 | 已通过 | 2026-04-03：用户真机确认，`VoiceScribe` 主窗口前台下按 `Right Alt` 已可正常触发录音流程 |
| 双键与左右 Alt/AltGr | 录制与命中符合预期 | 待人工验收 | - |

### 3.3 `PRD 10.1.3` 模型管理

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| `/models` 接口返回模型状态 | 本地 API 调用 | 已通过 | 2026-04-03：删除 `pyannote-3.1` 支持后，in-process `list_models()` 返回 `24` 条状态；当前分离模型列表为 `funasr_builtin / campplus-diarization / sond-diarization / 3d-speaker` |
| 模型目录完整性规则可执行 | 本地目录校验 / service 调用 | 已通过 | 2026-04-03：当前分离模型目录规则只覆盖仍在支持矩阵内的模型；被移除的 `pyannote-3.1` 已从 registry 和本地模型列表收敛掉，不再进入 `/models` 有效列表 |
| registry 自愈/清理逻辑可执行 | 读写 `voicescribe_models.json` | 已通过 | 2026-04-03：`model_registry_service.load_registry()` 返回 canonical buckets `diarization/funasr/qwen3_asr/speaker_mapping/whisper`，无 `speaker`、`qwen3asr` 历史 bucket |
| 下载失败后不会假可用 | 单点调用 + 状态校验 | 已通过 | 2026-04-03：下载状态统一以当前支持矩阵和 registry/path 为准；被移除的 `pyannote-3.1` 即使原先有本地 snapshot，也不再通过 `/models` 暴露成“已下载” |
| 预加载接口错误分类明确 | `/load` 或 service 调用 | 已通过 | 2026-04-03：`transcription_service.ensure_engine_loaded('qwen3_asr','qwen3-asr-1.7b',False, load_source='codex_test')` 成功，返回本地 `load_target=<repo>/models/qwen3_asr/qwen3-asr-1.7b` |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 引擎页模型状态展示 | 与真实目录和运行时一致 | 待人工验收 | - |
| 下载模型 | 下载后状态可信，无假成功 | 待人工验收 | - |
| 删除模型 | 页面状态、目录、registry 一起收敛 | 待人工验收 | - |
| 预加载模型 | 成功或失败反馈与真实行为一致 | 待人工验收 | - |
| gated 模型 token 流程 | 缺 token / 有 token 提示正确 | 待人工验收 | - |

### 3.4 `PRD 10.1.4` 说话人管理

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| speaker 相关后端代码可导入 | `python -m compileall backend` | 已通过 | 2026-04-03：`backend/venv/Scripts/python.exe -m compileall backend` 通过 |
| `/speakers/register` / `/speakers` 接口可调用 | 本地 API 调用 | 已通过 | 2026-04-03：真实 backend 下使用示例 wav 成功完成 `GET /speakers -> POST /speakers/register -> GET /speakers -> DELETE /speakers/{id}` roundtrip；随后已把 speaker embedding 主链改成 GPU tensor，直接回归确认 `extract_embedding()` 返回 `Tensor@cuda:0`，新注册 speaker 落盘为 `.pt`，不再新写 `.npy`；另用临时 legacy speaker 目录实测 `_load_speakers()` 会把旧 `.npy` 自动迁移成 `.pt` 并删除旧文件 |
| diarization 缺依赖错误分类明确 | 单点调用 `speaker.py` / service | 已通过 | 2026-04-03：`3d-speaker` 返回 bundle 已下载但 runtime 未实现的明确错误；不支持的分离模型现在直接返回 `Unsupported diarization model` |
| 失败时可回退普通转录的代码路径存在 | 代码与服务逻辑核对 | 已通过 | 2026-04-03：`transcribe()` 先拿 ASR 结果，再按分支决定是否跳过 diarization；空转录会直接保留普通结果，外部 diarization 失败则返回显式 HTTPException，不写伪成功结果 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 注册说话人样本 | 列表中可回显 | 待人工验收 | - |
| 删除说话人样本 | 列表与后端状态同步更新 | 待人工验收 | - |
| 开启 speaker chain 转录 | 结果带说话人标签或分段 | 待人工验收 | - |
| speaker chain 失败 | 明确报错或回退普通转录 | 待人工验收 | - |
| 缺 token / 缺模型 / 缺依赖 | 提示明确可理解 | 待人工验收 | - |

### 3.5 `PRD 10.1.5` 实时转录

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| 实时页与流式相关前端代码可编译 | `npm run build` | 已通过 | 2026-04-03：`tauri-app` 执行 `npm run build` 通过 |
| `/stream` 接口可访问 | 本地 API 调用 | 已通过 | 2026-04-03：mock backend websocket `/stream` 可连接，发送音频块后返回 `type=entry` 的实时消息 |
| `/summary` 接口可访问 | 本地 API 调用 | 已通过 | 2026-04-03：mock backend 下 `POST /summary` 返回 `200`；同轮修复为 mock mode 直接走 `_fallback_summary`，不再卡在 `AIRefiner` 子进程超时 |
| 实时状态对象和页面契约一致 | 代码与类型校验 | 已通过 | 2026-04-03：`RealtimeSessionState`、`realtimeStream.ts`、`RealtimeTranscriptionPage.tsx` 三者围绕 `status/entries/summaries/error` 使用一致 |
| 流式失败不污染普通转录主链 | 代码链核对 | 已通过 | 2026-04-03：`realtimeStream.ts` 的错误只写入 realtime state；`recordingFlow.ts` 仍独立走 `stopRecording -> transcribeAudio -> outputText/history` 主链 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 录音过程实时片段刷新 | 页面持续看到片段更新 | 待人工验收 | - |
| AI 摘要刷新 | 页面看到摘要更新 | 待人工验收 | - |
| 流式失败后离线转录 | 普通转录仍可继续完成 | 待人工验收 | - |
| 重新开始录音 | 实时状态正确清理与重建 | 待人工验收 | - |

### 3.6 `PRD 10.1.6` 历史记录

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| history 服务代码可导入 | `python -m compileall backend` | 已通过 | 2026-04-03：`backend/venv/Scripts/python.exe -m compileall backend/services/history_service.py` 通过 |
| `/history` 读写删接口可调用 | 本地 API 调用 | 已通过 | 2026-04-03：mock backend 执行 `GET /history -> POST /history(codex-history-roundtrip) -> DELETE /history/{id}` roundtrip 成功，记录数回到原值 |
| `HistoryRecord` 契约与持久化一致 | 类型与后端对象校验 | 已通过 | 2026-04-03：确认 `tauri-app/src/types/index.ts` 的 `HistoryRecord` 与 `server.py` 的 `HistoryRecordPayload` 字段一致，`upsertHistoryRecord/listHistory` 契约匹配 |
| `retainAudio` 导出约束存在 | 代码与对象校验 | 已通过 | 2026-04-03：确认 `recordingFlow.ts` 写入 `retain_audio/audio_path`，`HistoryPage.tsx` 仅在 `retain_audio && audio_path` 时允许导出音频，`history_service.py` 删除记录时按该约束清理音频 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 完成一次转录后写入历史 | 历史页能看到记录 | 待人工验收 | - |
| 复制记录 | 可复制文本 | 待人工验收 | - |
| 删除 / 清空记录 | 页面和后端状态同步变化 | 待人工验收 | - |
| 导出文本 / 音频 | 与设置和记录内容一致 | 待人工验收 | - |
| 失败任务历史 | 不产生误导性成功记录 | 待人工验收 | - |

### 3.7 `PRD 10.1.7` 热词与文本优化

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| 热词设置相关前端代码可编译 | `npm run build` | 已通过 | 2026-04-03：`tauri-app` 执行 `npm run build` 通过 |
| 设置对象含热词与 AI 优化字段 | 类型与 store 校验 | 已通过 | 2026-04-03：`AppSettings`、`defaultSettings`、`normalizeSettings` 都包含 `hotwords/enableAIRefine/enableStreaming` 字段 |
| 请求链可携带热词/AI 优化配置 | 代码链核对 | 已通过 | 2026-04-03：`recordingFlow.ts -> api/tauri.ts -> commands/backend.rs -> server.py /transcribe` 全链透传 `hotwords` 与 `enable_ai_refine` |
| 能力不可用时有明确错误路径 | API / 逻辑校验 | 已通过 | 2026-04-03：实测将 `server.AI_REFINE_AVAILABLE=False` 后调用 `/transcribe` 主链，当前实现会保留原始转录文本，并在 `TranscribeResult.warnings[]` 中返回 `AI text refine is not available in the current runtime; original transcription was kept`；Tauri `TranscribeResult` 与前端 toast 已同步透传该 warning |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 新增/编辑/删除热词 | 配置可保存并重新加载 | 待人工验收 | - |
| 热词参与转录 | 结果体现专有词修正效果 | 待人工验收 | - |
| 开启 AI 文本优化 | 得到优化结果或明确失败信息 | 待人工验收 | - |
| 优化失败回退 | 原始文本仍可保留 | 待人工验收 | - |

### 3.8 `PRD 10.1.8` 桌面系统能力

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| Tauri 桌面命令可编译 | `cargo check` | 已通过 | 2026-04-03：`tauri-app/src-tauri` 执行 `cargo check` 通过 |
| 托盘 / Overlay / 文本输出相关前端代码可编译 | `npm run build` | 已通过 | 2026-04-03：`tauri-app` 执行 `npm run build` 通过 |
| 自动启动设置对象与命令链存在 | 代码链核对 | 已通过 | 2026-04-03：`GeneralSettings.tsx -> appStore.setLaunchAtLogin -> lib/autostart.ts -> tauri_plugin_autostart` 调用链存在 |
| 文本输出 invoke 契约存在 | `tauri.ts` / Rust 命令校验 | 已通过 | 2026-04-03：`api/tauri.ts.outputText()` 调用 Rust `output_text` 命令，`src-tauri/lib.rs` 已注册该命令 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 托盘显示与菜单操作 | 符合预期 | 待人工验收 | - |
| Overlay 联动录音状态 | 可显示、更新、关闭 | 待人工验收 | - |
| 文本输出到目标输入框 | 成功注入或明确失败 | 待人工验收 | - |
| 自动启动 | 开机后行为符合 Windows 预期 | 待人工验收 | - |
| 窗口显隐与焦点行为 | 符合桌面应用预期 | 待人工验收 | - |

## 4. 模块与契约测试

本节主要映射 [SPEC.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/SPEC.md) 的模块、接口、状态与持久化约束。

### 4.1 启动链与后端连接

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| backend 启动命令可编译 | `cargo check` | 已通过 | 2026-04-02：`tauri-app/src-tauri` 下 `cargo check` 通过 |
| backend 可启动并返回健康状态 | `backend/venv/Scripts/python.exe server.py --mock --host 127.0.0.1 --port 8765` + `GET /health` | 已通过 | 2026-04-02：原测试方案误写为不存在的 `scripts/start_backend.bat`，已改为 mock backend 启动；`/health=healthy`、`mock_mode=true`、`/engines=5`、`/models=25` |
| AppShell 启动依赖链存在 | 代码链核对 | 已通过 | 2026-04-02：确认 `entry/main.tsx -> shell/AppShell.tsx -> hooks/useBackendConnection.ts -> stores/appStore.ts(startBackend/checkConnection) -> api/tauri.ts -> commands/backend.rs` 主链存在 |
| 启动失败时存在错误状态路径 | 前端 hook / backend command 校验 | 已通过 | 2026-04-02：`useBackendConnection.ts` 在后端未就绪时轮询并 toast，`appStore.checkConnection()` 会把 `backendConnected=false` 并回读 `backendStatus` |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 桌面应用启动后端 | 应用可进入可交互状态 | 待人工验收 | - |
| 后端未就绪时 UI 提示 | 不假装成功 | 待人工验收 | - |

### 4.2 热键契约与运行时恢复

本节用于覆盖热键注册的中间模块测试，不以业务端到端验收替代类型层、持久化层、Tauri invoke 层和 Rust runtime 层校验。

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| `HotkeyBinding` 结构唯一 | 类型与代码链核对 | 已通过 | 2026-04-02：当前主链统一使用 `HotkeyBinding={ keys, display }` |
| 前端设置页录制链存在 | `HotkeySettings.tsx` 代码链核对 | 已通过 | 2026-04-03：设置页已覆盖浏览器 keydown/keyup 录制、`normalizeBrowserCapturedVk`、draft/apply trace 和 suspend/resume 调用 |
| 前端持久化与迁移链存在 | `appStore.ts` 代码链核对 | 已通过 | 2026-04-03：`normalizeHotkeyBinding`、`migrateLegacyHotkeyBinding`、store 持久化字段与当前结构一致 |
| Tauri invoke 封装存在 | `tauri.ts` 代码链核对 | 已通过 | 2026-04-03：已封装 `registerHotkeyBinding`、`suspendHotkeyRuntime`、`resumeHotkeyRuntime`、`debugHotkeyLog` |
| 前端事件桥接存在 | `useHotkey.ts` 代码链核对 | 已通过 | 2026-04-03：已绑定 `hotkey-start-recording` / `hotkey-stop-recording` / `hotkey-cancel` 和 overlay 相关事件 |
| 旧热键结构未重新进入主链 | 搜索与代码校验 | 已通过 | 2026-04-02：旧结构仅保留在 `appStore.ts` 的迁移辅助类型 `LegacyHotkeyBinding`，未重新进入 invoke/runtime 主链 |
| Rust binding 规范化存在 | `hotkey.rs` 代码链核对 | 已通过 | 2026-04-03：`sanitize_binding`、`normalize_binding_keys`、`display_from_keys` 负责 runtime 侧 canonical hotkey 结构 |
| `Right Alt` 对 AltGr 变体容错存在 | Rust 单元测试 | 已通过 | 2026-04-03：新增 `binding_matches_pressed` 单测，确认单键 `0xA5` 同时接受 `{A5}`、`{A2+A5}`、`{A3+A5}`，两键绑定仍保持严格匹配 |
| Rust hook/runtime 状态机存在 | `hotkey.rs` 代码链核对 | 已通过 | 2026-04-03：runtime 内含 `pressed_keys`、`is_hotkey_active`、`suspended`、`long_press_generation` 和低层 hook 更新路径 |
| runtime suspend/resume trace 存在 | 日志与代码校验 | 已通过 | 2026-04-02：确认 `HotkeySettings.tsx -> tauri.ts -> hotkey.rs` 存在 `suspend_hotkey_runtime` / `resume_hotkey_runtime(trace_id, reason)` 诊断链 |
| shared hotkey log 记录毫秒级时间线 | 日志格式校验 | 已通过 | 2026-04-02：`voicescribe-hotkey.log` 使用 `[epoch_seconds.millis]` 格式，实测存在 `1775124916.082` 这类毫秒级时间戳 |
| `VoiceScribe` 主窗口聚焦时 `Right Alt` 原始上报诊断存在 | `hotkey.rs` 代码链核对 + `cargo check` | 已通过 | 2026-04-03：新增 `foreground_alt_raw` 日志，只在前台窗口属于 `VoiceScribe` 主窗口且事件涉及 `Alt/Right Alt` 时记录 `message/vk/scan/flags/normalized_vk/title`，用于对比 VSCode 与应用窗口的原始上报差异 |
| `VoiceScribe` 主窗口前台存在 `Right Alt` 前端兜底链 | `useHotkey.ts` / `HotkeySettings.tsx` / `appStore.ts` 代码链核对 + `npm run build` | 已通过 | 2026-04-03：新增主窗口前台 `AltRight keydown/keyup` 兜底路径，仅在单键 `Right Alt` 绑定下生效；包含 350ms 长按阈值、250ms native event 去重，以及 `hotkeyCaptureActive` 隔离，避免与设置页录制热键冲突 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| stale key recovery | 不再误触发旧热键 | 待人工验收 | - |
| settings capture suspend | 录制期间不误触发运行时匹配 | 待人工验收 | - |
| startup/apply trace diagnostics | 日志可辅助真实定位 | 待人工验收 | - |
| `VoiceScribe` 主窗口前台 `Right Alt` 兜底行为 | 点击主窗口后按 `Right Alt` 仍可开始/停止录音，且不依赖切到 VSCode | 已通过 | 2026-04-03：用户真机确认主窗口前台 `Right Alt` 可开始/停止录音，原问题已消失 |

### 4.3 模型路径、目录完整性与 registry

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| 主模型路径保持在 `<repo>/models/` | 配置与实际目录校验 | 已通过 | 2026-04-02：mock backend `/models` 返回的 `cache_paths.model_root` 指向当前仓库 `D:\\learn\\AIGC\\voicescribe\\0324\\voicescribe\\models` |
| registry 与目录状态一致 | 读取 `voicescribe_models.json` + 本地目录 | 已通过 | 2026-04-02：`bad_registry_count=0`、`missing_count=0`，当前 registry 条目都落在仓库 `models/` 下且路径存在 |
| 已移除模型不会继续标记 `available=true` | service / API 校验 | 已通过 | 2026-04-03：删除 `pyannote-3.1` 支持并清理本地目录后，`list_models()` 不再返回该模型；`models/voicescribe_models.json` 里的 diarization bucket 也不再包含该条目 |
| stale registry 可被清理 | 单点调用 / 文件校验 | 已通过 | 2026-04-03：`ModelRegistryService.clean_registry_entries()` 已做严格 canonical 清理；`speaker -> speaker_mapping`、`cam++ -> campp` 已归并，`qwen3asr`、`firered`、`firered2` 等历史 bucket 已从文件移除 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 引擎页显示与本地真实状态一致 | 不出现假下载/假可用 | 待人工验收 | - |

### 4.4 token 存储链

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| token 读写命令可编译 | `cargo check` | 已通过 | 2026-04-02：`cargo check` 通过，`cargo test model_download_token_roundtrip_works` 通过 |
| token 不进入普通 settings / registry / 文档 | 文件与代码校验 | 已通过 | 2026-04-03：`voicescribe_models.json` 与真实 `C:\\Users\\DingK\\AppData\\Roaming\\com.voicescribe.desktop\\voicescribe-settings.json` 均不含 token 字段；token 仍走 Windows Credential Manager |
| 当前支持矩阵无 token 依赖模型 | 代码与接口校验 | 已通过 | 2026-04-03：删除 `pyannote-3.1` 后，当前工作树中已无需要下载 token 的模型；token 存储基础设施保留但不再被现有模型矩阵使用 |
| 下载链可从 Tauri token 命令取值 | 代码链核对 | 已通过 | 2026-04-02：确认 `EngineSettings.tsx -> api/tauri.ts(get/save/delete token) -> commands/credentials.rs -> api/backend.ts downloadModel(token)` 调用链存在 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 保存 token 后再次下载 | 页面可复用已存 token | 待人工验收 | - |
| 缺 token 时下载 | 提示明确 | 待人工验收 | - |

### 4.5 说话人与 diarization 运行时

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| `speaker.py` 可导入 | `python -m compileall backend` | 已通过 | 2026-04-02：`backend/venv/Scripts/python.exe -m compileall backend` 通过，`SpeakerDiarizer` 可实例化 |
| 不支持的分离模型会明确失败 | 单点调用 `ensure_diarization_loaded` | 已通过 | 2026-04-03：删除 `pyannote-3.1` 支持后，实测 `ensure_diarization_loaded('pyannote-3.1')` 直接返回 `Unsupported diarization model: pyannote-3.1`，不再进入隐式坏路径 |
| `3D-Speaker` 真实加载结果明确 | 单点调用 `ensure_diarization_loaded('3d-speaker')` | 未通过 | 2026-04-03：当前 bundle 仅包含 speaker embedding + VAD，VoiceScribe 尚无可运行的 3d-speaker diarization integration；已改成返回明确 runtime 不可用错误 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| `3D-Speaker` 真实加载 | 可真实运行 | 待人工验收 | - |

### 4.6 历史与持久化对象

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| `HistoryRecord` 字段与后端持久化一致 | 类型与对象校验 | 已通过 | 2026-04-02：前端 `types/index.ts` 的 `HistoryRecord/HistorySpeakerEntry` 与后端 `HistoryRecordPayload/HistorySpeakerEntry` 字段一致 |
| `history.json` 读写逻辑可导入 | `python -m compileall backend` | 已通过 | 2026-04-02：`compileall` 通过，`HistoryService` 读写 `{\"records\": [...]}` 包装结构 |
| retainAudio 开关影响导出能力 | 代码与对象校验 | 已通过 | 2026-04-02：`HistoryService.delete_audio_file()` 仅在 `retain_audio=true` 且存在 `audio_path` 时删除音频文件 |
| 设置文件字段与 store 一致 | settings 文件与前端类型校验 | 已通过 | 2026-04-03：已读取真实 `C:\\Users\\DingK\\AppData\\Roaming\\com.voicescribe.desktop\\voicescribe-settings.json`；`settings` 下与 `AppSettings` 对应的必需字段 `selectedEngine/engineSelections/language/enableDiarization/outputMode/hotwords/enableAIRefine/enableStreaming/enableAISummary/retainAudio/launchAtLogin/hotkeyBinding` 全部存在，且无额外漂移字段 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 设置重启后保留 | 关键设置可恢复 | 待人工验收 | - |
| 历史页与实际文件一致 | 页面展示不失真 | 待人工验收 | - |

### 4.7 启动 warning 与环境依赖

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| `jieba` warning 状态 | 启动日志检查 | 已通过 | 2026-04-03：mock backend 启动 stderr 中已不再出现 `pkg_resources is deprecated as an API` |
| `ffmpeg` 缺失 warning 状态 | 启动日志检查 | 已通过 | 2026-04-03：项目内 `tools/ffmpeg/bin` 已接入启动环境；mock backend 启动日志中不再出现 `Couldn't find ffmpeg or avconv` 或 `ffmpeg is not installed` |
| `whisper.cpp` / `Parakeet` 启动提示状态 | 启动日志检查 | 已通过 | 2026-04-03：mock backend 启动日志中两者已从 `[Warning]` 降为 `[Notice]`，作为能力提示保留 |
| warning 是否已被收口或明确降级 | 启动日志与代码校验 | 已通过 | 2026-04-03：`jieba` 弃用警告已 suppress，`ffmpeg` 缺失 warning 已收口，`whisper.cpp` / `Parakeet` 已降级为 notice 级提示 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 实际启动体验 | warning 不干扰主要使用 | 待人工验收 | - |

### 4.8 快速测试启动脚本

#### 我可自行测试

| 检查项 | 方法 | 当前状态 | 最近结果 |
|---|---|---|---|
| 脚本存在并可执行 | 脚本检查 / 命令执行 | 已通过 | 2026-04-03：新增 `scripts/start_windows_quick_test.bat`，文件存在且可执行 |
| 脚本不重复执行完整 build | 读脚本与执行日志 | 已通过 | 2026-04-03：脚本日志明确输出 `Quick test launch: reusing existing release executable without tauri build...`，未走 `tauri build` |
| 脚本可拉起需要的测试环境 | 本地命令验证 | 已通过 | 2026-04-03：执行脚本后 `voicescribe-desktop` 进程成功拉起，说明可复用现有 release exe 进入快速复测链 |

#### 你手动测试

| 检查项 | 预期 | 当前状态 | 最近结果 |
|---|---|---|---|
| 体感启动耗时 | 明显快于正式启动脚本 | 待人工验收 | - |

## 5. 当前重点待测顺序

基于 [BUGS.md](/D:/learn/AIGC/voicescribe/0324/voicescribe/docs/BUGS.md)，优先补测顺序建议为：

1. 热键冷启动 `Right Alt`
2. 热键 Apply 后恢复链
3. `3D-Speaker` 下载后真实加载与转录
4. `3D-Speaker` 真实加载 / 真实 diarization

## 6. 当前测试结论写法

当前项目状态应写成：

- 某项“已通过”：仅当对应检查项已完成并写入本文件
- 某项“待人工验收”：仅当自动化或静态验证已做，但 Windows 真机行为未确认
- 某项“未通过”：仅当已经执行过测试且结果不符合预期
- 某项“未测试”：尚未执行

不应写成：

- “全部完成”
- “全部已修复”
- “全部已验证”

## 7. 2026-06-13 Typeless 文本处理首轮测试记录

### 7.1 自动化与构建

| 检查项 | 当前状态 | 最近结果 |
|---|---|---|
| 后端文本处理与路径守卫单元测试 | 已通过 | `backend/venv/Scripts/python.exe -m unittest discover -s tests -v`：11 项通过，包含 provider、SDK 超时中断、回退、仓库模型路径、旧历史迁移测试 |
| 后端静态导入 | 已通过 | `python -m compileall .` 通过 |
| 前端生产构建 | 已通过 | `npm ci` 后执行 `npm run build` 通过 |
| Rust 编译 | 已通过 | `cargo check` 通过 |
| Rust expanded transcribe payload 测试 | 已通过 | `cargo test transcribe_command_accepts_expanded_payload -- --nocapture` 通过 |
| Rust 全仓格式检查 | 未通过 | `cargo fmt --check` 仍报告多个既有文件格式差异；本轮修改的 `backend.rs` 已单独格式化 |

### 7.2 Provider 真实与 adapter 验证

| 检查项 | 当前状态 | 最近结果 |
|---|---|---|
| Claude CLI 无头轻度润色 | 已通过 | 真实调用返回 `Hello there, this is a simple test.`，约 4.2 秒；用户转写通过 stdin 传入，禁用工具并启用 safe mode |
| Codex CLI 无头轻度润色 | 已通过 | 真实调用返回 `Hello there. This is a simple test.`，约 22.8 秒；使用 ephemeral/read-only 模式 |
| Codex Python SDK 无头轻度润色 | 已通过 | `openai-codex==0.1.0b3` 真实调用返回 `Hello there. This is a simple test.`，两次约 15.3 秒和 20.6 秒；超时中断分支另有单元测试 |
| OpenAI-compatible adapter | 已通过 | 单元测试确认 `/chat/completions` 请求和结果解析；尚未用真实本地模型推理 |
| Ollama 真实本地模型 | 未测试 | `ollama list` 当前为空，本轮未下载模型 |

### 7.3 跨层 API 与数据契约

| 检查项 | 当前状态 | 最近结果 |
|---|---|---|
| mock `/health` 文本处理能力与模型路径 | 已通过 | 返回四个 provider，模型根目录为 `G:\AI_projects\voicescriber\models` |
| mock `/transcribe` raw profile | 已通过 | `status=skipped` 且 `raw_text == text` |
| provider 失败回退 | 已通过 | 缺失 provider 时 `status=fallback`、保留原文并返回明确 warning |
| 旧 history 记录迁移 | 已通过 | 缺少新字段的记录读取后补齐 `raw_text` 与 `text_processing=raw/skipped` |
| 通用设置页文本处理控件 | 已通过 | 本地 Vite 页面确认：`raw` 时 Provider 禁用，切换到 `light` 后 Provider 启用，选择 `openai_compatible` 后显示模型和默认 `http://127.0.0.1:11434/v1` endpoint |
| Windows 桌面完整闭环 | 待人工验收 | 设置页选择 provider/profile、热键录音、真实转写、文本处理、外部输入框输出和历史展示尚需真机验收 |
