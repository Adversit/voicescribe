@echo off
REM Fast path: repair environment for real (non-mock) Whisper inference on Windows.
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe Real Inference Fix
echo ========================================
echo.

set "CONDA_ENV_NAME=voicescribe"
set "ROOT_DIR=%~dp0..\.."

pushd "%ROOT_DIR%"

echo [1/6] Activate conda env: %CONDA_ENV_NAME%
call conda activate %CONDA_ENV_NAME%
if errorlevel 1 (
    echo [ERROR] Failed to activate conda env '%CONDA_ENV_NAME%'.
    echo [HINT] Run scripts\windows\install.bat first.
    popd
    exit /b 1
)

echo [2/6] Upgrade pip tooling
python -m pip install -U pip setuptools wheel
if errorlevel 1 (
    echo [ERROR] Failed to upgrade pip tooling.
    popd
    exit /b 1
)

echo [3/6] Remove broken Torch stack ^(if present^)
python -m pip uninstall -y torch torchaudio torchvision >nul 2>&1

echo [4/6] Install backend core dependencies
python -m pip install -r backend\requirements-core.txt
if errorlevel 1 (
    echo [ERROR] Failed to install requirements-core.txt
    popd
    exit /b 1
)

echo [5/6] Install CPU Torch for ctranslate2/faster-whisper import compatibility
python -m pip install --index-url https://download.pytorch.org/whl/cpu torch
if errorlevel 1 (
    echo [ERROR] Failed to install CPU torch.
    echo [HINT] Check network/proxy and rerun this script.
    popd
    exit /b 1
)

echo [6/6] Smoke test real inference ^(non-mock^)
python scripts\windows\test_real_inference.py
if errorlevel 1 (
    echo [ERROR] Real inference smoke test failed.
    popd
    exit /b 1
)

echo.
echo [PASS] Real inference repair completed.
echo.
popd
exit /b 0
