#!/bin/bash
# runner - end-to-end runner: cns-line-oa backend + clawframework python
# ./runner.sh <cmd> [args]
#  setup | backend:build|test|dev|smoke | claw:setup|check|run|tests |
#  deploy:check | health | all  (./runner.sh help for usage)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO_ROOT"

GREEN=$'\033[0;32m'; CYAN=$'\033[0;36m'; YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'; BOLD=$'\033[1m'; NC=$'\033[0m'

info() { printf "${CYAN}[runner]${NC} %s\n" "$*"; }
ok()   { printf "${GREEN}[✔]${NC} %s\n" "$*"; }
warn() { printf "${YELLOW}[!]${NC} %s\n" "$*"; }
err()  { printf "${RED}[✘]${NC} %s\n" "$*" >&2; }
die()  { err "$*"; exit 1; }
h()    { printf "${BOLD}%s${NC}\n" "$*"; }

if [ -f "$REPO_ROOT/runner.conf" ]; then
  set +u; source "$REPO_ROOT/runner.conf"; set -u
fi

require_tool() {
  command -v "$1" >/dev/null 2>&1 || die "Required tool '$1' is not installed."
}

backend_install() {
  h "backend: install npm dependencies"
  require_tool npm
  if [ ! -d node_modules ]; then npm install; else ok "node_modules present"; fi
}

backend_build() {
  h "backend: TypeScript build"
  require_tool npm; npm run build; ok "backend build succeeded"
}

backend_test() {
  h "backend: Vitest suite"
  require_tool npm; npm test
}

backend_dev() {
  backend_build
  local port="${1:-$BACKEND_PORT}"
  h "backend: serving on port ${port}"
  PORT="$port" NODE_ENV="${NODE_ENV:-development}" node dist/index.js
}

backend_smoke() {
  local url="${1:-$BACKEND_SMOKE_URL}"
  if [ -z "$url" ]; then url="$BACKEND_HEALTH_URL"; warn "No URL, using ${url}"; fi
  h "backend: smoke test ${url}"
  require_tool curl
  curl -fsS "${url%/}/healthz" >/dev/null && ok "healthz OK" || die "healthz failed"
  if curl -fsS "${url%/}/readyz" >/dev/null 2>&1; then ok "readyz OK"; else warn "readyz not reachable - continuing"; fi
}

claw_install() {
  h "claw: python venv deps"
  require_tool python3
  if [ ! -x "$PYTHON_BIN" ]; then python3 -m venv .venv; fi
  "$PYTHON_BIN" -m pip install --quiet -r clawframework/requirements.txt
  ok "claw deps installed (${PYTHON_BIN})"
}

claw_check() {
  h "claw: compile all python modules"
  local dir="$REPO_ROOT/$CLAW_DIR" failed=0
  while IFS= read -r f; do
    if "$PYTHON_BIN" -m py_compile "$f" 2>/tmp/claw_err; then printf "."; else
      printf "F"; err "compile failed: $f"; cat /tmp/claw_err >&2; failed=1
    fi
  done < <(find "$dir" -name '*.py' -not -path '*/venv/*' -not -path '*/__pycache__/*')
  echo
  [ "$failed" -eq 0 ] && ok "all clawframework modules compile" || die "claw compile check failed"
}

claw_run() {
  h "claw: run main.py (provider=${CLAW_PROVIDER})"
  "$PYTHON_BIN" clawframework/main.py --provider "$CLAW_PROVIDER" --prompt "$CLAW_PROMPT"
}

claw_tests() {
  h "claw: clawspring pytest suite"
  require_tool python3
  ( cd "$REPO_ROOT/$CLAW_DIR/clawspring" && "$REPO_ROOT/$PYTHON_BIN" -m pytest -q )
}

deploy_check() {
  local env="${1:-$DEPLOY_ENV}"
  h "deploy: validation pipeline (env=${env})"
  require_tool docker
  if [ -f "deploy.env.${env}.yaml" ]; then
    bash ./scripts/preflight-check.sh "$env"
  else
    warn "deploy.env.${env}.yaml not found - running cutover validators only"
    bash ./scripts/validate-cutover.sh "$env" "deploy.env.${env}.yaml.example"
  fi
  h "deploy: docker image build (no push)"
  docker build -t cns-line-oa:check .
  ok "docker build succeeded"
}

# Cloud Run is the canonical deployment target (see release.yml).
# Validates deploy env + container, and if gcloud credentials are present,
# triggers a Cloud Run deploy. Never requires Railway.
cloudrun_deploy() {
  local env="${1:-$DEPLOY_ENV}"
  h "cloudrun: deploy pipeline (env=${env})"
  require_tool gcloud
  if [ ! -f "deploy.env.${env}.yaml" ]; then
    die "Missing deploy.env.${env}.yaml (copy from deploy.env.${env}.yaml.example and fill)."
  fi
  bash ./scripts/preflight-check.sh "$env"
  bash ./deploy.sh "$env"
  ok "cloudrun deploy complete"
}

# Railway is an ALTERNATE target (railway.json + Dockerfile). CLI is optional;
# this only validates that the image Railway would deploy builds and runs.
railway_check() {
  h "railway: validate alternate-target image"
  require_tool docker
  docker build -t cns-line-oa:railway-check .
  local id
  id=$(docker run -d --rm -e PORT=8080 -e NODE_ENV=test cns-line-oa:railway-check)
  sleep 4
  docker exec "$id" sh -c 'wget -qO- http://localhost:8080/healthz >/dev/null 2>&1' \
    && ok "railway image healthz OK" || warn "healthz not reachable in container (service deps may be needed)"
  docker rm -f "$id" >/dev/null 2>&1 || true
}

health() {
  h "Verification pipeline"
  claw_check; backend_build; backend_test
  ok "all verification checks passed"
}

usage() {
  sed -n '3,9p' "$0" | sed 's/^# \{0,1\}//' | grep -v '^$'
}

CMD="${1:-help}"
case "$CMD" in
  setup)        backend_install; claw_install ;;
  backend:install) backend_install ;;
  backend:build) backend_build ;;
  backend:test)  backend_test ;;
  backend:dev)   backend_dev "${2:-}" ;;
  backend:smoke) backend_smoke "${2:-}" ;;
  claw:setup)    claw_install ;;
  claw:check)    claw_check ;;
  claw:run)      claw_run ;;
  claw:tests)    claw_tests ;;
  deploy:check)  deploy_check "${2:-}" ;;
  cloudrun)      cloudrun_deploy "${2:-}" ;;
  railway)       railway_check ;;
  health)        health ;;
  all)
    backend_install; claw_install; health
    h "Starting backend (Ctrl-C to stop)..."
    backend_dev "${2:-}"
    ;;
  help|-h|--help) usage ;;
  *) die "Unknown command: $CMD  (run './runner.sh help')" ;;
esac

