#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PARENT_DIR="$(dirname "$SCRIPT_DIR")"

if [ -f "$PARENT_DIR/.venv/bin/uvicorn" ]; then
    exec "$PARENT_DIR/.venv/bin/uvicorn" app.main:app --reload --port 8000 "$@"
else
    exec uvicorn app.main:app --reload --port 8000 "$@"
fi
