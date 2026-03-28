import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import * as backendApi from "../api/backend";
import * as tauriApi from "../api/tauri";
import { getAutostartEnabled, setAutostartEnabled } from "../lib/autostart";
import type {
  AppSettings,
  BackendRuntimeStatus,
  EngineInfo,
  HistoryRecord,
  HotkeyBinding,
  RealtimeEntry,
  RealtimeSessionState,
  SpeakerInfo,
  TranscribeResult,
  Transcription,
  TranscriptionSegment,
} from "../types";

export type PageKey =
  | "general"
  | "engine"
  | "realtime"
  | "history"
  | "vocabulary"
  | "speaker"
  | "hotkey";

const SETTINGS_KEY = "voicescribe-settings-v1";
const SETTINGS_STORE_FILE = "voicescribe-settings.json";
const SETTINGS_STORE_ENTRY = "settings";
const MAX_TRANSCRIPTION_HISTORY = 20;

const defaultHotkeyBinding: HotkeyBinding = {
  primaryCode: "KeyR",
  primaryKeyCode: 82,
  display: "Ctrl+Shift+R",
  modifiers: {
    ctrl: true,
    shift: true,
    win: false,
    altLeft: false,
    altRight: false,
  },
};

const defaultSettings: AppSettings = {
  selectedEngine: "funasr",
  selectedModel: "seaco-paraformer",
  language: "zh",
  enableDiarization: false,
  outputMode: "directInput",
  hotwords: "",
  enableAIRefine: false,
  enableStreaming: false,
  enableAISummary: false,
  retainAudio: false,
  launchAtLogin: false,
  hotkeyModifiers: 0x3,
  hotkeyKeyCode: 82,
  hotkeyBinding: defaultHotkeyBinding,
};

let settingsStorePromise: Promise<Store> | null = null;
let startBackendPromise: Promise<void> | null = null;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function normalizeSettings(value: Partial<AppSettings> | null | undefined): AppSettings {
  const next = { ...defaultSettings, ...(value ?? {}) };
  next.hotkeyBinding = value?.hotkeyBinding
    ? {
        ...defaultHotkeyBinding,
        ...value.hotkeyBinding,
        modifiers: {
          ...defaultHotkeyBinding.modifiers,
          ...(value.hotkeyBinding.modifiers ?? {}),
        },
      }
    : defaultHotkeyBinding;
  return next;
}

function loadBrowserSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return defaultSettings;
    }
    return normalizeSettings(JSON.parse(raw) as Partial<AppSettings>);
  } catch {
    return defaultSettings;
  }
}

function persistBrowserSettings(settings: AppSettings) {
  try {
    window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Ignore browser persistence errors.
  }
}

async function getSettingsStore(): Promise<Store | null> {
  if (!isTauriRuntime()) {
    return null;
  }

  if (!settingsStorePromise) {
    settingsStorePromise = Store.load(SETTINGS_STORE_FILE);
  }

  try {
    return await settingsStorePromise;
  } catch {
    settingsStorePromise = null;
    return null;
  }
}

async function loadPersistedSettings(): Promise<AppSettings> {
  const store = await getSettingsStore();
  if (!store) {
    return loadBrowserSettings();
  }

  try {
    const value = await store.get<Partial<AppSettings>>(SETTINGS_STORE_ENTRY);
    return normalizeSettings(value);
  } catch {
    return loadBrowserSettings();
  }
}

async function persistSettings(settings: AppSettings) {
  const store = await getSettingsStore();
  if (!store) {
    persistBrowserSettings(settings);
    return;
  }

  await store.set(SETTINGS_STORE_ENTRY, settings);
  await store.save();
}

function createSegmentId(segment: { start: number; end: number }, index: number) {
  return `${segment.start}-${segment.end}-${index}`;
}

function createTranscription(result: TranscribeResult, audioPath: string | null): Transcription {
  const segments: TranscriptionSegment[] = result.segments.map((segment, index) => ({
    ...segment,
    id: createSegmentId(segment, index),
  }));

  return {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    date: new Date().toISOString(),
    duration: result.duration,
    text: result.text,
    segments,
    engine: result.engine,
    model: result.model,
    audioPath,
  };
}

const defaultRealtimeState: RealtimeSessionState = {
  status: "idle",
  entries: [],
  summaries: [],
  error: null,
};

