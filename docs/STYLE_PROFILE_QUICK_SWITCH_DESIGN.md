# Style Profile Quick Switch

Updated: 2026-06-14

## Product Goal

Users can change the active local Style Profile from the always-visible main
window sidebar without opening General Settings.

This first slice deliberately does not add a second global hotkey or a dynamic
Rust tray menu. Those paths would overlap the existing recording hotkey runtime
and require separate Windows behavior validation.

## Single Source Of Truth

`appStore.settings.activeStyleProfileId` remains the canonical selected Style.
`appStore.selectStyleProfile()` owns selection and base Profile synchronization.
`appStore.cycleStyleProfile()` owns deterministic quick-switch order.

## Input / Output Contract

Cycle order:

`no custom Style -> first local Style -> next local Style -> no custom Style`

Selecting a custom Style also selects its `base_profile`. Selecting no custom
Style keeps the current built-in Profile.

The sidebar control displays the selected Style name, or `内置 Profile` when no
custom Style is active.

## Affected File List

- `docs/PRD.md`
- `docs/SPEC.md`
- `docs/ROADMAP.md`
- `docs/TEST.md`
- `docs/BUGS.md`
- `docs/STYLE_PROFILE_QUICK_SWITCH_DESIGN.md`
- `tauri-app/src/stores/appStore.ts`
- `tauri-app/src/components/Layout.tsx`
- `tauri-app/src/pages/GeneralSettings.tsx`
- `tauri-app/src/styles/globals.css`

## Affected Runtime Paths

Quick switch:

`Layout.tsx -> appStore.cycleStyleProfile -> appStore.selectStyleProfile
-> settings persistence -> recordingFlow next task`

Settings selector:

`GeneralSettings.tsx -> appStore.selectStyleProfile -> settings persistence`

## Affected Persisted Objects

- Settings: existing `activeStyleProfileId` and `textProcessingProfile` change.
- Style definitions: unchanged.
- History/results: unchanged; the next completed task records the selected Style.
- Model registry/model paths/tokens: unchanged.

## Old-Logic Removal List

- Remove direct active Style selection logic from `GeneralSettings.tsx`; route it
  through the store action.
- Do not add a second global keyboard hook in this slice.
- Do not allow Style selection to change while a task is active.

## Failure Branches

- No local Styles: quick switch is disabled and shows `未创建 Style`.
- Selected Style was deleted: existing settings normalization clears selection.
- Active pipeline stage: switch and Style management controls are disabled; the
  store selection action also rejects non-UI calls so the current task keeps its
  Style.
- Empty Style instructions: selection may remain visible, but processing still
  ignores the empty Style per the existing Style contract.
- Persistence failure: current store behavior keeps in-memory state.

## Acceptance Criteria

- Main sidebar always shows current Style selection.
- One click cycles through local Styles and no-custom mode.
- Selection persists through the existing settings store.
- Selecting a Style synchronizes its base Profile.
- Quick switch is disabled during every active pipeline stage.
- General Settings uses the same selection action.
- Frontend build and static contract checks are recorded in `docs/TEST.md`.
