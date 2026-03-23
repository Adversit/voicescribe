import { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, clipboard } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { store, getSetting, setSetting, getSettings, updateSettings, type AppSettings } from './store';
import * as backend from './backend';
import { createId, logEvent } from './telemetry';
import {
    buildCancelledRecordingState,
    buildPreparingRecordingState,
    buildStartFailedRecordingState,
    buildStartedRecordingState,
    buildStoppedRecordingState,
    getToggleRecordingAction,
    type RecordingControlState,
} from './recording-control';
import {
    buildSessionRuntimePlan,
    buildSettingsRuntimeRefreshPlan,
    type RuntimeModelState,
    type RuntimeStatus,
} from './runtime-plans';
import { DesktopHotkeyManager } from './windows-hotkey-manager';
import {
    formatHotkeyConfig,
    type HotkeyConfig,
} from '../src/lib/hotkey-config';

// Prevent EPIPE crash dialog when backend process pipe breaks
// NOTE: Do NOT use console.log/error here - it writes to the same broken pipe
process.on('uncaughtException', (err) => {
    if (err.message.includes('EPIPE') || err.message.includes('broken pipe')) {
        return; // silently ignore
    }
    // For non-EPIPE errors, try to write to stderr safely
    try { process.stderr.write(`Uncaught exception: ${err.stack || err.message}\n`); } catch { /* ignore */ }
});

// __dirname is available in CommonJS
const __dirname_resolved = __dirname;

// App icon paths
const iconPath = path.join(__dirname, '../resources/icon_256x256.png');
const trayIconPath = path.join(__dirname, '../resources/icon_32x32.png');

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;

// Recording state
let isPreparingRecording = false;
let isRecording = false;
let isTranscribing = false;
let isCancelled = false;
let recordingStartTime: number | null = null;
let lastTranscription: string | null = null;
let previousWindowTitle: string | null = null; // Track previous window for directInput mode
let currentAudioLevel = 0;
let currentRecordingSessionId: string | null = null;
let pendingRecordingStartRequestId: string | null = null;
let cancelPendingRecordingStart = false;

let runtimeModelState: RuntimeModelState = {
    asr: {
        engine: null,
        model: null,
        status: 'idle',
        error: null,
    },
    speakerMapping: {
        enabled: false,
        model: null,
        status: 'idle',
        error: null,
    },
    streamClustering: {
        enabled: false,
        backend: null,
        status: 'idle',
        error: null,
    },
};

function getRuntimeModelState(): RuntimeModelState {
    return {
        asr: { ...runtimeModelState.asr },
        speakerMapping: { ...runtimeModelState.speakerMapping },
        streamClustering: { ...runtimeModelState.streamClustering },
    };
}

function getRecordingControlState(): RecordingControlState {
    return {
        isPreparing: isPreparingRecording,
        isRecording,
        isTranscribing,
        isCancelled,
        currentAudioLevel,
        recordingStartTime,
        currentRecordingSessionId,
    };
}

function applyRecordingControlState(next: RecordingControlState): void {
    isPreparingRecording = next.isPreparing;
    isRecording = next.isRecording;
    isTranscribing = next.isTranscribing;
    isCancelled = next.isCancelled;
    currentAudioLevel = next.currentAudioLevel;
    recordingStartTime = next.recordingStartTime;
    currentRecordingSessionId = next.currentRecordingSessionId;
}

async function syncAsrRuntimeState(): Promise<RuntimeModelState> {
    const settings = getSettings();
    runtimeModelState.asr.engine = settings.engine || null;
    runtimeModelState.asr.model = settings.model || null;
    runtimeModelState.asr.error = null;

    try {
        const engines = await backend.getEngines();
        const selected = engines.find((item) => item.name === settings.engine);
        runtimeModelState.asr.status =
            selected?.loaded_model === settings.model ? 'ready' : 'idle';
    } catch (error) {
        runtimeModelState.asr.status = 'error';
        runtimeModelState.asr.error = String(error);
    }

    return getRuntimeModelState();
}

async function ensureAsrReady(engine: string, model: string): Promise<RuntimeModelState> {
    await syncAsrRuntimeState();

    if (
        runtimeModelState.asr.status === 'ready' &&
        runtimeModelState.asr.engine === engine &&
        runtimeModelState.asr.model === model
    ) {
        return getRuntimeModelState();
    }

    if (
        runtimeModelState.asr.status === 'preparing' &&
        runtimeModelState.asr.engine === engine &&
        runtimeModelState.asr.model === model
    ) {
        return getRuntimeModelState();
    }

    runtimeModelState.asr = {
        engine,
        model,
        status: 'preparing',
        error: null,
    };

    try {
        const result = await backend.loadEngine(engine, model);
        if (
            result.status !== 'loaded' &&
            result.status !== 'ok' &&
            result.status !== 'already_loaded'
        ) {
            throw new Error(result.status || 'Failed to load ASR engine');
        }
        await syncAsrRuntimeState();
        if (runtimeModelState.asr.status !== 'ready') {
            runtimeModelState.asr.status = 'error';
            runtimeModelState.asr.error = 'ASR model is not ready after load';
        }
    } catch (error) {
        runtimeModelState.asr = {
            engine,
            model,
            status: 'error',
            error: String(error),
        };
    }

    return getRuntimeModelState();
}

function resetSpeakerMappingRuntimeState(
    enabled: boolean,
    model: string | null,
): RuntimeModelState {
    runtimeModelState.speakerMapping = {
        enabled,
        model,
        status: enabled ? 'idle' : 'idle',
        error: null,
    };
    if (!enabled) {
        runtimeModelState.speakerMapping.model = model;
    }
    return getRuntimeModelState();
}

function resetStreamClusteringRuntimeState(enabled: boolean): RuntimeModelState {
    runtimeModelState.streamClustering = {
        enabled,
        backend: null,
        status: enabled ? 'idle' : 'idle',
        error: null,
    };
    return getRuntimeModelState();
}

async function ensureSpeakerMappingReady(
    enabled: boolean,
    speakerModel: string,
): Promise<RuntimeModelState> {
    if (!enabled) {
        return resetSpeakerMappingRuntimeState(false, speakerModel || null);
    }

    if (
        runtimeModelState.speakerMapping.status === 'ready' &&
        runtimeModelState.speakerMapping.model === speakerModel
    ) {
        return getRuntimeModelState();
    }

    if (
        runtimeModelState.speakerMapping.status === 'preparing' &&
        runtimeModelState.speakerMapping.model === speakerModel
    ) {
        return getRuntimeModelState();
    }

    runtimeModelState.speakerMapping = {
        enabled: true,
        model: speakerModel,
        status: 'preparing',
        error: null,
    };

    try {
        const result = await backend.reloadSpeakerModels(false, true, speakerModel);
        const ready = Boolean(
            result.stream_tracker?.available ||
            result.diarizer_status === 'loaded' ||
            result.diarizer_status === 'mock'
        );

        runtimeModelState.speakerMapping = {
            enabled: true,
            model: speakerModel,
            status: ready ? 'ready' : 'error',
            error: ready
                ? null
                : result.diarizer_error ||
                  result.stream_tracker_error ||
                  'Speaker mapping model is not ready',
        };
    } catch (error) {
        runtimeModelState.speakerMapping = {
            enabled: true,
            model: speakerModel,
            status: 'error',
            error: String(error),
        };
    }

    return getRuntimeModelState();
}

