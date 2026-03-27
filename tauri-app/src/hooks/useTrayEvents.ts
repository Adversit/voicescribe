import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
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
      unlistenStart = await listen("tray-start-recording", async () => {
        try {
          await beginRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "开始录音失败");
        }
      });

      unlistenStop = await listen("tray-stop-recording", async () => {
        try {
          await finishRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "转录失败");
        }
      });

      unlistenCancel = await listen("tray-cancel-recording", async () => {
        try {
          await abortRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "取消录音失败");
        }
      });

      unlistenCopy = await listen("tray-copy-latest", async () => {
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
    };

    void bind();

    return () => {
      unlistenStart?.();
      unlistenStop?.();
      unlistenCancel?.();
      unlistenCopy?.();
    };
  }, [setToast]);
}
