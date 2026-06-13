import * as backendApi from "../api/backend";
import {
  cancelRecording,
  deleteAudioFile,
  getRecordingStatus,
  getTargetContext,
  outputText,
  debugHotkeyLog,
  startRecording,
  stopRecording,
  transcribeAudio,
} from "../api/tauri";
import { hideOverlay, pushOverlayState, showOverlay } from "./overlayWindow";
import { cancelRealtimeStreamSession, startRealtimeStreamSession, stopRealtimeStreamSession } from "./realtimeStream";
import { useAppStore } from "../stores/appStore";
import type { HistoryRecord, HistorySpeakerEntry, TargetContext, TextProcessingResult, TranscribeResult } from "../types";

let cancelResetTimer: number | null = null;

const MIN_RECORDING_DURATION_MS_BY_ENGINE: Partial<Record<string, number>> = {
  funasr: 1000,
};

const TOO_SHORT_RECORDING_MESSAGE = "录音时间过短，请至少录制 1 秒后再停止。";

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
  rawText: string;
  text: string;
  duration: number;
  engine: string;
  model: string;
  diarizationModel: string | null;
  speakerMappingModel: string | null;
  speakerEntries: HistorySpeakerEntry[];
  summary?: string | null;
  textProcessing: TextProcessingResult;
  targetContext: TargetContext | null;
  retainAudio: boolean;
  audioPath: string | null;
}): HistoryRecord {
  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    created_at: new Date().toISOString(),
    mode: payload.mode,
    raw_text: payload.rawText,
    text: payload.text,
    duration: payload.duration,
    engine: payload.engine,
    model: payload.model,
    asr_engine: payload.engine,
    asr_model: payload.model,
    diarization_model: payload.diarizationModel,
    speaker_mapping_model: payload.speakerMappingModel,
    speaker_entries: payload.speakerEntries,
    summary: payload.summary ?? null,
    text_processing: payload.textProcessing,
    target_context: payload.targetContext,
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
    rawText: result.raw_text,
    text: result.text,
    duration: result.duration,
    engine: result.asr_engine,
    model: result.asr_model,
    diarizationModel: result.diarization_model,
    speakerMappingModel: result.speaker_mapping_model,
    speakerEntries: createSpeakerEntries(result),
    textProcessing: result.text_processing,
    targetContext: result.text_processing.target_context,
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
      rawText: streamText,
      text: streamText,
      duration: result.duration,
      engine: result.asr_engine,
      model: result.asr_model,
      diarizationModel: result.diarization_model,
      speakerMappingModel: result.speaker_mapping_model,
      speakerEntries: realtime.entries.map((entry) => ({
        speaker: entry.speaker,
        text: entry.text,
        timestamp: entry.timestamp,
      })),
      summary: streamSummary,
      textProcessing: {
        raw_text: streamText,
        text: streamText,
        profile: "raw",
        provider: null,
        model: null,
        status: "skipped",
        duration_ms: 0,
        warning: null,
        target_context: null,
      },
      targetContext: null,
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

  await debugHotkeyLog("beginRecordingSession showOverlay start").catch(() => undefined);
  await showOverlay({
    mode: "recording",
    startedAt,
    audioLevel: 0,
    canCancel: true,
    canStop: true,
  });
  await debugHotkeyLog("beginRecordingSession showOverlay success").catch(() => undefined);
}

