@echo off
REM VoiceScribe Cleanup Script
REM Clean build artifacts, caches and temp files
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

echo ========================================
echo   VoiceScribe Cleanup Script
echo ========================================
echo.

set "SCRIPT_DIR=%~dp0"
set "DRY_RUN=0"

REM Parse arguments
if "%1"=="--dry-run" set "DRY_RUN=1"

if "%DRY_RUN%"=="1" (
    echo [MODE] Dry run - only showing what would be deleted
    echo.
)

REM Clean frontend build artifacts
echo [CLEAN] Frontend build artifacts...

set "DIRS_TO_REMOVE=frontend\.next frontend\out frontend\dist frontend\dist-electron frontend\node_modules\.cache"

for %%d in (%DIRS_TO_REMOVE%) do (
    if exist "%SCRIPT_DIR%%%d" (
        if "%DRY_RUN%"=="1" (
            echo   Preview: delete %%d
        ) else (
            echo   Deleting %%d
            rmdir /s /q "%SCRIPT_DIR%%%d" 2>nul
        )
    )
)

REM Clean backend caches
echo.
echo [CLEAN] Backend caches...
set "BACKEND_CACHE=backend\__pycache__ backend\.pytest_cache backend\.mypy_cache"

for %%d in (%BACKEND_CACHE%) do (
    if exist "%SCRIPT_DIR%%%d" (
        if "%DRY_RUN%"=="1" (
            echo   Preview: delete %%d
        ) else (
            echo   Deleting %%d
            rmdir /s /q "%SCRIPT_DIR%%%d" 2>nul
        )
    )
)

REM Recursively delete __pycache__
echo.
echo [CLEAN] Python cache directories...
if "%DRY_RUN%"=="1" (
    for /d /r "%SCRIPT_DIR%backend" %%d in (__pycache__) do (
        if exist "%%d" echo   Preview: delete %%d
    )
) else (
    for /d /r "%SCRIPT_DIR%backend" %%d in (__pycache__) do (
        if exist "%%d" (
            echo   Deleting %%d
            rmdir /s /q "%%d" 2>nul
        )
    )
)

REM Clean .pyc files
echo.
echo [CLEAN] .pyc files...
if "%DRY_RUN%"=="1" (
    for /r "%SCRIPT_DIR%backend" %%f in (*.pyc) do echo   Preview: delete %%f
) else (
    del /s /q "%SCRIPT_DIR%backend\*.pyc" 2>nul
)

REM Clean temp files
echo.
echo [CLEAN] Temp files...
set "TEMP_PATTERNS=*.log *.tmp *.temp"
for %%p in (%TEMP_PATTERNS%) do (
    if "%DRY_RUN%"=="1" (
        for /r "%SCRIPT_DIR%" %%f in (%%p) do echo   Preview: delete %%f
    ) else (
        del /s /q "%SCRIPT_DIR%%%p" 2>nul
    )
)

echo.
echo ========================================
echo   Cleanup Complete!
echo ========================================
echo.
if "%DRY_RUN%"=="1" (
    echo This was a dry run. No files were deleted.
    echo Run without --dry-run to actually delete.
)

if "%~1"=="--no-pause" exit /b 0
if "%~2"=="--no-pause" exit /b 0
pause
