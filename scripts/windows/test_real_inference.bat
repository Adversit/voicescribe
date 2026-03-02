@echo off
REM Real (non-mock) inference smoke test
setlocal
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe Real Inference Test
echo ========================================
echo.

python "%~dp0test_real_inference.py"
if errorlevel 1 (
    echo.
    echo [FAIL] Real inference test failed.
    exit /b 1
)

echo.
echo [PASS] Real inference test passed.
exit /b 0
