import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";

export type OverlayMode = "hidden" | "recording" | "transcribing" | "cancelled";

export interface OverlayStatePayload {
  mode: OverlayMode;
  startedAt?: number | null;
  audioLevel?: number;
  canCancel?: boolean;
  canStop?: boolean;
}

const OVERLAY_LABEL = "overlay";
const OVERLAY_READY_EVENT = "overlay-ready";
const OVERLAY_STATE_EVENT = "overlay-state";
const OVERLAY_READY_TIMEOUT_MS = 400;

let overlayReady = false;
let overlayReadyListenerPromise: Promise<void> | null = null;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function withDefaults(payload: OverlayStatePayload): OverlayStatePayload {
  return {
    audioLevel: 0,
    canCancel: false,
    canStop: false,
    startedAt: null,
    ...payload,
  };
}

function ensureOverlayReadyListener() {
  if (!isTauriRuntime() || overlayReadyListenerPromise) {
    return;
  }

  overlayReadyListenerPromise = listen<void>(OVERLAY_READY_EVENT, () => {
    overlayReady = true;
  }).then(() => undefined);
}

async function waitForOverlayReady() {
  ensureOverlayReadyListener();
  if (overlayReady) {
    return;
  }

  await new Promise<void>((resolve) => {
    const stop = window.setInterval(() => {
      if (!overlayReady) {
        return;
      }

      window.clearTimeout(timer);
      window.clearInterval(stop);
      resolve();
    }, 20);
    const timer = window.setTimeout(() => {
      window.clearInterval(stop);
      resolve();
    }, OVERLAY_READY_TIMEOUT_MS);
  });
}

export async function pushOverlayState(payload: OverlayStatePayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await emitTo(OVERLAY_LABEL, OVERLAY_STATE_EVENT, withDefaults(payload));
}

export async function showOverlay(payload: OverlayStatePayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  ensureOverlayReadyListener();
  await invoke("show_overlay");
  await waitForOverlayReady();
  await pushOverlayState(payload);
}

export async function hideOverlay(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await pushOverlayState({ mode: "hidden" });
  await invoke("hide_overlay");
}
