#!/bin/bash
set -euo pipefail

DEPLOY_ENV=${1:-production}
ENV_FILE=${2:-"deploy.env.${DEPLOY_ENV}.yaml"}

if [ "$DEPLOY_ENV" != "production" ] && [ "$DEPLOY_ENV" != "staging" ]; then
  echo "[validate-deploy-env] DEPLOY_ENV must be production or staging." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[validate-deploy-env] Missing env vars file: $ENV_FILE" >&2
  echo "[validate-deploy-env] Copy from deploy.env.${DEPLOY_ENV}.yaml.example and customize." >&2
  exit 1
fi

required_keys=(
  NODE_ENV
  ENABLE_WEBHOOK_TEST
  ENABLE_DEMO_CONTROL_PANEL
  ALLOW_DEMO_HEADER_TOKEN_FALLBACK
  MAX_JSON_BODY
  READYZ_TIMEOUT_MS
)

for key in "${required_keys[@]}"; do
  if ! grep -Eq "^[[:space:]]*${key}[[:space:]]*:[[:space:]]*" "$ENV_FILE"; then
    echo "[validate-deploy-env] Missing key '${key}' in ${ENV_FILE}" >&2
    exit 1
  fi
done

if [ "$DEPLOY_ENV" = "production" ]; then
  if grep -Eq "^[[:space:]]*ENABLE_WEBHOOK_TEST[[:space:]]*:[[:space:]]*true([[:space:]]*#.*)?$" "$ENV_FILE"; then
    echo "[validate-deploy-env] ENABLE_WEBHOOK_TEST must be false in production env file." >&2
    exit 1
  fi

  if grep -Eq "^[[:space:]]*ALLOW_DEMO_HEADER_TOKEN_FALLBACK[[:space:]]*:[[:space:]]*true([[:space:]]*#.*)?$" "$ENV_FILE"; then
    echo "[validate-deploy-env] ALLOW_DEMO_HEADER_TOKEN_FALLBACK must be false in production env file." >&2
    exit 1
  fi

  if [ -z "${CLOUD_RUN_SECRETS:-}" ]; then
    echo "[validate-deploy-env] CLOUD_RUN_SECRETS is required for production deploys." >&2
    exit 1
  fi
fi

echo "[validate-deploy-env] Validation passed for ${DEPLOY_ENV} using ${ENV_FILE}."
