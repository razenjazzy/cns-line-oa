# Railway Test Deployment

Staging path: see [RAILWAY_STAGING.md](./RAILWAY_STAGING.md). This file is the short operator note.

Production deploys go through Cloud Run (`.github/workflows/release.yml`, `workflow_dispatch` only). Railway is the fast staging environment.

`railway.json` builds the `Dockerfile` and probes `/healthz`.

## Docker vs env

The image sets `NODE_ENV=production`. Do **not** leave Railway `NODE_ENV` unset expecting an open demo panel — you must set `ENABLE_DEMO_CONTROL_PANEL`, `ENABLE_WEBHOOK_TEST`, `ENABLE_GRAPHQL`, and `ENABLE_API_DOCS` explicitly for a walkable staging demo.

## Firestore on Railway

There is no GCP Application Default Credentials. Set `GOOGLE_APPLICATION_CREDENTIALS_JSON` (single-line service account JSON) and `GOOGLE_CLOUD_PROJECT`, or Firestore-backed features fail closed.

## Minimum variables

See the table in `RAILWAY_STAGING.md`. After deploy:

- `GET /healthz`
- `GET /readyz` (full platform checks + flags)
- `GET /ops/platform` with `Authorization: Bearer $OPS_API_TOKEN`
- `./scripts/validate-railway.sh https://<your-service>.up.railway.app`
- Register `https://<your-service>.up.railway.app/webhook` on the **test** LINE channel
