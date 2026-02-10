@echo off
REM VoiceScribe Backend Start Script for Windows (conda)
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

set SCRIPT_DIR=%~dp0
set BACKEND_DIR=%SCRIPT_DIR%..\backend
set CONDA_ENV_NAME=voicescribe

cd /d "%BACKEND_DIR%"

REM Parse arguments
set "MOCK_FLAG="
for %%a in (%*) do (
    if "%%a"=="--mock" set "MOCK_FLAG=--mock"
)

REM Activate conda environment
echo [INFO] Activating conda environment '%CONDA_ENV_NAME%'...
call conda activate %CONDA_ENV_NAME%
if errorlevel 1 (
    echo [ERROR] Failed to activate conda env '%CONDA_ENV_NAME%'
    echo [INFO] Please run install.bat first to create the environment
    exit /b 1
)

REM Set UTF-8 encoding for Windows
set PYTHONIOENCODING=utf-8
set NO_PROXY=127.0.0.1,localhost

REM Install dependencies if needed
if not exist ".deps_installed" (
    echo [INFO] Installing dependencies...
    if defined MOCK_FLAG (
        python -m pip install -r requirements-minimal.txt -q
    ) else (
        python -m pip install -r requirements.txt -q
    )
    if errorlevel 1 (
        echo [ERROR] Failed to install dependencies
        exit /b 1
    )
    echo. > .deps_installed
)

REM Start server
echo ========================================
echo   VoiceScribe Backend Service
echo ========================================
echo.
echo   URL:  http://127.0.0.1:8765
if defined MOCK_FLAG (
    echo   Mode: MOCK ^(no ASR engines^)
) else (
    echo   Mode: Full
)
echo   Env:  conda %CONDA_ENV_NAME%
echo.
echo   Press Ctrl+C to stop
echo ========================================
echo.

python server.py %MOCK_FLAG%
