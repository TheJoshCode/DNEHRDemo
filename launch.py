import os
import subprocess
import time
import sys
import shutil
from pathlib import Path
import ctypes

# Define paths
PROJECT_ROOT = Path(__file__).parent.resolve()
VENV_PATH = PROJECT_ROOT / "venv"
PYTHON_EXE = VENV_PATH / "python.exe"
SERVER_SCRIPT = PROJECT_ROOT / "llm_server.py"
NODE_SERVER = PROJECT_ROOT / "server.js"
NODE_APP_SCRIPT = PROJECT_ROOT / "electron.js"

# Safe fail handler for GUI-packaged apps
def fail(message):
    print(f"Error: {message}")
    try:
        # Show Windows message box (safe for --noconsole)
        ctypes.windll.user32.MessageBoxW(0, message, "Launch Error", 0)
    except Exception:
        pass
    sys.exit(1)

# Check for Conda (if relevant)
if not shutil.which("conda"):
    fail("Conda is not available in PATH.")

# Check necessary paths
if not VENV_PATH.exists():
    fail(f"Conda environment not found at {VENV_PATH}")

if not PYTHON_EXE.exists():
    fail(f"Python executable not found at {PYTHON_EXE}")

if not SERVER_SCRIPT.exists():
    fail(f"LLM server script not found at {SERVER_SCRIPT}")

if not NODE_SERVER.exists():
    fail(f"Node.js backend (server.js) not found at {NODE_SERVER}")

if not NODE_APP_SCRIPT.exists():
    fail(f"Electron entry point not found at {NODE_APP_SCRIPT}")

# Launch LLM server
print("Launching LLM server...")
llm_command = f'start "" cmd /k "{PYTHON_EXE} {SERVER_SCRIPT}"'
subprocess.run(llm_command, shell=True)

# Wait a few seconds to let it spin up
time.sleep(3)

# Launch Node.js backend server
print("Launching Node.js backend server...")
node_command = f'start "" cmd /k "cd /d {PROJECT_ROOT} && npm run start"'
subprocess.run(node_command, shell=True)

# Wait a few seconds
time.sleep(3)

# Launch Electron app as frontend
print("Launching frontend Electron app...")
electron_command = f'start "" cmd /k "cd /d {PROJECT_ROOT} && npm run app"'
subprocess.run(electron_command, shell=True)

print("✅ All systems launched. Check the app window and terminal logs.")
