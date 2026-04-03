import { useEffect, useRef } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { debugHotkeyLog, registerHotkeyBinding } from "../api/tauri";
import { useAppStore } from "../stores/appStore";
import {
  abortRecordingSession,
  beginRecordingSession,
  finishRecordingSession,
} from "../lib/recordingFlow";
import { pushRealtimeAudioChunk } from "../lib/realtimeStream";

const START_RECORDING_ERROR = "\u5f00\u59cb\u5f55\u97f3\u5931\u8d25";
const STOP_RECORDING_ERROR = "\u7ed3\u675f\u5f55\u97f3\u5931\u8d25";
const CANCEL_RECORDING_ERROR = "\u53d6\u6d88\u5f55\u97f3\u5931\u8d25";
const HOTKEY_LISTENER_ERROR = "\u70ed\u952e\u76d1\u542c\u6ce8\u518c\u5931\u8d25";
const REGISTER_HOTKEY_ERROR = "\u6ce8\u518c\u5feb\u6377\u952e\u5931\u8d25";
const FOREGROUND_RIGHT_ALT_KEY = "AltRight";
const FOREGROUND_HOTKEY_DEDUP_MS = 250;
const FOREGROUND_LONG_PRESS_MS = 350;

function formatBindingForLog(keys: number[], display: string): string {
  const keySummary = keys.length > 0 ? keys.join("+") : "none";
  return `keys=${keySummary} display=${display}`;
}

function formatTraceForLog(traceId: string | null): string {
  return traceId ? ` trace_id=${traceId}` : "";
}

function createTraceId(prefix: "startup" | "apply") {
  const random = Math.random().toString(16).slice(2, 8);
  return `hotkey-${prefix}-${Date.now()}-${random}`;
}

function isSingleRightAltBinding(keys: number[]) {
  return keys.length === 1 && keys[0] === 0xA5;
}