async function ensureStreamClusteringReady(
    enabled: boolean,
    speakerModel: string,
): Promise<RuntimeModelState> {
    if (!enabled) {
        return resetStreamClusteringRuntimeState(false);
    }

    if (
        runtimeModelState.streamClustering.status === 'ready' &&
        runtimeModelState.streamClustering.backend
    ) {
        return getRuntimeModelState();
    }

    if (runtimeModelState.streamClustering.status === 'preparing') {
        return getRuntimeModelState();
    }

    runtimeModelState.streamClustering = {
        enabled: true,
        backend: null,
        status: 'preparing',
        error: null,
    };

    try {
        const result = await backend.reloadSpeakerModels(true, false, speakerModel);
        const ready = Boolean(result.stream_tracker?.available);

        runtimeModelState.streamClustering = {
            enabled: true,
            backend: result.stream_tracker?.backend || null,
            status: ready ? 'ready' : 'error',
            error: ready
                ? null
                : result.stream_tracker_error || 'Streaming clustering backend is not ready',
        };
    } catch (error) {
        runtimeModelState.streamClustering = {
            enabled: true,
            backend: null,
            status: 'error',
            error: String(error),
        };
    }

    return getRuntimeModelState();
}

async function ensureRuntimeReadyForSession(): Promise<RuntimeModelState> {
    const settings = getSettings();
    await syncAsrRuntimeState();
    const plan = buildSessionRuntimePlan(settings, runtimeModelState);

    if (plan.ensureAsr) {
        await ensureAsrReady(settings.engine, settings.model);
    }

    if (plan.ensureSpeakerMapping) {
        await ensureSpeakerMappingReady(true, settings.speakerModel);
    } else {
        resetSpeakerMappingRuntimeState(false, settings.speakerModel);
    }

    if (plan.ensureStreamClustering) {
        await ensureStreamClusteringReady(true, settings.speakerModel);
    } else {
        resetStreamClusteringRuntimeState(false);
    }

    return getRuntimeModelState();
}

type TranscribeFailure = {
    errorType: 'transcription_failure' | 'output_failure';
    userMessage: string;
    detail: string;
};

function classifyTranscribeFailure(error: unknown): TranscribeFailure {
    const detail = String(error);
    const lower = detail.toLowerCase();

    if (lower.includes('empty audio upload')) {
        return {
            errorType: 'transcription_failure',
            userMessage: '转录失败：音频为空',
            detail,
        };
    }
    if (lower.includes('invalid or unsupported audio file') || lower.includes('audio duration is zero')) {
        return {
            errorType: 'transcription_failure',
            userMessage: '转录失败：音频文件无效',
            detail,
        };
    }
    if (lower.includes('no speech detected in audio')) {
        return {
            errorType: 'transcription_failure',
            userMessage: '转录失败：未检测到语音',
            detail,
        };
    }

    return {
        errorType: 'transcription_failure',
        userMessage: '转录失败：后端处理失败',
        detail,
    };
}

// Current hotkey configuration (loaded from store)
let currentHotkey: HotkeyConfig = getSetting('hotkey');
let desktopHotkeyManager: DesktopHotkeyManager | null = null;

// App quitting flag
let appIsQuitting = false;

// Backend process
let backendProcess: ChildProcess | null = null;

// Temp audio file path for current recording
let currentAudioPath: string | null = null;
const frontendHistoryTestPath = process.env.VOICESCRIBE_TEST_HISTORY_WAV_PATH || '';
const frontendHistoryTestExitOnComplete = process.env.VOICESCRIBE_TEST_EXIT_ON_COMPLETE === '1';
const frontendHistoryTestReportPath =
    process.env.VOICESCRIBE_TEST_HISTORY_REPORT ||
    path.join(__dirname_resolved, '../../logs/system-tests/frontend-history-test-report.json');
const frontendHistoryTestTimeoutMs = Number(
    process.env.VOICESCRIBE_TEST_HISTORY_TIMEOUT_MS ||
    process.env.VOICESCRIBE_TRANSCRIBE_TIMEOUT_MS ||
    3600000,
);
const frontendHistoryPersistTimeoutMs = Number(
    process.env.VOICESCRIBE_TEST_HISTORY_PERSIST_TIMEOUT_MS || 30000,
);

// -------------------------------------
// Window Creation
// -------------------------------------

