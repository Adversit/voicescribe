import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useAppStore } from "../stores/appStore";
import {
  abortRecordingSession,
  beginRecordingSession,
  finishRecordingSession,
} from "../lib/recordingFlow";
import { pushRealtimeAudioChunk } from "../lib/realtimeStream";

export function useHotkey() {
  const setAudioLevel = useAppStore((state) => state.setAudioLevel);
  const setToast = useAppStore((state) => state.setToast);

  useEffect(() => {
    let unlistenStart: (() => void) | undefined;
    let unlistenStop: (() => void) | undefined;
    let unlistenCancel: (() => void) | undefined;
    let unlistenAudio: (() => void) | undefined;
    let unlistenChunk: (() => void) | undefined;

    const bind = async () => {
      unlistenStart = await listen("hotkey-start-recording", async () => {
        try {
          await beginRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "开始录音失败");
        }
      });

      unlistenStop = await listen("hotkey-stop-recording", async () => {
        try {
          await finishRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "转录失败");
        }
      });

      unlistenCancel = await listen("hotkey-cancel", async () => {
        try {
          await abortRecordingSession();
        } catch (error) {
          setToast(error instanceof Error ? error.message : "取消录音失败");
        }
      });

      unlistenAudio = await listen<number>("audio-level", (event) => {
        setAudioLevel(event.payload ?? 0);
      });

      unlistenChunk = await listen<string>("audio-chunk", (event) => {
        if (typeof event.payload === "string") {
          pushRealtimeAudioChunk(event.payload);
        }
      });
    };

    void bind();

    return () => {
      unlistenStart?.();
      unlistenStop?.();
      unlistenCancel?.();
      unlistenAudio?.();
      unlistenChunk?.();
    };
  }, [setAudioLevel, setToast]);
}