export function useHotkey() {
  const setAudioLevel = useAppStore((state) => state.setAudioLevel);
  const setToast = useAppStore((state) => state.setToast);
  const settingsHydrated = useAppStore((state) => state.settingsHydrated);
  const hotkeyBinding = useAppStore((state) => state.settings.hotkeyBinding);
  const hotkeyCaptureActive = useAppStore((state) => state.hotkeyCaptureActive);
  const startupTraceIdRef = useRef<string>(createTraceId("startup"));
  const startupRegisterConsumedRef = useRef(false);
  const suppressNativeHotkeyUntilRef = useRef(0);
  const foregroundRightAltActiveRef = useRef(false);
  const foregroundLongPressModeRef = useRef(false);
  const foregroundLongPressTimerRef = useRef<number | null>(null);

  const clearForegroundLongPressTimer = () => {
    if (foregroundLongPressTimerRef.current !== null) {
      window.clearTimeout(foregroundLongPressTimerRef.current);
      foregroundLongPressTimerRef.current = null;
    }
  };

  useEffect(() => {
    let unlistenStart: (() => void) | undefined;
    let unlistenStop: (() => void) | undefined;
    let unlistenCancel: (() => void) | undefined;
    let unlistenOverlayCancel: (() => void) | undefined;
    let unlistenOverlayStop: (() => void) | undefined;
    let unlistenAudio: (() => void) | undefined;
    let unlistenChunk: (() => void) | undefined;
    const startupTraceId = startupTraceIdRef.current;

    const bind = async () => {
      const currentWebviewWindow = getCurrentWebviewWindow();
      void debugHotkeyLog(`bind hotkey listeners start trace_id=${startupTraceId} source=startup`).catch(() => undefined);

      unlistenStart = await currentWebviewWindow.listen("hotkey-start-recording", async () => {
        if (Date.now() < suppressNativeHotkeyUntilRef.current) {
          void debugHotkeyLog("received hotkey-start-recording suppressed source=foreground-fallback").catch(() => undefined);
          return;
        }
        void debugHotkeyLog("received hotkey-start-recording").catch(() => undefined);
        try {
          await beginRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : START_RECORDING_ERROR);
        }
      });

      unlistenStop = await currentWebviewWindow.listen("hotkey-stop-recording", async () => {
        if (Date.now() < suppressNativeHotkeyUntilRef.current) {
          void debugHotkeyLog("received hotkey-stop-recording suppressed source=foreground-fallback").catch(() => undefined);
          return;
        }
        void debugHotkeyLog("received hotkey-stop-recording").catch(() => undefined);
        try {
          await finishRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : STOP_RECORDING_ERROR);
        }
      });

      unlistenCancel = await currentWebviewWindow.listen("hotkey-cancel", async () => {
        void debugHotkeyLog("received hotkey-cancel").catch(() => undefined);
        try {
          await abortRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : CANCEL_RECORDING_ERROR);
        }
      });

      unlistenOverlayCancel = await currentWebviewWindow.listen("overlay-cancel-recording", async () => {
        void debugHotkeyLog("received overlay-cancel-recording").catch(() => undefined);
        try {
          await abortRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : CANCEL_RECORDING_ERROR);
        }
      });

      unlistenOverlayStop = await currentWebviewWindow.listen("overlay-stop-recording", async () => {
        void debugHotkeyLog("received overlay-stop-recording").catch(() => undefined);
        try {
          await finishRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : STOP_RECORDING_ERROR);
        }
      });

      unlistenAudio = await currentWebviewWindow.listen<number>("audio-level", (event) => {
        setAudioLevel(event.payload ?? 0);
      });

      unlistenChunk = await currentWebviewWindow.listen<string>("audio-chunk", (event) => {
        if (typeof event.payload === "string") {
          pushRealtimeAudioChunk(event.payload);
        }
      });

      void debugHotkeyLog(`bind hotkey listeners success trace_id=${startupTraceId} source=startup`).catch(() => undefined);
    };

    void bind().catch((error) => {
      void debugHotkeyLog(`bind hotkey listeners failed trace_id=${startupTraceId} source=startup error=${String(error)}`).catch(
        () => undefined,
      );
      setToast(error instanceof Error ? error.message : HOTKEY_LISTENER_ERROR);
    });

    return () => {
      void debugHotkeyLog(`bind hotkey listeners cleanup trace_id=${startupTraceId} source=startup`).catch(() => undefined);
      unlistenStart?.();
      unlistenStop?.();
      unlistenCancel?.();
      unlistenOverlayCancel?.();
      unlistenOverlayStop?.();
      unlistenAudio?.();
      unlistenChunk?.();
    };
  }, [setAudioLevel, setToast]);

  useEffect(() => {
    if (!settingsHydrated) {
      return;
    }

    let cancelled = false;
    const applyTraceId = useAppStore.getState().hotkeyApplyTraceId;
    const isStartupRegister = !applyTraceId && !startupRegisterConsumedRef.current;
    const traceId = applyTraceId ?? (isStartupRegister ? startupTraceIdRef.current : null);
    const traceSource = applyTraceId ? "apply" : isStartupRegister ? "startup" : "none";
    void debugHotkeyLog(
      `use-hotkey register requested${formatTraceForLog(traceId)} source=${traceSource} ${formatBindingForLog(hotkeyBinding.keys, hotkeyBinding.display)}`,
    ).catch(() => undefined);

    void registerHotkeyBinding(hotkeyBinding, traceId ?? undefined)
      .then(() => {
        void debugHotkeyLog(
          `use-hotkey register succeeded${formatTraceForLog(traceId)} source=${traceSource} ${formatBindingForLog(hotkeyBinding.keys, hotkeyBinding.display)}`,
        ).catch(() => undefined);
      })
      .catch((error) => {
        void debugHotkeyLog(
          `use-hotkey register failed${formatTraceForLog(traceId)} source=${traceSource} error=${String(error)} ${formatBindingForLog(hotkeyBinding.keys, hotkeyBinding.display)}`,
        ).catch(() => undefined);
        if (!cancelled) {
          setToast(error instanceof Error ? error.message : REGISTER_HOTKEY_ERROR);
        }
      })
      .finally(() => {
        if (isStartupRegister) {
          startupRegisterConsumedRef.current = true;
        }
        if (traceId && useAppStore.getState().hotkeyApplyTraceId === traceId) {
          useAppStore.getState().setHotkeyApplyTraceId(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hotkeyBinding, setToast, settingsHydrated]);

  useEffect(() => {
    if (!settingsHydrated || !isSingleRightAltBinding(hotkeyBinding.keys)) {
      return;
    }

    const runForegroundFallbackAction = async (action: "start" | "stop", reason: string) => {
      suppressNativeHotkeyUntilRef.current = Date.now() + FOREGROUND_HOTKEY_DEDUP_MS;
      void debugHotkeyLog(`foreground_right_alt action=${action} reason=${reason} dedup_ms=${FOREGROUND_HOTKEY_DEDUP_MS}`).catch(
        () => undefined,
      );

      try {
        if (action === "start") {
          await beginRecordingSession();
        } else {
          await finishRecordingSession();
        }
      } catch (error) {
        setToast(error instanceof Error ? error.message : action === "start" ? START_RECORDING_ERROR : STOP_RECORDING_ERROR);
      }
    };

    const resetForegroundFallback = (reason: string) => {
      if (
        foregroundRightAltActiveRef.current
        || foregroundLongPressModeRef.current
        || foregroundLongPressTimerRef.current !== null
      ) {
        void debugHotkeyLog(`foreground_right_alt reset reason=${reason}`).catch(() => undefined);
      }
      foregroundRightAltActiveRef.current = false;
      foregroundLongPressModeRef.current = false;
      clearForegroundLongPressTimer();
    };

    const shouldHandleForegroundRightAlt = (event: KeyboardEvent) => {
      if (event.code !== FOREGROUND_RIGHT_ALT_KEY) {
        return false;
      }
      if (!document.hasFocus()) {
        return false;
      }
      if (useAppStore.getState().hotkeyCaptureActive) {
        return false;
      }
      return true;
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!shouldHandleForegroundRightAlt(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (event.repeat) {
        return;
      }

      if (foregroundRightAltActiveRef.current) {
        return;
      }

      foregroundRightAltActiveRef.current = true;
      foregroundLongPressModeRef.current = false;
      clearForegroundLongPressTimer();
      void debugHotkeyLog(`foreground_right_alt keydown page=${useAppStore.getState().currentPage}`).catch(() => undefined);

      foregroundLongPressTimerRef.current = window.setTimeout(() => {
        foregroundLongPressTimerRef.current = null;
        if (!foregroundRightAltActiveRef.current || useAppStore.getState().hotkeyCaptureActive) {
          return;
        }
        if (useAppStore.getState().isRecording) {
          return;
        }

        foregroundLongPressModeRef.current = true;
        void runForegroundFallbackAction("start", "long-press-threshold");
      }, FOREGROUND_LONG_PRESS_MS);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (!shouldHandleForegroundRightAlt(event)) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      clearForegroundLongPressTimer();

      if (!foregroundRightAltActiveRef.current) {
        return;
      }

      foregroundRightAltActiveRef.current = false;
      const wasLongPressMode = foregroundLongPressModeRef.current;
      foregroundLongPressModeRef.current = false;
      void debugHotkeyLog(
        `foreground_right_alt keyup long_press_mode=${wasLongPressMode} recording=${useAppStore.getState().isRecording}`,
      ).catch(() => undefined);

      if (useAppStore.getState().hotkeyCaptureActive) {
        return;
      }

      if (wasLongPressMode) {
        if (useAppStore.getState().isRecording) {
          void runForegroundFallbackAction("stop", "long-press-release");
        }
        return;
      }

      void runForegroundFallbackAction(useAppStore.getState().isRecording ? "stop" : "start", "single-release");
    };

    const handleBlur = () => {
      resetForegroundFallback("window-blur");
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);
    window.addEventListener("blur", handleBlur);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
      window.removeEventListener("blur", handleBlur);
      resetForegroundFallback("effect-cleanup");
    };
  }, [hotkeyBinding.keys, hotkeyCaptureActive, setToast, settingsHydrated]);
}
