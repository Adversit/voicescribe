import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";

export type OverlayMode = "idle" | "recording" | "transcribing" | "cancelled";

export interface OverlayStatePayload {
  mode: OverlayMode;
  startedAt?: number | null;
}

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export async function pushOverlayState(payload: OverlayStatePayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await emit("overlay-state", payload);
}

export async function showOverlay(payload: OverlayStatePayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await invoke("show_overlay");
  await pushOverlayState(payload);
}

export async function hideOverlay(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await pushOverlayState({ mode: "idle", startedAt: null });
  await invoke("hide_overlay");
}
