@echo off
REM VoiceScribe Windows Build Script
REM Build Electron frontend application
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe Build Script
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"

REM Parse arguments
set "BUILD_MODE=dev"
for %%a in (%*) do (
    if "%%a"=="--release" set "BUILD_MODE=release"
    if "%%a"=="--prod" set "BUILD_MODE=release"
)

cd /d "%FRONTEND_DIR%"

REM Check node_modules
if not exist "node_modules" (
    echo [1/3] Installing Node.js dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        exit /b 1
    )
    echo [OK] Dependencies installed
) else (
    echo [1/3] Dependencies already installed
)
echo.

REM Build Electron TypeScript
echo [2/3] Building Electron main process...
call npm run build:electron
if errorlevel 1 (
    echo [ERROR] Electron build failed
    exit /b 1
)
echo [OK] Electron build complete
echo.

REM Build Next.js
echo [3/3] Building Next.js frontend...
call npm run build
if errorlevel 1 (
    echo [ERROR] Next.js build failed
    exit /b 1
)
echo [OK] Next.js build complete

echo.
echo ========================================
echo   Build Complete!
echo ========================================
echo.
echo   Dev mode:  cd frontend ^&^& npm run dev:electron
echo   Prod mode: cd frontend ^&^& npm run start
echo.
if "%BUILD_MODE%"=="release" (
    echo   Package:   npm run package
)

if "%~1"=="--no-pause" exit /b 0
pause
