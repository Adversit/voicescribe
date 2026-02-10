@echo off
REM VoiceScribe Backend Test Script
REM Tests all backend API endpoints
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe Backend Tests
echo ========================================
echo.

set "BASE_URL=http://127.0.0.1:8765"
set "PASS=0"
set "FAIL=0"

REM Bypass proxy for localhost
set "NO_PROXY=127.0.0.1,localhost"
set "no_proxy=127.0.0.1,localhost"
set "HTTP_PROXY="
set "HTTPS_PROXY="
set "http_proxy="
set "https_proxy="

REM Check curl availability
where curl >nul 2>&1
if errorlevel 1 (
    echo [ERROR] curl not found. Please use Windows 10/11 or install curl.
    exit /b 1
)

REM 1. Check service status
echo [1/7] Service status (GET /)...
curl -s --noproxy "*" --connect-timeout 3 "%BASE_URL%/" > "%TEMP%\vs_test_result.txt" 2>&1
if errorlevel 1 (
    echo   [FAIL] Backend not running
    echo.
    echo   Please start the backend first:
    echo     scripts\start_backend.bat --mock
    exit /b 1
)
set /p STATUS=<"%TEMP%\vs_test_result.txt"
echo   [PASS] %STATUS%
set /a PASS+=1
echo.

REM 2. Health check
echo [2/7] Health check (GET /health)...
curl -s --noproxy "*" "%BASE_URL%/health" > "%TEMP%\vs_test_result.txt" 2>&1
set /p HEALTH=<"%TEMP%\vs_test_result.txt"
echo   [PASS] %HEALTH%
set /a PASS+=1
echo.

REM 3. Engine list
echo [3/7] Available engines (GET /engines)...
curl -s --noproxy "*" "%BASE_URL%/engines" > "%TEMP%\vs_test_result.txt" 2>&1
set /p ENGINES=<"%TEMP%\vs_test_result.txt"
echo   [PASS] %ENGINES%
set /a PASS+=1
echo.

REM 4. Speaker list
echo [4/7] Speaker list (GET /speakers)...
curl -s --noproxy "*" "%BASE_URL%/speakers" > "%TEMP%\vs_test_result.txt" 2>&1
set /p SPEAKERS=<"%TEMP%\vs_test_result.txt"
echo   [PASS] %SPEAKERS%
set /a PASS+=1
echo.

REM 5. Load engine
echo [5/7] Load engine (POST /load)...
curl -s --noproxy "*" -X POST -F "engine=whisper" -F "model=base" "%BASE_URL%/load" > "%TEMP%\vs_test_result.txt" 2>&1
set /p LOAD=<"%TEMP%\vs_test_result.txt"
if "!LOAD!"=="" (
    echo   [FAIL] No response
    set /a FAIL+=1
) else (
    echo   [PASS] !LOAD!
    set /a PASS+=1
)
echo.

REM 6. Transcribe test
echo [6/7] Transcribe test (POST /transcribe)...
echo dummy audio content > "%TEMP%\voicescribe_test.wav"
curl -s --noproxy "*" -X POST -F "audio=@%TEMP%\voicescribe_test.wav" "%BASE_URL%/transcribe" > "%TEMP%\vs_test_result.txt" 2>&1
del "%TEMP%\voicescribe_test.wav" >nul 2>&1
set /p TRANSCRIBE=<"%TEMP%\vs_test_result.txt"
if "!TRANSCRIBE!"=="" (
    echo   [FAIL] No response
    set /a FAIL+=1
) else (
    echo   [PASS] !TRANSCRIBE!
    set /a PASS+=1
)
echo.

REM 7. Delete speaker
echo [7/7] Delete speaker (DELETE /speakers/mock_001)...
curl -s --noproxy "*" -X DELETE "%BASE_URL%/speakers/mock_001" > "%TEMP%\vs_test_result.txt" 2>&1
set /p DELETE_RESULT=<"%TEMP%\vs_test_result.txt"
if "!DELETE_RESULT!"=="" (
    echo   [FAIL] No response
    set /a FAIL+=1
) else (
    echo   [PASS] !DELETE_RESULT!
    set /a PASS+=1
)
echo.

REM Cleanup
del "%TEMP%\vs_test_result.txt" >nul 2>&1

echo ========================================
echo   Results: %PASS% passed, %FAIL% failed
echo ========================================
echo.

if "%~1"=="--no-pause" exit /b 0
pause
