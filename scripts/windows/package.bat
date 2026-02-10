@echo off
REM VoiceScribe Windows Package Script
REM Package Electron application
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe Package Script
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"

cd /d "%FRONTEND_DIR%"

REM Check node_modules
if not exist "node_modules" (
    echo [INSTALL] Node.js dependencies...
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed
        exit /b 1
    )
)

REM Build first
echo [1/3] Building Electron TypeScript...
call npm run build:electron
if errorlevel 1 (
    echo [ERROR] Electron build failed
    exit /b 1
)
echo [OK] Electron build complete
echo.

echo [2/3] Building Next.js...
call npm run build
if errorlevel 1 (
    echo [ERROR] Next.js build failed
    exit /b 1
)
echo [OK] Next.js build complete
echo.

REM Package
echo [3/3] Packaging Electron app...
call npm run package
if errorlevel 1 (
    echo [ERROR] Packaging failed
    exit /b 1
)

echo.
echo ========================================
echo   Package Complete!
echo ========================================
echo.
echo   Output: frontend\dist
echo.

if "%~1"=="--no-pause" exit /b 0
pause
