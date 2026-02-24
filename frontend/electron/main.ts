import { app, BrowserWindow, Tray, Menu, nativeImage, globalShortcut, ipcMain, clipboard } from 'electron';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
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

// Current hotkey configuration (loaded from store)
let currentHotkey: HotkeyConfig = getSetting('hotkey');

// App quitting flag
let appIsQuitting = false;

// Backend process
let backendProcess: ChildProcess | null = null;

// Temp audio file path for current recording
let currentAudioPath: string | null = null;

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
            label: isRecording ? '🔴 录音中...' : '⚪ 待命',
            enabled: false,
        },
        { type: 'separator' },
        {
            label: isRecording ? '停止录音' : '开始录音',
            click: () => toggleRecording(),
            accelerator: getHotkeyString(),
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
    const parts: string[] = [];
    if (currentHotkey.useControl) parts.push('Ctrl');
    if (currentHotkey.useOption) parts.push('Alt');
    if (currentHotkey.useShift) parts.push('Shift');
    if (currentHotkey.useCommand) parts.push('Super');
    // Treat "no key" sentinel as empty.
    const key = currentHotkey.selectedKey;
    if (key && key !== '无') parts.push(key);
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

function transcriptionComplete(text: string, result?: backend.TranscribeResult) {
    console.log('[Main] ===== TRANSCRIPTION COMPLETE =====');
    console.log('[Main] Text:', text.substring(0, 50));
    console.log('[Main] Result:', result);
    
    lastTranscription = text;

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
                    console.warn('[Output] PowerShell paste failed:', error.message);
                    console.log('[Output] Text is in clipboard, press Ctrl+V to paste');
                } else {
                    console.log('[Output] Simulated Ctrl+V paste using PowerShell');
                }
            });
            return;
        } catch (error) {
            console.warn('[Output] PowerShell method failed:', error);
        }
    }

    // Fallback: Just notify user
    console.log('[Output] Direct input mode: Text ready in clipboard, press Ctrl+V to paste');
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
        updateSettings(partial);
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
        
        transcriptionComplete('[转录失败]');
    } finally {
        // Cleanup temp file
        if (fs.existsSync(audioPath)) {
            fs.unlinkSync(audioPath);
        }
    }
}