interface AppStore {
  currentPage: PageKey;
  settings: AppSettings;
  settingsHydrated: boolean;
  backendConnected: boolean;
  availableEngines: EngineInfo[];
  backendRuntime: BackendRuntimeStatus | null;
  speakers: SpeakerInfo[];
  toast: string | null;
  isRecording: boolean;
  isTranscribing: boolean;
  recordingCancelled: boolean;
  recordingStartedAt: number | null;
  recordingDuration: number;
  audioLevel: number;
  transcriptions: Transcription[];
  currentTranscription: Transcription | null;
  historyRecords: HistoryRecord[];
  selectedHistoryId: string | null;
  realtime: RealtimeSessionState;
  setPage: (page: PageKey) => void;
  hydrateSettings: () => Promise<void>;
  updateSettings: (partial: Partial<AppSettings>) => void;
  syncAutostart: () => Promise<void>;
  setLaunchAtLogin: (enabled: boolean) => Promise<void>;
  setToast: (message: string | null) => void;
  setRecording: (value: boolean) => void;
  setTranscribing: (value: boolean) => void;
  setRecordingCancelled: (value: boolean) => void;
  setAudioLevel: (value: number) => void;
  saveTranscription: (result: TranscribeResult, audioPath: string | null) => Transcription;
  refreshHistory: () => Promise<void>;
  upsertHistoryRecord: (record: HistoryRecord) => Promise<void>;
  deleteHistoryRecord: (recordId: string) => Promise<void>;
  clearHistoryRecords: () => Promise<void>;
  selectHistoryRecord: (recordId: string | null) => void;
  resetRealtimeSession: () => void;
  setRealtimeStatus: (status: RealtimeSessionState["status"]) => void;
  pushRealtimeEntry: (entry: RealtimeEntry) => void;
  pushRealtimeSummary: (text: string) => void;
  setRealtimeError: (message: string | null) => void;
  checkConnection: () => Promise<void>;
  startBackend: () => Promise<void>;
  stopBackend: () => Promise<void>;
  loadSelectedEngine: () => Promise<void>;
  refreshSpeakers: () => Promise<void>;
  removeSpeaker: (speakerId: string) => Promise<void>;
  addSpeaker: (speaker: SpeakerInfo) => void;
}

