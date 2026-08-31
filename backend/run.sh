#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"

# Add project root to PYTHONPATH so backend can import the engine modules
export PYTHONPATH="$PARENT_DIR:$PYTHONPATH"

# Change directory to backend/ so Uvicorn can find the app package correctly
cd "$SCRIPT_DIR"

if [ -f "$PARENT_DIR/.venv/bin/uvicorn" ]; then
    exec "$PARENT_DIR/.venv/bin/uvicorn" app.main:app --reload --port 8000 "$@"
else
    exec uvicorn app.main:app --reload --port 8000 "$@"
fi
