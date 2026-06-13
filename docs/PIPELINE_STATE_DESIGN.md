# Phase C: Visible Processing Pipeline

Updated: 2026-06-13

## Product Goal

VoiceScribe must expose the real post-recording pipeline instead of presenting ASR,
text polishing, and desktop output as one opaque "transcribing" wait.

The first Phase C slice introduces a truthful desktop sequence:

`recording -> transcribing -> polishing (when enabled) -> outputting -> completed`

This slice does not add streaming provider output or mid-request cancellation. Those
remain later Phase C work.

## Two-Pass Review Summary

Pass 1 found that `recordingFlow.ts` currently performs one Tauri `transcribe`
invoke and only exposes a boolean `isTranscribing`. The backend `/transcribe`
route performs both ASR and text processing before returning, so the frontend
cannot know when polishing actually starts.

Pass 2 checked the connected modules and confirmed that the change also affects:

- the Overlay state contract and UI
- the main-window status label
- Tauri multipart request construction and Rust response types
- FastAPI request compatibility
- final result merging, history persistence, warnings, and external text output
- raw-profile behavior, provider-failure fallback, mock mode, and legacy callers

## Single Source Of Truth

The frontend `appStore.pipeline` object owns the current user-visible pipeline
stage and elapsed stage timings for the active desktop task.

The backend remains the source of truth for the raw ASR result, text-processing
result, provider duration, and provider warning/fallback status.

The persisted transcription and history objects remain the source of truth for
raw and final text. Ephemeral UI stage timings are not persisted in this slice.

## Input / Output Contract

### Desktop raw transcription request

The Tauri `transcribe` command sends `defer_text_processing=true` for the desktop
pipeline. `/transcribe` still returns the existing `TranscribeResult` shape, but:

- `raw_text == text`
- `text_processing.status == "skipped"`
- `text_processing.profile == "raw"`
- the normalized target context remains attached
- no configured provider is invoked

The FastAPI default remains `defer_text_processing=false`, preserving the current
combined behavior for legacy callers.

### Independent text processing request

New JSON endpoint: `POST /text/process`

Input:

```json
{
  "text": "raw ASR text",
  "profile": "light",
  "provider": "claude_cli",
  "model": "",
  "base_url": "",
  "target_language": "",
  "hotwords": "VoiceScribe, Typeless",
  "target_context": {
    "app_kind": "chat",
    "executable_name": null,
    "captured_at": "2026-06-13T12:00:00Z"
  }
}
```

Output is the existing `TextProcessingResult` object. Provider failure returns
`status="fallback"` and the original text instead of failing the desktop task.

### Final result merge

The desktop flow replaces only `text`, `text_processing`, and warning fields on
the raw `TranscribeResult`. ASR segments, engine/model metadata, speaker metadata,
and duration remain from the raw transcription result.

## Pipeline State Contract

```text
idle | recording | transcribing | polishing | outputting |
completed | cancelled | error
```

`pipeline.timings` records elapsed milliseconds for completed active stages:

- `recording_ms`
- `transcribing_ms`
- `polishing_ms`
- `outputting_ms`
- `total_ms`

Changing stages closes the prior stage timer. Starting `recording` resets all
timings. The raw profile transitions directly from `transcribing` to
`outputting`, with no fake `polishing` stage.

## Affected File List

- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/ROADMAP.md`
- `docs/TEST.md`
- `docs/BUGS.md`
- `docs/PIPELINE_STATE_DESIGN.md`
- `backend/server.py`
- `backend/tests/test_text_processing_service.py` or a focused route/service test
- `tauri-app/src/types/index.ts`
- `tauri-app/src/stores/appStore.ts`
- `tauri-app/src/api/backend.ts`
- `tauri-app/src/api/tauri.ts`
- `tauri-app/src/lib/recordingFlow.ts`
- `tauri-app/src/lib/overlayWindow.ts`
- `tauri-app/src/components/Layout.tsx`
- `tauri-app/src/components/RecordingOverlay.tsx`
- `tauri-app/src/components/ShellHeader.tsx`
- `tauri-app/src/hooks/useBackendConnection.ts`
- `tauri-app/src/hooks/useHotkey.ts`
- `tauri-app/src/hooks/useTrayEvents.ts`
- `tauri-app/src-tauri/src/commands/backend.rs`

## Affected Runtime Paths

Raw ASR:

`recordingFlow.ts -> tauri.ts -> backend.rs -> POST /transcribe
-> ASR/diarization runtime -> raw TranscribeResult`

Polishing:

`recordingFlow.ts -> backend.ts -> POST /text/process
-> TextProcessingService -> configured local/headless provider
-> TextProcessingResult`

Output and persistence:

`recordingFlow.ts -> output_text -> target window/clipboard`

`recordingFlow.ts -> appStore/history API -> HistoryService`

Visible state:

`recordingFlow.ts -> appStore.pipeline + overlayWindow.ts
-> ShellHeader.tsx + RecordingOverlay.tsx`

## Affected Persisted Objects

- Settings: unchanged; existing text-processing settings drive the new request.
- Model registry: unchanged.
- History records: shape unchanged; must still contain raw text, final text,
  text-processing result, and target context.
- Transcription result objects: shape unchanged; assembled from raw ASR plus the
  independent processing result.
- Token storage: unchanged.
- Logs: stage transitions and independent processing failures should be visible,
  without logging user text.

## Old-Logic Removal List

- Remove `isTranscribing` and `setTranscribing` as the visible pipeline state.
- Remove desktop reliance on server-side text processing inside `/transcribe`.
- Do not add a timer-based or guessed `polishing` state.
- Do not duplicate final-result/history construction in a second path.
- Keep combined `/transcribe` processing only as a compatibility path for callers
  that do not send `defer_text_processing=true`.

## Failure Branches

- Empty ASR text: processing returns skipped; output/history still complete.
- Raw profile: skip `/text/process` and skip the visible polishing stage.
- Provider unavailable, timeout, or malformed output: processing returns fallback,
  original text is output and persisted, warning is shown.
- `/text/process` transport failure: desktop constructs a fallback result locally,
  outputs/persists raw text, and records a warning.
- Output failure: pipeline becomes `error`; existing Rust clipboard fallback
  behavior remains authoritative.
- History refresh failure after output: task becomes `error` and the error remains
  visible; no second output attempt is made.
- Short recording: cancel before transcribing and return to `idle`.
- Recording cancellation: pipeline becomes `cancelled`.
- Startup/backend race: existing Tauri transcription retries remain unchanged.
- Legacy caller: omitting `defer_text_processing` preserves combined behavior.
- Windows target snapshot failure: target context remains null and does not block
  any stage.

## Acceptance Criteria

- A non-raw desktop task visibly follows
  `recording -> transcribing -> polishing -> outputting -> completed`.
- A raw-profile task never displays `polishing`.
- `/transcribe` with `defer_text_processing=true` does not invoke a configured
  provider and returns raw/skipped text processing.
- `/transcribe` without the flag preserves current combined behavior.
- `/text/process` uses configured provider/profile/context inputs and returns the
  existing `TextProcessingResult` contract.
- Provider and transport failures output and persist raw text with a warning.
- History still stores the same raw/final/context objects.
- Main window and Overlay display the same active stage.
- Stage elapsed timings are populated for completed stages.
- Python tests, frontend build, Rust check, and focused Rust request-contract test
  pass and are recorded in `docs/TEST.md`.

## Deferred Phase C Work

- streaming provider partial text in the Overlay
- incremental insertion into the target application
- cancellation of an active ASR/provider/output request
- persisted latency analytics and provider benchmarking
