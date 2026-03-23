import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import type { HotkeyConfig } from '../src/lib/hotkey-config';

type RuntimeStatus = 'idle' | 'preparing' | 'ready' | 'error';

type RuntimeModelStatus = {
    asr: {
        engine: string | null;
        model: string | null;
        status: RuntimeStatus;
        error: string | null;
    };
    speakerMapping: {
        enabled: boolean;
        model: string | null;
        status: RuntimeStatus;
        error: string | null;
    };
    streamClustering: {
        enabled: boolean;
        backend: string | null;
        status: RuntimeStatus;
        error: string | null;
    };
};

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
        started: (payload?: { requestId?: string }) => ipcRenderer.send('recording-started', payload),
        startFailed: (payload?: { requestId?: string; error?: string }) =>
            ipcRenderer.send('recording-start-failed', payload),
        transcribeAudio: (audioBuffer: ArrayBuffer) => ipcRenderer.invoke('transcribe-audio', audioBuffer),
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
    runtime: {
        getModelStatus: () => ipcRenderer.invoke('get-runtime-model-status'),
        ensureSpeakerMappingReady: () => ipcRenderer.invoke('ensure-speaker-mapping-ready'),
        ensureStreamClusteringReady: () => ipcRenderer.invoke('ensure-stream-clustering-ready'),
        ensureSessionRuntimeReady: () => ipcRenderer.invoke('ensure-session-runtime-ready'),
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
    testing: {
        runFrontendHistoryTest: (filePath: string) =>
            ipcRenderer.invoke('run-frontend-history-test', filePath),
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
        getState: () => Promise<{ isPreparing?: boolean; isRecording: boolean; startTime: number | null; isTranscribing?: boolean; cancelled?: boolean; audioLevel?: number }>;
        started: (payload?: { requestId?: string }) => void;
        startFailed: (payload?: { requestId?: string; error?: string }) => void;
        transcribeAudio: (audioBuffer: ArrayBuffer) => Promise<{ success: boolean; error?: string; errorType?: string; userMessage?: string }>;
        complete: (text: string) => void;
        completeWithResult: (payload: { text: string; result?: unknown }) => void;
        error: (error: string) => void;
        updateAudioLevel: (level: number) => void;
        onStateChange: (callback: (state: unknown) => void) => () => void;
    };
    hotkey: {
        get: () => Promise<HotkeyConfig>;
        update: (config: HotkeyConfig) => Promise<{ success: boolean; hotkey: string }>;
    };
    backend: {
        checkHealth: () => Promise<{ healthy: boolean; status?: string; engines?: Record<string, boolean>; speaker_model?: string }>;
        getEngines: () => Promise<Array<{ name: string; models: string[]; loaded_model: string | null; available: boolean }>>;
        loadEngine: (engine: string, model: string) => Promise<{ status: string; error?: string; runtime?: RuntimeModelStatus }>;
        getSpeakers: () => Promise<Array<{ speaker_id: string; name: string }>>;
        deleteSpeaker: (speakerId: string) => Promise<{ status: string; error?: string }>;
        registerSpeaker: (name: string, audioBuffer: ArrayBuffer) => Promise<{ status: string; speaker_id: string; name: string; error?: string }>;
        getModels: () => Promise<Array<{ engine: string; model: string; available: boolean; downloading: boolean; size_bytes?: number; downloaded_bytes?: number; error?: string }>>;
        downloadModel: (engine: string, model: string) => Promise<{ status: string; error?: string }>;
        deleteModel: (engine: string, model: string) => Promise<{ status: string; error?: string }>;
    };
    runtime: {
        getModelStatus: () => Promise<RuntimeModelStatus>;
        ensureSpeakerMappingReady: () => Promise<RuntimeModelStatus>;
        ensureStreamClusteringReady: () => Promise<RuntimeModelStatus>;
        ensureSessionRuntimeReady: () => Promise<RuntimeModelStatus>;
    };
    settings: {
        get: () => Promise<{
            hotkey: HotkeyConfig;
            engine: string;
            model: string;
            speakerModel: 'cam++' | 'eres2netv2' | 'eres2net-large';
            language: string;
            enableDiarization: boolean;
            enableAiRefine: boolean;
            enableAiSummary: boolean;
            outputFormat: 'clipboard' | 'directInput' | 'both';
            launchAtLogin: boolean;
            enableStreaming: boolean;
            vadThreshold: number;
            vadMinSpeechMs: number;
            vadHangoverMs: number;
            vadPreRollMs: number;
            vadMaxSegmentS: number;
            speakerMatchThreshold: number;
            activeRegisteredFloorMin: number;
            activeRegisteredFloorOffset: number;
            activeRegisteredKeepMargin: number;
            stableRegisteredFloorOffset: number;
            stableRegisteredKeepMargin: number;
            registeredSwitchFloorMin: number;
            registeredSwitchFloorOffset: number;
            registeredSwitchMargin: number;
            spanContinuityFloorMin: number;
            spanContinuityFloorOffset: number;
            spanContinuityKeepMargin: number;
            spanTopFallbackOffset: number;
            pyannoteWindowS: number;
            pyannoteHopS: number;
            pyannoteChangeSimilarity: number;
            minMultiSpeakerSpanS: number;
            noiseFilterEnabled: boolean;
            noiseMaxDurationS: number;
            noiseRmsThreshold: number;
            noisePeakThreshold: number;
            vocabulary: string[];
            meetingOutputFormat: 'text_only' | 'with_speakers' | 'with_summary' | 'full';
            llmProvider: 'claude_cli' | 'anthropic_api' | 'custom';
            llmModel: string;
            customApiUrl: string;
            customApiKey: string;
            summaryInterval: number;
        }>;
        update: (partial: Record<string, unknown>) => Promise<{ success: boolean; runtime?: RuntimeModelStatus }>;
    };
    window: {
        showMain: () => void;
    };
    app: {
        getVersion: () => Promise<string>;
    };
    transcription: {
        onComplete: (callback: (data: { text: string }) => void) => () => void;
    };
    testing: {
        runFrontendHistoryTest: (filePath: string) => Promise<{
            duration: number;
            engine: string;
            model: string;
            segmentCount: number;
            previewLines: string[];
        }>;
    };
}

// Type is exported for use in other files
// Global Window interface extended in src/types/electron.d.ts
