@echo off
setlocal

:: Define paths
set PROJECT_ROOT=%~dp0
set VENV_PATH=%PROJECT_ROOT%venv
set PYTHON_EXE=%VENV_PATH%\python.exe
set SERVER_SCRIPT=%PROJECT_ROOT%llm_server.py
set NODE_SERVER=%PROJECT_ROOT%server.js

:: Check if Conda environment exists
if not exist "%VENV_PATH%" (
    echo Error: Conda environment not found at %VENV_PATH%
    pause
    exit /b 1
)

:: Check if Python executable exists
if not exist "%PYTHON_EXE%" (
    echo Error: Python executable not found at %PYTHON_EXE%
    pause
    exit /b 1
)

:: Check if server script exists
if not exist "%SERVER_SCRIPT%" (
    echo Error: LLM server script not found at %SERVER_SCRIPT%
    pause
    exit /b 1
)

:: Check if Node.js server script exists
if not exist "%NODE_SERVER%" (
    echo Error: Node.js server script not found at %NODE_SERVER%
    pause
    exit /b 1
)

:: Activate Conda environment
call conda activate %VENV_PATH% || (
    echo Error: Failed to activate Conda environment. Ensure Conda is installed and added to PATH.
    pause
    exit /b 1
)

:: Start LLM server in a new window
echo Starting LLM server...
start "LLM Server" cmd /k "%PYTHON_EXE% %SERVER_SCRIPT%"

:: Wait a moment to allow LLM server to start
timeout /t 2 /nobreak

:: Start Node.js server in a new window
echo Starting Node.js server...
start "Node Server" cmd /k cd /d "%PROJECT_ROOT%" && npm start

:: Wait a moment to allow servers to initialize
timeout /t 2 /nobreak

:: Open the website in the default browser
echo Opening website at http://localhost:3000...
start http://localhost:3000

echo Launch script completed. Check the server windows for logs.
pause