function createMainWindow() {
    mainWindow = new BrowserWindow({
        width: 720,
        height: 560,
        icon: iconPath,
        title: 'VoiceScribe',
        show: true,
        autoHideMenuBar: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const startUrl = process.env.ELECTRON_START_URL || `file://${path.join(__dirname, '../out/index.html')}`;

    if (process.env.ELECTRON_START_URL) {
        mainWindow.loadURL(startUrl);
        // DevTools can be opened manually with F12 or Ctrl+Shift+I
        // mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../out/index.html'));
    }

    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    if (process.platform !== 'darwin') {
        mainWindow.removeMenu();
        mainWindow.setMenuBarVisibility(false);
        mainWindow.setAutoHideMenuBar(true);
    }

    // Hide window instead of closing when close button clicked (tray app behavior)
    mainWindow.on('close', (event) => {
        if (tray && !appIsQuitting) {
            event.preventDefault();
            mainWindow?.hide();
        }
    });
}

function createOverlayWindow() {
    overlayWindow = new BrowserWindow({
        width: 280,
        height: 80,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        resizable: false,
        movable: true,  // Allow window to be moved
        show: false,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
    });

    const overlayUrl = process.env.ELECTRON_START_URL
        ? `${process.env.ELECTRON_START_URL}/overlay`
        : `file://${path.join(__dirname, '../out/overlay.html')}`;

    overlayWindow.loadURL(overlayUrl);

    // Position at bottom center of screen
    const { screen } = require('electron');
    const primaryDisplay = screen.getPrimaryDisplay();
    const { width, height } = primaryDisplay.workAreaSize;
    overlayWindow.setPosition(
        Math.round((width - 280) / 2),
        height - 120
    );

    // Make window draggable by clicking anywhere
    overlayWindow.setIgnoreMouseEvents(false);
}

function formatHistoryPreview(text: string, maxLines = 20): string[] {
    return text
        .split(/\r?\n/)
        .map((line) => line.trimEnd())
        .filter((line) => line.length > 0)
        .slice(0, maxLines);
}

async function getRendererHistoryStorageSnapshot(): Promise<{
    count: number;
    latestTimestamp: number | null;
    latestTextLength: number;
    latestSegmentCount: number;
}> {
    if (!mainWindow) {
        throw new Error('Main window is not available');
    }

    const script = `
        (() => {
            const raw = window.localStorage.getItem("voicescribe-recordings");
            if (!raw) {
                return {
                    count: 0,
                    latestTimestamp: null,
                    latestTextLength: 0,
                    latestSegmentCount: 0,
                };
            }
            try {
                const parsed = JSON.parse(raw);
                const history = Array.isArray(parsed?.state?.history) ? parsed.state.history : [];
                const latest = history[0] || null;
                return {
                    count: history.length,
                    latestTimestamp: latest ? Number(latest.timestamp || 0) : null,
                    latestTextLength: latest ? String(latest.text || "").length : 0,
                    latestSegmentCount: latest && Array.isArray(latest.segments) ? latest.segments.length : 0,
                };
            } catch (error) {
                return {
                    count: -1,
                    latestTimestamp: null,
                    latestTextLength: 0,
                    latestSegmentCount: 0,
                };
            }
        })()
    `;

    return mainWindow.webContents.executeJavaScript(script, true) as Promise<{
        count: number;
        latestTimestamp: number | null;
        latestTextLength: number;
        latestSegmentCount: number;
    }>;
}

function getHistoryLevelDbDir(): string {
    return path.join(app.getPath('userData'), 'Local Storage', 'leveldb');
}

function getHistoryLevelDbSnapshot(): {
    dir: string;
    exists: boolean;
    latestWriteMs: number;
    signature: string;
} {
    const dir = getHistoryLevelDbDir();
    if (!fs.existsSync(dir)) {
        return {
            dir,
            exists: false,
            latestWriteMs: 0,
            signature: '',
        };
    }

    const entries = fs
        .readdirSync(dir)
        .map((name) => {
            const fullPath = path.join(dir, name);
            const stat = fs.statSync(fullPath);
            return `${name}:${stat.size}:${stat.mtimeMs}`;
        })
        .sort();

    const latestWriteMs = entries.reduce((latest, entry) => {
        const parts = entry.split(':');
        const mtimeMs = Number(parts[2] || 0);
        return Math.max(latest, mtimeMs);
    }, 0);

    return {
        dir,
        exists: true,
        latestWriteMs,
        signature: entries.join('|'),
    };
}

async function waitForHistoryPersistFlush(
    baseline: {
        latestWriteMs: number;
        signature: string;
    },
    timeoutMs = frontendHistoryPersistTimeoutMs,
): Promise<{
    dir: string;
    latestWriteMs: number;
    signatureChanged: boolean;
    writeAdvanced: boolean;
}> {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
        const current = getHistoryLevelDbSnapshot();
        const signatureChanged = current.signature !== baseline.signature;
        const writeAdvanced = current.latestWriteMs > baseline.latestWriteMs;
        if (signatureChanged || writeAdvanced) {
            return {
                dir: current.dir,
                latestWriteMs: current.latestWriteMs,
                signatureChanged,
                writeAdvanced,
            };
        }
        await new Promise((resolve) => setTimeout(resolve, 500));
    }

    const current = getHistoryLevelDbSnapshot();
    throw new Error(
        `Timed out waiting for history persist flush in ${current.dir}; latestWriteMs=${current.latestWriteMs}`,
    );
}

async function waitForRendererHistoryEntry(
    startedAt: number,
    timeoutMs = 30000,
): Promise<{
    duration: number;
    engine: string;
    model: string;
    segmentCount: number;
    previewLines: string[];
}> {
    if (!mainWindow) {
        throw new Error('Main window is not available');
    }

    const script = `
        (async () => {
            const startedAt = ${JSON.stringify(startedAt)};
            const timeoutMs = ${JSON.stringify(timeoutMs)};
            const start = Date.now();
            while (Date.now() - start < timeoutMs) {
                const raw = window.localStorage.getItem("voicescribe-recordings");
                if (raw) {
                    try {
                        const parsed = JSON.parse(raw);
                        const history = Array.isArray(parsed?.state?.history) ? parsed.state.history : [];
                        const latest = history.find((item) => Number(item?.timestamp || 0) >= startedAt);
                        if (latest) {
                            return {
                                duration: Number(latest.duration || 0),
                                engine: String(latest.engine || ""),
                                model: String(latest.model || ""),
                                segmentCount: Array.isArray(latest.segments) ? latest.segments.length : 0,
                                text: String(latest.text || ""),
                            };
                        }
                    } catch (error) {
                        // ignore parse errors while waiting for persist flush
                    }
                }
                await new Promise((resolve) => setTimeout(resolve, 500));
            }
            throw new Error("Timed out waiting for frontend history entry");
        })()
    `;

    const latest = await mainWindow.webContents.executeJavaScript(script, true) as {
        duration: number;
        engine: string;
        model: string;
        segmentCount: number;
        text: string;
    };

    return {
        duration: latest.duration,
        engine: latest.engine,
        model: latest.model,
        segmentCount: latest.segmentCount,
        previewLines: formatHistoryPreview(latest.text),
    };
}

async function runFrontendHistoryTest(filePath: string): Promise<{
    duration: number;
    engine: string;
    model: string;
    segmentCount: number;
    previewLines: string[];
}> {
    const resolvedPath = path.resolve(filePath);
    if (!fs.existsSync(resolvedPath)) {
        throw new Error(`Frontend history test file not found: ${resolvedPath}`);
    }

    const tempDir = os.tmpdir();
    const tempAudioPath = path.join(tempDir, `voicescribe_history_test_${Date.now()}.wav`);
    fs.copyFileSync(resolvedPath, tempAudioPath);

    currentRecordingSessionId = createId('test');
    isTranscribing = true;
    broadcastRecordingState();
    updateTrayMenu();

    const startedAt = Date.now();
    const persistBaseline = getHistoryLevelDbSnapshot();
    const settings = getSettings();
    console.log(`[FrontendHistoryTest] Starting test for: ${resolvedPath}`);
    console.log(`[FrontendHistoryTest] Started at: ${new Date(startedAt).toISOString()}`);
    console.log(
        `[FrontendHistoryTest] History LevelDB baseline: dir=${persistBaseline.dir} exists=${persistBaseline.exists} latestWriteMs=${persistBaseline.latestWriteMs}`,
    );
    console.log(
        `[FrontendHistoryTest] Preloading runtime speaker mapping: diarization=${settings.enableDiarization} speakerModel=${settings.speakerModel}`,
    );
    const speakerMappingState = await ensureSpeakerMappingReady(
        Boolean(settings.enableDiarization),
        settings.speakerModel,
    );
    console.log(
        `[FrontendHistoryTest] Speaker mapping preload result: status=${speakerMappingState.speakerMapping.status} model=${speakerMappingState.speakerMapping.model} error=${speakerMappingState.speakerMapping.error ?? 'none'}`,
    );
    await transcribeAudioFile(tempAudioPath, {
        recordingSessionId: currentRecordingSessionId,
        transcribeRequestId: createId('req'),
        timeoutMs: frontendHistoryTestTimeoutMs,
    });
    console.log(`[FrontendHistoryTest] Backend transcription returned at: ${new Date().toISOString()}`);

    const historyResult = await waitForRendererHistoryEntry(startedAt);
    console.log(
        `[FrontendHistoryTest] Renderer history entry observed at: ${new Date().toISOString()} duration=${historyResult.duration} segmentCount=${historyResult.segmentCount}`
    );
    const storageSnapshot = await getRendererHistoryStorageSnapshot();
    console.log(
        `[FrontendHistoryTest] Renderer localStorage snapshot after history detection: count=${storageSnapshot.count} latestTimestamp=${storageSnapshot.latestTimestamp ?? 'none'} latestTextLength=${storageSnapshot.latestTextLength} latestSegmentCount=${storageSnapshot.latestSegmentCount}`
    );
    const persistFlush = await waitForHistoryPersistFlush(persistBaseline);
    console.log(
        `[FrontendHistoryTest] History persist flush observed at: ${new Date().toISOString()} dir=${persistFlush.dir} latestWriteMs=${persistFlush.latestWriteMs} signatureChanged=${persistFlush.signatureChanged} writeAdvanced=${persistFlush.writeAdvanced}`
    );
    fs.mkdirSync(path.dirname(frontendHistoryTestReportPath), { recursive: true });
    fs.writeFileSync(
        frontendHistoryTestReportPath,
        JSON.stringify(
            {
                filePath: resolvedPath,
                capturedAt: new Date().toISOString(),
                historyPersist: {
                    dir: persistFlush.dir,
                    latestWriteMs: persistFlush.latestWriteMs,
                    signatureChanged: persistFlush.signatureChanged,
                    writeAdvanced: persistFlush.writeAdvanced,
                },
                ...historyResult,
            },
            null,
            2,
        ),
        'utf8',
    );

    console.log(`[FrontendHistoryTest] History report written: ${frontendHistoryTestReportPath}`);
    if (historyResult.previewLines.length > 0) {
        console.log('[FrontendHistoryTest] Latest history preview (first 20 lines):');
        for (const line of historyResult.previewLines) {
            console.log(`[FrontendHistoryTest] ${line}`);
        }
    }

    return historyResult;
}

// -------------------------------------
// System Tray
// -------------------------------------

function createTray() {
    const trayImage = nativeImage.createFromPath(trayIconPath);
    tray = new Tray(trayImage);
    tray.setToolTip('VoiceScribe');

    updateTrayMenu();

    tray.on('click', () => {
        // Toggle recording on tray icon click
        toggleRecording();
    });

    tray.on('double-click', () => {
        // Show main window on double-click
        showMainWindow();
    });
}

function updateTrayMenu() {
    if (!tray) return;

    const contextMenu = Menu.buildFromTemplate([
        {
            label: isRecording ? '🔴 录音中...' : '⚪ 待命',
            enabled: false,
        },
        { type: 'separator' },
        {
            label: isRecording ? '停止录音' : '开始录音',
            click: () => toggleRecording(),
        },
        { type: 'separator' },
        {
            label: '复制最近结果',
            enabled: !!lastTranscription,
            click: () => {
                if (lastTranscription) {
                    clipboard.writeText(lastTranscription);
                }
            },
        },
        { type: 'separator' },
        {
            label: '设置...',
            click: () => showMainWindow(),
            accelerator: 'CmdOrCtrl+,',
        },
        {
            label: '打开主窗口',
            click: () => showMainWindow(),
        },
        { type: 'separator' },
        {
            label: '退出 VoiceScribe',
            click: () => {
                appIsQuitting = true;
                app.quit();
            },
            accelerator: 'CmdOrCtrl+Q',
        },
    ]);

    tray.setContextMenu(contextMenu);
}

function showMainWindow() {
    if (mainWindow) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.show();
        mainWindow.focus();
    } else {
        createMainWindow();
    }
}

