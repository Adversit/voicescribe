@echo off
REM VoiceScribe Development Mode Launcher
REM Starts backend and Electron frontend in development mode
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe Development Mode
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%..\..\backend"
set "FRONTEND_DIR=%SCRIPT_DIR%..\..\frontend"
set "CONDA_ENV_NAME=voicescribe"

REM Parse arguments
set "MOCK_FLAG="
for %%a in (%*) do (
    if "%%a"=="--mock" set "MOCK_FLAG=--mock"
)

REM ============================================
REM Step 1: Check prerequisites
REM ============================================
echo [1/4] Checking prerequisites...

REM Check conda
call conda --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Conda not found. Please run install.bat first.
    exit /b 1
)

REM Check if conda env exists
call conda env list 2>nul | findstr /C:"%CONDA_ENV_NAME%" >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Conda environment '%CONDA_ENV_NAME%' not found.
    echo [INFO] Please run install.bat first to create the environment.
    exit /b 1
)

REM Check Node.js
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js.
    exit /b 1
)

REM Check frontend dependencies
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [ERROR] Frontend dependencies not installed.
    echo [INFO] Please run install.bat first.
    exit /b 1
)

echo [OK] Prerequisites checked
echo.

REM ============================================
REM Step 2: Start backend in background
REM ============================================
echo [2/4] Starting backend service...

REM Create a temporary script to start backend
set "BACKEND_SCRIPT=%TEMP%\voicescribe_backend.bat"
(
    echo @echo off
    echo call conda activate %CONDA_ENV_NAME%
    echo cd /d "%BACKEND_DIR%"
    echo set PYTHONIOENCODING=utf-8
    echo set NO_PROXY=127.0.0.1,localhost
    echo python server.py %MOCK_FLAG%
) > "%BACKEND_SCRIPT%"

REM Start backend in a new window
start "VoiceScribe Backend" cmd /c "%BACKEND_SCRIPT%"

echo [OK] Backend starting in new window...
echo.

REM ============================================
REM Step 3: Wait for backend health check
REM ============================================
echo [3/4] Waiting for backend to be ready...

set "BACKEND_URL=http://127.0.0.1:8765"
set "MAX_RETRIES=30"
set "RETRY_COUNT=0"

:wait_backend
set /a RETRY_COUNT+=1
if %RETRY_COUNT% GTR %MAX_RETRIES% (
    echo [ERROR] Backend failed to start after %MAX_RETRIES% seconds
    echo [INFO] Check the backend window for errors
    exit /b 1
)

REM Try to connect to backend
curl -s --noproxy "*" --connect-timeout 1 "%BACKEND_URL%/health" >nul 2>&1
if errorlevel 1 (
    echo   Waiting... ^(%RETRY_COUNT%/%MAX_RETRIES%^)
    timeout /t 1 /nobreak >nul
    goto wait_backend
)

echo [OK] Backend is ready at %BACKEND_URL%
echo.

REM ============================================
REM Step 4: Start Electron frontend
REM ============================================
echo [4/4] Starting Electron frontend...
echo.
echo ========================================
echo   Development Mode Active
echo ========================================
echo.
echo   Backend:  %BACKEND_URL%
echo   Frontend: http://localhost:3000
if defined MOCK_FLAG (
    echo   Mode:     MOCK ^(no real ASR engines^)
) else (
    echo   Mode:     Full ^(with ASR engines^)
)
echo.
echo   Press Ctrl+C to stop
echo ========================================
echo.

cd /d "%FRONTEND_DIR%"
call npm run dev:electron

REM Cleanup on exit
echo.
echo [CLEANUP] Stopping services...
taskkill /FI "WINDOWTITLE eq VoiceScribe Backend*" /F >nul 2>&1
del "%BACKEND_SCRIPT%" >nul 2>&1
echo [OK] Cleanup complete

