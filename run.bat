@echo off
setlocal enabledelayedexpansion

:: Get directory where script resides
set "SCRIPT_DIR=%~dp0"
:: Remove trailing backslash if present
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

cd /d "%SCRIPT_DIR%"

:: Set PYTHONPATH to project root and backend folder to prevent 'no module' errors
set "PYTHONPATH=%SCRIPT_DIR%;%SCRIPT_DIR%\backend;%PYTHONPATH%"

:: Parse arguments to check for --build flag
set "FORCE_BUILD=0"
set "UVICORN_ARGS="
:parse_args
if "%~1"=="" goto done_args
if /i "%~1"=="--build" (
    set "FORCE_BUILD=1"
) else (
    set UVICORN_ARGS=!UVICORN_ARGS! %1
)
shift
goto parse_args
:done_args

:: Automatically build frontend production bundle if missing or rebuild requested
set "NEED_BUILD=0"
if "!FORCE_BUILD!"=="1" set "NEED_BUILD=1"
if not exist "%SCRIPT_DIR%\frontend\dist\assets\index-*.js" set "NEED_BUILD=1"
if not exist "%SCRIPT_DIR%\frontend\dist\assets\index-*.css" set "NEED_BUILD=1"

if "!NEED_BUILD!"=="1" (
    echo [INFO] Frontend bundle missing or rebuild requested. Building frontend...
    where npm >nul 2>&1
    if errorlevel 1 (
        echo [WARNING] Node/NPM was not found in PATH.
        echo [WARNING] Please install Node.js and run 'npm run build' inside frontend directory.
    ) else (
        if not exist "%SCRIPT_DIR%\frontend\node_modules" (
            echo [INFO] Installing frontend dependencies...
            call npm install --prefix "%SCRIPT_DIR%\frontend"
        )
        echo [INFO] Compiling Vite bundle...
        call npm --prefix "%SCRIPT_DIR%\frontend" run build
    )
)

:: Check if virtual environment Python / Uvicorn exists
if exist "%SCRIPT_DIR%\.venv\Scripts\uvicorn.exe" (
    "%SCRIPT_DIR%\.venv\Scripts\uvicorn.exe" backend.app.main:app --host 0.0.0.0 --port 8000 --reload !UVICORN_ARGS!
) else if exist "%SCRIPT_DIR%\venv\Scripts\uvicorn.exe" (
    "%SCRIPT_DIR%\venv\Scripts\uvicorn.exe" backend.app.main:app --host 0.0.0.0 --port 8000 --reload !UVICORN_ARGS!
) else (
    uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload !UVICORN_ARGS!
)
