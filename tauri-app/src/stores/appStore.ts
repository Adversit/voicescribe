import { create } from "zustand";
import { Store } from "@tauri-apps/plugin-store";
import * as backendApi from "../api/backend";
import * as tauriApi from "../api/tauri";
import { getAutostartEnabled, setAutostartEnabled } from "../lib/autostart";
import type {
  AppSettings,
  BackendRuntimeStatus,
  EngineInfo,
  SpeakerInfo,
  TranscribeResult,
  Transcription,
  TranscriptionSegment,
} from "../types";

type PageKey = "general" | "engine" | "vocabulary" | "speaker" | "hotkey";

const SETTINGS_KEY = "voicescribe-settings-v1";
const SETTINGS_STORE_FILE = "voicescribe-settings.json";
const SETTINGS_STORE_ENTRY = "settings";
const MAX_TRANSCRIPTION_HISTORY = 20;

const defaultSettings: AppSettings = {
  selectedEngine: "funasr",
  selectedModel: "seaco-paraformer",
  language: "zh",
  enableDiarization: false,
  outputMode: "directInput",
  hotwords: "",
  enableAIRefine: false,
  launchAtLogin: false,
  hotkeyModifiers: 0x3,
  hotkeyKeyCode: 82,
};

let settingsStorePromise: Promise<Store> | null = null;

function isTauriRuntime() {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function loadBrowserSettings(): AppSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return defaultSettings;
    }
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<AppSettings>) };
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
    if (!value) {
      return defaultSettings;
    }
    return { ...defaultSettings, ...value };
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

function createTranscription(result: TranscribeResult, audioPath: string): Transcription {
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
  saveTranscription: (result: TranscribeResult, audioPath: string) => Transcription;
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
      const next = { ...state.settings, ...partial };
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
  setTranscribing: (value) =>
    set({
      isTranscribing: value,
      recordingCancelled: value ? false : get().recordingCancelled,
    }),
  setRecordingCancelled: (value) => set({ recordingCancelled: value }),
  setAudioLevel: (value) => set({ audioLevel: value }),
  saveTranscription: (result, audioPath) => {
    const transcription = createTranscription(result, audioPath);
    set((state) => ({
      currentTranscription: transcription,
      transcriptions: [transcription, ...state.transcriptions].slice(
        0,
        MAX_TRANSCRIPTION_HISTORY,
      ),
    }));
    return transcription;
  },
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
    const runtime = await tauriApi.startBackend();
    set({ backendRuntime: runtime });
    await get().checkConnection();
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
