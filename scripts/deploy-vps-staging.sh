#!/usr/bin/env bash
# Deploy this checkout to Hostinger staging (amardhaka.io only).
# Does not: add npm packages, change nginx for other vhosts, or copy .env / secrets.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
HOST="${VPS_HOST:-root@187.127.179.49}"
REMOTE="${VPS_REMOTE_DIR:-/opt/cns-line-oa}"

rsync -az --delete \
  --exclude '.env' \
  --exclude '.env.*' \
  --exclude '.git' \
  --exclude 'node_modules' \
  --exclude 'dist' \
  --exclude '.cursor' \
  --exclude '.claude' \
  --exclude 'agent-transcripts' \
  -e "ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new" \
  "$ROOT/" \
  "$HOST:$REMOTE/"

ssh -o BatchMode=yes -o StrictHostKeyChecking=accept-new "$HOST" bash -s -- "$REMOTE" <<'REMOTE'
set -euo pipefail
REMOTE_DIR="$1"
test -f "$REMOTE_DIR/.env"
cd "$REMOTE_DIR"
docker compose -f deploy/hostinger/docker-compose.staging.yml --env-file .env up -d --build
curl -fsS http://127.0.0.1:8080/healthz
echo
curl -fsS http://127.0.0.1:8080/readyz | python3 -c "import json,sys; d=json.load(sys.stdin); assert d.get('ready') is True, d; print('ready', d.get('flags',{}).get('appEnv'))"
REMOTE
