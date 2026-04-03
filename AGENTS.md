# AGENTS.md

Repository: `voicescribe`
Default branch: `0325main`

Read these first:
1. `docs/PRD.md`
2. `docs/SPEC.md`
3. `docs/TEST.md`
4. `docs/BUGS.md`

Priority: `PRD/SPEC/TEST/BUGS > code`

Workflow:
- Update docs before code.
- Test before reporting.
- Write new test results into `docs/TEST.md` before claiming something is tested.
- Write new bugs and unresolved items into `docs/BUGS.md`.
- Packaging is a final-stage task unless it blocks earlier debugging.

Bug repair rule:
- When a bug is discovered during testing and the fix is local, low-risk, and clearly scoped, fix it immediately in the same round and record both the bug and the repair outcome.
- If two consecutive repair attempts for the same bug do not close it, write the current cause analysis into `docs/BUGS.md` before continuing with other tests.
- If four consecutive self-repair attempts for the same bug still fail, stop active repair for that bug in the current round, keep it recorded in `docs/BUGS.md`, and report it in the final summary.
- Do not quietly retry the same repair path without updating the recorded understanding of the failure.

Historical docs rule:
- Historical phase docs are no longer kept in the working tree.
- If a task explicitly requires old phase context, inspect Git history instead of expecting archived docs on disk.
- Do not recreate large date-based doc trees in `docs/`.

Model path rule:
- Active model/cache root must stay under `<repo>/models/`.
- Do not switch the runtime back to user-profile default caches as the primary path.

VoiceScribe cross-layer audit rule:
- For any feature that touches engine selection, model management, speaker diarization, speaker mapping, transcription requests, token download flow, or Windows desktop behavior, do not freeze docs or start implementation after checking only the visible page.
- In this repository, one feature may span: frontend page, shared types, store/settings persistence, recording/transcription flow, backend API wrapper, Tauri invoke wrapper, Rust command layer, FastAPI route layer, backend runtime/service layer, history/result persistence layer, model registry/model path logic, and Windows-native capability logic.
- Before finalizing `FEATURE_REQUEST.md`, `SPEC.md`, or `DESIGN.md`, perform a cross-layer impact audit against the real repository structure.

Minimum required files to inspect when the feature affects engines, models, or transcription:
- `tauri-app/src/pages/EngineSettings.tsx`
- `tauri-app/src/pages/GeneralSettings.tsx`
- `tauri-app/src/stores/appStore.ts`
- `tauri-app/src/stores/modelStore.ts`
- `tauri-app/src/types/index.ts`
- `tauri-app/src/lib/recordingFlow.ts`
- `tauri-app/src/api/backend.ts`
- `tauri-app/src/api/tauri.ts`
- `tauri-app/src-tauri/src/lib.rs`
- `tauri-app/src-tauri/src/commands/backend.rs`
- `backend/server.py`
- `backend/diarization/speaker.py`
- `backend/engines/*.py`
- history/export related backend and frontend objects
- model registry/model path related backend helpers

Required impact sections for cross-layer docs:
- `Affected File List`
- `Affected Runtime Paths`
- `Affected Persisted Objects`
- `Old-Logic Removal List`

`Affected Runtime Paths` should describe the real execution chain in this repo, for example:
- `EngineSettings.tsx -> appStore.ts -> recordingFlow.ts -> tauri.ts -> backend.rs -> server.py -> speaker.py`

`Affected Persisted Objects` must explicitly check:
- settings
- model registry
- history records
- transcription result objects
- token storage
- logs

VoiceScribe request/result consistency rule:
- If a feature changes transcription inputs, model selection inputs, load inputs, or download inputs, also check whether the same change is required in frontend shared types, Tauri command payloads, backend request models, response/result objects, history records, settings persistence, logs, and tests.
- Do not stop at request payload changes alone.

VoiceScribe hidden entry point rule:
- Do not assume `EngineSettings.tsx` is the only affected entry when the feature looks like an engine-page change.
- Also check whether the same behavior is used by `recordingFlow.ts`, preload/load actions, realtime/streaming flows, history writeback, export/download flows, and migration logic.
- If these paths are not checked, the design is still draft.

VoiceScribe large file rule:
- `backend/server.py` is a high-risk central file in this repository.
- When a feature touches engine catalog, model status, download/delete, load/transcribe, history persistence, or runtime orchestration, explicitly assess whether the feature should also include a gradual extraction plan from `backend/server.py` into service modules.
- Do not continue stacking major new business rules into `backend/server.py` without documenting the tradeoff.

Windows PowerShell UTF-8 rule:
- Do not treat console mojibake as proof that a file is damaged.
- When writing Chinese content from the shell, avoid raw Chinese literals inside PowerShell command strings.
- Prefer ASCII-safe scripts, Unicode escapes, and explicit UTF-8 writes.
- After writing Chinese content, verify by UTF-8 re-read instead of only checking console output.
