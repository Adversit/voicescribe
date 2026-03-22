@echo off
setlocal
chcp 65001 >nul 2>&1

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..\..") do set "REPO_DIR=%%~fI"
set "FRONTEND_DIR=%REPO_DIR%\frontend"
set "REPORT_PATH=%REPO_DIR%\logs\system-tests\frontend-file-test-report.json"

if "%~1"=="" (
    echo [ERROR] Usage: scripts\windows\test_frontend_transcribe_file.bat "D:\path\to\input.wav"
    exit /b 1
)
set "WAV_PATH=%~f1"

if not exist "%WAV_PATH%" (
    echo [ERROR] WAV file not found: %WAV_PATH%
    exit /b 1
)

echo ========================================
echo VoiceScribe Frontend File Transcribe Test
echo ========================================
echo [INFO] WAV: %WAV_PATH%
echo [INFO] Report: %REPORT_PATH%
echo [INFO] This script reuses frontend/electron backend client only.
echo [INFO] Backend logs should show the full transcribe process.
echo.

cd /d "%FRONTEND_DIR%"
call npm run build:electron
if errorlevel 1 (
    echo [ERROR] build:electron failed
    exit /b 1
)

set "VOICESCRIBE_TEST_HISTORY_REPORT=%REPORT_PATH%"
node dist-electron/electron/test-transcribe-file.js --audio "%WAV_PATH%" --engine funasr --model seaco-paraformer --language zh --enable-diarization true --speaker-model cam++

if exist "%REPORT_PATH%" (
    echo.
    echo [INFO] Test report generated:
    type "%REPORT_PATH%"
)
