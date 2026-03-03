import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type SettingsSection = 'general' | 'engine' | 'vocabulary' | 'speaker' | 'hotkey' | 'history';

export interface TranscriptionSegment {
    start: number;
    end: number;
    text: string;
    speaker?: string;
}

export interface TranscriptionHistory {
    id: string;
    date: string;
    duration: number;
    text: string;
    segments: TranscriptionSegment[];
    engine: string;
    model: string;
    language: string;
    audioPath?: string;
}

export interface AskAnswerPayload {
    question: string;
    answer: string;
    contextPreview?: string;
    timestamp: string;
}

export interface OperationNotice {
    type: 'info' | 'success' | 'error';
    message: string;
    detail?: string;
    timestamp: string;
}

interface AppState {
    selectedSection: SettingsSection;
    setSelectedSection: (section: SettingsSection) => void;
    
    // Transcription history
    transcriptions: TranscriptionHistory[];
    addTranscription: (transcription: Omit<TranscriptionHistory, 'id' | 'date'>) => void;
    updateTranscription: (id: string, updates: Partial<TranscriptionHistory>) => void;
    deleteTranscription: (id: string) => void;
    clearHistory: () => void;

    // Ask mode result panel
    askAnswer: AskAnswerPayload | null;
    setAskAnswer: (payload: AskAnswerPayload | null) => void;

    // In-app operation notice
    operationNotice: OperationNotice | null;
    setOperationNotice: (notice: OperationNotice | null) => void;
}

export const useAppStore = create<AppState>()(
    persist(
        (set) => ({
            selectedSection: 'general',
            setSelectedSection: (section) => set({ selectedSection: section }),
            
            // Transcription history
            transcriptions: [],
            addTranscription: (transcription) => set((state) => ({
                transcriptions: [
                    {
                        ...transcription,
                        id: crypto.randomUUID(),
                        date: new Date().toISOString(),
                    },
                    ...state.transcriptions,
                ],
            })),
            updateTranscription: (id, updates) => set((state) => ({
                transcriptions: state.transcriptions.map((t) =>
                    t.id === id ? { ...t, ...updates } : t
                ),
            })),
            deleteTranscription: (id) => set((state) => ({
                transcriptions: state.transcriptions.filter((t) => t.id !== id),
            })),
            clearHistory: () => set({ transcriptions: [] }),

            askAnswer: null,
            setAskAnswer: (payload) => set({ askAnswer: payload }),

            operationNotice: null,
            setOperationNotice: (notice) => set({ operationNotice: notice }),
        }),
        {
            name: 'voicescribe-storage',
            partialize: (state) => ({
                transcriptions: state.transcriptions,
            }),
        }
    )
);
