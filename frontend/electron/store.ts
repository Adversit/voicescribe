/**
 * Settings Store Configuration
 * Persistent settings storage for VoiceScribe using fs
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import {
    createDefaultHotkeyConfig,
    normalizeHotkeyConfig,
    type HotkeyConfig,
} from '../src/lib/hotkey-config';

export interface AppSettings {
    // Hotkey
    hotkey: HotkeyConfig;

    // Engine settings
    engine: string;
    model: string;
    speakerModel: 'cam++' | 'eres2netv2' | 'eres2net-large';
    language: string;
    enableDiarization: boolean;
    enableAiRefine: boolean;
    enableAiSummary: boolean;

    // General settings
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

    // Vocabulary
    vocabulary: string[];

    // Meeting settings
    meetingOutputFormat: 'text_only' | 'with_speakers' | 'with_summary' | 'full';
    llmProvider: 'claude_cli' | 'anthropic_api' | 'custom';
    llmModel: string;
    customApiUrl: string;
    customApiKey: string;
    summaryInterval: number;
}

const FIXED_SPEAKER_MODEL: AppSettings["speakerModel"] = "cam++";

const defaults: AppSettings = {
    hotkey: createDefaultHotkeyConfig(),
    engine: 'firered',
    model: 'firered-aed-l',
    speakerModel: FIXED_SPEAKER_MODEL,
    language: 'zh',
    enableDiarization: false,
    enableAiRefine: false,
    enableAiSummary: false,
    outputFormat: 'clipboard',
    launchAtLogin: false,
    enableStreaming: false,
    vadThreshold: 0.5,
    vadMinSpeechMs: 300,
    vadHangoverMs: 700,
    vadPreRollMs: 200,
    vadMaxSegmentS: 30.0,
    speakerMatchThreshold: 0.6,
    activeRegisteredFloorMin: 0.5,
    activeRegisteredFloorOffset: 0.1,
    activeRegisteredKeepMargin: 0.04,
    stableRegisteredFloorOffset: 0.08,
    stableRegisteredKeepMargin: 0.06,
    registeredSwitchFloorMin: 0.52,
    registeredSwitchFloorOffset: 0.06,
    registeredSwitchMargin: 0.05,
    spanContinuityFloorMin: 0.38,
    spanContinuityFloorOffset: 0.12,
    spanContinuityKeepMargin: 0.08,
    spanTopFallbackOffset: 0.05,
    pyannoteWindowS: 1.2,
    pyannoteHopS: 0.6,
    pyannoteChangeSimilarity: 0.72,
    minMultiSpeakerSpanS: 0.8,
    noiseFilterEnabled: true,
    noiseMaxDurationS: 0.35,
    noiseRmsThreshold: 0.012,
    noisePeakThreshold: 0.04,
    vocabulary: [],
    meetingOutputFormat: 'with_speakers',
    llmProvider: 'claude_cli',
    llmModel: 'haiku',
    customApiUrl: '',
    customApiKey: '',
    summaryInterval: 120,
};

// Get config file path
function getConfigPath(): string {
    const userDataPath = app.getPath('userData');
    return path.join(userDataPath, 'settings.json');
}

// Load settings from file
function loadSettings(): AppSettings {
    try {
        const configPath = getConfigPath();
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf-8');
            const parsed = JSON.parse(data) as Partial<AppSettings> & { hotkey?: unknown };
            return {
                ...defaults,
                ...parsed,
                speakerModel: FIXED_SPEAKER_MODEL,
                hotkey: normalizeHotkeyConfig(parsed.hotkey),
            };
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
    return { ...defaults, speakerModel: FIXED_SPEAKER_MODEL };
}

// Save settings to file
function saveSettings(settings: AppSettings): void {
    try {
        const configPath = getConfigPath();
        fs.writeFileSync(configPath, JSON.stringify(settings, null, 2), 'utf-8');
    } catch (error) {
        console.error('Failed to save settings:', error);
    }
}

// In-memory cache
let settingsCache: AppSettings | null = null;

// Type-safe wrapper for the store
export const store = {
    get<K extends keyof AppSettings>(key: K): AppSettings[K] {
        if (!settingsCache) {
            settingsCache = loadSettings();
        }
        return settingsCache[key];
    },
    set<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
        if (!settingsCache) {
            settingsCache = loadSettings();
        }
        if (key === 'speakerModel') {
            settingsCache[key] = FIXED_SPEAKER_MODEL as AppSettings[K];
        } else {
            settingsCache[key] = value;
        }
        saveSettings(settingsCache);
    },
    getAll(): AppSettings {
        if (!settingsCache) {
            settingsCache = loadSettings();
        }
        return { ...settingsCache, speakerModel: FIXED_SPEAKER_MODEL };
    }
};

export function getSettings(): AppSettings {
    return store.getAll();
}

export function getSetting<K extends keyof AppSettings>(key: K): AppSettings[K] {
    return store.get(key);
}

export function setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): void {
    store.set(key, value);
}

export function updateSettings(partial: Partial<AppSettings>): void {
    for (const [key, value] of Object.entries(partial)) {
        if (key === 'speakerModel') {
            store.set('speakerModel', FIXED_SPEAKER_MODEL);
            continue;
        }
        store.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings]);
    }
}
