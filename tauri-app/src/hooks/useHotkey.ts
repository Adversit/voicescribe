import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { outputText, startRecording, stopRecording, transcribeAudio, cancelRecording } from "../api/tauri";
import { useAppStore } from "../stores/appStore";

export function useHotkey() {
  const setRecording = useAppStore((state) => state.setRecording);
  const setTranscribing = useAppStore((state) => state.setTranscribing);
  const setAudioLevel = useAppStore((state) => state.setAudioLevel);
  const setLastResult = useAppStore((state) => state.setLastResult);
  const setToast = useAppStore((state) => state.setToast);

  useEffect(() => {
    let unlistenStart: (() => void) | undefined;
    let unlistenStop: (() => void) | undefined;
    let unlistenCancel: (() => void) | undefined;
    let unlistenAudio: (() => void) | undefined;

    const bind = async () => {
      unlistenStart = await listen("hotkey-start-recording", async () => {
        try {
          await startRecording();
          setRecording(true);
          setTranscribing(false);
          setToast("开始录音");
        } catch (error) {
          setToast(error instanceof Error ? error.message : "开始录音失败");
        }
      });

      unlistenStop = await listen("hotkey-stop-recording", async () => {
        try {
          setRecording(false);
          setTranscribing(true);
          const audioPath = await stopRecording();
          const settings = useAppStore.getState().settings;
          const result = await transcribeAudio({
            audioPath,
            engine: settings.selectedEngine,
            model: settings.selectedModel,
            language: settings.language,
            enableDiarization: settings.enableDiarization,
            hotwords: settings.hotwords,
            enableAIRefine: settings.enableAIRefine,
          });
          await outputText(settings.outputMode, result.text);
          setLastResult(result);
          setToast("转录完成，结果已输出");
        } catch (error) {
          setToast(error instanceof Error ? error.message : "转录失败");
        } finally {
          setTranscribing(false);
        }
      });

      unlistenCancel = await listen("hotkey-cancel", async () => {
        try {
          await cancelRecording();
        } finally {
          setRecording(false);
          setTranscribing(false);
          setAudioLevel(0);
          setToast("录音已取消");
        }
      });

      unlistenAudio = await listen<number>("audio-level", (event) => {
        setAudioLevel(event.payload ?? 0);
      });
    };

    void bind();

    return () => {
      unlistenStart?.();
      unlistenStop?.();
      unlistenCancel?.();
      unlistenAudio?.();
    };
  }, [setAudioLevel, setLastResult, setRecording, setToast, setTranscribing]);
}
