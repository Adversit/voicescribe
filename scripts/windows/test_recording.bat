@echo off
setlocal enabledelayedexpansion

echo ========================================
echo   VoiceScribe Recording Test Script
echo ========================================
echo.

REM Check if backend is running
echo [1/5] Checking backend status...
curl -s http://127.0.0.1:8765/health >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Backend is not running!
    echo Please start the backend first:
    echo   cd backend
    echo   conda activate voicescribe
    echo   python server.py
    echo.
    pause
    exit /b 1
)
echo [OK] Backend is running
echo.

REM Check if frontend is running
echo [2/5] Checking frontend status...
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Frontend is not running!
    echo Please start the frontend first:
    echo   cd frontend
    echo   npm run dev:electron
    echo.
    pause
    exit /b 1
)
echo [OK] Frontend is running
echo.

REM Test backend API
echo [3/5] Testing backend API...
curl -s http://127.0.0.1:8765/engines >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Backend API is not responding!
    pause
    exit /b 1
)
echo [OK] Backend API is working
echo.

REM Check if model is loaded
echo [4/5] Checking if model is loaded...
echo Please open the application and:
echo   1. Go to "Engine Settings"
echo   2. Select an engine (e.g., FunASR)
echo   3. Select a model (e.g., seaco-paraformer)
echo   4. Click "Load Model" button
echo   5. Wait for model to load
echo.
echo Press any key when model is loaded...
pause >nul
echo.

REM Recording test instructions
echo [5/5] Recording Test Instructions
echo ========================================
echo.
echo STEP 1: Test Long Press Mode
echo   1. Press and HOLD Alt+B (or your configured hotkey)
echo   2. You should see a small window appear with:
echo      - A pulsing white dot
echo      - Animated sound waves (5 bars)
echo      - A timer showing duration
echo   3. Speak clearly: "This is a test"
echo   4. Release the hotkey
echo   5. You should see:
echo      - Window shows "thinking" with animated dots
echo      - Window stays visible for at least 1 second
echo      - Window closes automatically
echo      - Text is copied to clipboard
echo.
echo STEP 2: Verify Result
echo   1. Open Notepad
echo   2. Press Ctrl+V to paste
echo   3. You should see the transcribed text
echo.
echo STEP 3: Check History
echo   1. In the application, click "History"
echo   2. You should see your transcription record
echo   3. Click on it to view details
echo.
echo ========================================
echo.
echo TROUBLESHOOTING:
echo.
echo Problem: No recording window appears
echo Solution: 
echo   - Check if hotkey is registered (should see message in console)
echo   - Try changing hotkey in "Hotkey Settings"
echo   - Check microphone permissions in Windows Settings
echo.
echo Problem: Recording window appears but no sound waves
echo Solution:
echo   - Check microphone is selected correctly
echo   - Test microphone in Windows Sound Settings
echo   - Grant microphone permission to the app
echo.
echo Problem: No "thinking" state shown
echo Solution:
echo   - Open Developer Tools (F12 in Electron window)
echo   - Check Console for errors
echo   - Look for messages starting with [GlobalRecordingManager]
echo   - Check if transcribe-audio IPC call succeeds
echo.
echo Problem: Transcription fails
echo Solution:
echo   - Check backend logs in backend window
echo   - Verify model is loaded in "Engine Settings"
echo   - Try reloading the model
echo   - Check backend/server_err.log for errors
echo.
echo Problem: Text not in clipboard
echo Solution:
echo   - Check "Output Mode" in "General Settings"
echo   - Should be set to "Clipboard" or "Both"
echo   - Try manually copying from History
echo.
echo ========================================
echo.
echo Press any key to open Developer Tools guide...
pause >nul
echo.
echo DEVELOPER TOOLS DEBUGGING:
echo ========================================
echo.
echo 1. Press F12 in the Electron window
echo 2. Go to Console tab
echo 3. Try recording again
echo 4. Look for these messages:
echo.
echo    [GlobalRecordingManager] Starting recording...
echo    [GlobalRecordingManager] Stopping recording...
echo    [GlobalRecordingManager] Transcribing audio...
echo    [GlobalRecordingManager] Transcription complete
echo.
echo 5. If you see errors, note them down
echo.
echo 6. Common errors and solutions:
echo.
echo    Error: "window.electron.settings.get is not a function"
echo    Solution: Restart the application
echo.
echo    Error: "Failed to start recording"
echo    Solution: Check microphone permissions
echo.
echo    Error: "Transcription failed"
echo    Solution: Check backend connection and model loading
echo.
echo ========================================
echo.
echo Test complete! Press any key to exit...
pause >nul
