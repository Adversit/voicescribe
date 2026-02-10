@echo off
REM VoiceScribe GPU Support Install Script
REM Install PyTorch with CUDA support for GPU acceleration
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe GPU Support Install
echo ========================================
echo.

set "CONDA_ENV_NAME=voicescribe"

echo This script will:
echo   1. Check for NVIDIA GPU and CUDA
echo   2. Auto-detect CUDA version
echo   3. Install PyTorch with CUDA support
echo.
echo NOTE: This will replace CPU-only PyTorch if installed
echo.

REM ============================================
REM Step 1: Check GPU and CUDA
REM ============================================
echo ----------------------------------------
echo   Step 1/2: Check GPU and CUDA
echo ----------------------------------------
echo.

REM Check NVIDIA GPU
echo [CHECK] NVIDIA GPU...
nvidia-smi >nul 2>&1
if errorlevel 1 (
    echo [ERROR] nvidia-smi not found!
    echo.
    echo This means either:
    echo   1. No NVIDIA GPU is installed
    echo   2. NVIDIA drivers are not installed
    echo.
    echo Please install NVIDIA drivers first:
    echo   https://www.nvidia.com/Download/index.aspx
    echo.
    pause
    exit /b 1
)

REM Get GPU info
echo [OK] NVIDIA GPU detected
for /f "tokens=*" %%i in ('nvidia-smi --query-gpu=name --format=csv,noheader 2^>nul') do (
    echo [INFO] GPU: %%i
)
for /f "tokens=*" %%i in ('nvidia-smi --query-gpu=driver_version --format=csv,noheader 2^>nul') do (
    echo [INFO] Driver: %%i
)

REM Check CUDA version
echo.
echo [CHECK] CUDA version...
for /f "tokens=*" %%i in ('nvidia-smi --query-gpu=cuda_version --format=csv,noheader 2^>nul') do (
    set CUDA_VERSION=%%i
    echo [OK] CUDA %%i supported by driver
)

if not defined CUDA_VERSION (
    echo [WARN] Could not detect CUDA version
    set CUDA_VERSION=12.6
    echo [INFO] Will try CUDA 12.6 (latest)
)
echo.

REM ============================================
REM Step 2: Install PyTorch with CUDA
REM ============================================
echo ----------------------------------------
echo   Step 2/2: Install PyTorch with CUDA
echo ----------------------------------------
echo.

REM Activate conda env
echo [ACTIVATE] Conda environment '%CONDA_ENV_NAME%'...
call conda activate %CONDA_ENV_NAME%
if errorlevel 1 (
    echo [ERROR] Failed to activate conda environment
    echo [INFO] Please run install.bat first
    pause
    exit /b 1
)
echo [OK] Activated

REM Check current PyTorch and CUDA status
echo.
echo [CHECK] Current PyTorch installation...
python -c "import torch; print('[INFO] Current PyTorch:', torch.__version__); cuda_available = torch.cuda.is_available(); print('[INFO] CUDA available:', cuda_available); exit(0 if cuda_available else 1)" 2>nul
if not errorlevel 1 (
    echo.
    echo ========================================
    echo   GPU Support Already Installed!
    echo ========================================
    echo.
    echo Your PyTorch already has GPU support enabled.
    echo No need to reinstall.
    echo.
    python -c "import torch; print('[INFO] PyTorch version:', torch.__version__); print('[INFO] CUDA version:', torch.version.cuda); print('[INFO] GPU count:', torch.cuda.device_count()); [print(f'[INFO] GPU {i}:', torch.cuda.get_device_name(i)) for i in range(torch.cuda.device_count())]"
    echo.
    if "%~1"=="--no-pause" exit /b 0
    pause
    exit /b 0
)

REM PyTorch exists but no CUDA
python -c "import torch" 2>nul
if not errorlevel 1 (
    echo [INFO] PyTorch found but CUDA not available
    echo [INFO] Will reinstall with GPU support
) else (
    echo [INFO] PyTorch not installed
    echo [ERROR] Please run install.bat first
    pause
    exit /b 1
)

echo.
echo [INSTALL] PyTorch with CUDA support...
echo [INFO] This may take several minutes...
echo.

REM Try light-the-torch first (auto-detects CUDA version)
echo [METHOD 1] Trying light-the-torch (auto-detection)...
python -m pip install light-the-torch -q
if not errorlevel 1 (
    python -m light_the_torch install torch torchvision torchaudio
    if not errorlevel 1 (
        echo [OK] PyTorch installed via light-the-torch
        goto :verify
    )
)

echo [WARN] light-the-torch failed, trying manual install...
echo.

REM Fallback: Manual install with CUDA 12.6 (latest)
echo [METHOD 2] Manual install with CUDA 12.6...
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
if errorlevel 1 (
    echo [ERROR] Failed to install PyTorch with CUDA
    echo.
    echo Troubleshooting:
    echo   1. Check your internet connection
    echo   2. Try running the command manually:
    echo      pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu126
    echo.
    pause
    exit /b 1
)

:verify
echo.
echo ========================================
echo   Verifying Installation
echo ========================================
echo.

python -c "import torch; print('[OK] PyTorch', torch.__version__); cuda_available = torch.cuda.is_available(); print('[INFO] CUDA available:', cuda_available); exit(0 if cuda_available else 1); print('[INFO] CUDA version:', torch.version.cuda if cuda_available else 'N/A'); print('[INFO] GPU count:', torch.cuda.device_count() if cuda_available else 0); [print(f'[INFO] GPU {i}:', torch.cuda.get_device_name(i)) for i in range(torch.cuda.device_count())] if cuda_available else None"

if errorlevel 1 (
    echo.
    echo [ERROR] GPU support verification failed!
    echo.
    echo PyTorch was installed but CUDA is not available.
    echo This could mean:
    echo   1. CUDA drivers are not properly installed
    echo   2. PyTorch CUDA version doesn't match your driver
    echo   3. GPU is not detected by the system
    echo.
    echo Please check:
    echo   - Run 'nvidia-smi' to verify GPU is detected
    echo   - Reinstall NVIDIA drivers if needed
    echo   - Restart your computer and try again
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   GPU Support Install Complete!
echo ========================================
echo.
echo Your system is now configured for GPU acceleration.
echo.
echo Next steps:
echo   1. Run dev.bat to start the app
echo   2. Select Parakeet engine for GPU-accelerated transcription
echo.
echo NOTE: FunASR and Whisper will also benefit from GPU acceleration
echo.

if "%~1"=="--no-pause" exit /b 0
pause