// -------------------------------------
// Global Shortcuts
// -------------------------------------

function getHotkeyString(): string {
    return currentHotkey.recordingShortcut?.keys?.length
        ? formatHotkeyConfig(currentHotkey)
        : '';
    const parts: string[] = [];
    if (currentHotkey.useControl) parts.push('Ctrl');
    if (currentHotkey.useOption) parts.push('Alt');
    if (currentHotkey.useShift) parts.push('Shift');
    if (currentHotkey.useCommand) parts.push('Super');
    // Treat "no key" sentinel as empty.
    const key: string = currentHotkey.selectedKey ?? '';
    if (key && key !== '无') parts.push(key);
    return parts.join('+');
}

function registerConfiguredHotkeys() {
    desktopHotkeyManager?.dispose();
    desktopHotkeyManager = new DesktopHotkeyManager({
        onHoldStart: () => {
            if (!isPreparingRecording && !isRecording) {
                startRecording();
            }
        },
        onHoldEnd: () => {
            if (isPreparingRecording) {
                cancelPendingRecordingStart = true;
                console.log('[Recording] Hold released while preparing; start will be cancelled');
                return;
            }
            if (isRecording) {
                stopRecording();
            }
        },
        onToggle: () => {
            if (isPreparingRecording) {
                cancelPendingRecordingStart = true;
                console.log('[Recording] Toggle requested while preparing; start will be cancelled');
                return;
            }
            toggleRecording();
        },
        onCancel: () => {
            cancelRecording();
        },
    });
    desktopHotkeyManager
        .updateConfig(currentHotkey)
        .catch((error) => console.error(`[Hotkey] Failed to register desktop hook: ${String(error)}`));
}

// -------------------------------------
// Recording Logic
// -------------------------------------

function getRecordingStatePayload() {
    return {
        isPreparing: isPreparingRecording,
        isRecording,
        isTranscribing,
        cancelled: isCancelled,
        startTime: recordingStartTime,
        audioLevel: currentAudioLevel,
    };
}

