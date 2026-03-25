import { invoke } from "@tauri-apps/api/core";
import type { BackendRuntimeStatus, TranscribeResult } from "../types";

export async function startBackend(): Promise<BackendRuntimeStatus> {
  return invoke("start_backend");
}

export async function stopBackend(): Promise<BackendRuntimeStatus> {
  return invoke("stop_backend");
}

export async function backendStatus(): Promise<BackendRuntimeStatus> {
  return invoke("backend_status");
}

export async function registerHotkey(
  modifiers: number,
  keyCode: number,
): Promise<void> {
  await invoke("register_hotkey", { modifiers, keyCode });
}

export async function getHotkeyDisplay(): Promise<string> {
  return invoke("get_hotkey_display");
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
