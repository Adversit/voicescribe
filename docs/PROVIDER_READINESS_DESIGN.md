# Text Processing Provider Readiness

Updated: 2026-06-13

## Product Goal

Users must be able to determine whether a configured local/headless text-processing
provider is ready before finishing a recording. A readiness probe prevents a late
surprise where VoiceScribe waits for polishing and only then falls back.

This probe is diagnostic only. It must not run a real text transformation, create
an agent session, download a model, or move any model/cache outside `<repo>/models/`.

## Single Source Of Truth

`TextProcessingService` owns canonical provider readiness because it already owns
provider command resolution, SDK loading, OpenAI-compatible endpoint rules, and
the repository-local provider environment.

The frontend holds only the most recent ephemeral probe result for display. Probe
results are not persisted into settings or history.

## Input / Output Contract

New endpoint:

`POST /text/providers/probe`

Input:

```json
{
  "model": "qwen3:8b",
  "base_url": "http://127.0.0.1:11434/v1"
}
```

Output:

```json
{
  "providers": [
    {
      "provider": "claude_cli",
      "status": "ready",
      "latency_ms": 1,
      "detail": "Claude Code CLI is available"
    }
  ]
}
```

Allowed status values:

- `ready`: runtime and required configuration are available
- `unconfigured`: runtime endpoint is reachable but required model configuration is missing
- `unavailable`: runtime, command, SDK, endpoint, or configured model cannot be verified

## Provider Probe Rules

- `claude_cli`: resolve the `claude` command without launching it.
- `codex_cli`: resolve the `codex` command without launching it.
- `codex_sdk`: check whether the `openai_codex` Python package can be imported,
  without creating a Codex session.
- `openai_compatible`: validate the configured HTTP(S) base URL and request
  `<base_url>/models` with a short timeout. A configured model must appear in the
  returned model IDs for `ready`.
- Command paths and raw endpoint response bodies are not returned.
- Probe errors are shortened before returning to the frontend.
- Probe execution runs outside the FastAPI event loop.

## Affected File List

- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/ROADMAP.md`
- `docs/TEST.md`
- `docs/BUGS.md`
- `docs/PROVIDER_READINESS_DESIGN.md`
- `backend/services/text_processing_service.py`
- `backend/server.py`
- `backend/tests/test_text_processing_service.py`
- `backend/tests/test_pipeline_routes.py`
- `tauri-app/src/types/index.ts`
- `tauri-app/src/api/backend.ts`
- `tauri-app/src/pages/GeneralSettings.tsx`

## Affected Runtime Paths

`GeneralSettings.tsx -> backend.ts -> POST /text/providers/probe
-> server.py -> TextProcessingService.probe_providers`

This path is independent from recording, transcription, polishing, output, and
history persistence.

## Affected Persisted Objects

- Settings: read only; model and base URL are sent for the current probe.
- Model registry: unchanged.
- History records: unchanged.
- Transcription result objects: unchanged.
- Token storage: unchanged.
- Logs: no user text, credentials, full command paths, or raw endpoint bodies.

## Old-Logic Removal List

- Do not infer provider readiness from the provider dropdown value.
- Do not treat a configured OpenAI-compatible URL as proof that its model exists.
- Do not launch Claude/Codex or send a sample prompt as a readiness check.
- Do not persist stale readiness results as canonical settings.

## Failure Branches

- Backend unavailable: frontend shows a concise probe failure toast and keeps the
  prior result visible.
- CLI missing: `unavailable`, without throwing the whole probe request.
- Codex SDK missing: `unavailable`.
- OpenAI-compatible URL invalid or unreachable: `unavailable`.
- OpenAI-compatible endpoint reachable but model blank: `unconfigured`.
- Configured model absent from `/models`: `unavailable`.
- `/models` malformed: `unavailable`.
- Probe timeout: `unavailable`; other provider results still return.

## Acceptance Criteria

- One settings-page action checks all four providers.
- Probe never invokes a real text-processing provider.
- Probe never downloads a model.
- Claude/Codex command paths are not returned.
- OpenAI-compatible readiness verifies the configured model using `/models`.
- Each provider failure is isolated.
- The selected provider's latest status is visible in General Settings.
- Backend tests, frontend build, Python compile, and real local probe smoke are
  recorded in `docs/TEST.md`.
