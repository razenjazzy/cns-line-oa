#!/bin/bash
set -euo pipefail

DEPLOY_ENV=${1:-${DEPLOY_ENV:-production}}
PROJECT_ID=${GOOGLE_CLOUD_PROJECT:-}
REGION=${GOOGLE_CLOUD_LOCATION:-"us-central1-a"}
SERVICE_NAME=${CLOUD_RUN_SERVICE_NAME:-"line-oa-commerce-agent"}
ENV_VARS_FILE=${CLOUD_RUN_ENV_VARS_FILE:-"deploy.env.${DEPLOY_ENV}.yaml"}
SECRETS_MAPPING=${CLOUD_RUN_SECRETS:-}

if ! command -v gcloud >/dev/null 2>&1; then
  echo "Error: gcloud CLI is required but not installed." >&2
  exit 1
fi

if [ -z "$PROJECT_ID" ]; then
  echo "Error: GOOGLE_CLOUD_PROJECT must be set." >&2
  exit 1
fi

if [ "$DEPLOY_ENV" != "production" ] && [ "$DEPLOY_ENV" != "staging" ]; then
  echo "Error: DEPLOY_ENV must be 'production' or 'staging' (got '$DEPLOY_ENV')." >&2
  exit 1
fi

if [ -x "./scripts/validate-deploy-env.sh" ]; then
  ./scripts/validate-deploy-env.sh "$DEPLOY_ENV" "$ENV_VARS_FILE"
fi

if [ -x "./scripts/validate-cutover.sh" ]; then
  ./scripts/validate-cutover.sh "$DEPLOY_ENV" "$ENV_VARS_FILE"
fi

echo "Deploying to Cloud Run..."
echo "Project: $PROJECT_ID"
echo "Region: $REGION"
echo "Service: $SERVICE_NAME"
echo "Environment: $DEPLOY_ENV"

DEPLOY_ARGS=(
  --source .
  --project "$PROJECT_ID"
  --region "$REGION"
)

# Default to authenticated service in production-grade deployments.
ALLOW_PUBLIC=${ALLOW_UNAUTHENTICATED:-false}
if [ "$DEPLOY_ENV" = "production" ]; then
  ALLOW_PUBLIC=false
fi

if [ "$ALLOW_PUBLIC" = "true" ]; then
  DEPLOY_ARGS+=(--allow-unauthenticated)
  echo "Warning: deploying with public unauthenticated access enabled."
else
  DEPLOY_ARGS+=(--no-allow-unauthenticated)
fi

if [ -f "$ENV_VARS_FILE" ]; then
  DEPLOY_ARGS+=(--env-vars-file "$ENV_VARS_FILE")
fi

if [ -n "$SECRETS_MAPPING" ]; then
  DEPLOY_ARGS+=(--update-secrets "$SECRETS_MAPPING")
fi

gcloud run deploy "$SERVICE_NAME" "${DEPLOY_ARGS[@]}"

echo "Deployment complete."
