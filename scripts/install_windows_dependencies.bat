@echo off
setlocal EnableExtensions

set "ROOT_DIR=%~dp0.."
for %%I in ("%ROOT_DIR%") do set "ROOT_DIR=%%~fI"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "VENV_DIR=%BACKEND_DIR%\venv"
set "PYTHON_EXE="
set "MODE=full"

if /I "%~1"=="--minimal" set "MODE=minimal"
if /I "%~1"=="--full" set "MODE=full"
if /I "%~1"=="--help" goto :help
if /I "%~1"=="-h" goto :help

if /I "%MODE%"=="minimal" (
  set "REQ_FILE=%BACKEND_DIR%\requirements-minimal.txt"
) else (
  set "REQ_FILE=%BACKEND_DIR%\requirements.txt"
)

echo ========================================
echo   VoiceScribe Windows Dependency Setup
echo ========================================
echo Root: %ROOT_DIR%
echo Mode: %MODE%
echo Requirements: %REQ_FILE%
echo.

where py >nul 2>nul
if not errorlevel 1 (
  set "PYTHON_EXE=py -3"
) else (
  where python >nul 2>nul
  if not errorlevel 1 (
    set "PYTHON_EXE=python"
  )
)

if not defined PYTHON_EXE (
  echo [ERROR] Python 3 not found in PATH.
  exit /b 1
)

if not exist "%VENV_DIR%\Scripts\python.exe" (
  echo [INFO] Creating backend virtual environment...
  call %PYTHON_EXE% -m venv "%VENV_DIR%"
  if errorlevel 1 (
    echo [ERROR] Failed to create virtual environment.
    exit /b 1
  )
) else (
  echo [INFO] Reusing existing backend virtual environment.
)

echo [INFO] Upgrading pip...
call "%VENV_DIR%\Scripts\python.exe" -m pip install --upgrade pip
if errorlevel 1 (
  echo [ERROR] Failed to upgrade pip.
  exit /b 1
)

echo [INFO] Installing dependencies from %REQ_FILE%...
call "%VENV_DIR%\Scripts\python.exe" -m pip install -r "%REQ_FILE%"
if errorlevel 1 (
  echo [ERROR] Dependency installation failed.
  exit /b 1
)

echo.
echo [OK] Dependency installation completed.
echo Virtual environment: %VENV_DIR%
exit /b 0

:help
echo Usage:
echo   scripts\install_windows_dependencies.bat [--minimal^|--full]
echo.
echo Options:
echo   --minimal   Install backend\requirements-minimal.txt
echo   --full      Install backend\requirements.txt ^(default^)
exit /b 0
