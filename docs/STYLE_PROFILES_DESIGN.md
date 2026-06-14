# Local Style Profiles

Updated: 2026-06-14

## Product Goal

Users can keep several local writing styles and choose one for the next
dictation. This adds explicit, user-controlled personalization without training
on private history or weakening the text-cleanup safety boundary.

Reference direction:

- Typeless emphasizes personalized tone and app-aware writing.
- OpenLess exposes a user-selected writing style.
- OpenTypeless combines AI polishing with provider choice and local control.

## Single Source Of Truth

`AppSettings.styleProfiles` owns the locally persisted profile definitions.
`AppSettings.activeStyleProfileId` owns the current selection.

The backend owns validation and prompt application for the style included in an
individual processing request. It does not persist style definitions.

## Data Contract

Frontend persisted profile:

```ts
interface StyleProfile {
  id: string
  name: string
  base_profile: "light" | "structured" | "formal" | "translate"
  instructions: string
}
```

Text-processing requests add optional `style_profile`. Results and history add
optional `style_profile_id` and `style_profile_name`, but never persist the full
instructions.

## Prompt And Safety Contract

- Custom instructions may affect tone, formatting, concision, and phrasing only.
- Existing fidelity and no-tool/no-execution rules remain higher priority.
- Backend trims profile ID/name and limits instructions to 2,000 characters.
- Profile instructions are placed in a dedicated tagged block before the
  untrusted transcription.
- Empty or invalid custom profiles are ignored and the base Profile still runs.

## Affected File List

- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/ROADMAP.md`
- `docs/TEST.md`
- `docs/BUGS.md`
- `docs/STYLE_PROFILES_DESIGN.md`
- `backend/postprocess/text_processing_prompts.py`
- `backend/services/text_processing_service.py`
- `backend/server.py`
- `backend/services/history_service.py`
- `backend/tests/test_text_processing_service.py`
- `backend/tests/test_pipeline_routes.py`
- `tauri-app/src/types/index.ts`
- `tauri-app/src/stores/appStore.ts`
- `tauri-app/src/pages/GeneralSettings.tsx`
- `tauri-app/src/pages/HistoryPage.tsx`
- `tauri-app/src/lib/recordingFlow.ts`

## Affected Runtime Paths

Selection and persistence:

`GeneralSettings.tsx -> appStore.ts -> voicescribe-settings.json`

Processing:

`recordingFlow.ts -> backend.ts -> /text/tasks -> server.py
-> TextProcessingService -> text_processing_prompts.py -> provider`

History:

`TextProcessingResult -> recordingFlow.ts -> history_service.py -> history.json`

## Affected Persisted Objects

- Settings: adds profile definitions and active profile ID.
- History/result objects: add selected style ID/name only.
- Model registry/model paths: unchanged; no downloads.
- Tokens: unchanged.
- Logs: may include style ID/name, never instructions or transcription content.

## Old-Logic Removal List

- Do not treat the five built-in processing profiles as the only selectable
  writing styles.
- Do not persist custom instructions in history records.
- Do not let custom style instructions replace or bypass the base safety prompt.
- Keep the existing built-in Profile selector as the default/fallback behavior.

## Failure Branches

- Selected profile deleted: clear selection and use built-in Profile.
- Persisted malformed profile: drop it during settings normalization.
- Empty instructions: profile remains editable but is not sent to backend.
- Oversized instructions: backend truncates to 2,000 characters.
- Provider failure: existing raw-text fallback remains.
- Old settings/history: normalize with no active custom style.

## Acceptance Criteria

- User can create, edit, select, and delete local Style Profiles.
- Selected Style is applied to the next non-raw processing request.
- Raw Profile does not call a Provider or apply Style.
- Backend prompt keeps safety rules above custom instructions.
- Result/history identify the selected Style without storing instructions.
- Existing settings migrate without data loss.
- Backend tests and frontend build are recorded in `docs/TEST.md`.
