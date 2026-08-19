# Railway Test Deployment

For quick iteration/testing only. Production deploys go through the
existing Cloud Run pipeline (`.github/workflows/release.yml`) — this is a
separate, lighter path for a fast test environment, not a replacement.

`railway.json` in the repo root already tells Railway to build from the
existing `Dockerfile` and health-check `/healthz`, so connecting the repo
(GitHub integration) or running `railway up` from a Railway-authenticated
terminal should build and deploy without extra Railway-side config.

## The one gotcha specific to Railway

Firestore normally authenticates via Application Default Credentials, which
Cloud Run provides automatically through its attached service account.
Railway has no equivalent — without credentials, Firestore silently fails
auth and every feature built on it (verification, admin authorization,
guided forms, audit log) quietly stops working instead of erroring loudly.

Fixed in code this pass: `getDb()` now also accepts credentials inline via
`GOOGLE_APPLICATION_CREDENTIALS_JSON`. To use it:

1. In GCP Console, create (or reuse) a service account with Firestore access
   (`roles/datastore.user` is enough).
2. Create a JSON key for it, open the file, and paste its **entire contents
   as a single-line string** into Railway's `GOOGLE_APPLICATION_CREDENTIALS_JSON`
   variable.
3. Set `GOOGLE_CLOUD_PROJECT` to that service account's project.

Skip this if you don't need Firestore-backed features for this particular
test (e.g. testing pure Odoo commerce commands without verification/admin
flows) — the app degrades gracefully without it, just with those features
silently unavailable.

## Minimum variables for a working test deploy

| Variable | Notes |
|---|---|
| `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` | From a test LINE channel — don't point this at a production OA |
| `GOOGLE_CLOUD_PROJECT` | Only needed if testing Firestore-backed features |
| `GOOGLE_APPLICATION_CREDENTIALS_JSON` | See above — only needed off-GCP |
| `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY` | Point at a sandbox/test Odoo instance, not production data |
| `ADMIN_USER_ID` | Your own LINE user ID, to actually test `ADMIN ENABLE` |
| `NODE_ENV` | Leave unset or `development` for a test deploy — `production` locks down `/webhook-test`, the demo panel, and mutating test commands |
| `GOOGLE_AI_STUDIO_API_KEY` | Simpler than Vertex AI for a non-GCP test host — no ADC needed, works immediately with just an API key |

## After deploy

- `GET /healthz` — should be immediate, no dependency checks
- `GET /readyz` — reports Firestore/Odoo/rate-limiter status individually; useful for spotting the credentials gotcha above (Firestore will show `ok: false` if `GOOGLE_APPLICATION_CREDENTIALS_JSON` is missing/wrong)
- `./scripts/validate-railway.sh https://<your-service>.up.railway.app` — runs through the existing smoke checks (health, demo, a live `DEMO ODOO` webhook-test call, language switching)
- Register `https://<your-service>.up.railway.app/webhook` as the test channel's webhook URL in the LINE Developers console
