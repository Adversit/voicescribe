# BAT Scripts Verification Report

> Date: 2026-02-09

## Summary

All 6 bat scripts have been updated and verified. Common fixes applied:
- Added `chcp 65001 >nul 2>&1` for UTF-8 console encoding
- Added `--no-pause` parameter support to skip `pause` (for automation)
- Replaced Chinese text with English in output messages
- Added `set NO_PROXY=127.0.0.1,localhost` for proxy bypass
- Added proper error handling with `errorlevel` checks

---

## 1. scripts/start_backend.bat

**Purpose**: Start Python FastAPI backend server

**Changes**:
- Added `chcp 65001` for UTF-8 console
- Added `--mock` flag parsing
- Added `NO_PROXY` env var
- Mock mode installs `requirements-minimal.txt` instead of full
- Removed `pause` (server runs until Ctrl+C)

**Test Result**: PASS
```
Backend starts successfully on http://127.0.0.1:8765
Mock mode returns correct JSON responses
```

**Usage**:
```
scripts\start_backend.bat          # Full mode
scripts\start_backend.bat --mock   # Mock mode (for development)
```

---

## 2. scripts/test_backend.bat

**Purpose**: Test all backend API endpoints

**Changes**:
- Added `chcp 65001` for UTF-8
- Cleared all proxy env vars (`HTTP_PROXY`, `HTTPS_PROXY`, `http_proxy`, `https_proxy`)
- Changed from `for /f` to `set /p` with temp file for reliable curl output capture
- Added `--noproxy "*"` to all curl commands
- Added `--connect-timeout 3` for fast fail
- Added `--no-pause` parameter support
- Extended from 4 tests to 7 tests (added /load, /transcribe, DELETE)

**Test Result**: PASS (7/7)
```
[1/7] Service status (GET /)...         [PASS]
[2/7] Health check (GET /health)...     [PASS]
[3/7] Available engines (GET /engines)  [PASS]
[4/7] Speaker list (GET /speakers)...   [PASS]
[5/7] Load engine (POST /load)...       [PASS]
[6/7] Transcribe test (POST /transcribe) [PASS]
[7/7] Delete speaker (DELETE)...        [PASS]
Results: 7 passed, 0 failed
```

**Usage**:
```
scripts\test_backend.bat              # Interactive (with pause)
scripts\test_backend.bat --no-pause   # Automation mode
```

---

## 3. build.bat

**Purpose**: Build Electron TypeScript + Next.js static export

**Changes**:
- Added `chcp 65001`
- Added step numbering [1/3], [2/3], [3/3]
- Added `--no-pause` parameter support
- Added `errorlevel` checks after npm commands

**Test Result**: PASS
```
[1/3] Dependencies already installed
[2/3] Electron TypeScript: compiled successfully
[3/3] Next.js: compiled in 3.5s, 3 routes (/, /_not-found, /overlay)
Build Complete!
```

**Usage**:
```
build.bat                  # Dev build
build.bat --release        # Release build (shows package hint)
build.bat --no-pause       # Automation mode
```

---

## 4. install.bat

**Purpose**: Full installation (Python venv + deps + models + npm)

**Changes**:
- Added `chcp 65001`
- Added `PYTHONIOENCODING=utf-8`
- Added `--no-pause` parameter support
- Changed messages to English

**Test Result**: PASS (prerequisites verified)
```
Python 3.12.4 - OK
Node.js v22.14.0 - OK
venv already exists
node_modules already installed
```

**Note**: Full run skipped (deps already installed, model download ~2-3GB)

**Usage**:
```
install.bat               # Full interactive install
install.bat --no-pause    # Automation mode
```

---

## 5. cleanup_artifacts.bat

**Purpose**: Clean build artifacts, caches, temp files

**Changes**:
- Added `chcp 65001`
- Added `--no-pause` parameter support (works as 2nd arg too)
- Changed messages to English

**Test Result**: PASS (dry-run mode)
```
Correctly identifies:
- frontend/.next, out, dist-electron (build artifacts)
- backend __pycache__ directories (recursive)
- .pyc files
- .log, .tmp, .temp files
```

**Usage**:
```
cleanup_artifacts.bat --dry-run    # Preview only
cleanup_artifacts.bat              # Actually delete
```

---

## 6. package.bat

**Purpose**: Build and package Electron app for distribution

**Changes**:
- Added `chcp 65001`
- Added `--no-pause` parameter support
- Added step numbering [1/3], [2/3], [3/3]

**Also fixed** `frontend/package.json`:
- Added `name: "voicescribe"`, `description`, `author`, `productName`
- Added `build` config for electron-builder (appId, files, win target, nsis options)

**Test Result**: PARTIAL PASS
```
[1/3] Electron TypeScript: OK
[2/3] Next.js build: OK
[3/3] electron-builder:
  - Downloaded Electron v40.2.1 (138MB): OK
  - Native deps rebuild: OK
  - Packaging: FAIL - electron.exe deleted by Windows Defender
```

**Known Issue**: Windows Defender/antivirus blocks `electron.exe` during extraction.
**Fix**: Add `frontend/dist` directory to Windows Defender exclusion list.

---

## Common `--no-pause` Pattern

All scripts support `--no-pause` to skip the final `pause` command:
```batch
if "%~1"=="--no-pause" exit /b 0
pause
```

This allows scripts to be called from automation (other bat files, CI, etc.) without blocking.

---

## Proxy Issue Resolution

Windows systems with HTTP proxy (e.g., `127.0.0.1:7890`) will intercept localhost requests.
All scripts now clear proxy vars before curl calls:
```batch
set "NO_PROXY=127.0.0.1,localhost"
set "HTTP_PROXY="
set "HTTPS_PROXY="
curl --noproxy "*" http://127.0.0.1:8765/...
```
