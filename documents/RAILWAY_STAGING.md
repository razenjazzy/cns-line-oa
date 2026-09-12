# Railway staging (historical)

Railway was the previous staging host. The service is **offline**. Live staging is Hostinger VPS: [VPS_STAGING.md](./VPS_STAGING.md) (`https://amardhaka.io`).

Keep this file as the Railway variable table. Copy those names into `/opt/cns-line-oa/.env`, then set `PUBLIC_BASE_URL=https://amardhaka.io`. Template: `deploy.env.staging.example`.

`railway.json` still builds the repo `Dockerfile` if you ever re-link Railway. Production remains Cloud Run (`release.yml`, manual).

## Architecture (do not change)

LINE HMAC webhook → Firestore profile → one `resolveCommandReply` → Flex. GraphQL/Swagger/Mongo/BullMQ are optional ops adapters. Mongo is never the ERP or user store.

## Image facts

- `NODE_ENV=production` is set in the Dockerfile. Set `APP_ENV=staging` or the process fail-closes as delivery production (demo off). Then set `ENABLE_*` for `/demo`, `/webhook-test`, GraphQL, `/api-docs`.
- Process is `node dist/index.js`.
- `skills/` is copied into the image.
- `/healthz` is liveness. `/readyz` is the full platform snapshot.

## Required variables (same names on VPS)

| Variable | Staging |
|---|---|
| `APP_ENV` | **Must be `staging`.** |
| `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | Test OA |
| `LINE_CHANNEL_BASIC_ID` | OA `@handle`. Keep the `@`. |
| `LINE_CHANNEL_ID` | Optional numeric channel id |
| `LINE_AGENT_NAME_EN`, `LINE_AGENT_NAME_TH` | Optional; defaults Sora / โซระ |
| `LINE_RICH_MENU_EN`, `LINE_RICH_MENU_TH` | Default trays. Laptop `npm run rich-menu:upload`. |
| `LINE_RICH_MENU_JSON` | Active-cell variants. |
| `GOOGLE_CLOUD_PROJECT` | Firestore project |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | Single-line service account JSON |
| `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY` | Sandbox Odoo |
| `ADMIN_USER_ID` | Your LINE user id |
| `ERP_PROVIDER` | `odoo` |
| `PUBLIC_BASE_URL` | VPS: `https://amardhaka.io` (Railway was `https://<service>.up.railway.app`) |
| `OPS_API_TOKEN` | Protects `/ops/*` and GraphQL/docs |
| `DEMO_CONTROL_TOKEN` | Demo login; may equal ops token |
| `ENABLE_DEMO_CONTROL_PANEL` | `true` for `/demo` |
| `ENABLE_WEBHOOK_TEST` | `true` plus `WEBHOOK_TEST_TOKEN` |
| `ENABLE_GRAPHQL` | `true` for GraphiQL/`POST /graphql` |
| `ENABLE_API_DOCS` | `true` for `/api-docs` |
| `GOOGLE_AI_STUDIO_API_KEY` | Optional Gemini without Vertex ADC |

Leave **unset/false**: `LINE_WEBHOOK_ASYNC`, `OPS_JOBS_ASYNC`, `RUN_BULLMQ_WORKER`, `CLAWFRAMEWORK_ENABLED`, `MONGO_VECTOR_ENABLED` unless Redis + Mongo are provisioned.

## After deploy (VPS)

1. `GET https://amardhaka.io/healthz` must be 200 (`appEnv: staging`).
2. `GET /readyz` 200 when LINE, Firestore, and Odoo are configured.
3. `./scripts/validate-railway.sh https://amardhaka.io`
4. LINE webhook `https://amardhaka.io/webhook`

Ops snapshot: `GET /ops/platform` with the ops token.