function broadcastRecordingState() {
    const payload = getRecordingStatePayload();

    if (overlayWindow) {
        try {
            if (overlayWindow.webContents.isLoading()) {
                overlayWindow.webContents.once('did-finish-load', () => {
                    overlayWindow?.webContents.send('recording-state', payload);
                });
            } else {
                overlayWindow.webContents.send('recording-state', payload);
            }
        } catch {
            // ignore (window destroyed / navigation race)
        }
    }

    if (mainWindow) {
        try {
            mainWindow.webContents.send('recording-state', payload);
        } catch {
            // ignore
        }
    }
}

function toggleRecording() {
    if (isPreparingRecording) {
        cancelPendingRecordingStart = true;
        console.log('[Recording] Start is still preparing, toggle will cancel once ready');
        return;
    }

    if (getToggleRecordingAction(getRecordingControlState()) === 'stop') {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    const requestId = createId('start');
    pendingRecordingStartRequestId = requestId;
    cancelPendingRecordingStart = false;
    const nextState = buildPreparingRecordingState(getRecordingControlState());
    applyRecordingControlState(nextState);

    // Save current active window title (for directInput mode)
    // Note: On Windows, we can't easily get the active window from Electron
    // We'll rely on the fact that the user will switch back to their app
    previousWindowTitle = null; // Reset
    logEvent('electron.main', 'recording_start_requested', {
        start_request_id: requestId,
        output_mode: getSettings().outputFormat || 'clipboard',
    });
    console.log('[Recording] Preparing recording runtime...');

    // Show overlay window and send state when ready
    if (overlayWindow) {
        overlayWindow.show();
        // Add small delay to ensure React has mounted.
        setTimeout(() => broadcastRecordingState(), 50);
    }

    // Notify main window + overlay
    broadcastRecordingState();

    // Update tray menu
    updateTrayMenu();

    console.log('Recording preparation started');

    if (mainWindow) {
        mainWindow.webContents.send('start-audio-recording', { requestId });
    }
}

function stopRecording() {
    if (!isRecording) {
        console.log('[Recording] Stop ignored because capture is not active');
        return;
    }

    const duration = recordingStartTime ? (Date.now() - recordingStartTime) / 1000 : 0;
    const recordingSessionId = currentRecordingSessionId;
    applyRecordingControlState(buildStoppedRecordingState(getRecordingControlState()));

    // Notify main window + overlay
    broadcastRecordingState();

    // Update tray
    updateTrayMenu();

    console.log(`Recording stopped. Duration: ${duration.toFixed(1)}s`);
    logEvent('electron.main', 'recording_stopped', {
        recording_session_id: recordingSessionId,
        recording_duration_s: Number(duration.toFixed(3)),
    });

    // Request renderer to stop audio recording and get the audio data
    if (mainWindow) {
        mainWindow.webContents.send('stop-audio-recording');
    }
}

function cancelRecording() {
    if (!(isPreparingRecording || isRecording)) {
        return;
    }

    const recordingSessionId = currentRecordingSessionId;
    pendingRecordingStartRequestId = null;
    cancelPendingRecordingStart = false;
    applyRecordingControlState(buildCancelledRecordingState(getRecordingControlState()));
    logEvent('electron.main', 'recording_cancelled', {
        recording_session_id: recordingSessionId,
    }, 'WARN');

    if (overlayWindow) {
        broadcastRecordingState();
        setTimeout(() => overlayWindow?.hide(), 1000);
    }

    if (mainWindow) {
        mainWindow.webContents.send('cancel-audio-recording');
    }

    updateTrayMenu();
    console.log('Recording cancelled');

    setTimeout(() => {
        isCancelled = false;
        broadcastRecordingState();
    }, 1000);
}

function transcriptionComplete(text: string, result?: backend.TranscribeResult) {
    console.log('[Main] ===== TRANSCRIPTION COMPLETE =====');
    console.log('[Main] Text:', text.substring(0, 50));
    console.log('[Main] Result:', result);
    logEvent('electron.main', 'transcription_complete', {
        recording_session_id: currentRecordingSessionId,
        result_duration_s: result?.duration,
        segment_count: result?.segments?.length,
        has_result: Boolean(result),
        preview: text.substring(0, 80),
    });
    
    lastTranscription = text;

    // Keep overlay visible for a moment to show completion
    // Then hide after a short delay
    setTimeout(() => {
        currentRecordingSessionId = null;
        if (overlayWindow) {
            overlayWindow.hide();
            isTranscribing = false;
            isCancelled = false;
            currentAudioLevel = 0;
            broadcastRecordingState();
        }
    }, 500); // Show completion state for 500ms

    // Notify main window with full result for history
    if (mainWindow) {
        console.log('[Main] Sending transcription-complete event to main window');
        console.log('[Main] Event data:', { text, result });
        mainWindow.webContents.send('transcription-complete', { text, result });
    } else {
        console.error('[Main] Main window is null, cannot send transcription-complete event');
    }

    // Update tray
    updateTrayMenu();

    // Handle output based on settings
    handleTranscriptionOutput(text);
}

function handleTranscriptionOutput(text: string) {
    const settings = getSettings();
    let outputMode = settings.outputFormat || 'clipboard';

    console.log(`[Output] Mode: ${outputMode}, Text: ${text.substring(0, 50)}...`);

    if (outputMode === 'clipboard') {
        clipboard.writeText(text);
        console.log('[Output] Copied to clipboard');
        return;
    }

    // For directInput or both modes:
    // 1. Copy text to clipboard
    clipboard.writeText(text);
    console.log('[Output] Text copied to clipboard');

    if (outputMode === 'directInput' || outputMode === 'both') {
        // 2. Wait a bit for clipboard to be ready
        // 3. Simulate paste (user should already be in their target app)
        setTimeout(() => {
            simulatePaste();
        }, 300); // Increased delay to ensure clipboard is ready
    }
}

function simulatePaste() {
    // Use Windows SendInput API via node-ffi or similar
    // For now, we'll use a simpler approach with uiohook-napi or just clipboard
    
    // Method 1: Try robotjs if available (optional dependency)
    try {
        const robot = require('robotjs');
        robot.keyTap('v', ['control']);
        console.log('[Output] Simulated Ctrl+V paste using robotjs');
        return;
    } catch (error) {
        // robotjs not available, try alternative methods
    }

    // Method 2: Use PowerShell to send keys (Windows-specific)
    if (process.platform === 'win32') {
        try {
            const { exec } = require('child_process');
            // Use PowerShell to send Ctrl+V with proper escaping
            const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^v')`;
            exec(`powershell -Command "${script}"`, (error: Error | null) => {
                if (error) {
                    logEvent('electron.main', 'output_failed', {
                        recording_session_id: currentRecordingSessionId,
                        error_type: 'output_failure',
                        error_message: '输出失败：已复制到剪贴板，请手动粘贴',
                        error_detail: error.message,
                    }, 'WARN');
                    console.warn('[Output] PowerShell paste failed:', error.message);
                    console.log('[Output] 输出失败：已复制到剪贴板，请手动粘贴');
                } else {
                    console.log('[Output] Simulated Ctrl+V paste using PowerShell');
                }
            });
            return;
        } catch (error) {
            logEvent('electron.main', 'output_failed', {
                recording_session_id: currentRecordingSessionId,
                error_type: 'output_failure',
                error_message: '输出失败：已复制到剪贴板，请手动粘贴',
                error_detail: String(error),
            }, 'WARN');
            console.warn('[Output] PowerShell method failed:', error);
        }
    }

    // Fallback: Just notify user
    logEvent('electron.main', 'output_failed', {
        recording_session_id: currentRecordingSessionId,
        error_type: 'output_failure',
        error_message: '输出失败：已复制到剪贴板，请手动粘贴',
    }, 'WARN');
    console.log('[Output] 输出失败：已复制到剪贴板，请手动粘贴');
}

// -------------------------------------
// IPC Handlers
// -------------------------------------

function setupIpcHandlers() {
    // Get current recording state
    ipcMain.handle('get-recording-state', () => {
        return {
            isPreparing: isPreparingRecording,
            isRecording,
            startTime: recordingStartTime,
            isTranscribing,
            cancelled: isCancelled,
            audioLevel: currentAudioLevel,
        };
    });

    // Toggle recording from renderer
    ipcMain.on('toggle-recording', () => {
        toggleRecording();
    });

    ipcMain.on('recording-started', (_event, payload?: { requestId?: string }) => {
        if (
            pendingRecordingStartRequestId &&
            payload?.requestId &&
            payload.requestId !== pendingRecordingStartRequestId
        ) {
            return;
        }

        pendingRecordingStartRequestId = null;
        if (cancelPendingRecordingStart) {
            cancelPendingRecordingStart = false;
            const cancelledState = buildCancelledRecordingState(
                buildStartedRecordingState(getRecordingControlState(), createId('rec'), Date.now()),
            );
            applyRecordingControlState(cancelledState);
            broadcastRecordingState();
            updateTrayMenu();
            if (mainWindow) {
                mainWindow.webContents.send('cancel-audio-recording');
            }
            if (overlayWindow) {
                setTimeout(() => overlayWindow?.hide(), 1000);
            }
            setTimeout(() => {
                isCancelled = false;
                broadcastRecordingState();
            }, 1000);
            console.log('[Recording] Start completed after release/cancel request; capture cancelled');
            return;
        }

        applyRecordingControlState(
            buildStartedRecordingState(getRecordingControlState(), createId('rec'), Date.now()),
        );

        logEvent('electron.main', 'recording_started', {
            recording_session_id: currentRecordingSessionId,
            output_mode: getSettings().outputFormat || 'clipboard',
        });
        console.log('[Recording] Recording capture started');

        if (overlayWindow) {
            overlayWindow.show();
            setTimeout(() => broadcastRecordingState(), 50);
        }

        broadcastRecordingState();
        updateTrayMenu();
    });

    ipcMain.on('recording-start-failed', (_event, payload?: { requestId?: string; error?: string }) => {
        if (
            pendingRecordingStartRequestId &&
            payload?.requestId &&
            payload.requestId !== pendingRecordingStartRequestId
        ) {
            return;
        }

        pendingRecordingStartRequestId = null;
        cancelPendingRecordingStart = false;
        applyRecordingControlState(buildStartFailedRecordingState(getRecordingControlState()));
        broadcastRecordingState();
        updateTrayMenu();

        if (overlayWindow) {
            setTimeout(() => overlayWindow?.hide(), 200);
        }

        if (payload?.error) {
            console.error('[Recording] Failed to start recording:', payload.error);
        }
    });

    // Cancel recording
    ipcMain.on('cancel-recording', () => {
        cancelRecording();
    });

    // Update hotkey configuration
    ipcMain.handle('update-hotkey', (_event, config: HotkeyConfig) => {
        currentHotkey = config;
        setSetting('hotkey', config); // Save to store
        registerConfiguredHotkeys();
        updateTrayMenu();
        return { success: true, hotkey: getHotkeyString() };
    });

    // Get current hotkey
    ipcMain.handle('get-hotkey', () => {
        return currentHotkey;
    });

    // Show main window
    ipcMain.on('show-main-window', () => {
        showMainWindow();
    });

    // Check backend health
    ipcMain.handle('check-backend', async () => {
        try {
            const health = await backend.checkHealth();
            return { healthy: true, ...health };
        } catch {
            return { healthy: false };
        }
    });

    // Get all settings
    ipcMain.handle('get-settings', () => {
        return getSettings();
    });

    // Update settings
    ipcMain.handle('update-settings', async (_event, partial: Partial<AppSettings>) => {
        const before = getSettings();
        updateSettings(partial);
        const after = getSettings();
        const refreshPlan = buildSettingsRuntimeRefreshPlan(before, partial, after);

        if (refreshPlan.resetAsr) {
            runtimeModelState.asr = {
                engine: after.engine || null,
                model: after.model || null,
                status: 'idle',
                error: null,
            };
        }

        if (refreshPlan.refreshSpeakerMapping) {
            await ensureSpeakerMappingReady(Boolean(after.enableDiarization), after.speakerModel);
        }

        if (refreshPlan.refreshStreamClustering) {
            await ensureStreamClusteringReady(Boolean(after.enableStreaming), after.speakerModel);
        }

        return { success: true, runtime: getRuntimeModelState() };
    });

    ipcMain.handle('get-runtime-model-status', async () => {
        return getRuntimeModelState();
    });

    ipcMain.handle('ensure-speaker-mapping-ready', async () => {
        const settings = getSettings();
        return ensureSpeakerMappingReady(Boolean(settings.enableDiarization), settings.speakerModel);
    });

    ipcMain.handle('ensure-stream-clustering-ready', async () => {
        const settings = getSettings();
        return ensureStreamClusteringReady(Boolean(settings.enableStreaming), settings.speakerModel);
    });

    ipcMain.handle('ensure-session-runtime-ready', async () => {
        return ensureRuntimeReadyForSession();
    });

    // Get available engines
    ipcMain.handle('get-engines', async () => {
        try {
            return await backend.getEngines();
        } catch {
            return [];
        }
    });

    // Load engine
    ipcMain.handle('load-engine', async (_event, engine: string, model: string) => {
        try {
            const result = await backend.loadEngine(engine, model);
            await syncAsrRuntimeState();
            return { ...result, runtime: getRuntimeModelState() };
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    // Get speakers
    ipcMain.handle('get-speakers', async () => {
        try {
            return await backend.getSpeakers();
        } catch {
            return [];
        }
    });

    // Delete speaker
    ipcMain.handle('delete-speaker', async (_event, speakerId: string) => {
        try {
            return await backend.deleteSpeaker(speakerId);
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    // Register speaker with audio data from renderer
    ipcMain.handle('register-speaker', async (_event, name: string, audioBuffer: ArrayBuffer) => {
        try {
            const tempDir = os.tmpdir();
            const audioPath = path.join(tempDir, `voicescribe_speaker_${Date.now()}.wav`);
            fs.writeFileSync(audioPath, Buffer.from(audioBuffer));
            try {
                const result = await backend.registerSpeaker(name, audioPath);
                return result;
            } finally {
                if (fs.existsSync(audioPath)) {
                    fs.unlinkSync(audioPath);
                }
            }
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    // Get app version
    ipcMain.handle('get-app-version', () => {
        return app.getVersion();
    });

    // Get models status
    ipcMain.handle('get-models', async () => {
        try {
            return await backend.getModels();
        } catch {
            return [];
        }
    });

    // Download model
    ipcMain.handle('download-model', async (_event, engine: string, model: string) => {
        try {
            return await backend.downloadModel(engine, model);
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    // Delete model
    ipcMain.handle('delete-model', async (_event, engine: string, model: string) => {
        try {
            return await backend.deleteModel(engine, model);
        } catch (error) {
            return { status: 'error', error: String(error) };
        }
    });

    // Transcribe audio data
    ipcMain.handle('transcribe-audio', async (_event, audioBuffer: ArrayBuffer) => {
        try {
            const transcribeRequestId = createId('req');
            const buffer = Buffer.from(audioBuffer);
            logEvent('electron.main', 'ipc_transcribe_requested', {
                recording_session_id: currentRecordingSessionId,
                transcribe_request_id: transcribeRequestId,
                audio_size_bytes: buffer.byteLength,
            });

            // Save audio to temp file
            const tempDir = os.tmpdir();
            const audioPath = path.join(tempDir, `voicescribe_${Date.now()}.wav`);
            fs.writeFileSync(audioPath, buffer);
            const stat = fs.statSync(audioPath);
            logEvent('electron.main', 'temp_audio_written', {
                recording_session_id: currentRecordingSessionId,
                transcribe_request_id: transcribeRequestId,
                audio_path: audioPath,
                audio_size_bytes: stat.size,
            });

            // Transcribe
            await transcribeAudioFile(audioPath, {
                recordingSessionId: currentRecordingSessionId,
                transcribeRequestId,
            });
            return { success: true };
        } catch (error) {
            console.error('Transcribe audio error:', error);
            return {
                success: false,
                errorType: 'transcription_failure',
                error: String(error),
                userMessage: String(error),
            };
        }
    });

    ipcMain.handle('run-frontend-history-test', async (_event, filePath: string) => {
        return runFrontendHistoryTest(filePath);
    });

    // Audio level updates from renderer (used by the overlay waveform)
    ipcMain.on('recording-audio-level', (_event, level: unknown) => {
        if (!isRecording) return;
        const n = typeof level === 'number' ? level : Number(level);
        if (!Number.isFinite(n)) return;
        currentAudioLevel = Math.max(0, Math.min(1, n));
        broadcastRecordingState();
    });
    
    // Recording complete
    ipcMain.on('recording-complete', (_event, text: string) => {
        transcriptionComplete(text);
    });

    // Recording complete with full result payload (streaming path)
    ipcMain.on('recording-complete-result', (_event, payload: { text: string; result?: backend.TranscribeResult }) => {
        transcriptionComplete(payload?.text || '', payload?.result);
    });
    
    // Recording error
    ipcMain.on('recording-error', (_event, error: string) => {
        logEvent('electron.main', 'recording_error', {
            recording_session_id: currentRecordingSessionId,
            error_message: error,
        }, 'ERROR');
        console.error('Recording error:', error);
        pendingRecordingStartRequestId = null;
        cancelPendingRecordingStart = false;
        isPreparingRecording = false;
        isRecording = false;
        isTranscribing = false;
        isCancelled = false;
        currentAudioLevel = 0;
        currentRecordingSessionId = null;
        if (overlayWindow) {
            overlayWindow.hide();
        }
        broadcastRecordingState();
        updateTrayMenu();
    });
}

// -------------------------------------
// App Lifecycle
// -------------------------------------

app.on('ready', async () => {
    if (process.platform !== 'darwin') {
        Menu.setApplicationMenu(null);
    }

    // Start backend process (skip if VOICESCRIBE_SKIP_BACKEND is set)
    if (!process.env.VOICESCRIBE_SKIP_BACKEND) {
        await startBackendProcess();
    } else {
        console.log('Skipping backend startup (VOICESCRIBE_SKIP_BACKEND is set)');
    }

    await syncRuntimeModelStatusOnStartup();

    createMainWindow();
    createOverlayWindow();
    createTray();
    registerConfiguredHotkeys();
    setupIpcHandlers();

    if (frontendHistoryTestPath) {
        mainWindow?.webContents.once('did-finish-load', () => {
            setTimeout(() => {
                runFrontendHistoryTest(frontendHistoryTestPath)
                    .catch((error) => {
                        console.error(`[FrontendHistoryTest] ${String(error)}`);
                    })
                    .finally(() => {
                        if (frontendHistoryTestExitOnComplete) {
                            setTimeout(() => {
                                getRendererHistoryStorageSnapshot()
                                    .then((snapshot) => {
                                        console.log(
                                            `[FrontendHistoryTest] Pre-exit renderer localStorage snapshot: count=${snapshot.count} latestTimestamp=${snapshot.latestTimestamp ?? 'none'} latestTextLength=${snapshot.latestTextLength} latestSegmentCount=${snapshot.latestSegmentCount}`
                                        );
                                    })
                                    .catch((error) => {
                                        console.warn(`[FrontendHistoryTest] Failed to read pre-exit storage snapshot: ${String(error)}`);
                                    })
                                    .finally(() => {
                                        console.log(`[FrontendHistoryTest] Exiting app at: ${new Date().toISOString()}`);
                                        appIsQuitting = true;
                                        app.quit();
                                    });
                            }, 500);
                        }
                    });
            }, 1000);
        });
    }
});

app.on('window-all-closed', () => {
    // Keep app running in tray on Windows/Linux
    if (process.platform === 'darwin') {
        // On macOS, quit completely
    }
    // Don't quit - we have a tray icon
});

app.on('activate', () => {
    if (mainWindow === null) {
        createMainWindow();
    }
});

app.on('will-quit', () => {
    desktopHotkeyManager?.dispose();
    desktopHotkeyManager = null;
    stopBackendProcess();
});

// -------------------------------------
// Backend Process Management
// -------------------------------------

async function startBackendProcess(): Promise<void> {
    // Path to backend directory
    const backendDir = path.join(__dirname, '../../backend');
    const serverScript = path.join(backendDir, 'server.py');

    // Find Python executable: try conda env 'voicescribe', then fallback to system python
    let pythonExe = 'python';
    if (process.platform === 'win32') {
        // Conda env location on Windows
        const condaBase = process.env.CONDA_PREFIX_1 || process.env.CONDA_PREFIX || path.join(process.env.USERPROFILE || '', 'Anaconda3');
        const condaPython = path.join(condaBase, 'envs', 'voicescribe', 'python.exe');
        // Also check miniconda
        const minicondaPython = path.join(process.env.USERPROFILE || '', 'miniconda3', 'envs', 'voicescribe', 'python.exe');
        if (fs.existsSync(condaPython)) {
            pythonExe = condaPython;
        } else if (fs.existsSync(minicondaPython)) {
            pythonExe = minicondaPython;
        } else {
            // Fallback: try common Anaconda install paths
            const commonPaths = [
                'D:\\Anaconda3\\envs\\voicescribe\\python.exe',
                'C:\\Anaconda3\\envs\\voicescribe\\python.exe',
                'C:\\ProgramData\\Anaconda3\\envs\\voicescribe\\python.exe',
            ];
            for (const p of commonPaths) {
                if (fs.existsSync(p)) {
                    pythonExe = p;
                    break;
                }
            }
        }
    } else {
        // macOS/Linux: try conda env python
        const condaPython = path.join(process.env.HOME || '', 'anaconda3', 'envs', 'voicescribe', 'bin', 'python');
        if (fs.existsSync(condaPython)) {
            pythonExe = condaPython;
        }
    }

    console.log(`Starting backend process with: ${pythonExe}`);

    backendProcess = spawn(pythonExe, [serverScript], {
        cwd: backendDir,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
    });

    backendProcess.stdout?.on('data', (data: Buffer) => {
        try { console.log(`[Backend] ${data.toString().trim()}`); } catch { /* EPIPE */ }
    });
    backendProcess.stdout?.on('error', () => { /* pipe closed */ });

    backendProcess.stderr?.on('data', (data: Buffer) => {
        try { console.error(`[Backend Error] ${data.toString().trim()}`); } catch { /* EPIPE */ }
    });
    backendProcess.stderr?.on('error', () => { /* pipe closed */ });

    backendProcess.on('error', (err) => {
        console.error(`Backend process error: ${err.message}`);
        backendProcess = null;
    });

    backendProcess.on('exit', (code) => {
        console.log(`Backend process exited with code ${code}`);
        backendProcess = null;
    });

    // Wait for backend to be ready
    await waitForBackend();
}

async function waitForBackend(maxAttempts = 30): Promise<boolean> {
    for (let i = 0; i < maxAttempts; i++) {
        try {
            await backend.checkHealth();
            console.log('Backend is ready!');
            return true;
        } catch {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }
    console.warn('Backend did not become ready in time');
    return false;
}

async function syncRuntimeModelStatusOnStartup(): Promise<void> {
    try {
        const settings = getSettings();
        await syncAsrRuntimeState();
        await ensureSpeakerMappingReady(Boolean(settings.enableDiarization), settings.speakerModel);
        await ensureStreamClusteringReady(Boolean(settings.enableStreaming), settings.speakerModel);
        console.log(
            `[Startup] Runtime model state synced: asr=${runtimeModelState.asr.status}, ` +
            `speakerMapping=${runtimeModelState.speakerMapping.status}, ` +
            `streamClustering=${runtimeModelState.streamClustering.status}`
        );
    } catch (error) {
        console.warn(`[Startup] Failed to sync runtime model status: ${String(error)}`);
    }
}

function stopBackendProcess(): void {
    if (backendProcess) {
        console.log('Stopping backend process...');
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(backendProcess.pid), '/f', '/t']);
        } else {
            backendProcess.kill('SIGTERM');
        }
        backendProcess = null;
    }
}

// -------------------------------------
// Audio Transcription
// -------------------------------------

async function transcribeAudioFile(
    audioPath: string,
    metadata: {
        recordingSessionId: string | null;
        transcribeRequestId: string;
        timeoutMs?: number;
    }
): Promise<void> {
    const startTime = Date.now();
    const minDisplayTime = 1000; // Minimum 1 second to show "thinking" state
    
    try {
        const settings = getSettings();
        const stat = fs.statSync(audioPath);
        logEvent('electron.main', 'transcribe_request_sent', {
            recording_session_id: metadata.recordingSessionId,
            transcribe_request_id: metadata.transcribeRequestId,
            audio_path: audioPath,
            audio_size_bytes: stat.size,
            engine: settings.engine,
            model: settings.model,
            language: settings.language,
            enable_diarization: settings.enableDiarization,
            enable_ai_refine: settings.enableAiRefine,
            hotword_count: settings.vocabulary.length,
        });
        const result = await backend.transcribe(audioPath, {
            engine: settings.engine,
            model: settings.model,
            language: settings.language,
            enableDiarization: settings.enableDiarization,
            hotwords: settings.vocabulary.join(','),
            enableAiRefine: settings.enableAiRefine,
            recordingSessionId: metadata.recordingSessionId || undefined,
            transcribeRequestId: metadata.transcribeRequestId,
            timeoutMs: metadata.timeoutMs,
        });
        logEvent('electron.main', 'transcribe_response_received', {
            recording_session_id: metadata.recordingSessionId,
            transcribe_request_id: metadata.transcribeRequestId,
            result_duration_s: result.duration,
            segment_count: result.segments.length,
            elapsed_ms: Date.now() - startTime,
        });
        
        // Ensure minimum display time for "thinking" state
        const elapsed = Date.now() - startTime;
        if (elapsed < minDisplayTime) {
            await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
        }
        
        transcriptionComplete(result.text, result);
    } catch (error) {
        const failure = classifyTranscribeFailure(error);
        logEvent('electron.main', 'ui_transcription_failed', {
            recording_session_id: metadata.recordingSessionId,
            transcribe_request_id: metadata.transcribeRequestId,
            audio_path: audioPath,
            error_type: failure.errorType,
            error_message: failure.userMessage,
            error_detail: failure.detail,
            elapsed_ms: Date.now() - startTime,
        }, 'ERROR');
        console.error('Transcription failed:', failure.detail);
        
        // Still respect minimum display time even on error
        const elapsed = Date.now() - startTime;
        if (elapsed < minDisplayTime) {
            await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
        }
        
        throw new Error(failure.userMessage);
    } finally {
        // Cleanup temp file
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
    }
}

