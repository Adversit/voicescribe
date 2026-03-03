import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, clipboard } from 'electron';
import path from 'path';
import { spawn, spawnSync, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import { store, getSetting, setSetting, getSettings, updateSettings, type HotkeyConfig, type AppSettings } from './store';
import * as backend from './backend';

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
let isRecording = false;
let isTranscribing = false;
let isCancelled = false;
let recordingStartTime: number | null = null;
let lastTranscription: string | null = null;
let previousWindowTitle: string | null = null; // Track previous window for directInput mode
let currentAudioLevel = 0;
let streamedOutputText = '';

// Current hotkey configuration (loaded from store)
let currentHotkey: HotkeyConfig = getSetting('hotkey');

// App quitting flag
let appIsQuitting = false;

// Backend process
let backendProcess: ChildProcess | null = null;

// Temp audio file path for current recording
let currentAudioPath: string | null = null;

type OperationNoticeType = 'info' | 'success' | 'error';

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function findSuffixPrefixOverlap(previous: string, current: string, maxWindow = 240): number {
    const max = Math.min(previous.length, current.length, maxWindow);
    for (let len = max; len > 0; len -= 1) {
        if (previous.slice(-len) === current.slice(0, len)) {
            return len;
        }
    }
    return 0;
}

function computeFinalOutputDelta(alreadyOutput: string, finalText: string): string {
    const committed = String(alreadyOutput || '');
    const full = String(finalText || '').trim();
    if (!full) return '';
    if (!committed) return full;
    if (full.startsWith(committed)) return full.slice(committed.length);
    if (committed.endsWith(full)) return '';
    const overlap = findSuffixPrefixOverlap(committed, full);
    return overlap > 0 ? full.slice(overlap) : full;
}

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
            label: isRecording ? 'Recording...' : 'Idle',
            enabled: false,
        },
        { type: 'separator' },
        {
            label: isRecording ? 'Stop Recording' : 'Start Recording',
            click: () => toggleRecording(),
            accelerator: getHotkeyString(),
        },
        { type: 'separator' },
        {
            label: 'Copy Last Result',
            enabled: !!lastTranscription,
            click: () => {
                if (lastTranscription) {
                    clipboard.writeText(lastTranscription);
                }
            },
        },
        { type: 'separator' },
        {
            label: 'Settings...',
            click: () => showMainWindow(),
            accelerator: 'CmdOrCtrl+,',
        },
        {
            label: 'Show Main Window',
            click: () => showMainWindow(),
        },
        { type: 'separator' },
        {
            label: 'Quit VoiceScribe',
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
    const parts: string[] = [];
    if (currentHotkey.useControl) parts.push('Ctrl');
    if (currentHotkey.useOption) parts.push('Alt');
    if (currentHotkey.useShift) parts.push('Shift');
    if (currentHotkey.useCommand) parts.push('Super');
    // Treat "no key" sentinel as empty.
    const key = currentHotkey.selectedKey;
    if (key && key !== 'None') parts.push(key);
    return parts.join('+');
}

function registerGlobalShortcuts() {
    // Unregister all first
    globalShortcut.unregisterAll();

    const accelerator = getHotkeyString();
    if (!accelerator) return;

    try {
        const registered = globalShortcut.register(accelerator, () => {
            toggleRecording();
        });

        if (!registered) {
            console.error(`Failed to register global shortcut: ${accelerator}`);
        } else {
            console.log(`Registered global shortcut: ${accelerator}`);
        }
    } catch (error) {
        console.error(`Error registering global shortcut: ${error}`);
    }
}

// -------------------------------------
// Recording Logic
// -------------------------------------

