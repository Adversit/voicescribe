import { create } from "zustand";
import { persist } from "zustand/middleware";

// --- Shared types ---

export interface Utterance {
  id: string;
  speaker: string;
  speakerId: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface Summary {
  content: string;
  decisions: string[];
  actionItems: Array<{ assignee: string; task: string }>;
  updatedAt: string;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
}

// --- Unified recording record ---

export interface RecordingRecord {
  id: string;
  timestamp: number;
  duration: number;
  engine: string;
  model: string;
  language: string;
  text: string;
  segments: Segment[];
  utterances?: Utterance[];
  summary?: Summary | null;
  isStreaming: boolean;
}

// --- Settings section (preserved from app-store) ---

export type SettingsSection =
  | "live-transcript"
  | "general"
  | "engine"
  | "vocabulary"
  | "speaker"
  | "hotkey"
  | "history";

// --- Store interface ---

interface RecordingState {
  // UI
  selectedSection: SettingsSection;
  setSelectedSection: (section: SettingsSection) => void;

  // ---- Runtime state (not persisted) ----
  isRecording: boolean;
  sessionId: string | null;
  currentEngine: string | null;
  currentUtterances: Utterance[];
  currentSummary: Summary | null;
  activeSpeaker: string | null;
  recordingStartTime: number | null;

  // ---- Persisted ----
  history: RecordingRecord[];

  // ---- Actions: active session (streaming) ----
  startSession: (sessionId: string, engine?: string) => void;
  endSession: () => void;
  addUtterance: (utterance: Utterance) => void;
  updateUtterance: (id: string, text: string) => void;
  setSummary: (summary: Summary) => void;
  setActiveSpeaker: (speaker: string | null) => void;

  // ---- Actions: history ----
  addToHistory: (record: Omit<RecordingRecord, "id" | "timestamp">) => void;
  deleteRecord: (id: string) => void;
  updateRecord: (id: string, updates: Partial<RecordingRecord>) => void;
  clearHistory: () => void;
}

export const useRecordingStore = create<RecordingState>()(
  persist(
    (set, get) => ({
      // UI
      selectedSection: "live-transcript",
      setSelectedSection: (section) => set({ selectedSection: section }),

      // Runtime state
      isRecording: false,
      sessionId: null,
      currentEngine: null,
      currentUtterances: [],
      currentSummary: null,
      activeSpeaker: null,
      recordingStartTime: null,

      // Persisted
      history: [],

      // --- Active session actions ---

      startSession: (sessionId, engine) =>
        set({
          isRecording: true,
          sessionId,
          currentEngine: engine || null,
          currentUtterances: [],
          currentSummary: null,
          activeSpeaker: null,
          recordingStartTime: Date.now(),
        }),

      endSession: () => {
        const state = get();
        if (state.currentUtterances.length > 0) {
          const record: RecordingRecord = {
            id: state.sessionId || crypto.randomUUID(),
            timestamp: state.recordingStartTime || Date.now(),
            duration:
              (Date.now() - (state.recordingStartTime || Date.now())) / 1000,
            engine: state.currentEngine || "unknown",
            model: "",
            language: "",
            text: state.currentUtterances.map((u) => u.text).join("\n"),
            segments: [],
            utterances: state.currentUtterances,
            summary: state.currentSummary,
            isStreaming: true,
          };
          set((s) => ({
            history: [record, ...s.history],
          }));
        }
        set({
          isRecording: false,
          sessionId: null,
          currentEngine: null,
          currentUtterances: [],
          currentSummary: null,
          activeSpeaker: null,
          recordingStartTime: null,
        });
      },

      addUtterance: (utterance) =>
        set((s) => ({
          currentUtterances: [...s.currentUtterances, utterance],
          activeSpeaker: utterance.speaker,
        })),

      updateUtterance: (id, text) =>
        set((s) => ({
          currentUtterances: s.currentUtterances.map((u) =>
            u.id === id ? { ...u, text } : u
          ),
        })),

      setSummary: (summary) => set({ currentSummary: summary }),

      setActiveSpeaker: (speaker) => set({ activeSpeaker: speaker }),

      // --- History actions ---

      addToHistory: (record) =>
        set((s) => ({
          history: [
            {
              ...record,
              id: crypto.randomUUID(),
              timestamp: Date.now(),
            },
            ...s.history,
          ],
        })),

      deleteRecord: (id) =>
        set((s) => ({
          history: s.history.filter((r) => r.id !== id),
        })),

      updateRecord: (id, updates) =>
        set((s) => ({
          history: s.history.map((r) =>
            r.id === id ? { ...r, ...updates } : r
          ),
        })),

      clearHistory: () => set({ history: [] }),
    }),
    {
      name: "voicescribe-recordings",
      partialize: (state) => ({
        history: state.history,
      }),
    }
  )
);
