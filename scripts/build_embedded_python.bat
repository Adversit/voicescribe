@echo off
setlocal

set "ROOT=%~dp0.."
set "TARGET=%ROOT%\tauri-app\src-tauri\resources\python-embed"
set "ZIP_FILE=%TARGET%\python-embed.zip"

if not exist "%TARGET%" mkdir "%TARGET%"

echo [INFO] Place the Windows embeddable Python zip in:
echo        %ZIP_FILE%
echo [INFO] Then rerun this script to extract it into:
echo        %TARGET%

if not exist "%ZIP_FILE%" (
  echo [WARN] python-embed zip not found. Skipping extraction.
  exit /b 0
)

powershell -NoProfile -Command "Expand-Archive -LiteralPath '%ZIP_FILE%' -DestinationPath '%TARGET%' -Force"
if errorlevel 1 (
  echo [ERROR] Failed to extract python-embed zip.
  exit /b 1
)

if not exist "%TARGET%\python.exe" (
  echo [ERROR] Extraction completed, but python.exe was not found.
  exit /b 1
)

for %%F in ("%TARGET%\python*._pth") do (
  powershell -NoProfile -Command "$p='%%~fF'; $c=Get-Content $p; $c=$c -replace '^#import site','import site'; Set-Content $p $c -Encoding utf8"
)

"%TARGET%\python.exe" -c "import sys; print(sys.version)" >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Embedded python.exe exists but failed to start.
  exit /b 1
)

"%TARGET%\python.exe" -c "import venv" >nul 2>nul
if errorlevel 1 (
  echo [WARN] Embedded Python is available, but venv support is not ready.
  echo [WARN] First-time bootstrap will fall back to system Python if it is installed.
) else (
  echo [INFO] Embedded Python reports venv support.
)

echo [INFO] Embedded Python is ready: %TARGET%\python.exe
exit /b 0
