#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js is missing. Install Node.js 22.13 or newer from https://nodejs.org/ and run this file again."
  read -r -p "Press Enter to close..."
  exit 1
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  echo "BOMBANANA needs Node.js 22.13 or newer. Your version is $(node --version)."
  read -r -p "Press Enter to close..."
  exit 1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "Enabling pnpm..."
  corepack enable
  corepack prepare pnpm@11.25.0 --activate
fi

echo "Installing BOMBANANA packages..."
pnpm install --frozen-lockfile

echo "Starting BOMBANANA at http://localhost:3000"
echo "Multiplayer rooms use the same Firebase database as the live site."
echo "Keep this window open while you play. Press Control+C to stop."
pnpm run dev
