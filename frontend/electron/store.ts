/**
 * Settings Store Configuration
 * Persistent settings storage for VoiceScribe using fs
 */

import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';

export interface HotkeyConfig {
    useControl: boolean;
    useOption: boolean;
    useShift: boolean;
    useCommand: boolean;
    selectedKey: string;
}

export interface AppSettings {
    // Hotkey
    hotkey: HotkeyConfig;

    // Engine settings
    engine: string;
    model: string;
    language: string;
    enableDiarization: boolean;
    enableAiRefine: boolean;

    // General settings
    outputFormat: 'clipboard' | 'directInput' | 'both';
    launchAtLogin: boolean;
    enableStreaming: boolean;
    mode: 'dictate' | 'edit_selected' | 'ask_selected';
    editCommand: 'rewrite' | 'summarize' | 'polish' | 'custom';
    customCommandPrompt: string;

    // Vocabulary
    vocabulary: string[];
}

const defaults: AppSettings = {
    hotkey: {
        useControl: false,
        useOption: true,
        useShift: false,
        useCommand: false,
        selectedKey: 'R',
    },
    engine: 'funasr',
    model: 'seaco-paraformer',
    language: 'zh',
    enableDiarization: false,
    enableAiRefine: false,
    outputFormat: 'clipboard',
    launchAtLogin: false,
    enableStreaming: false,
    mode: 'dictate',
    editCommand: 'rewrite',
    customCommandPrompt: '',
    vocabulary: [],
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
            return { ...defaults, ...JSON.parse(data) };
        }
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
    return { ...defaults };
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
        settingsCache[key] = value;
        saveSettings(settingsCache);
    },
    getAll(): AppSettings {
        if (!settingsCache) {
            settingsCache = loadSettings();
        }
        return { ...settingsCache };
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
        store.set(key as keyof AppSettings, value as AppSettings[keyof AppSettings]);
    }
}
