# Railway staging

Railway is the **staging** deploy path. Production remains the Cloud Run workflow (manual). `railway.json` builds the repo `Dockerfile` and health-checks `GET /healthz`.

## Architecture (do not change on Railway)

LINE HMAC webhook → Firestore profile → one `resolveCommandReply` → Flex. GraphQL/Swagger/Mongo/BullMQ are optional ops adapters. Mongo is never the ERP or user store.

## Image facts (source of truth)

- `NODE_ENV=production` is set in the Dockerfile. Set `APP_ENV=staging` or the process fail-closes as delivery production (demo off). Then set `ENABLE_*` for `/demo`, `/webhook-test`, GraphQL, `/api-docs`.
- Process is `node dist/index.js` so Railway SIGTERM hits the Express shutdown handler.
- `skills/` is copied into the image (markdown skills). `.dockerignore` must not exclude it.
- `/healthz` is liveness only. `/readyz` is the full platform snapshot (LINE, Firestore, Odoo, rate limiter required; Mongo/queues optional).

## Required Railway variables (staging demo)

Set these in the Railway service. Do not commit values.

| Variable | Staging |
|---|---|
| `APP_ENV` | **Must be `staging`.** Unset + image `NODE_ENV=production` fail-closes to delivery production and turns demo off. |
| `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | Test OA, not production |
| `GOOGLE_CLOUD_PROJECT` | Firestore project |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Single-line service account JSON (Railway has no GCP ADC) |
| `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY` | Sandbox Odoo |
| `ADMIN_USER_ID` | Your LINE user id |
| `ERP_PROVIDER` | `odoo` |
| `PUBLIC_BASE_URL` | `https://<service>.up.railway.app` |
| `OPS_API_TOKEN` | Protects `/ops/*` and production GraphQL/docs |
| `DEMO_CONTROL_TOKEN` | Demo login; may equal ops token |
| `ENABLE_DEMO_CONTROL_PANEL` | `true` for `/demo` |
| `ENABLE_WEBHOOK_TEST` | `true` plus `WEBHOOK_TEST_TOKEN` |
| `ENABLE_GRAPHQL` | `true` if you will show GraphiQL/`POST /graphql` |
| `ENABLE_API_DOCS` | `true` if you will show `/api-docs` |
| `GOOGLE_AI_STUDIO_API_KEY` | Optional Gemini without Vertex ADC |

Leave **unset/false**: `LINE_WEBHOOK_ASYNC`, `OPS_JOBS_ASYNC`, `RUN_BULLMQ_WORKER`, `CLAWFRAMEWORK_ENABLED`, `MONGO_VECTOR_ENABLED` unless Redis + Mongo Atlas are actually provisioned.

## After every git push to the connected branch

1. Railway rebuilds from `main` (or the branch linked in Railway).
2. `GET /healthz` must be 200.
3. `GET /readyz` should be 200 when LINE, Firestore, and Odoo are configured.
4. `./scripts/validate-railway.sh https://<service>.up.railway.app`

Ops snapshot (token required): `GET /ops/platform`.

## What this deploy does not do

It does not replace Cloud Run production. It does not put LINE events on GraphQL. It does not store users in Mongo.