export async function finishRecordingSession() {
  const store = useAppStore.getState();
  const settings = store.settings;
  const activeSelection = settings.engineSelections[settings.selectedEngine];
  const minRecordingDurationMs = MIN_RECORDING_DURATION_MS_BY_ENGINE[settings.selectedEngine] ?? 0;

  await debugHotkeyLog(
    `finishRecordingSession start engine=${settings.selectedEngine} model=${activeSelection?.asrModel ?? "unknown"}`,
  ).catch(() => undefined);

  const status = minRecordingDurationMs > 0
    ? await getRecordingStatus().catch(() => null)
    : null;

  await debugHotkeyLog(
    `finishRecordingSession status duration=${status?.duration ?? "unknown"} minMs=${minRecordingDurationMs}`,
  ).catch(() => undefined);

  if (status && status.duration * 1000 < minRecordingDurationMs) {
    await debugHotkeyLog("finishRecordingSession too short -> cancelRecording").catch(() => undefined);
    await cancelRecording().catch(() => undefined);
    cancelRealtimeStreamSession();
    store.setRecording(false);
    store.setTranscribing(false);
    store.setRecordingCancelled(false);
    store.setAudioLevel(0);
    store.setToast(TOO_SHORT_RECORDING_MESSAGE);
    await hideOverlay();
    await debugHotkeyLog("finishRecordingSession too short -> hideOverlay success").catch(() => undefined);
    return;
  }

  store.setRecording(false);
  store.setTranscribing(true);
  await debugHotkeyLog("finishRecordingSession pushOverlayState transcribing").catch(() => undefined);
  await pushOverlayState({
    mode: "transcribing",
    startedAt: null,
    audioLevel: 0,
    canCancel: false,
    canStop: false,
  });

  try {
    await debugHotkeyLog("finishRecordingSession stopRecording start").catch(() => undefined);
    const audioPath = await stopRecording();
    await debugHotkeyLog(`finishRecordingSession stopRecording success audioPath=${audioPath}`).catch(() => undefined);

    if (settings.enableStreaming) {
      await stopRealtimeStreamSession();
    }

    await debugHotkeyLog(
      `finishRecordingSession transcribeAudio start engine=${settings.selectedEngine} model=${activeSelection?.asrModel ?? "unknown"}`,
    ).catch(() => undefined);

    const result = await transcribeAudio({
      audioPath,
      asrEngine: settings.selectedEngine,
      asrModel: activeSelection?.asrModel ?? "",
      diarizationModel: settings.enableDiarization ? (activeSelection?.diarizationModel ?? null) : null,
      speakerMappingModel: settings.enableDiarization ? (activeSelection?.speakerMappingModel ?? null) : null,
      language: settings.language,
      enableDiarization: settings.enableDiarization,
      hotwords: settings.hotwords,
      textProcessingProfile: settings.textProcessingProfile,
      textProcessingProvider: settings.textProcessingProvider,
      textProcessingModel: settings.textProcessingModel,
      textProcessingBaseUrl: settings.textProcessingBaseUrl,
      textProcessingTargetLanguage: settings.textProcessingTargetLanguage,
      targetContext: settings.useAppContext ? await getTargetContext().catch(() => null) : null,
    });

    await debugHotkeyLog(
      `finishRecordingSession transcribeAudio success textLength=${result.text.length} segments=${result.segments.length}`,
    ).catch(() => undefined);

    await outputText(settings.outputMode, result.text);
    useAppStore.getState().saveTranscription(result, settings.retainAudio ? audioPath : null);
    await persistTranscriptionHistory(result, audioPath);
    useAppStore.getState().setToast("转录完成，结果已输出并写入历史记录。");
    const warningMessage = (result.warnings ?? []).find((message) => message.trim().length > 0) ?? null;
    if (warningMessage) {
      useAppStore.getState().setToast(`转录完成，文本处理已回退到原始转写：${warningMessage}`);
    }
    await backendApi.listHistory().then((records) => {
      useAppStore.setState({
        historyRecords: records,
        selectedHistoryId: records[0]?.id ?? null,
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await debugHotkeyLog(`finishRecordingSession failed: ${message}`).catch(() => undefined);
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
    await debugHotkeyLog("finishRecordingSession finally completed").catch(() => undefined);
  }
}

export async function abortRecordingSession() {
  clearCancelResetTimer();
  await debugHotkeyLog("abortRecordingSession start").catch(() => undefined);

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
    await debugHotkeyLog("abortRecordingSession pushOverlayState cancelled").catch(() => undefined);

    cancelResetTimer = window.setTimeout(() => {
      useAppStore.getState().setRecordingCancelled(false);
      cancelResetTimer = null;
      void hideOverlay();
      void debugHotkeyLog("abortRecordingSession hideOverlay after cancelled").catch(() => undefined);
    }, 1400);
  }
}