export const useAppStore = create<AppStore>((set, get) => ({
  currentPage: "general",
  settings: defaultSettings,
  settingsHydrated: false,
  backendConnected: false,
  availableEngines: [],
  backendRuntime: null,
  speakers: [],
  toast: null,
  isRecording: false,
  isTranscribing: false,
  recordingCancelled: false,
  recordingStartedAt: null,
  recordingDuration: 0,
  audioLevel: 0,
  transcriptions: [],
  currentTranscription: null,
  historyRecords: [],
  selectedHistoryId: null,
  realtime: defaultRealtimeState,
  setPage: (page) => set({ currentPage: page }),
  hydrateSettings: async () => {
    if (get().settingsHydrated) {
      return;
    }

    const settings = await loadPersistedSettings();
    persistBrowserSettings(settings);
    set({ settings, settingsHydrated: true });

    if (isTauriRuntime()) {
      await get().syncAutostart();
    }
  },
  updateSettings: (partial) =>
    set((state) => {
      const next = normalizeSettings({ ...state.settings, ...partial });
      if (!next.enableStreaming) {
        next.enableAISummary = false;
      }
      void persistSettings(next).catch(() => {
        // Ignore persistence failures and keep in-memory state.
      });
      persistBrowserSettings(next);
      return { settings: next };
    }),
  syncAutostart: async () => {
    const enabled = await getAutostartEnabled();
    const next = { ...get().settings, launchAtLogin: enabled };
    persistBrowserSettings(next);
    set({ settings: next });
    void persistSettings(next).catch(() => {
      // Ignore persistence failures and keep in-memory state.
    });
  },
  setLaunchAtLogin: async (enabled) => {
    await setAutostartEnabled(enabled);
    const next = { ...get().settings, launchAtLogin: enabled };
    persistBrowserSettings(next);
    set({ settings: next, toast: enabled ? "已启用开机自启" : "已关闭开机自启" });
    await persistSettings(next);
  },
  setToast: (message) => set({ toast: message }),
  setRecording: (value) =>
    set((state) => ({
      isRecording: value,
      recordingStartedAt: value ? Date.now() : null,
      recordingDuration:
        value || state.recordingStartedAt === null
          ? 0
          : Math.max(0, (Date.now() - state.recordingStartedAt) / 1000),
      recordingCancelled: false,
    })),
  setTranscribing: (value) => set({ isTranscribing: value }),
  setRecordingCancelled: (value) => set({ recordingCancelled: value }),
  setAudioLevel: (value) => set({ audioLevel: value }),
  saveTranscription: (result, audioPath) => {
    const transcription = createTranscription(result, audioPath);
    set((state) => ({
      currentTranscription: transcription,
      transcriptions: [transcription, ...state.transcriptions].slice(0, MAX_TRANSCRIPTION_HISTORY),
    }));
    return transcription;
  },
  refreshHistory: async () => {
    const records = await backendApi.listHistory();
    set((state) => ({
      historyRecords: records,
      selectedHistoryId:
        state.selectedHistoryId && records.some((item) => item.id === state.selectedHistoryId)
          ? state.selectedHistoryId
          : records[0]?.id ?? null,
    }));
  },
  upsertHistoryRecord: async (record) => {
    await backendApi.saveHistory(record);
    await get().refreshHistory();
  },
  deleteHistoryRecord: async (recordId) => {
    await backendApi.deleteHistoryRecord(recordId);
    await get().refreshHistory();
    set({ toast: "历史记录已删除" });
  },
  clearHistoryRecords: async () => {
    await backendApi.clearHistory();
    set({ historyRecords: [], selectedHistoryId: null, toast: "历史记录已清空" });
  },
  selectHistoryRecord: (recordId) => set({ selectedHistoryId: recordId }),
  resetRealtimeSession: () => set({ realtime: defaultRealtimeState }),
  setRealtimeStatus: (status) =>
    set((state) => ({
      realtime: {
        ...state.realtime,
        status,
        error: status === "error" ? state.realtime.error : null,
      },
    })),
  pushRealtimeEntry: (entry) =>
    set((state) => ({
      realtime: {
        ...state.realtime,
        status: "streaming",
        entries: [...state.realtime.entries, entry],
      },
    })),
  pushRealtimeSummary: (text) =>
    set((state) => ({
      realtime: {
        ...state.realtime,
        summaries: [
          ...state.realtime.summaries,
          {
            id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
            createdAt: new Date().toISOString(),
            text,
          },
        ],
      },
    })),
  setRealtimeError: (message) =>
    set((state) => ({
      realtime: {
        ...state.realtime,
        status: message ? "error" : state.realtime.status,
        error: message,
      },
    })),
  checkConnection: async () => {
    const health = await backendApi.healthCheck();
    if (!health) {
      set({ backendConnected: false, availableEngines: [] });
      try {
        const runtime = await tauriApi.backendStatus();
        set({ backendRuntime: runtime });
      } catch {
        // Browser-only dev mode may not expose Tauri invoke.
      }
      return;
    }

    const [engines, runtime] = await Promise.all([
      backendApi.listEngines(),
      tauriApi.backendStatus().catch(() => null),
    ]);
    set({
      backendConnected: true,
      availableEngines: engines,
      backendRuntime: runtime,
    });
  },
  startBackend: async () => {
    if (startBackendPromise) {
      return startBackendPromise;
    }

    startBackendPromise = (async () => {
      try {
        const runtime = await tauriApi.startBackend();
        set({ backendRuntime: runtime });
        await get().checkConnection();
      } finally {
        startBackendPromise = null;
      }
    })();

    return startBackendPromise;
  },
  stopBackend: async () => {
    const runtime = await tauriApi.stopBackend();
    set({ backendRuntime: runtime, backendConnected: false, availableEngines: [] });
  },
  loadSelectedEngine: async () => {
    const { selectedEngine, selectedModel } = get().settings;
    await backendApi.loadEngine(selectedEngine, selectedModel);
    set({ toast: `${selectedEngine} / ${selectedModel} 已加载` });
    await get().checkConnection();
  },
  refreshSpeakers: async () => {
    const speakers = await backendApi.listSpeakers();
    set({ speakers });
  },
  removeSpeaker: async (speakerId) => {
    await backendApi.deleteSpeaker(speakerId);
    set((state) => ({
      speakers: state.speakers.filter((speaker) => speaker.speaker_id !== speakerId),
      toast: "说话人已删除",
    }));
  },
  addSpeaker: (speaker) =>
    set((state) => ({
      speakers: [
        ...state.speakers.filter((item) => item.speaker_id !== speaker.speaker_id),
        speaker,
      ],
      toast: `已注册说话人：${speaker.name}`,
    })),
}));
