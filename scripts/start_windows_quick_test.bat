@echo off
setlocal

set "ROOT=%~dp0.."
for %%I in ("%ROOT%") do set "ROOT=%%~fI"
set "TAURI_DIR=%ROOT%\tauri-app"
set "RELEASE_DIR=%TAURI_DIR%\src-tauri\target\release"
set "APP_EXE=%RELEASE_DIR%\voicescribe-desktop.exe"
set "RESOURCE_DIR=%RELEASE_DIR%\resources"
set "PACKAGED_BACKEND_RESOURCES=%RESOURCE_DIR%\backend"
set "PACKAGED_TEST=0"

for %%A in (%*) do (
  if /I "%%~A"=="--packaged-test" set "PACKAGED_TEST=1"
)

if not exist "%TAURI_DIR%\package.json" (
  echo [ERROR] tauri-app not found: %TAURI_DIR%
  exit /b 1
)

call :stop_running_processes
if errorlevel 1 exit /b 1

if "%PACKAGED_TEST%"=="1" (
  set "VOICESCRIBE_FORCE_INSTALL_MODE=1"
  set "VOICESCRIBE_RUNTIME_OVERRIDE_DIR=%ROOT%\.packaged-runtime"
  echo [INFO] Running quick packaged-mode simulation...
  echo [INFO] Runtime override: %VOICESCRIBE_RUNTIME_OVERRIDE_DIR%
  call :prepare_packaged_test_resources
  if errorlevel 1 exit /b 1
)

if not exist "%APP_EXE%" (
  echo [ERROR] Release app executable not found: %APP_EXE%
  echo [HINT] Run scripts\start_windows_system.bat once to build the desktop app, then retry.
  exit /b 1
)

echo [INFO] Quick test launch: reusing existing release executable without tauri build...
pushd "%RELEASE_DIR%"
start "" "%APP_EXE%"
popd

exit /b 0

:stop_running_processes
echo [INFO] Stopping existing VoiceScribe processes...
taskkill /IM voicescribe-desktop.exe /F >nul 2>nul
powershell -NoProfile -Command "$py = Get-CimInstance Win32_Process | Where-Object { ($_.Name -eq 'python.exe' -or $_.Name -eq 'pythonw.exe') -and $_.CommandLine -and ($_.CommandLine -like '*backend\server.py*' -or $_.CommandLine -like '*voicescribe*backend*') }; $port = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 } | Select-Object -ExpandProperty OwningProcess -Unique; $pids = @(); if ($py) { $pids += ($py | Select-Object -ExpandProperty ProcessId) }; if ($port) { $pids += $port }; $pids | Sort-Object -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }" >nul 2>nul
call :wait_for_backend_port_exit
if errorlevel 1 exit /b 1
timeout /t 2 /nobreak >nul
exit /b 0

:wait_for_backend_port_exit
set /a WAIT_COUNT=0
:wait_for_backend_port_exit_loop
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -gt 0 }) { exit 1 } else { exit 0 }" >nul 2>nul
if not errorlevel 1 exit /b 0
set /a WAIT_COUNT+=1
if %WAIT_COUNT% GEQ 10 (
  echo [ERROR] Backend port 8765 is still occupied after cleanup.
  powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue | Select-Object LocalAddress,LocalPort,State,OwningProcess | Format-Table -AutoSize"
  exit /b 1
)
timeout /t 1 /nobreak >nul
goto :wait_for_backend_port_exit_loop

:prepare_packaged_test_resources
echo [INFO] Preparing packaged-mode backend resources...
if not exist "%RESOURCE_DIR%" mkdir "%RESOURCE_DIR%"
robocopy "%ROOT%\backend" "%PACKAGED_BACKEND_RESOURCES%" /MIR /XD "venv" "__pycache__" >nul
if errorlevel 8 (
  echo [ERROR] Failed to mirror backend resources for packaged-mode simulation.
  exit /b 1
)
exit /b 0
