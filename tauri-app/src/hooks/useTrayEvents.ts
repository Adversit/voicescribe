import { useEffect } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { debugHotkeyLog } from "../api/tauri";
import {
  abortRecordingSession,
  beginRecordingSession,
  finishRecordingSession,
} from "../lib/recordingFlow";
import { copyText } from "../lib/clipboard";
import { useAppStore } from "../stores/appStore";

export function useTrayEvents() {
  const setToast = useAppStore((state) => state.setToast);

  useEffect(() => {
    let unlistenStart: (() => void) | undefined;
    let unlistenStop: (() => void) | undefined;
    let unlistenCancel: (() => void) | undefined;
    let unlistenCopy: (() => void) | undefined;

    const bind = async () => {
      const currentWebviewWindow = getCurrentWebviewWindow();
      void debugHotkeyLog("bind tray listeners start").catch(() => undefined);

      unlistenStart = await currentWebviewWindow.listen("tray-start-recording", async () => {
        try {
          await beginRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "开始录音失败");
        }
      });

      unlistenStop = await currentWebviewWindow.listen("tray-stop-recording", async () => {
        try {
          await finishRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "转录失败");
        }
      });

      unlistenCancel = await currentWebviewWindow.listen("tray-cancel-recording", async () => {
        try {
          await abortRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "取消录音失败");
        }
      });

      unlistenCopy = await currentWebviewWindow.listen("tray-copy-latest", async () => {
        const text = useAppStore.getState().currentTranscription?.text ?? "";

        if (!text) {
          setToast("当前没有可复制的转录结果");
          return;
        }

        try {
          await copyText(text);
          setToast("最近结果已复制到剪贴板");
        } catch (error) {
          setToast(error instanceof Error ? error.message : "复制失败");
        }
      });

      void debugHotkeyLog("bind tray listeners success").catch(() => undefined);
    };

    void bind().catch((error) => {
      void debugHotkeyLog(`bind tray listeners failed: ${String(error)}`).catch(() => undefined);
      setToast(error instanceof Error ? error.message : "托盘监听注册失败");
    });

    return () => {
      unlistenStart?.();
      unlistenStop?.();
      unlistenCancel?.();
      unlistenCopy?.();
    };
  }, [setToast]);
}
