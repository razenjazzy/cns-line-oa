#!/bin/bash
set -euo pipefail

DEPLOY_ENV=${1:-production}
ENV_FILE=${2:-"deploy.env.${DEPLOY_ENV}.yaml"}

if [ "$DEPLOY_ENV" != "production" ] && [ "$DEPLOY_ENV" != "staging" ]; then
  echo "[validate-cutover] DEPLOY_ENV must be production or staging." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[validate-cutover] Missing env vars file: $ENV_FILE" >&2
  echo "[validate-cutover] Copy from deploy.env.${DEPLOY_ENV}.yaml.example and customize it first." >&2
  exit 1
fi

if [ -x "./scripts/validate-deploy-env.sh" ]; then
  ./scripts/validate-deploy-env.sh "$DEPLOY_ENV" "$ENV_FILE"
fi

required_runtime_env=(
  GOOGLE_CLOUD_PROJECT
  GOOGLE_CLOUD_LOCATION
)

for key in "${required_runtime_env[@]}"; do
  if [ -z "${!key:-}" ]; then
    echo "[validate-cutover] Required environment variable missing: $key" >&2
    exit 1
  fi
done

if [ -z "${CLOUD_RUN_SECRETS:-}" ]; then
  echo "[validate-cutover] CLOUD_RUN_SECRETS must be provided." >&2
  exit 1
fi

contains_secret_mapping() {
  local key="$1"
  if [[ ",$CLOUD_RUN_SECRETS," == *",${key}="* ]]; then
    return 0
  fi
  return 1
}

required_secret_keys=(
  LINE_CHANNEL_ACCESS_TOKEN
  LINE_CHANNEL_SECRET
  ODOO_API_KEY
  DEMO_CONTROL_TOKEN
  OPS_API_TOKEN
)

for key in "${required_secret_keys[@]}"; do
  if ! contains_secret_mapping "$key"; then
    echo "[validate-cutover] CLOUD_RUN_SECRETS is missing mapping for: $key" >&2
    exit 1
  fi
done

rate_limit_store=$(grep -E '^[[:space:]]*RATE_LIMIT_STORE[[:space:]]*:[[:space:]]*' "$ENV_FILE" | sed -E 's/^[^:]+:[[:space:]]*"?([^"#]+)"?.*$/\1/' | tr '[:upper:]' '[:lower:]' | xargs)
if [ "$rate_limit_store" = "redis" ]; then
  if ! contains_secret_mapping "REDIS_URL"; then
    echo "[validate-cutover] RATE_LIMIT_STORE=redis requires REDIS_URL in CLOUD_RUN_SECRETS." >&2
    exit 1
  fi
fi

if [ "$DEPLOY_ENV" = "production" ]; then
  if [ "${PRODUCTION_APPROVED:-false}" != "true" ]; then
    echo "[validate-cutover] PRODUCTION_APPROVED=true is required for production deploy." >&2
    exit 1
  fi

  if [ "${ALLOW_UNAUTHENTICATED:-false}" = "true" ]; then
    echo "[validate-cutover] ALLOW_UNAUTHENTICATED=true is not allowed for production." >&2
    exit 1
  fi
fi

echo "[validate-cutover] Cutover validation passed for ${DEPLOY_ENV}."
