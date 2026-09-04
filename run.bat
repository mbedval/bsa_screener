@echo off
setlocal enabledelayedexpansion

:: Get directory where script resides
set "SCRIPT_DIR=%~dp0"
:: Remove trailing backslash if present
if "%SCRIPT_DIR:~-1%"=="\" set "SCRIPT_DIR=%SCRIPT_DIR:~0,-1%"

cd /d "%SCRIPT_DIR%"

:: Set PYTHONPATH to project root and backend folder to prevent 'no module' errors
set "PYTHONPATH=%SCRIPT_DIR%;%SCRIPT_DIR%\backend;%PYTHONPATH%"

:: Check if virtual environment Python / Uvicorn exists
if exist "%SCRIPT_DIR%\.venv\Scripts\uvicorn.exe" (
    "%SCRIPT_DIR%\.venv\Scripts\uvicorn.exe" backend.app.main:app --host 0.0.0.0 --port 8000 --reload %*
) else if exist "%SCRIPT_DIR%\venv\Scripts\uvicorn.exe" (
    "%SCRIPT_DIR%\venv\Scripts\uvicorn.exe" backend.app.main:app --host 0.0.0.0 --port 8000 --reload %*
) else (
    uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload %*
)
