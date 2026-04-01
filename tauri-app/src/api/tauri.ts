import { invoke } from "@tauri-apps/api/core";
import type { BackendRuntimeStatus, HotkeyBinding, TranscribeResult } from "../types";

export async function startBackend(): Promise<BackendRuntimeStatus> {
  return invoke("start_backend");
}

export async function stopBackend(): Promise<BackendRuntimeStatus> {
  return invoke("stop_backend");
}

export async function backendStatus(): Promise<BackendRuntimeStatus> {
  return invoke("backend_status");
}


export async function registerHotkeyBinding(binding: HotkeyBinding, traceId?: string): Promise<void> {
  await invoke("register_hotkey_binding", { binding, traceId });
}

export async function getHotkeyDisplay(): Promise<string> {
  return invoke("get_hotkey_display");
}

export async function debugHotkeyLog(message: string): Promise<void> {
  await invoke("debug_hotkey_log", { message });
}

export async function suspendHotkeyRuntime(): Promise<void> {
  await invoke("suspend_hotkey_runtime");
}

export async function resumeHotkeyRuntime(traceId?: string, reason?: string): Promise<void> {
  await invoke("resume_hotkey_runtime", { traceId, reason });
}


export async function startRecording(): Promise<string> {
  return invoke("start_recording");
}

export async function stopRecording(): Promise<string> {
  return invoke("stop_recording");
}

export async function cancelRecording(): Promise<void> {
  await invoke("cancel_recording");
}

export async function getRecordingStatus(): Promise<{
  is_recording: boolean;
  duration: number;
  audio_level: number;
}> {
  return invoke("get_recording_status");
}

export async function deleteAudioFile(path: string): Promise<void> {
  await invoke("delete_audio_file", { path });
}

export async function transcribeAudio(payload: {
  audioPath: string;
  asrEngine: string;
  asrModel: string;
  diarizationModel: string | null;
  speakerMappingModel: string | null;
  language: string;
  enableDiarization: boolean;
  hotwords: string;
  enableAIRefine: boolean;
}): Promise<TranscribeResult> {
  return invoke("transcribe", {
    audioPath: payload.audioPath,
    asrEngine: payload.asrEngine,
    asrModel: payload.asrModel,
    diarizationModel: payload.diarizationModel,
    speakerMappingModel: payload.speakerMappingModel,
    language: payload.language,
    enableDiarization: payload.enableDiarization,
    hotwords: payload.hotwords,
    enableAiRefine: payload.enableAIRefine,
  });
}

export async function outputText(mode: string, text: string): Promise<void> {
  await invoke("output_text", { mode, text });
}
