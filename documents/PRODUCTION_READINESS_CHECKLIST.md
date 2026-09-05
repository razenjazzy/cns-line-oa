# Production Readiness Checklist

Use this checklist after the reviewed release snapshot is committed. Do not put
credentials or secret values in this repository.

**Note (2026-09-05):** Cloud Run (`release.yml`) is manual `workflow_dispatch` only. **Railway** (`railway.json` + `Dockerfile`) is the staging deploy that runs on git push. Use `documents/RAILWAY_STAGING.md` for variables. Work through the Cloud Run list below only if Cloud Run is actually going to be used.

## Railway staging (current path)

- [x] `npm test`, `npm run lint`, `npx tsc --noEmit` pass locally before push.
- [x] Dockerfile copies `dist/` and `skills/`, runs `node dist/index.js`, healthchecks `/healthz`.
- [ ] Railway service has LINE, Firestore JSON credentials, sandbox Odoo, `ADMIN_USER_ID`, `OPS_API_TOKEN`.
- [ ] Staging demo flags: `ENABLE_DEMO_CONTROL_PANEL`, `ENABLE_WEBHOOK_TEST` (+ token), optional `ENABLE_GRAPHQL` / `ENABLE_API_DOCS`.
- [ ] `LINE_WEBHOOK_ASYNC` remains false unless Redis + a worker process exist.
- [ ] After deploy: `/healthz` 200, `/readyz` 200, `scripts/validate-railway.sh`.
- [ ] LINE webhook URL points at the Railway host `/webhook` on a **test** OA.

## Automated Local Evidence

- [x] `npm test` passes.
- [x] `npm run build -- --pretty false` passes.
- [x] `npm run lint` passes with no errors or warnings.
- [x] `git diff --check` passes.
- [x] `.github/workflows/release.yml` parses as YAML.
- [ ] `npm run preflight:staging` passes against a real staging manifest.
- [ ] `npm run smoke -- <staging-url>` passes after deployment.
- [ ] Staging deploy evidence is generated and reviewed.

## GitHub Environment Configuration

Configure these as GitHub repository or environment secrets, not committed
files:

- [ ] `DEPLOY_ENV_STAGING_YAML` contains the reviewed staging YAML manifest.
- [ ] `DEPLOY_ENV_PRODUCTION_YAML` contains the reviewed production YAML manifest.
- [ ] `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` are set per environment.
- [ ] `CLOUD_RUN_SECRETS` maps every required runtime secret.
- [ ] `GCP_WORKLOAD_IDENTITY_PROVIDER` and `GCP_SERVICE_ACCOUNT` are configured.
- [ ] `CLOUD_RUN_SERVICE_NAME` is configured.
- [ ] `STAGING_BASE_URL` and `PRODUCTION_BASE_URL` are configured.
- [ ] `OPS_API_TOKEN` is configured for smoke checks.
- [ ] GitHub `staging` and `production` environments have intended reviewers and protection rules.
- [ ] GitHub variable `PRODUCTION_ENVIRONMENT` is set to the exact protected production environment name.

Required Cloud Run secret mappings are validated by
`scripts/validate-cutover.sh` and include LINE credentials, Odoo API key,
`DEMO_CONTROL_TOKEN`, and `OPS_API_TOKEN`. Add `REDIS_URL` when the manifest
sets `RATE_LIMIT_STORE=redis`.

## Runtime Signoff

- [ ] Rotate any credential that was ever exposed outside the intended secret store.
- [ ] Confirm `ERP_PROVIDER=odoo` until another ERP adapter is implemented.
- [ ] Confirm `ENABLE_WEBHOOK_TEST=false` in production.
- [ ] Confirm `ALLOW_DEMO_HEADER_TOKEN_FALLBACK=false` in production.
- [ ] Confirm the demo control panel is disabled in production unless explicitly time-boxed.
- [ ] Confirm `PRODUCTION_APPROVED=true` is supplied only for an approved manual production run.
- [ ] Verify `/healthz` and `/readyz` after staging deployment.
- [ ] Verify LINE webhook signature validation with the configured channel.
- [ ] Exercise `VERIFY`, `ADMIN ENABLE`, one product lookup, one quote, and one audit-log read in staging.
- [ ] Record staging approval before production dispatch.
- [ ] Confirm rollback target and owner before production deployment.

## Release Sequence

1. Commit the reviewed release snapshot.
2. Configure staging environment secrets and manifest.
3. Run `npm run preflight:staging`.
4. Deploy staging through `.github/workflows/release.yml`.
5. Run smoke checks and review deploy evidence.
6. Obtain staging signoff.
7. Dispatch the workflow with `deploy_production=true` only after approval.
8. Run production smoke checks and retain evidence.
