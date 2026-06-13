import { invoke } from "@tauri-apps/api/core";
import { emitTo, listen } from "@tauri-apps/api/event";
import { debugHotkeyLog } from "../api/tauri";

export type OverlayMode =
  | "hidden"
  | "recording"
  | "transcribing"
  | "polishing"
  | "outputting"
  | "completed"
  | "cancelled"
  | "error";

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
    void debugHotkeyLog("overlay-ready received").catch(() => undefined);
  }).then(() => undefined);
}

export function primeOverlayBridge() {
  ensureOverlayReadyListener();
}

async function waitForOverlayReady() {
  ensureOverlayReadyListener();
  if (overlayReady) {
    await debugHotkeyLog("waitForOverlayReady immediate").catch(() => undefined);
    return;
  }

  await new Promise<void>((resolve) => {
    const stop = window.setInterval(() => {
      if (!overlayReady) {
        return;
      }

      window.clearTimeout(timer);
      window.clearInterval(stop);
      void debugHotkeyLog("waitForOverlayReady resolved by event").catch(() => undefined);
      resolve();
    }, 20);
    const timer = window.setTimeout(() => {
      window.clearInterval(stop);
      void debugHotkeyLog("waitForOverlayReady timed out").catch(() => undefined);
      resolve();
    }, OVERLAY_READY_TIMEOUT_MS);
  });
}

export async function pushOverlayState(payload: OverlayStatePayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  const next = withDefaults(payload);
  await debugHotkeyLog(
    `pushOverlayState mode=${next.mode} canCancel=${Boolean(next.canCancel)} canStop=${Boolean(next.canStop)}`,
  ).catch(() => undefined);
  await emitTo(OVERLAY_LABEL, OVERLAY_STATE_EVENT, next);
}

export async function showOverlay(payload: OverlayStatePayload): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  ensureOverlayReadyListener();
  await debugHotkeyLog(`showOverlay invoke start mode=${payload.mode}`).catch(() => undefined);
  await invoke("show_overlay");
  await debugHotkeyLog("showOverlay invoke success").catch(() => undefined);
  await waitForOverlayReady();
  await pushOverlayState(payload);
  await debugHotkeyLog(`showOverlay completed mode=${payload.mode}`).catch(() => undefined);
}

export async function hideOverlay(): Promise<void> {
  if (!isTauriRuntime()) {
    return;
  }

  await debugHotkeyLog("hideOverlay start").catch(() => undefined);
  await pushOverlayState({ mode: "hidden" });
  await invoke("hide_overlay");
  await debugHotkeyLog("hideOverlay success").catch(() => undefined);
}

if (isTauriRuntime()) {
  ensureOverlayReadyListener();
}
