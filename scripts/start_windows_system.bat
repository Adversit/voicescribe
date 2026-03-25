@echo off
setlocal

set "ROOT=%~dp0.."
set "TAURI_DIR=%ROOT%\tauri-app"
set "RELEASE_DIR=%TAURI_DIR%\src-tauri\target\release"
set "APP_EXE=%RELEASE_DIR%\voicescribe-desktop.exe"
set "RUST_BIN=C:\Program Files\Rust stable MSVC 1.94\bin"
set "VSDEVCMD=D:\VSBuildTools2022\Common7\Tools\VsDevCmd.bat"
set "SKIP_BUILD=0"

if /I "%~1"=="--skip-build" set "SKIP_BUILD=1"

if not exist "%TAURI_DIR%\package.json" (
  echo [ERROR] tauri-app not found: %TAURI_DIR%
  exit /b 1
)

if "%SKIP_BUILD%"=="0" (
  echo [INFO] Building latest Tauri app before launch...
  if not exist "%VSDEVCMD%" (
    echo [ERROR] VS Build Tools not found: %VSDEVCMD%
    exit /b 1
  )

  pushd "%TAURI_DIR%"
  set "PATH=%RUST_BIN%;%PATH%"
  call "%VSDEVCMD%" -no_logo
  if errorlevel 1 (
    echo [ERROR] Failed to load MSVC build environment.
    popd
    exit /b 1
  )

  call npm run tauri:build
  if errorlevel 1 (
    echo [ERROR] tauri build failed.
    popd
    exit /b 1
  )
  popd
)

if not exist "%APP_EXE%" (
  echo [ERROR] App executable not found after build: %APP_EXE%
  exit /b 1
)

echo [INFO] Launching VoiceScribe desktop app...
pushd "%RELEASE_DIR%"
start "" "%APP_EXE%"
popd

exit /b 0
