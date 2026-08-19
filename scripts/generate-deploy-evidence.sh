#!/bin/bash
set -euo pipefail

BASE_URL=${1:-${SMOKE_BASE_URL:-}}
OUTPUT_FILE=${2:-${EVIDENCE_OUTPUT_FILE:-./artifacts/deploy-evidence.json}}
DEPLOY_ENV=${3:-${DEPLOY_ENV:-unknown}}
OPS_TOKEN=${OPS_API_TOKEN:-}
STRICT=${EVIDENCE_STRICT:-false}

if [ -z "$BASE_URL" ]; then
  echo "Usage: $0 <base-url> [output-file] [deploy-env]" >&2
  exit 1
fi

BASE_URL=${BASE_URL%/}
mkdir -p "$(dirname "$OUTPUT_FILE")"

fetch_endpoint() {
  local url="$1"
  local output_file="$2"
  local header_file="$3"
  local status_file="$4"
  shift 4

  local http_code
  http_code=$(curl -sS -o "$output_file" -D "$header_file" -w "%{http_code}" "$@" "$url" || true)
  echo "$http_code" > "$status_file"
}

tmp_dir=$(mktemp -d)
trap 'rm -rf "$tmp_dir"' EXIT

health_body="$tmp_dir/healthz.json"
health_headers="$tmp_dir/healthz.headers"
health_status="$tmp_dir/healthz.status"
fetch_endpoint "${BASE_URL}/healthz" "$health_body" "$health_headers" "$health_status"

ready_body="$tmp_dir/readyz.json"
ready_headers="$tmp_dir/readyz.headers"
ready_status="$tmp_dir/readyz.status"
fetch_endpoint "${BASE_URL}/readyz" "$ready_body" "$ready_headers" "$ready_status"

ops_checked=false
ops_body="$tmp_dir/ops-workflow-audit.json"
ops_headers="$tmp_dir/ops-workflow-audit.headers"
ops_status="$tmp_dir/ops-workflow-audit.status"
if [ -n "$OPS_TOKEN" ]; then
  ops_checked=true
  fetch_endpoint "${BASE_URL}/ops/workflow-audit" "$ops_body" "$ops_headers" "$ops_status" -H "x-ops-token: ${OPS_TOKEN}"
else
  echo "000" > "$ops_status"
  echo "{}" > "$ops_body"
  echo "" > "$ops_headers"
fi

node - <<'NODE' "$OUTPUT_FILE" "$BASE_URL" "$DEPLOY_ENV" "$ops_checked" "$health_status" "$health_body" "$ready_status" "$ready_body" "$ops_status" "$ops_body"
const fs = require('fs');

const [
  outputFile,
  baseUrl,
  deployEnv,
  opsCheckedRaw,
  healthStatusPath,
  healthBodyPath,
  readyStatusPath,
  readyBodyPath,
  opsStatusPath,
  opsBodyPath,
] = process.argv.slice(2);

const readText = (path) => fs.readFileSync(path, 'utf8').trim();
const safeParse = (text) => {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return { raw: text };
  }
};

const healthStatus = Number(readText(healthStatusPath) || '0');
const readyStatus = Number(readText(readyStatusPath) || '0');
const opsStatus = Number(readText(opsStatusPath) || '0');
const healthBody = safeParse(readText(healthBodyPath));
const readyBody = safeParse(readText(readyBodyPath));
const opsBody = safeParse(readText(opsBodyPath));
const opsChecked = opsCheckedRaw === 'true';

const checks = {
  healthz: {
    ok: healthStatus >= 200 && healthStatus < 300,
    statusCode: healthStatus,
    response: healthBody,
  },
  readyz: {
    ok: readyStatus >= 200 && readyStatus < 300,
    statusCode: readyStatus,
    response: readyBody,
  },
  opsWorkflowAudit: {
    checked: opsChecked,
    ok: !opsChecked || (opsStatus >= 200 && opsStatus < 300),
    statusCode: opsStatus,
    response: opsBody,
  },
};

const overallOk = checks.healthz.ok && checks.readyz.ok && checks.opsWorkflowAudit.ok;

const payload = {
  generatedAt: new Date().toISOString(),
  environment: deployEnv,
  baseUrl,
  overallOk,
  checks,
};

fs.writeFileSync(outputFile, `${JSON.stringify(payload, null, 2)}\n`);
NODE

if [ "$STRICT" = "true" ]; then
  health_code=$(cat "$health_status")
  ready_code=$(cat "$ready_status")
  ops_code=$(cat "$ops_status")

  if [ "$health_code" -lt 200 ] || [ "$health_code" -ge 300 ]; then
    echo "[evidence] healthz check failed with status $health_code" >&2
    exit 1
  fi

  if [ "$ready_code" -lt 200 ] || [ "$ready_code" -ge 300 ]; then
    echo "[evidence] readyz check failed with status $ready_code" >&2
    exit 1
  fi

  if [ "$ops_checked" = true ] && { [ "$ops_code" -lt 200 ] || [ "$ops_code" -ge 300 ]; }; then
    echo "[evidence] ops/workflow-audit check failed with status $ops_code" >&2
    exit 1
  fi
fi

echo "[evidence] wrote deploy evidence to $OUTPUT_FILE"
