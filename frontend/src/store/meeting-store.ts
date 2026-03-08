import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface MeetingUtterance {
  id: string;
  speaker: string;
  speakerId: string;
  text: string;
  start: number;
  end: number;
  confidence: number;
}

export interface MeetingSummary {
  content: string;
  decisions: string[];
  actionItems: Array<{ assignee: string; task: string }>;
  updatedAt: string;
}

export interface MeetingRecord {
  id: string;
  timestamp: number;
  duration: number;
  engine: string;
  utterances: MeetingUtterance[];
  summary: MeetingSummary | null;
  plainText: string;
}

interface MeetingState {
  // Active session
  isRecording: boolean;
  sessionId: string | null;
  currentUtterances: MeetingUtterance[];
  currentSummary: MeetingSummary | null;
  activeSpeaker: string | null;
  recordingStartTime: number | null;

  // History
  meetingHistory: MeetingRecord[];

  // Actions - active session
  startSession: (sessionId: string) => void;
  endSession: () => void;
  addUtterance: (utterance: MeetingUtterance) => void;
  updateUtterance: (id: string, text: string) => void;
  setSummary: (summary: MeetingSummary) => void;
  setActiveSpeaker: (speaker: string | null) => void;

  // Actions - history
  addMeetingRecord: (record: MeetingRecord) => void;
  deleteMeetingRecord: (id: string) => void;
  clearMeetingHistory: () => void;
}

export const useMeetingStore = create<MeetingState>()(
  persist(
    (set, get) => ({
      // Active session state (not persisted)
      isRecording: false,
      sessionId: null,
      currentUtterances: [],
      currentSummary: null,
      activeSpeaker: null,
      recordingStartTime: null,

      // History (persisted)
      meetingHistory: [],

      startSession: (sessionId) =>
        set({
          isRecording: true,
          sessionId,
          currentUtterances: [],
          currentSummary: null,
          activeSpeaker: null,
          recordingStartTime: Date.now(),
        }),

      endSession: () => {
        const state = get();
        if (state.currentUtterances.length > 0) {
          const record: MeetingRecord = {
            id: state.sessionId || crypto.randomUUID(),
            timestamp: state.recordingStartTime || Date.now(),
            duration: (Date.now() - (state.recordingStartTime || Date.now())) / 1000,
            engine: "firered",
            utterances: state.currentUtterances,
            summary: state.currentSummary,
            plainText: state.currentUtterances.map((u) => u.text).join("\n"),
          };
          set((s) => ({
            meetingHistory: [record, ...s.meetingHistory],
          }));
        }
        set({
          isRecording: false,
          sessionId: null,
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

      addMeetingRecord: (record) =>
        set((s) => ({
          meetingHistory: [record, ...s.meetingHistory],
        })),

      deleteMeetingRecord: (id) =>
        set((s) => ({
          meetingHistory: s.meetingHistory.filter((r) => r.id !== id),
        })),

      clearMeetingHistory: () => set({ meetingHistory: [] }),
    }),
    {
      name: "voicescribe-meetings",
      partialize: (state) => ({
        meetingHistory: state.meetingHistory,
      }),
    }
  )
);
