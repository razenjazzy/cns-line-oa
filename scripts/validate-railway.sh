#!/bin/bash
set -euo pipefail

BASE_URL="${1:-${RAILWAY_URL:-}}"

if [[ -z "$BASE_URL" ]]; then
  echo "Usage: ./scripts/validate-railway.sh https://your-service.up.railway.app"
  echo "Or set RAILWAY_URL environment variable first."
  exit 1
fi

BASE_URL="${BASE_URL%/}"
TOKEN_HEADER=()
if [[ -n "${WEBHOOK_TEST_TOKEN:-}" ]]; then
  TOKEN_HEADER=(-H "x-webhook-test-token: ${WEBHOOK_TEST_TOKEN}")
fi

echo "Validating Railway deployment at ${BASE_URL}"

echo "1) healthz"
curl -fsS "${BASE_URL}/healthz" | cat
echo

echo "2) readyz"
curl -fsS "${BASE_URL}/readyz" | cat
echo

echo "3) demo"
curl -fsSI "${BASE_URL}/demo" | head -n 1

echo "4) demo connections"
curl -fsS "${BASE_URL}/demo/connections" | cat
echo

echo "5) demo platform"
curl -fsS "${BASE_URL}/demo/platform" | cat
echo

echo "6) webhook-test SYSTEM STATUS"
curl -fsS -X POST "${BASE_URL}/webhook-test" \
  -H 'Content-Type: application/json' \
  "${TOKEN_HEADER[@]}" \
  -d '{"userId":"railway_validate_user","text":"SYSTEM STATUS"}' | cat
echo

echo "7) webhook-test PRODUCT FIND"
curl -fsS -X POST "${BASE_URL}/webhook-test" \
  -H 'Content-Type: application/json' \
  "${TOKEN_HEADER[@]}" \
  -d '{"userId":"railway_validate_user","text":"PRODUCT FIND App"}' | cat
echo

echo "8) language default + switch"
curl -fsS -X POST "${BASE_URL}/webhook-test" \
  -H 'Content-Type: application/json' \
  "${TOKEN_HEADER[@]}" \
  -d '{"userId":"railway_lang_user","text":"NAME"}' | cat
echo
curl -fsS -X POST "${BASE_URL}/webhook-test" \
  -H 'Content-Type: application/json' \
  "${TOKEN_HEADER[@]}" \
  -d '{"userId":"railway_lang_user","text":"LANG TH"}' | cat
echo
curl -fsS -X POST "${BASE_URL}/webhook-test" \
  -H 'Content-Type: application/json' \
  "${TOKEN_HEADER[@]}" \
  -d '{"userId":"railway_lang_user","text":"NAME"}' | cat
echo

echo "Validation completed."