# Cancellable Text Processing Tasks

Updated: 2026-06-14

## Product Goal

During the visible `polishing` stage, the user must be able to cancel the active
text-processing task without outputting or persisting a result that arrives later.

This slice implements real process/session interruption for Claude CLI, Codex CLI,
and Codex SDK. OpenAI-compatible cancellation discards the task result and closes
the VoiceScribe task immediately; whether the local model server stops generation
immediately depends on that server's HTTP disconnect/cancellation behavior.

ASR/transcribing and outputting cancellation remain later work because their
runtime contracts are separate.

## Single Source Of Truth

Backend `TextProcessingTaskService` owns canonical task state:

`pending | running | completed | fallback | cancelled | failed`

The frontend stores only the active task ID needed to issue cancellation and
maps backend terminal state into the existing pipeline UI.

## Input / Output Contract

### Start task

`POST /text/tasks`

Input is the existing text-processing JSON contract. Output:

```json
{"task_id": "uuid", "status": "pending"}
```

### Read task

`GET /text/tasks/{task_id}`

Output:

```json
{
  "task_id": "uuid",
  "status": "completed",
  "result": {"...": "TextProcessingResult"},
  "error": null
}
```

`result` exists only for `completed` or `fallback`.

### Cancel task

`DELETE /text/tasks/{task_id}`

Sets the task cancellation event and returns the current task snapshot. Repeated
cancel calls are idempotent.

## Provider Cancellation Contract

- Claude CLI and Codex CLI: provider execution uses a hidden child process;
  cancellation terminates the process tree and raises `TextProcessingCancelled`.
- Codex SDK: cancellation calls `turn.interrupt()` and raises
  `TextProcessingCancelled`.
- OpenAI-compatible: VoiceScribe marks the task cancelled and discards any late
  response. Immediate model-server compute cancellation is not guaranteed in this
  slice.
- Cancellation is not converted into ordinary fallback, because cancelled text
  must not be output or written to history.

## Affected File List

- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/ROADMAP.md`
- `docs/TEST.md`
- `docs/BUGS.md`
- `docs/TEXT_PROCESSING_CANCELLATION_DESIGN.md`
- `backend/services/text_processing_service.py`
- `backend/services/text_processing_task_service.py`
- `backend/server.py`
- `backend/tests/test_text_processing_service.py`
- `backend/tests/test_text_processing_task_service.py`
- `backend/tests/test_pipeline_routes.py`
- `tauri-app/src/types/index.ts`
- `tauri-app/src/api/backend.ts`
- `tauri-app/src/lib/recordingFlow.ts`
- `tauri-app/src/components/RecordingOverlay.tsx`

## Affected Runtime Paths

Start and poll:

`recordingFlow.ts -> backend.ts -> POST /text/tasks
-> TextProcessingTaskService -> TextProcessingService -> provider`

Cancel:

`hotkey/tray/Overlay cancel -> abortRecordingSession
-> DELETE /text/tasks/{id} -> task cancel event
-> CLI terminate / SDK interrupt -> cancelled terminal state`

## Affected Persisted Objects

- Settings: unchanged.
- Model registry and model paths: unchanged; no downloads.
- History and transcription results: cancelled polishing tasks write nothing.
- Token storage: unchanged.
- Logs: task ID/provider/status only; no user text or command path.

## Old-Logic Removal List

- Desktop polishing no longer calls synchronous `POST /text/process`.
- Remove the current “processing stage does not support cancel” toast for
  `polishing`.
- Do not convert `TextProcessingCancelled` into fallback.
- Do not output or persist a late result from a cancelled task.
- Keep synchronous `/text/process` for compatibility and focused diagnostics.

## Failure Branches

- Cancel before worker starts: task becomes cancelled and provider is not invoked.
- Cancel while CLI runs: child process tree is terminated.
- Cancel while Codex SDK runs: active turn is interrupted.
- Cancel after terminal completion: terminal result remains authoritative.
- Unknown task ID: API returns 404.
- Provider failure without cancel: existing fallback behavior remains.
- Poll transport failure: desktop uses existing raw-text transport fallback unless
  a local cancellation was already requested.
- Cancelled after raw ASR: no output/history; temporary audio is deleted.
- App closes/backend stops: in-memory task registry is discarded.

## Acceptance Criteria

- Non-raw polishing starts through task API and polls to a terminal result.
- Overlay exposes cancel during `polishing`.
- Cancelling polishing produces pipeline `cancelled`, no output, and no history.
- Claude/Codex CLI process runner terminates on cancel.
- Codex SDK runner interrupts on cancel.
- Cancelled tasks never become fallback or completed later.
- Raw Profile behavior is unchanged.
- Sync `/text/process` compatibility remains.
- Python tests, frontend build, mock task API smoke, and cancellation behavior are
  recorded in `docs/TEST.md`.
