#!/bin/bash
set -euo pipefail

DEPLOY_ENV=${1:-staging}
ENV_FILE=${2:-"deploy.env.${DEPLOY_ENV}.yaml"}

if [ "$DEPLOY_ENV" != "production" ] && [ "$DEPLOY_ENV" != "staging" ]; then
  echo "[preflight] DEPLOY_ENV must be production or staging." >&2
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "[preflight] Missing env vars file: $ENV_FILE" >&2
  echo "[preflight] Copy from deploy.env.${DEPLOY_ENV}.yaml.example and customize it first." >&2
  exit 1
fi

echo "[preflight] running deploy env validation (${DEPLOY_ENV})"
bash ./scripts/validate-deploy-env.sh "$DEPLOY_ENV" "$ENV_FILE"

echo "[preflight] running cutover validation (${DEPLOY_ENV})"
bash ./scripts/validate-cutover.sh "$DEPLOY_ENV" "$ENV_FILE"

echo "[preflight] building"
env -u GOOGLE_CLOUD_PROJECT -u GOOGLE_CLOUD_LOCATION -u GOOGLE_APPLICATION_CREDENTIALS npm run build

echo "[preflight] testing"
env -u GOOGLE_CLOUD_PROJECT -u GOOGLE_CLOUD_LOCATION -u GOOGLE_APPLICATION_CREDENTIALS npm run test

echo "[preflight] success (${DEPLOY_ENV})"
