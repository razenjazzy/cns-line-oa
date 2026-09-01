#!/bin/bash
set -euo pipefail

DEPLOY_ENV=${1:-staging}
OUTPUT_FILE=${2:-"deploy.env.${DEPLOY_ENV}.yaml"}
EXAMPLE_FILE=${3:-"deploy.env.${DEPLOY_ENV}.yaml.example"}
INLINE_ENV_YAML=${DEPLOY_ENV_YAML:-}
BASE_URL=${PUBLIC_BASE_URL:-}

if [ -n "$INLINE_ENV_YAML" ]; then
  printf '%s' "$INLINE_ENV_YAML" > "$OUTPUT_FILE"
  exit 0
fi

if [ ! -f "$EXAMPLE_FILE" ]; then
  echo "[materialize-deploy-env] Missing example env file: $EXAMPLE_FILE" >&2
  exit 1
fi

cp "$EXAMPLE_FILE" "$OUTPUT_FILE"

if [ -n "$BASE_URL" ]; then
  node - "$OUTPUT_FILE" "$BASE_URL" <<'NODE'
const fs = require('fs');

const [outputFile, baseUrl] = process.argv.slice(2);
const content = fs.readFileSync(outputFile, 'utf8');
const updated = content.replace(
  /^(PUBLIC_BASE_URL:\s*")[^"]*(".*)$/m,
  (_match, prefix, suffix) => `${prefix}${baseUrl}${suffix}`,
);

fs.writeFileSync(outputFile, updated);
NODE
fi
