@echo off
REM VoiceScribe Windows Install Script
REM Install Python backend dependencies (conda) and frontend packages
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe Windows Install
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
set "BACKEND_DIR=%SCRIPT_DIR%backend"
set "FRONTEND_DIR=%SCRIPT_DIR%frontend"
set "CONDA_ENV_NAME=voicescribe"

echo This script will:
echo   1. Check system requirements (conda, Node.js)
echo   2. Create conda env and install dependencies
echo   3. Install PyTorch (CPU version)
echo   4. Install frontend dependencies
echo.

REM ============================================
REM Step 1: Check system requirements
REM ============================================
echo ----------------------------------------
echo   Step 1/4: System Requirements
echo ----------------------------------------
echo.

REM Check conda
echo [CHECK] Conda...
call conda --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Conda not found. Please install Anaconda or Miniconda.
    exit /b 1
)
for /f "tokens=*" %%i in ('conda --version 2^>^&1') do set CONDA_VERSION=%%i
echo [OK] %CONDA_VERSION%

REM Check Node.js
echo [CHECK] Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js not found. Please install Node.js
    exit /b 1
)
for /f %%i in ('node --version') do set NODE_VERSION=%%i
echo [OK] Node.js %NODE_VERSION%
echo.

REM ============================================
REM Step 2: Create conda environment
REM ============================================
echo ----------------------------------------
echo   Step 2/4: Conda Environment
echo ----------------------------------------
echo.

REM Check if conda env already exists
call conda env list 2>nul | findstr /C:"%CONDA_ENV_NAME%" >nul 2>&1
if not errorlevel 1 (
    echo [OK] Conda environment '%CONDA_ENV_NAME%' already exists
) else (
    echo [CREATE] Conda environment '%CONDA_ENV_NAME%' with Python 3.12...
    call conda create -n %CONDA_ENV_NAME% python=3.12 -y
    if errorlevel 1 (
        echo [ERROR] Failed to create conda environment
        exit /b 1
    )
    echo [OK] Conda environment created
)

REM Activate conda env
echo [ACTIVATE] Conda environment '%CONDA_ENV_NAME%'...
call conda activate %CONDA_ENV_NAME%
if errorlevel 1 (
    echo [ERROR] Failed to activate conda environment
    exit /b 1
)
echo [OK] Activated

REM Verify we're in the correct environment
for /f "tokens=*" %%i in ('python -c "import sys; print(sys.executable)"') do set PYTHON_PATH=%%i
echo [INFO] Using Python: %PYTHON_PATH%

set PYTHONIOENCODING=utf-8

REM Install backend dependencies
echo [INSTALL] Python backend dependencies (may take a few minutes)...
cd /d "%BACKEND_DIR%"
python -m pip install --upgrade pip -q
if errorlevel 1 (
    echo [WARN] pip upgrade failed, continuing with current version
)
python -m pip install -r requirements.txt
if errorlevel 1 (
    echo [ERROR] Failed to install Python dependencies
    exit /b 1
)
echo [OK] Python dependencies installed

REM Install ffmpeg via conda (recommended for audio processing)
echo [INSTALL] FFmpeg (audio processing tool)...
call conda install -c conda-forge ffmpeg -y -q
if errorlevel 1 (
    echo [WARN] FFmpeg install failed, will use torchaudio as fallback
) else (
    echo [OK] FFmpeg installed
)
echo.

REM ============================================
REM Step 3: Install PyTorch (CPU version)
REM ============================================
echo ----------------------------------------
echo   Step 3/4: PyTorch (CPU version)
echo ----------------------------------------
echo.

REM Check if PyTorch is already installed
echo [CHECK] PyTorch installation...
python -c "import torch; print('[OK] PyTorch', torch.__version__, 'already installed'); cuda_available = torch.cuda.is_available(); print('[INFO] CUDA available:', cuda_available); exit(0 if cuda_available else 1)" 2>nul
if not errorlevel 1 (
    echo [SKIP] PyTorch with GPU support already installed
    echo [INFO] No need to install CPU version
    goto :torch_done
)

REM Check if CPU version is installed
python -c "import torch; print('[OK] PyTorch', torch.__version__, 'already installed (CPU only)'); exit(0)" 2>nul
if not errorlevel 1 (
    echo [SKIP] PyTorch CPU version already installed
    echo [INFO] For GPU support, run: scripts\windows\install_gpu.bat
    goto :torch_done
)

echo [INFO] PyTorch not found, installing CPU version...
echo [INSTALL] PyTorch CPU-only...
python -m pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
if errorlevel 1 (
    echo [ERROR] Failed to install PyTorch
    exit /b 1
)

:torch_done
echo [CHECK] Verifying PyTorch installation...
python -c "import torch; print(f'[OK] PyTorch {torch.__version__}'); cuda_available = torch.cuda.is_available(); print(f'[INFO] CUDA available: {cuda_available}')"
if errorlevel 1 (
    echo [ERROR] PyTorch verification failed
    exit /b 1
)
echo.
echo [INFO] For GPU support, run: scripts\windows\install_gpu.bat
echo.

REM ============================================
REM Step 4: Install frontend dependencies
REM ============================================
echo ----------------------------------------
echo   Step 4/4: Frontend Dependencies
echo ----------------------------------------
echo.

cd /d "%FRONTEND_DIR%"
echo [INSTALL] Node.js dependencies...
call npm install
if errorlevel 1 (
    echo [ERROR] npm install failed
    exit /b 1
)
echo [OK] Frontend dependencies installed
echo.

REM ============================================
REM Done
REM ============================================
echo ========================================
echo   Install Complete!
echo ========================================
echo.
echo Next steps:
echo   1. For GPU support: scripts\windows\install_gpu.bat
echo   2. Run dev.bat to start the app
echo   3. Or cd frontend ^&^& npm run dev:electron
echo.
echo NOTE: Always activate conda env first:
echo   conda activate %CONDA_ENV_NAME%
echo.

if "%~1"=="--no-pause" exit /b 0
pause
