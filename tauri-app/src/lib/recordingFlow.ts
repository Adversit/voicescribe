import * as backendApi from "../api/backend";
import {
  cancelRecording,
  deleteAudioFile,
  getRecordingStatus,
  outputText,
  debugHotkeyLog,
  startRecording,
  stopRecording,
  transcribeAudio,
} from "../api/tauri";
import { hideOverlay, pushOverlayState, showOverlay } from "./overlayWindow";
import { cancelRealtimeStreamSession, startRealtimeStreamSession, stopRealtimeStreamSession } from "./realtimeStream";
import { useAppStore } from "../stores/appStore";
import type { HistoryRecord, HistorySpeakerEntry, TranscribeResult } from "../types";

let cancelResetTimer: number | null = null;
const MIN_RECORDING_DURATION_MS_BY_ENGINE: Partial<Record<string, number>> = {
  funasr: 1000,
};
const TOO_SHORT_RECORDING_MESSAGE = "录音时间过短，请至少录制 1 秒后再停止";
const TOO_SHORT_RECORDING_PATTERNS = [
  /too short/i,
  /sampling_points.*short/i,
  /audio.*short/i,
  /recording.*short/i,
  /duration.*short/i,
  /录音时间过短/,
  /时长过短/,
];

function clearCancelResetTimer() {
  if (cancelResetTimer !== null) {
    window.clearTimeout(cancelResetTimer);
    cancelResetTimer = null;
  }
}

function isTooShortRecordingError(message: string) {
  return TOO_SHORT_RECORDING_PATTERNS.some((pattern) => pattern.test(message));
}

function createSpeakerEntries(result: TranscribeResult): HistorySpeakerEntry[] {
  return result.segments.map((segment) => ({
    speaker: segment.speaker ?? null,
    text: segment.text,
    timestamp: new Date().toISOString(),
  }));
}

function buildHistoryRecord(payload: {
  mode: "stream" | "non-stream";
  text: string;
  duration: number;
  engine: string;
  model: string;
  speakerEntries: HistorySpeakerEntry[];
  summary?: string | null;
  retainAudio: boolean;
  audioPath: string | null;
}): HistoryRecord {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    mode: payload.mode,
    text: payload.text,
    duration: payload.duration,
    engine: payload.engine,
    model: payload.model,
    speaker_entries: payload.speakerEntries,
    summary: payload.summary ?? null,
    retain_audio: payload.retainAudio,
    audio_path: payload.audioPath,
  };
}

async function persistTranscriptionHistory(result: TranscribeResult, audioPath: string) {
  const store = useAppStore.getState();
  const { settings, realtime } = store;
  const retainedAudioPath = settings.retainAudio ? audioPath : null;

  const nonStreamRecord = buildHistoryRecord({
    mode: "non-stream",
    text: result.text,
    duration: result.duration,
    engine: result.engine,
    model: result.model,
    speakerEntries: createSpeakerEntries(result),
    retainAudio: settings.retainAudio,
    audioPath: retainedAudioPath,
  });
  await store.upsertHistoryRecord(nonStreamRecord);

  if (settings.enableStreaming && realtime.entries.length > 0) {
    const streamText = realtime.entries.map((entry) => `${entry.speaker ?? "说话人"}: ${entry.text}`).join("\n");
    const streamSummary = realtime.summaries.length
      ? realtime.summaries[realtime.summaries.length - 1]?.text ?? null
      : null;

    const streamRecord = buildHistoryRecord({
      mode: "stream",
      text: streamText,
      duration: result.duration,
      engine: result.engine,
      model: result.model,
      speakerEntries: realtime.entries.map((entry) => ({
        speaker: entry.speaker,
        text: entry.text,
        timestamp: entry.timestamp,
      })),
      summary: streamSummary,
      retainAudio: settings.retainAudio,
      audioPath: retainedAudioPath,
    });
    await store.upsertHistoryRecord(streamRecord);
  }

  if (!settings.retainAudio) {
    await deleteAudioFile(audioPath).catch(() => {
      // Ignore temp file cleanup errors for now.
    });
  }
}

export async function beginRecordingSession() {
  const startedAt = Date.now();
  const store = useAppStore.getState();
  clearCancelResetTimer();
  await debugHotkeyLog("beginRecordingSession start").catch(() => undefined);
  try {
    await startRecording();
    await debugHotkeyLog("beginRecordingSession startRecording success").catch(() => undefined);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await debugHotkeyLog(`beginRecordingSession startRecording failed: ${message}`).catch(() => undefined);
    throw error;
  }
  store.setRecording(true);
  store.setTranscribing(false);
  store.setRecordingCancelled(false);
  store.setAudioLevel(0);
  store.setToast("开始录音");
  if (store.settings.enableStreaming) {
    startRealtimeStreamSession();
  }
  await showOverlay({
    mode: "recording",
    startedAt,
    audioLevel: 0,
    canCancel: true,
    canStop: true,
  });
}

export async function finishRecordingSession() {
  const store = useAppStore.getState();
  const settings = store.settings;
  const minRecordingDurationMs = MIN_RECORDING_DURATION_MS_BY_ENGINE[settings.selectedEngine] ?? 0;
  const status = minRecordingDurationMs > 0
    ? await getRecordingStatus().catch(() => null)
    : null;

  if (status && status.duration * 1000 < minRecordingDurationMs) {
    await cancelRecording().catch(() => undefined);
    cancelRealtimeStreamSession();
    store.setRecording(false);
    store.setTranscribing(false);
    store.setRecordingCancelled(false);
    store.setAudioLevel(0);
    store.setToast(TOO_SHORT_RECORDING_MESSAGE);
    await hideOverlay();
    return;
  }

  store.setRecording(false);
  store.setTranscribing(true);
  await pushOverlayState({
    mode: "transcribing",
    startedAt: null,
    audioLevel: 0,
    canCancel: false,
    canStop: false,
  });

  try {
    const audioPath = await stopRecording();
    if (settings.enableStreaming) {
      await stopRealtimeStreamSession();
    }

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
    useAppStore.getState().saveTranscription(result, settings.retainAudio ? audioPath : null);
    await persistTranscriptionHistory(result, audioPath);
    useAppStore.getState().setToast("转录完成，结果已输出并写入历史记录");
    await backendApi.listHistory().then((records) => {
      useAppStore.setState({
        historyRecords: records,
        selectedHistoryId: records[0]?.id ?? null,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isTooShortRecordingError(message)) {
      useAppStore.getState().setToast(TOO_SHORT_RECORDING_MESSAGE);
      return;
    }
    throw error;
  } finally {
    const nextStore = useAppStore.getState();
    nextStore.setTranscribing(false);
    nextStore.setAudioLevel(0);
    await hideOverlay();
  }
}
export async function abortRecordingSession() {
  clearCancelResetTimer();

  try {
    await cancelRecording();
  } finally {
    cancelRealtimeStreamSession();
    const store = useAppStore.getState();
    store.setRecording(false);
    store.setTranscribing(false);
    store.setAudioLevel(0);
    store.setRecordingCancelled(true);
    store.setToast("录音已取消");
    await pushOverlayState({
      mode: "cancelled",
      startedAt: null,
      audioLevel: 0,
      canCancel: false,
      canStop: false,
    });

    cancelResetTimer = window.setTimeout(() => {
      useAppStore.getState().setRecordingCancelled(false);
      cancelResetTimer = null;
      void hideOverlay();
    }, 1400);
  }
}
