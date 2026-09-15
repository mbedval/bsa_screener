#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Add project root and backend folder to PYTHONPATH so imports like `engine.*` and `app.*` resolve cleanly without No Module errors
export PYTHONPATH="$SCRIPT_DIR:$SCRIPT_DIR/backend:$PYTHONPATH"

# Change directory to project root
cd "$SCRIPT_DIR"

# Automatically build frontend production bundle before server start
if [ -f "$SCRIPT_DIR/frontend/build.sh" ]; then
    echo "🔨 Rebuilding frontend bundle..."
    bash "$SCRIPT_DIR/frontend/build.sh"
fi


# Detect Python interpreter & Uvicorn executable
if [ -f "$SCRIPT_DIR/.venv/bin/python" ] && "$SCRIPT_DIR/.venv/bin/python" -c "import uvicorn" 2>/dev/null; then
    PYTHON_BIN="$SCRIPT_DIR/.venv/bin/python"
    exec "$PYTHON_BIN" -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload "$@"
elif python3 -c "import uvicorn" 2>/dev/null; then
    exec python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload "$@"
elif command -v uvicorn >/dev/null 2>&1; then
    exec uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload "$@"
else
    exec python3 -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000 --reload "$@"
fi
