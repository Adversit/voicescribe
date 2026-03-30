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


export async function registerHotkeyBinding(binding: HotkeyBinding): Promise<void> {
  await invoke("register_hotkey_binding", { binding });
}

export async function getHotkeyDisplay(): Promise<string> {
  return invoke("get_hotkey_display");
}

export async function debugHotkeyLog(message: string): Promise<void> {
  await invoke("debug_hotkey_log", { message });
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
  engine: string;
  model: string;
  language: string;
  enableDiarization: boolean;
  hotwords: string;
  enableAIRefine: boolean;
}): Promise<TranscribeResult> {
  return invoke("transcribe", {
    audioPath: payload.audioPath,
    engine: payload.engine,
    model: payload.model,
    language: payload.language,
    enableDiarization: payload.enableDiarization,
    hotwords: payload.hotwords,
    enableAiRefine: payload.enableAIRefine,
  });
}

export async function outputText(mode: string, text: string): Promise<void> {
  await invoke("output_text", { mode, text });
}
