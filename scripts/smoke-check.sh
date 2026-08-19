#!/bin/bash
set -euo pipefail

BASE_URL=${1:-${SMOKE_BASE_URL:-}}
OPS_TOKEN=${OPS_API_TOKEN:-}

if [ -z "$BASE_URL" ]; then
  echo "Usage: $0 <base-url>" >&2
  echo "Or set SMOKE_BASE_URL env var." >&2
  exit 1
fi

BASE_URL=${BASE_URL%/}

echo "[smoke] checking ${BASE_URL}/healthz"
curl -fsS "${BASE_URL}/healthz" >/dev/null

echo "[smoke] checking ${BASE_URL}/readyz"
curl -fsS "${BASE_URL}/readyz" >/dev/null

if [ -n "$OPS_TOKEN" ]; then
  echo "[smoke] checking ${BASE_URL}/ops/workflow-audit"
  curl -fsS -H "x-ops-token: ${OPS_TOKEN}" "${BASE_URL}/ops/workflow-audit" >/dev/null
else
  echo "[smoke] OPS_API_TOKEN not set; skipping /ops/workflow-audit"
fi

echo "[smoke] success"
