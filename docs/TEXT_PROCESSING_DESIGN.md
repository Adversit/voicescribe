# VoiceScribe 统一文本处理运行时设计

更新时间：2026-06-13
状态：Phase A 实施规格

## 1. 产品目标

把当前硬编码 Claude CLI 的 `AIRefiner` 替换为可配置、可测试、可观测的文本处理运行时。转写完成后，用户可选择处理 Profile，并由指定 Provider 在无头模式下生成最终文本。

本阶段只处理文本，不允许 Provider 执行用户口述中的任务、修改仓库或调用工具。独立 Agent 执行模式属于后续阶段。

## 2. Single Source of Truth

| 状态 | 单一事实源 |
|---|---|
| 用户选择的 Profile / Provider / 模型 / endpoint | `AppSettings` 持久化设置 |
| Provider 和 Profile 支持矩阵 | `backend/services/text_processing_service.py` |
| Prompt 正式模板 | `backend/postprocess/text_processing_prompts.py` |
| 单次处理结果 | 后端 `TextProcessingResult`，并进入 `TranscribeResult` |
| 原始与最终文本历史 | `HistoryRecord` / `history.json` |
| VoiceScribe 管理的模型路径 | `<repo>/models/` |

## 3. Input / Output Contract

### 3.1 文本处理请求

```text
TextProcessingRequest
- text: string
- profile: raw | light | structured | formal | translate
- provider: claude_cli | codex_cli | codex_sdk | openai_compatible
- model: string
- base_url: string
- target_language: string
- hotwords: string[]
- timeout_seconds: integer
```

约束：

- `raw` 不调用 Provider。
- `base_url` 只允许 HTTP(S) endpoint；默认本地 endpoint 为 `http://127.0.0.1:11434/v1`。
- 用户原文必须被标记为不可信内容，不能当作系统指令执行。
- CLI Prompt 通过 stdin 传入，不放入进程 argv。
- Claude CLI 使用无工具、无会话持久化的 print 模式。
- Codex CLI 使用 `exec --ephemeral --sandbox read-only`。
- Codex SDK 使用只读 sandbox。

### 3.2 文本处理结果

```text
TextProcessingResult
- raw_text: string
- text: string
- profile: string
- provider: string | null
- model: string | null
- status: skipped | processed | fallback
- duration_ms: integer
- warning: string | null
```

### 3.3 转写结果扩展

`TranscribeResult` 增加：

- `raw_text`
- `text_processing`

`text` 始终表示最终将输出到目标应用的文本。Provider 失败时，`text == raw_text`。

### 3.4 历史记录扩展

`HistoryRecord` 增加：

- `raw_text`
- `text_processing`

旧历史记录迁移规则：

- 缺少 `raw_text` 时，读取时使用旧 `text`。
- 缺少 `text_processing` 时，视为 `raw/skipped`。

## 4. Affected File List

### 文档

- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/TEST.md`
- `docs/BUGS.md`
- `docs/ROADMAP.md`
- `docs/TEXT_PROCESSING_DESIGN.md`

### 前端

- `tauri-app/src/types/index.ts`
- `tauri-app/src/stores/appStore.ts`
- `tauri-app/src/pages/GeneralSettings.tsx`
- `tauri-app/src/lib/recordingFlow.ts`
- `tauri-app/src/api/tauri.ts`
- `tauri-app/src/pages/HistoryPage.tsx`

### Tauri / Rust

- `tauri-app/src-tauri/src/commands/backend.rs`

### 后端

- `backend/server.py`
- `backend/config.py`
- `backend/services/text_processing_service.py`（新增）
- `backend/postprocess/text_processing_prompts.py`（新增）
- `backend/postprocess/ai_refiner.py`（删除）
- `backend/services/history_service.py`

### 测试

- `backend/tests/test_text_processing_service.py`（新增）
- `backend/tests/test_history_service.py`（新增）
- `app/VoiceScribe/Services/BackendService.swift` 等旧 Swift 客户端入口（已审查；本轮通过后端兼容字段保持可用，未迁移其 UI）
- Rust `transcribe_command_accepts_expanded_payload`
- 前端 TypeScript 构建

## 5. Affected Runtime Paths

### 普通转写与润色

`GeneralSettings.tsx -> appStore.ts -> recordingFlow.ts -> tauri.ts -> backend.rs -> server.py -> text_processing_service.py -> provider -> TranscribeResult -> output_text -> history`

### 实时摘要

`realtimeStream.ts -> backend.ts -> server.py -> text_processing_service.py`

本阶段实时摘要保持现有行为，但改用统一服务的后续迁移入口，不再新增 `AIRefiner` 依赖。

### 本地模型与缓存

`backend.rs -> VOICESCRIBE_ROOT / VOICESCRIBE_MODEL_DIR -> config.py -> backend engines/providers -> <repo>/models/`

## 6. Affected Persisted Objects

| 对象 | 影响 |
|---|---|
| settings | 增加 Profile、Provider、模型、endpoint、目标语言 |
| model registry | 不改 schema；继续只记录 `<repo>/models/` 下的 ASR/说话人模型 |
| history records | 增加 `raw_text` 与 `text_processing` |
| transcription result | 增加 `raw_text` 与 `text_processing` |
| token storage | 本阶段不新增 token 字段；CLI 使用本机已有登录态 |
| logs | 记录 Provider、Profile、耗时、状态；不得记录完整 prompt 或 token |

外部 Ollama 说明：

- VoiceScribe 不下载 Ollama 模型。
- 用户自行运行的 Ollama 进程可能使用外部默认模型目录，VoiceScribe 无法强制迁移。
- 后续由 VoiceScribe 管理 Ollama 进程时，必须设置 `OLLAMA_MODELS=<repo>/models/ollama`。

## 7. Old-Logic Removal List

- 删除 `backend/postprocess/ai_refiner.py`。
- 删除 `server.py` 对 `AIRefiner` 的导入与分支。
- 删除“只有出现英文热词才调用 Claude”的旧判断。
- 删除硬编码 `claude --model haiku --print <prompt argv>` 调用。
- 删除 `enable_ai_refine` 作为正式请求主链；仅在设置迁移中兼容旧字段。
- 修复 `recordingFlow.ts` 中损坏的中文 warning toast。

## 8. Failure Branches

| 分支 | 行为 |
|---|---|
| 空文本 | 返回 `skipped`，不调用 Provider |
| `raw` Profile | 返回 `skipped`，原文直接输出 |
| CLI 不存在 | 返回 `fallback`，输出原文并 warning |
| SDK 未安装 | 返回 `fallback`，输出原文并 warning |
| endpoint 不可用 | 返回 `fallback`，输出原文并 warning |
| Provider 超时 | 终止子进程，返回 `fallback` |
| Provider 返回空文本 | 返回 `fallback` |
| Provider 返回异常格式 | 返回 `fallback` |
| 转写失败 | 不进入文本处理 |
| 过短录音 | 不进入文本处理 |
| 启动竞态 | 设置迁移完成后才发起转写 |
| Windows CLI shim | 必须兼容 `.exe`、`.cmd`、`.bat` 和 PowerShell shim |
| Prompt injection | 原文只作为带边界标记的内容，Provider 不获得工具权限 |

## 9. Acceptance Criteria

自动验证：

1. `raw` Profile 不启动任何 Provider。
2. Claude CLI、Codex CLI、Codex SDK、OpenAI-compatible 都有独立 adapter 和明确可用性错误。
3. Provider 成功时返回原文和最终文本；失败时最终文本等于原文。
4. Prompt 通过 stdin 传递，CLI argv 不包含原始转写。
5. `TranscribeResult`、Tauri、前端类型和历史对象字段一致。
6. 旧 settings 与旧 history 可读取。
7. 模型根目录和主要缓存环境变量指向 `<repo>/models/`。
8. `python -m unittest`、`python -m compileall backend`、`npm run build`、`cargo fmt --check`、`cargo check` 通过。
9. 所有执行结果写入 `docs/TEST.md` 后才能声明已测试。

人工验证：

1. 启用任一 Provider 后，录音结果以最终文本输出到外部应用。
2. Provider 不可用时仍输出原始转写，并显示 warning。
3. 历史详情同时显示原始转写与最终文本。

## 10. Server Extraction Plan

`backend/server.py` 本阶段只负责：

- 解析表单字段
- 调用 `TextProcessingService`
- 把处理结果写入响应

Provider 发现、进程调用、Prompt 组装、HTTP 请求、超时和 fallback 全部放入新增 service/postprocess 模块。后续再把转写路由编排逐步抽离。
