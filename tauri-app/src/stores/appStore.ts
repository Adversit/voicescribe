import { create } from "zustand";
import * as backendApi from "../api/backend";
import * as tauriApi from "../api/tauri";
import type {
  AppSettings,
  BackendRuntimeStatus,
  EngineInfo,
  SpeakerInfo,
  TranscribeResult,
} from "../types";

type PageKey = "general" | "engine" | "vocabulary" | "speaker" | "hotkey";

const SETTINGS_KEY = "voicescribe-settings-v1";

const defaultSettings: AppSettings = {
  selectedEngine: "funasr",
  selectedModel: "seaco-paraformer",
  language: "zh",
  enableDiarization: false,
  outputMode: "directInput",
  hotwords: "",
  enableAIRefine: false,
  hotkeyModifiers: 0x3,
  hotkeyKeyCode: 82,
};

function loadSettings(): AppSettings {
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

function persistSettings(settings: AppSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

interface AppStore {
  currentPage: PageKey;
  settings: AppSettings;
  backendConnected: boolean;
  availableEngines: EngineInfo[];
  backendRuntime: BackendRuntimeStatus | null;
  speakers: SpeakerInfo[];
  toast: string | null;
  isRecording: boolean;
  isTranscribing: boolean;
  audioLevel: number;
  lastResult: TranscribeResult | null;
  setPage: (page: PageKey) => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  setToast: (message: string | null) => void;
  setRecording: (value: boolean) => void;
  setTranscribing: (value: boolean) => void;
  setAudioLevel: (value: number) => void;
  setLastResult: (value: TranscribeResult | null) => void;
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
  settings: loadSettings(),
  backendConnected: false,
  availableEngines: [],
  backendRuntime: null,
  speakers: [],
  toast: null,
  isRecording: false,
  isTranscribing: false,
  audioLevel: 0,
  lastResult: null,
  setPage: (page) => set({ currentPage: page }),
  updateSettings: (partial) =>
    set((state) => {
      const next = { ...state.settings, ...partial };
      persistSettings(next);
      return { settings: next };
    }),
  setToast: (message) => set({ toast: message }),
  setRecording: (value) => set({ isRecording: value }),
  setTranscribing: (value) => set({ isTranscribing: value }),
  setAudioLevel: (value) => set({ audioLevel: value }),
  setLastResult: (value) => set({ lastResult: value }),
  checkConnection: async () => {
    const health = await backendApi.healthCheck();
    if (!health) {
      set({ backendConnected: false });
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
    set({ backendRuntime: runtime, backendConnected: false });
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
