# VoiceScribe 上下文感知文本处理设计

更新时间：2026-06-13
状态：Phase B 首轮已实现，待 Windows 真机验收

## 1. Product Goal

让文本处理知道用户开始录音时正在使用哪一类应用，从而生成更适合目标场景的文本，同时保持本地优先、最小采集和失败回退。

首轮只采集目标窗口的应用类别，不读取选区、页面正文、聊天内容或完整窗口标题。选区编辑属于后续独立功能，必须显式触发。

## 2. Single Source of Truth

| 状态 | 单一事实源 |
|---|---|
| 录音开始时的目标窗口 | Rust `text_input.rs` 保存的 target context snapshot |
| 应用类别识别 | Rust `text_input.rs` 的本地规则 |
| 是否允许应用上下文参与处理 | `AppSettings.useAppContext` |
| 单次使用的上下文 | `TextProcessingResult.target_context` 与 history record |
| Profile / Provider | 继续由 Phase A 的设置与后端服务负责 |

## 3. Input / Output Contract

```text
TargetContext
- app_kind: code | chat | email | document | browser | terminal | other | unknown
- executable_name: string | null
- captured_at: ISO-8601 string
```

约束：

- 不保存 HWND、PID、完整可执行路径或窗口标题。
- `executable_name` 只保留文件名，并限制长度。
- VoiceScribe 自身窗口返回 `unknown`。
- 上下文只作为格式提示，必须被标记为不可信数据。
- 捕获失败时返回 `unknown`，不得阻断录音或转写。

## 4. Affected File List

### 文档

- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/TEST.md`
- `docs/BUGS.md`
- `docs/ROADMAP.md`
- `docs/CONTEXT_AWARE_DESIGN.md`

### 前端 / 状态 / 持久化

- `tauri-app/src/types/index.ts`
- `tauri-app/src/stores/appStore.ts`
- `tauri-app/src/pages/GeneralSettings.tsx`
- `tauri-app/src/api/tauri.ts`
- `tauri-app/src/lib/recordingFlow.ts`
- `tauri-app/src/pages/HistoryPage.tsx`

### Tauri / Windows

- `tauri-app/src-tauri/src/commands/text_input.rs`
- `tauri-app/src-tauri/src/commands/audio.rs`
- `tauri-app/src-tauri/src/commands/backend.rs`
- `tauri-app/src-tauri/src/lib.rs`

### Backend

- `backend/server.py`
- `backend/services/text_processing_service.py`
- `backend/postprocess/text_processing_prompts.py`
- `backend/services/history_service.py`

## 5. Affected Runtime Paths

捕获链：

`hotkey/main window -> start_recording -> audio.rs -> text_input.rs remember_target_context`

处理链：

`recordingFlow.ts -> get_target_context -> tauri.ts -> text_input.rs -> transcribe payload -> backend.rs -> server.py -> TextProcessingService -> provider`

持久化链：

`TranscribeResult -> recordingFlow.ts -> HistoryRecord -> history_service.py -> HistoryPage.tsx`

## 6. Affected Persisted Objects

| 对象 | 影响 |
|---|---|
| settings | 增加 `useAppContext`，默认关闭 |
| transcription result | `text_processing` 增加可选 `target_context` |
| history records | 增加可选 `target_context` |
| model registry | 无变化 |
| token storage | 无变化 |
| logs | 只记录 `app_kind`，不记录完整标题、路径或正文 |

## 7. Old-Logic Removal List

- 把 `PREVIOUS_WINDOW` 从单独 HWND 状态升级为一个目标快照，避免输出窗口与上下文各自维护不同事实。
- 删除任何在转录停止时重新读取当前前台窗口的方案；Overlay 或主窗口可能已抢占焦点。
- 不引入通过剪贴板模拟 `Ctrl+C` 的隐式选区读取路径。

## 8. Context Policy

首轮上下文只影响 Prompt 的语气提示：

| app_kind | 提示 |
|---|---|
| code / terminal | 保留技术术语、命令、标识符和结构 |
| chat | 保持自然、简洁、可直接发送 |
| email | 使用清晰、礼貌、完整的书面表达 |
| document | 使用有段落结构的完整书面表达 |
| browser / other / unknown | 不增加额外风格规则 |

应用类别不会覆盖用户显式选择的 Profile，也不会让 Provider 执行口述指令。

## 9. Failure Branches

| 分支 | 行为 |
|---|---|
| Windows API 获取失败 | `unknown`，继续转写 |
| 录音从 VoiceScribe 主窗口开始 | `unknown` |
| 应用在录音期间切换 | 使用录音开始时快照 |
| `useAppContext=false` | 不向 backend/provider 发送上下文 |
| 旧 settings/history | 默认关闭；缺少 context 视为 `null` |
| Provider 失败 | 延续 Phase A：保留原始转写 |
| 非 Windows 平台 | `unknown` |

## 10. Acceptance Criteria

自动验证：

1. `remember_target_context` 与输出粘贴使用同一个目标窗口快照。
2. 应用类别规则有 Rust 单元测试。
3. 完整路径、标题、PID、HWND 不进入前端请求、日志或 history。
4. 上下文关闭时 Prompt 不包含应用提示。
5. 上下文开启且 app kind 已知时，Prompt 包含对应的最小风格提示。
6. 旧 settings/history 可读取。
7. Python、TypeScript 和 Rust 构建/测试通过，并写入 `docs/TEST.md`。

人工验证：

1. 从聊天、代码编辑器和邮件应用开始录音时，history 显示正确应用类别。
2. 切换窗口后停止录音仍使用开始录音时目标。
3. 文本仍能粘贴回开始录音时目标窗口。
