# Mac App Parity Fixes (2026-02-10)

Goal: align the Electron port behavior with the original macOS SwiftUI app in `app/VoiceScribe`, focusing on:

- audio format (WAV/PCM16 @ 16kHz, mono)
- hotkey behavior documentation vs actual behavior
- recording overlay waveform driven by real audio level (not simulated)

## Summary

1. Audio pipeline: switched renderer-side recording from WebM (MediaRecorder) to WAV (PCM16) so the backend receives the same format as the macOS app.
2. Speaker registration: fixed the format mismatch for `/speakers/register` (backend expects WAV; renderer previously sent WebM).
3. Overlay waveform: implemented real-time audio level propagation from renderer to main process and to the overlay UI.
4. Hotkey usage text: updated UI copy to match the actual Electron hotkey implementation (toggle start/stop), removing the macOS-only long-press/double-tap description.

## What Changed

### 1) Recording: WebM -> WAV (PCM16 mono @ 16kHz)

New WAV recorder implementation using WebAudio PCM capture + RIFF/WAV encoding:

- `frontend/src/lib/wav-recorder.ts` (new)

Renderer recorder now uses WAV output:

- `frontend/src/lib/audio-recorder.ts` (updated to use `WavRecorder`; adds `getAudioLevel()`)

Main process temp files now use `.wav` for both transcription and speaker registration:

- `frontend/electron/main.ts` (writes `voicescribe_*.wav` and `voicescribe_speaker_*.wav`)

### 2) Speaker Registration Uses WAV

Speaker recording UI now records WAV and sends it to the main process:

- `frontend/src/components/settings/SpeakerSettings.tsx` (rewritten to use `WavRecorder`)

Backend compatibility note:

- `backend/server.py` saves `/speakers/register` uploads as `.wav` unconditionally, so sending actual WAV is required.

### 3) Overlay Uses Real Audio Level

Audio level propagation pipeline:

- Renderer computes RMS-based level in `WavRecorder` and exposes `getAudioLevel()`.
- Renderer periodically pushes `audioLevel` to main process during recording.
- Main process includes `audioLevel` in the `recording-state` payload.
- Overlay reads `audioLevel` from the payload and renders the waveform accordingly.

Code changes:

- `frontend/electron/preload.ts` (adds `recording.updateAudioLevel(level)` and types)
- `frontend/electron/main.ts` (adds `recording-audio-level` listener; extends `recording-state` payload)
- `frontend/src/components/GlobalRecordingManager.tsx` (pushes audio level every 100ms while recording)
- `frontend/src/app/overlay/page.tsx` (removes random simulation; uses payload `audioLevel`)

### 4) Hotkey Usage Copy Matches Electron Behavior

Electron hotkey is implemented via `globalShortcut.register(accelerator)` (toggle behavior), so UI copy was updated accordingly:

- `frontend/src/components/settings/HotkeySettings.tsx` (rewritten)

Also fixed the sentinel handling for "no key" (`无`) when building the accelerator:

- `frontend/electron/main.ts` (`getHotkeyString()` treats `selectedKey === '无'` as empty)

## Notes / Verification

- TypeScript compile for Electron main/preload passed:
  - `cd frontend; npm run build:electron`
- `next build` may fail on this machine due to a PowerShell profile `conda.exe` permission issue (`spawn EPERM`), unrelated to the changes here.

## Files Touched (High Level)

- new: `frontend/src/lib/wav-recorder.ts`
- updated: `frontend/src/lib/audio-recorder.ts`
- updated: `frontend/electron/preload.ts`
- updated: `frontend/electron/main.ts`
- updated: `frontend/src/components/GlobalRecordingManager.tsx`
- updated: `frontend/src/app/overlay/page.tsx`
- rewritten: `frontend/src/components/settings/SpeakerSettings.tsx`
- rewritten: `frontend/src/components/settings/HotkeySettings.tsx`

