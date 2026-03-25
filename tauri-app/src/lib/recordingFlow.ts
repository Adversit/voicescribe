import { cancelRecording, outputText, startRecording, stopRecording, transcribeAudio } from "../api/tauri";
import { useAppStore } from "../stores/appStore";

let cancelResetTimer: number | null = null;

function clearCancelResetTimer() {
  if (cancelResetTimer !== null) {
    window.clearTimeout(cancelResetTimer);
    cancelResetTimer = null;
  }
}

export async function beginRecordingSession() {
  const store = useAppStore.getState();
  clearCancelResetTimer();
  await startRecording();
  store.setRecording(true);
  store.setTranscribing(false);
  store.setRecordingCancelled(false);
  store.setAudioLevel(0);
  store.setToast("开始录音");
}

export async function finishRecordingSession() {
  const store = useAppStore.getState();
  store.setRecording(false);
  store.setTranscribing(true);

  try {
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
    useAppStore.getState().setLastResult(result);
    useAppStore.getState().setToast("转录完成，结果已输出");
  } finally {
    const nextStore = useAppStore.getState();
    nextStore.setTranscribing(false);
    nextStore.setAudioLevel(0);
  }
}

export async function abortRecordingSession() {
  clearCancelResetTimer();

  try {
    await cancelRecording();
  } finally {
    const store = useAppStore.getState();
    store.setRecording(false);
    store.setTranscribing(false);
    store.setAudioLevel(0);
    store.setRecordingCancelled(true);
    store.setToast("录音已取消");

    cancelResetTimer = window.setTimeout(() => {
      useAppStore.getState().setRecordingCancelled(false);
      cancelResetTimer = null;
    }, 1400);
  }
}
