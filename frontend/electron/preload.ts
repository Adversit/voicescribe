import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electron', {
    ipcRenderer: {
        send: (channel: string, data?: unknown) => ipcRenderer.send(channel, data),
        on: (channel: string, func: (...args: unknown[]) => void) => {
            const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => func(...args);
            ipcRenderer.on(channel, subscription);
            return () => ipcRenderer.removeListener(channel, subscription);
        },
        invoke: (channel: string, data?: unknown) => ipcRenderer.invoke(channel, data),
        removeAllListeners: (channel: string) => ipcRenderer.removeAllListeners(channel),
    },
    // Generic event listener
    on: (channel: string, func: (...args: unknown[]) => void) => {
        const subscription = (_event: IpcRendererEvent, ...args: unknown[]) => func(...args);
        ipcRenderer.on(channel, subscription);
        return () => ipcRenderer.removeListener(channel, subscription);
    },
    // Recording controls
    recording: {
        toggle: () => ipcRenderer.send('toggle-recording'),
        cancel: () => ipcRenderer.send('cancel-recording'),
        getState: () => ipcRenderer.invoke('get-recording-state'),
        transcribeAudio: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('transcribe-audio', audioBuffer),
        partial: (text: string) => ipcRenderer.send('recording-partial', text),
        complete: (text: string) => ipcRenderer.send('recording-complete', text),
        completeWithResult: (payload: { text: string; result?: unknown }) => ipcRenderer.send('recording-complete-result', payload),
        error: (error: string) => ipcRenderer.send('recording-error', error),
        updateAudioLevel: (level: number) => ipcRenderer.send('recording-audio-level', level),
        onStateChange: (callback: (state: unknown) => void) => {
            const subscription = (_event: IpcRendererEvent, state: unknown) => callback(state);
            ipcRenderer.on('recording-state', subscription);
            return () => ipcRenderer.removeListener('recording-state', subscription);
        },
    },
    // Hotkey management
    hotkey: {
        get: () => ipcRenderer.invoke('get-hotkey'),
        update: (config: unknown) => ipcRenderer.invoke('update-hotkey', config),
    },
    // Backend
    backend: {
        checkHealth: () => ipcRenderer.invoke('check-backend'),
        getEngines: () => ipcRenderer.invoke('get-engines'),
        loadEngine: (engine: string, model: string) => ipcRenderer.invoke('load-engine', engine, model),
        getSpeakers: () => ipcRenderer.invoke('get-speakers'),
        deleteSpeaker: (speakerId: string) => ipcRenderer.invoke('delete-speaker', speakerId),
        registerSpeaker: (name: string, audioBuffer: ArrayBuffer) => ipcRenderer.invoke('register-speaker', name, audioBuffer),
        getModels: () => ipcRenderer.invoke('get-models'),
        downloadModel: (engine: string, model: string) => ipcRenderer.invoke('download-model', engine, model),
        deleteModel: (engine: string, model: string) => ipcRenderer.invoke('delete-model', engine, model),
    },
    // Settings
    settings: {
        get: () => ipcRenderer.invoke('get-settings'),
        update: (partial: unknown) => ipcRenderer.invoke('update-settings', partial),
    },
    // Window
    window: {
        showMain: () => ipcRenderer.send('show-main-window'),
    },
    // Selection bridge
    selection: {
        get: () => ipcRenderer.invoke('selection-get'),
        replace: (text: string) => ipcRenderer.invoke('selection-replace', text),
    },
    // App info
    app: {
        getVersion: () => ipcRenderer.invoke('get-app-version'),
    },
    // Transcription events
    transcription: {
        onComplete: (callback: (data: unknown) => void) => {
            const subscription = (_event: IpcRendererEvent, data: unknown) => callback(data);
            ipcRenderer.on('transcription-complete', subscription);
            return () => ipcRenderer.removeListener('transcription-complete', subscription);
        },
    },
});

// Type declarations for window.electron
export interface ElectronAPI {
    ipcRenderer: {
        send: (channel: string, data?: unknown) => void;
        on: (channel: string, func: (...args: unknown[]) => void) => () => void;
        invoke: (channel: string, data?: unknown) => Promise<unknown>;
        removeAllListeners: (channel: string) => void;
    };
    recording: {
        toggle: () => void;
        cancel: () => void;
        getState: () => Promise<{ isRecording: boolean; startTime: number | null; isTranscribing?: boolean; cancelled?: boolean; audioLevel?: number }>;
        transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; error?: string }>;
        partial: (text: string) => void;
        complete: (text: string) => void;
        completeWithResult: (payload: { text: string; result?: unknown }) => void;
        error: (error: string) => void;
        updateAudioLevel: (level: number) => void;
        onStateChange: (callback: (state: unknown) => void) => () => void;
    };
    hotkey: {
        get: () => Promise<{
            useControl: boolean;
            useOption: boolean;
            useShift: boolean;
            useCommand: boolean;
            selectedKey: string;
        }>;
        update: (config: unknown) => Promise<{ success: boolean; hotkey: string }>;
    };
    backend: {
        checkHealth: () => Promise<{ healthy: boolean; status?: string; engines?: Record<string, boolean> }>;
        getEngines: () => Promise<Array<{ name: string; models: string[]; loaded_model: string | null; available: boolean }>>;
        loadEngine: (engine: string, model: string) => Promise<{ status: string; error?: string }>;
        getSpeakers: () => Promise<Array<{ speaker_id: string; name: string }>>;
        deleteSpeaker: (speakerId: string) => Promise<{ status: string; error?: string }>;
        registerSpeaker: (name: string, audioBuffer: ArrayBuffer) => Promise<{ status: string; speaker_id: string; name: string; error?: string }>;
        getModels: () => Promise<Array<{ engine: string; model: string; available: boolean; downloading: boolean; size_bytes?: number; downloaded_bytes?: number; error?: string }>>;
        downloadModel: (engine: string, model: string) => Promise<{ status: string; error?: string }>;
        deleteModel: (engine: string, model: string) => Promise<{ status: string; error?: string }>;
    };
    settings: {
        get: () => Promise<{
            hotkey: { useControl: boolean; useOption: boolean; useShift: boolean; useCommand: boolean; selectedKey: string };
            engine: string;
            model: string;
            language: string;
            enableDiarization: boolean;
            enableAiRefine: boolean;
            outputFormat: 'clipboard' | 'directInput' | 'both';
            launchAtLogin: boolean;
            enableStreaming: boolean;
            mode: 'dictate' | 'edit_selected' | 'ask_selected';
            editCommand: 'rewrite' | 'summarize' | 'polish' | 'custom';
            customCommandPrompt: string;
            vocabulary: string[];
        }>;
        update: (partial: Record<string, unknown>) => Promise<{ success: boolean }>;
    };
    window: {
        showMain: () => void;
    };
    selection: {
        get: () => Promise<{ success: boolean; text: string; error?: string }>;
        replace: (text: string) => Promise<{ success: boolean; error?: string }>;
    };
    app: {
        getVersion: () => Promise<string>;
    };
    transcription: {
        onComplete: (callback: (data: { text: string }) => void) => () => void;
    };
}

// Type is exported for use in other files
// Global Window interface extended in src/types/electron.d.ts
