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

echo [INFO] Embedded Python is ready: %TARGET%\python.exe
exit /b 0
