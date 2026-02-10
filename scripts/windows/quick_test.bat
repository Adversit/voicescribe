@echo off
echo ========================================
echo   VoiceScribe Quick Test
echo ========================================
echo.
echo This script will help you test the recording functionality.
echo.
echo PREREQUISITES:
echo   1. Backend must be running (http://127.0.0.1:8765)
echo   2. Frontend must be running (http://localhost:3000)
echo.
echo If not running, please run dev.bat first!
echo.
pause
echo.

echo Testing backend connection...
curl -s http://127.0.0.1:8765/health >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Backend not running!
    echo Please start: cd backend ^&^& conda activate voicescribe ^&^& python server.py
    pause
    exit /b 1
)
echo [OK] Backend is running
echo.

echo ========================================
echo   RECORDING TEST
echo ========================================
echo.
echo STEP 1: Press and HOLD your hotkey (default: Alt+B)
echo STEP 2: You should see a small window with:
echo    - Pulsing white dot
echo    - Animated sound waves
echo    - Timer counting up
echo.
echo STEP 3: Speak clearly: "This is a test"
echo.
echo STEP 4: Release the hotkey
echo.
echo EXPECTED BEHAVIOR:
echo    - Window should show "thinking" with animated dots
echo    - Window stays visible for at least 1 second
echo    - Window closes automatically
echo    - Text is copied to clipboard
echo.
echo STEP 5: Open Notepad and press Ctrl+V
echo    - You should see: "这是一个测试" or "This is a test"
echo.
echo ========================================
echo.
echo If "thinking" state doesn't appear:
echo   1. Press F12 in Electron window
echo   2. Check Console for errors
echo   3. Look for [GlobalRecordingManager] messages
echo   4. Run diagnose.bat for more info
echo.
echo If transcription fails:
echo   1. Check "Engine Settings" - load a model
echo   2. Check backend window for errors
echo   3. Try a different engine/model
echo.
echo ========================================
echo.
echo Press any key to exit...
pause >nul
