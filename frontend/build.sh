#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

NODE_BIN=$(which node 2>/dev/null || find /home/jmbx/snap/antigravity -name node -type f 2>/dev/null | head -n 1)

if [ -z "$NODE_BIN" ]; then
    echo "Error: Node.js executable not found."
    exit 1
fi

echo "Building frontend bundle with Vite..."
"$NODE_BIN" ./node_modules/vite/bin/vite.js build
echo "Frontend production build complete!"
