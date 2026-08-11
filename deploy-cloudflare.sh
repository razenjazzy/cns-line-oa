#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")" && pwd)"

if ! command -v cloudflared >/dev/null 2>&1; then
  echo "cloudflared is not installed. Install it first, then run this script again."
  exit 1
fi

if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | awk '/=/ {print $1}')
fi

PORT=${PORT:-8080}

echo "Building the app..."
cd "$ROOT_DIR"
npm run build

echo "Starting Cloudflare Tunnel to http://localhost:${PORT}..."
echo "Use the public https URL printed by cloudflared as your LINE webhook, ending with /webhook"
cloudflared tunnel --url "http://localhost:${PORT}"