function getRecordingStatePayload() {
    return {
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
    if (isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

function startRecording() {
    isRecording = true;
    isTranscribing = false;
    isCancelled = false;
    currentAudioLevel = 0;
    streamedOutputText = '';
    recordingStartTime = Date.now();

    // Save current active window title (for directInput mode)
    // Note: On Windows, we can't easily get the active window from Electron
    // We'll rely on the fact that the user will switch back to their app
    previousWindowTitle = null; // Reset
    console.log('[Recording] Started, user should be in their target application');

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

    console.log('Recording started');
    
    // Request renderer to start audio recording
    if (mainWindow) {
        mainWindow.webContents.send('start-audio-recording');
    }
}

function stopRecording() {
    isRecording = false;
    isTranscribing = true;
    isCancelled = false;
    const duration = recordingStartTime ? (Date.now() - recordingStartTime) / 1000 : 0;
    recordingStartTime = null;

    // Notify main window + overlay
    broadcastRecordingState();

    // Update tray
    updateTrayMenu();

    console.log(`Recording stopped. Duration: ${duration.toFixed(1)}s`);

    // Request renderer to stop audio recording and get the audio data
    if (mainWindow) {
        mainWindow.webContents.send('stop-audio-recording');
    }
}

function notifyOperation(type: OperationNoticeType, message: string, detail?: string) {
    if (!mainWindow) return;
    try {
        mainWindow.webContents.send('operation-notice', {
            type,
            message,
            detail,
            timestamp: new Date().toISOString(),
        });
    } catch {
        // ignore
    }
}

async function sendCtrlKey(key: 'c' | 'v'): Promise<boolean> {
    // Method 1: robotjs if available.
    try {
        const robot = require('robotjs');
        robot.keyTap(key, ['control']);
        return true;
    } catch {
        // fallback
    }

    if (process.platform === 'win32') {
        try {
            const script = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^${key}')`;
            const res = spawnSync('powershell', ['-NoProfile', '-Command', script], {
                windowsHide: true,
                encoding: 'utf8',
            });
            return res.status === 0;
        } catch {
            return false;
        }
    }

    return false;
}

async function getSelectedTextFromActiveApp(): Promise<{ success: boolean; text: string; error?: string }> {
    const originalClipboard = clipboard.readText();
    const sentinel = `__VOICESCRIBE_SELECTION_SENTINEL_${Date.now()}__`;
    try {
        clipboard.writeText(sentinel);
        await sleep(60);
        const copied = await sendCtrlKey('c');
        if (!copied) {
            return { success: false, text: '', error: 'Failed to trigger copy shortcut (Ctrl+C)' };
        }
        await sleep(140);
        const selectedText = clipboard.readText();
        if (!selectedText || selectedText === sentinel) {
            return { success: false, text: '', error: 'No selected text detected' };
        }
        return { success: true, text: selectedText };
    } finally {
        clipboard.writeText(originalClipboard);
    }
}

async function replaceSelectedTextInActiveApp(text: string): Promise<boolean> {
    const originalClipboard = clipboard.readText();
    try {
        clipboard.writeText(text);
        await sleep(80);
        const pasted = await sendCtrlKey('v');
        await sleep(80);
        return pasted;
    } finally {
        clipboard.writeText(originalClipboard);
    }
}

async function runEditSelectedWorkflow(instruction: string, settings: AppSettings): Promise<{ text: string; replaced: boolean }> {
    const selected = await getSelectedTextFromActiveApp();
    if (!selected.success) {
        console.warn('[EditSelected] failed to read selected text:', selected.error || 'unknown');
        notifyOperation('error', 'Edit selected text failed', selected.error || 'Unable to read selected text');
        return { text: instruction, replaced: false };
    }

    try {
        const processed = await backend.processText({
            mode: 'edit_selected',
            selectedText: selected.text,
            instruction,
            language: settings.language,
            command: settings.editCommand,
            customPrompt: settings.customCommandPrompt,
        });
        const editedText = processed.result_text || selected.text;
        const replaced = await replaceSelectedTextInActiveApp(editedText);
        if (replaced) {
            notifyOperation('success', 'Selected text replaced', `provider=${processed.meta?.provider || 'unknown'}`);
            return { text: editedText, replaced: true };
        }

        clipboard.writeText(editedText);
        notifyOperation('error', 'Write-back failed; result copied to clipboard', 'Paste manually into target app');
        return { text: editedText, replaced: false };
    } catch (error) {
        notifyOperation('error', 'Edit selected text failed', String(error));
        return { text: selected.text, replaced: false };
    }
}

async function runAskSelectedWorkflow(question: string, settings: AppSettings): Promise<{ answer: string; contextPreview: string }> {
    const selected = await getSelectedTextFromActiveApp();
    if (!selected.success) {
        const fallbackAnswer = `Unable to read selected text: ${selected.error || 'unknown error'}`;
        notifyOperation('error', 'Ask selected text failed', fallbackAnswer);
        return { answer: fallbackAnswer, contextPreview: '' };
    }

    const contextPreview = selected.text.length > 240 ? `${selected.text.slice(0, 240)}...` : selected.text;
    try {
        const processed = await backend.processText({
            mode: 'ask_selected',
            selectedText: selected.text,
            question,
            language: settings.language,
        });
        const answer = processed.result_text || '(empty response)';
        notifyOperation('success', 'Q&A completed', `provider=${processed.meta?.provider || 'unknown'}`);
        return { answer, contextPreview };
    } catch (error) {
        const fallbackAnswer = `Q&A processing failed: ${String(error)}`;
        notifyOperation('error', 'Ask selected text failed', fallbackAnswer);
        return { answer: fallbackAnswer, contextPreview };
    }
}

function handleStreamingPartial(text: string) {
    const settings = getSettings();
    if (settings.mode !== 'dictate') return;

    const delta = String(text || '');
    if (!delta.trim()) return;

    if (
        streamedOutputText &&
        /[A-Za-z0-9]$/.test(streamedOutputText) &&
        /^[A-Za-z0-9]/.test(delta)
    ) {
        streamedOutputText += ' ';
    }
    streamedOutputText += delta;

    handleTranscriptionOutput(delta);
}

function transcriptionComplete(text: string, result?: backend.TranscribeResult) {
    void transcriptionCompleteAsync(text, result);
}

async function transcriptionCompleteAsync(text: string, result?: backend.TranscribeResult) {
    console.log('[Main] ===== TRANSCRIPTION COMPLETE =====');
    console.log('[Main] Text:', text.substring(0, 50));
    console.log('[Main] Result:', result);

    const settings = getSettings();
    console.log('[Main] Mode settings:', {
        mode: settings.mode,
        editCommand: settings.editCommand,
        outputFormat: settings.outputFormat,
        enableStreaming: settings.enableStreaming,
    });
    let finalText = text;
    let shouldAutoOutput = true;

    if (settings.mode === 'edit_selected') {
        shouldAutoOutput = false;
        const processed = await runEditSelectedWorkflow(text, settings);
        finalText = processed.text;
        if (!processed.replaced) {
            clipboard.writeText(finalText);
        }
    } else if (settings.mode === 'ask_selected') {
        shouldAutoOutput = false;
        const qa = await runAskSelectedWorkflow(text, settings);
        finalText = qa.answer;
        if (mainWindow) {
            try {
                mainWindow.webContents.send('ask-answer', {
                    question: text,
                    answer: qa.answer,
                    contextPreview: qa.contextPreview,
                    timestamp: new Date().toISOString(),
                });
                mainWindow.show();
                mainWindow.focus();
            } catch {
                // ignore
            }
        }
    }

    lastTranscription = finalText;

    // Keep overlay visible for a moment to show completion
    // Then hide after a short delay
    setTimeout(() => {
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
        const nextResult = result ? { ...result, text: finalText } : undefined;
        console.log('[Main] Event data:', { text: finalText, result: nextResult });
        mainWindow.webContents.send('transcription-complete', { text: finalText, result: nextResult });
    } else {
        console.error('[Main] Main window is null, cannot send transcription-complete event');
    }

    // Update tray
    updateTrayMenu();

    // Handle output based on settings
    if (shouldAutoOutput) {
        if (settings.enableStreaming && settings.mode === 'dictate') {
            const delta = computeFinalOutputDelta(streamedOutputText, finalText);
            if (delta.trim()) {
                handleTranscriptionOutput(delta);
                streamedOutputText += delta;
            }
        } else {
            handleTranscriptionOutput(finalText);
        }
    }
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
    void sendCtrlKey('v').then((ok) => {
        if (ok) {
            console.log('[Output] Simulated Ctrl+V paste');
            return;
        }
        console.log('[Output] Direct input mode: Text ready in clipboard, press Ctrl+V to paste');
    });
}

// -------------------------------------
// IPC Handlers
// -------------------------------------

function setupIpcHandlers() {
    // Get current recording state
    ipcMain.handle('get-recording-state', () => {
        return {
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

    // Cancel recording
    ipcMain.on('cancel-recording', () => {
        if (isRecording) {
            isRecording = false;
            recordingStartTime = null;
            isTranscribing = false;
            isCancelled = true;
            currentAudioLevel = 0;
            streamedOutputText = '';

            if (overlayWindow) {
                broadcastRecordingState();
                setTimeout(() => overlayWindow?.hide(), 1000);
            }

            // Ensure renderer stops capturing audio immediately.
            if (mainWindow) {
                mainWindow.webContents.send('cancel-audio-recording');
            }

            updateTrayMenu();
            console.log('Recording cancelled');

            // Clear cancelled flag to avoid sticky UI.
            setTimeout(() => {
                isCancelled = false;
                broadcastRecordingState();
            }, 1000);
        }
    });

    // Update hotkey configuration
    ipcMain.handle('update-hotkey', (_event, config: HotkeyConfig) => {
        currentHotkey = config;
        setSetting('hotkey', config); // Save to store
        registerGlobalShortcuts();
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
    ipcMain.handle('update-settings', (_event, partial: Partial<AppSettings>) => {
        console.log('[Settings] update-settings called with:', partial);
        updateSettings(partial);
        console.log('[Settings] current settings snapshot:', {
            mode: getSetting('mode'),
            editCommand: getSetting('editCommand'),
            outputFormat: getSetting('outputFormat'),
        });
        return { success: true };
    });

    // Selection bridge: get selected text from current active app
    ipcMain.handle('selection-get', async () => {
        return await getSelectedTextFromActiveApp();
    });

    // Selection bridge: replace selected text in current active app
    ipcMain.handle('selection-replace', async (_event, text: string) => {
        if (!text || !String(text).trim()) {
            return { success: false, error: 'text is empty' };
        }
        const ok = await replaceSelectedTextInActiveApp(String(text));
        if (!ok) {
            clipboard.writeText(String(text));
            return { success: false, error: 'paste failed, copied to clipboard' };
        }
        return { success: true };
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
            return await backend.loadEngine(engine, model);
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
            // Save audio to temp file
            const tempDir = os.tmpdir();
            const audioPath = path.join(tempDir, `voicescribe_${Date.now()}.wav`);
            fs.writeFileSync(audioPath, Buffer.from(audioBuffer));

            // Transcribe
            await transcribeAudioFile(audioPath);
            return { success: true };
        } catch (error) {
            console.error('Transcribe audio error:', error);
            return { success: false, error: String(error) };
        }
    });

    // Audio level updates from renderer (used by the overlay waveform)
    ipcMain.on('recording-audio-level', (_event, level: unknown) => {
        if (!isRecording) return;
        const n = typeof level === 'number' ? level : Number(level);
        if (!Number.isFinite(n)) return;
        currentAudioLevel = Math.max(0, Math.min(1, n));
        broadcastRecordingState();
    });

    // Streaming partial text chunks from renderer
    ipcMain.on('recording-partial', (_event, text: string) => {
        if (!isRecording && !isTranscribing) return;
        handleStreamingPartial(text);
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
        console.error('Recording error:', error);
        isRecording = false;
        isTranscribing = false;
        isCancelled = false;
        currentAudioLevel = 0;
        streamedOutputText = '';
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
    // Start backend process (skip if VOICESCRIBE_SKIP_BACKEND is set)
    if (!process.env.VOICESCRIBE_SKIP_BACKEND) {
        await startBackendProcess();
    } else {
        console.log('Skipping backend startup (VOICESCRIBE_SKIP_BACKEND is set)');
    }

    createMainWindow();
    createOverlayWindow();
    createTray();
    registerGlobalShortcuts();
    setupIpcHandlers();
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
    globalShortcut.unregisterAll();
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

async function transcribeAudioFile(audioPath: string): Promise<void> {
    const startTime = Date.now();
    const minDisplayTime = 1000; // Minimum 1 second to show "thinking" state
    
    try {
        const settings = getSettings();
        const result = await backend.transcribe(audioPath, {
            engine: settings.engine,
            model: settings.model,
            language: settings.language,
            enableDiarization: settings.enableDiarization,
            hotwords: settings.vocabulary.join(','),
            enableAiRefine: settings.enableAiRefine,
        });
        
        // Ensure minimum display time for "thinking" state
        const elapsed = Date.now() - startTime;
        if (elapsed < minDisplayTime) {
            await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
        }
        
        transcriptionComplete(result.text, result);
    } catch (error) {
        console.error('Transcription failed:', error);
        
        // Still respect minimum display time even on error
        const elapsed = Date.now() - startTime;
        if (elapsed < minDisplayTime) {
            await new Promise(resolve => setTimeout(resolve, minDisplayTime - elapsed));
        }
        
        transcriptionComplete('[杞綍澶辫触]');
    } finally {
        // Cleanup temp file
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
    }
}


