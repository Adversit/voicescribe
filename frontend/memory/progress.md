# VoiceScribe Electron Port - Progress Log

## Modification Log

### 2026-02-09

#### 1. Project Initialization

- Created Next.js project under `frontend/`
- Added Electron build/run scripts and packaging config
- Added UI dependencies (shadcn/ui + radix) and state management (zustand)

#### 2. Configuration Files

- Added TailwindCSS + shadcn/ui base setup
- Added `tsconfig.electron.json` for Electron main/preload build

#### 3. Electron Main/Preload

- `frontend/electron/main.ts`: main process, windows, tray, IPC
- `frontend/electron/preload.ts`: contextBridge API for renderer

#### 4. UI Components

- Added settings panels: General / Engine / Vocabulary (initial versions)

### 2026-02-10

#### 1. Mac Parity Fixes (Audio/Overlay/Hotkey Copy)

- Recording format: WebM (MediaRecorder) -> WAV (PCM16, 16kHz, mono)
  - new: `frontend/src/lib/wav-recorder.ts`
  - updated: `frontend/src/lib/audio-recorder.ts`
- Fixed `/speakers/register` format mismatch by switching SpeakerSettings to WAV recording
  - rewritten: `frontend/src/components/settings/SpeakerSettings.tsx`
- Overlay waveform now uses real RMS audio level (renderer -> IPC -> main -> overlay)
  - updated: `frontend/src/components/GlobalRecordingManager.tsx`
  - updated: `frontend/electron/preload.ts`
  - updated: `frontend/electron/main.ts`
  - updated: `frontend/src/app/overlay/page.tsx`
- Hotkey settings "usage" copy updated to match Electron toggle behavior
  - rewritten: `frontend/src/components/settings/HotkeySettings.tsx`

---

## SwiftUI -> React Mapping

| SwiftUI file | React/Electron implementation | Status |
| --- | --- | --- |
| `ContentView.swift` | `src/app/page.tsx` + settings layout | ✅ Complete |
| `SettingsView.swift` (GeneralSettingsView) | `GeneralSettings.tsx` | ✅ Complete |
| `SettingsView.swift` (EngineSettingsView) | `EngineSettings.tsx` | ✅ Complete |
| `SettingsView.swift` (VocabularySettingsView) | `VocabularySettings.tsx` | ✅ Complete |
| `SettingsView.swift` (SpeakerSettingsView) | `SpeakerSettings.tsx` | ✅ Complete |
| `SettingsView.swift` (HotkeySettingsView) | `HotkeySettings.tsx` | ✅ Complete |
| `MenuBarView.swift` | Electron Tray + Context Menu | ✅ Complete |
| `RecordingOverlayWindow.swift` | `src/app/overlay/page.tsx` + `RecordingOverlay.tsx` | ✅ Complete |

---

## TODO

1. [x] Implement `SpeakerSettings.tsx`
2. [x] Implement `HotkeySettings.tsx`
3. [x] Implement Electron system tray menu
4. [x] Implement recording overlay window
5. [x] Integrate backend API calls (engines/load/transcribe/speakers/models)
6. [ ] Polish UI consistency vs macOS app (spacing, typography, labels)
7. [ ] Add end-to-end smoke tests (record -> transcribe -> output -> history)

