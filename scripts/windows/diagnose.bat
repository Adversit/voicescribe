@echo off
echo ========================================
echo   VoiceScribe Diagnostic Tool
echo ========================================
echo.

echo [1] Checking processes...
echo.
echo Node.js processes:
tasklist /FI "IMAGENAME eq node.exe" /FO TABLE 2>nul
echo.

echo Python processes:
tasklist /FI "IMAGENAME eq python.exe" /FO TABLE 2>nul
echo.

echo [2] Checking ports...
echo.
echo Port 3000 (Frontend):
netstat -ano | findstr :3000
echo.

echo Port 8765 (Backend):
netstat -ano | findstr :8765
echo.

echo [3] Testing backend connection...
curl -s http://127.0.0.1:8765/health
echo.
echo.

echo [4] Testing frontend connection...
curl -s http://localhost:3000 >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Frontend not accessible
) else (
    echo [OK] Frontend is accessible
)
echo.

echo [5] Checking backend engines...
curl -s http://127.0.0.1:8765/engines
echo.
echo.

echo [6] File structure check...
echo.
if exist "..\..\frontend\dist-electron\main.js" (
    echo [OK] Electron main.js exists
) else (
    echo [ERROR] Electron main.js not found - run: npm run build:electron
)
echo.

if exist "..\..\frontend\.next" (
    echo [OK] Next.js build exists
) else (
    echo [WARN] Next.js build not found - will be created on first run
)
echo.

echo [7] Log files...
echo.
if exist "..\..\backend\server_out.log" (
    echo Backend output log (last 10 lines):
    powershell -Command "Get-Content '..\..\backend\server_out.log' -Tail 10"
    echo.
)

if exist "..\..\backend\server_err.log" (
    echo Backend error log (last 10 lines):
    powershell -Command "Get-Content '..\..\backend\server_err.log' -Tail 10"
    echo.
)

echo ========================================
echo   Diagnostic complete
echo ========================================
echo.
pause
