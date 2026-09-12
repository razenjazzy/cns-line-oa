# Environments

Three lanes. Same codebase. Different `APP_ENV`. The Docker image always sets `NODE_ENV=production` for staging and delivery so Node runs optimized and ClawFramework stays off.

| Lane | `APP_ENV` | Host | `/demo` | `/webhook-test` | GraphiQL | GraphQL / `/api-docs` |
|---|---|---|---|---|---|---|
| Dev | `development` | laptop (`npm run dev`) | on | on | on | on |
| Staging | `staging` | Hostinger VPS `amardhaka.io` | if `ENABLE_DEMO_CONTROL_PANEL` | if `ENABLE_WEBHOOK_TEST` | if GraphQL enabled | if `ENABLE_*` |
| Production | `production` | final delivery | **off** | **off** | **off** | only if `ENABLE_GRAPHQL` / `ENABLE_API_DOCS` + ops token |

If `APP_ENV` is unset and `NODE_ENV=production`, the process **fails closed to production**. The VPS must set `APP_ENV=staging`.

## 1. Development (local + API test)

```bash
APP_ENV=development
NODE_ENV=development
```

Use `.env` locally (never commit). Hit `/webhook-test` and `/demo` without extra flags. Cursor MCP (`.cursor/mcp.json`) points at `http://127.0.0.1:8080` and uses `OPS_API_TOKEN` from your shell, not from git.

## 2. Staging (Hostinger VPS + demo)

```text
APP_ENV=staging
NODE_ENV=production          # from Dockerfile
ENABLE_DEMO_CONTROL_PANEL=true
ENABLE_WEBHOOK_TEST=true
WEBHOOK_TEST_TOKEN=...
ENABLE_GRAPHQL=true          # optional
ENABLE_API_DOCS=true         # optional
```

Plus LINE test OA, Firestore JSON credentials, sandbox Odoo, `ADMIN_USER_ID`, `OPS_API_TOKEN`, `PUBLIC_BASE_URL=https://amardhaka.io`. See `documents/VPS_STAGING.md`.

## 3. Production (final delivery)

```text
APP_ENV=production
NODE_ENV=production
ENABLE_DEMO_CONTROL_PANEL=   # ignored; demo stays off
ENABLE_WEBHOOK_TEST=         # ignored; stays off
```

Use a **production** LINE OA, production Odoo, and a separate `ADMIN_USER_ID` / token set from staging. Do not enable Claw, async LINE, or Mongo unless those systems are provisioned and reviewed.

Cloud Run `release.yml` remains manual until GCP secrets exist. Railway is not production.

## Identity and ERP (all lanes)

Firestore is identity SoR. Odoo is ERP via `getErpAdapter()`. Mongo is optional LINE FAQ only. `SALES_SESSION_TTL_HOURS` (default 24) is the gold VERIFY sales-login window.

Variable names for each lane: `src/http/env-params.ts`. Railway copy-paste keys: `deploy.env.staging.example`. Delivery keys: `deploy.env.production.example`. `GET /ops/platform` reports `env.missingRequired`.
