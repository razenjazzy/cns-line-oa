# Staging: amardhaka.io

Docker on Hostinger. Domain is the public URL. Do not edit other vhosts (`golpocom.com`, `shahbaizidarefin.com`).

| | |
|---|---|
| Domain | `https://amardhaka.io` |
| Webhook | `POST https://amardhaka.io/webhook` |
| Host | `root@187.127.179.49` |
| App | `/opt/cns-line-oa` |
| Env | `/opt/cns-line-oa/.env` (server only) |
| Compose | `deploy/hostinger/docker-compose.staging.yml` |
| Lane | `APP_ENV=staging`, image `NODE_ENV=production` |

LINE HMAC → Firestore profile → one `resolveCommandReply` → Flex.

## Required config (already forced in compose)

`PUBLIC_BASE_URL=https://amardhaka.io`

Also in `.env`: LINE secret + access token, Firestore project + credentials JSON, Odoo URL/DB/user/key, `ADMIN_USER_ID`, `OPS_API_TOKEN`, `DEMO_CONTROL_TOKEN`, `WEBHOOK_TEST_TOKEN`. Demo, webhook-test, GraphQL, and API docs are on. Claw, async queues, and Mongo stay off.

## Deploy

```bash
cd /opt/cns-line-oa
docker compose -f deploy/hostinger/docker-compose.staging.yml --env-file .env up -d --build
curl -sS http://127.0.0.1:8080/healthz
curl -sS http://127.0.0.1:8080/readyz
```

DNS: A `@` → `187.127.179.49`. CNAME `www` → `amardhaka.io` is fine.

TLS:

```bash
certbot --nginx -d amardhaka.io -d www.amardhaka.io
```

LINE Developers webhook: `https://amardhaka.io/webhook`. Rich menu ids: laptop `npm run rich-menu:upload`, then put ids in `.env` and recreate.

Smoke: `GET https://amardhaka.io/healthz`, `/readyz`, `/demo`.

## GitHub → VPS (push `main`)

`ci.yml` builds and tests. `.github/workflows/staging-vps.yml` rsyncs this repo to `/opt/cns-line-oa` and recreates the container. It never writes `.env`.

GitHub → Settings → Environments → **staging** secrets:

| Secret | Value |
|---|---|
| `VPS_SSH_KEY` | Private key that can `ssh root@187.127.179.49` |
| `VPS_HOST` | Optional; default `root@187.127.179.49` |

From a laptop with that key: `npm run deploy:vps-staging`.

Out of scope for this path: new npm packages, a second command router, GraphQL LINE events, Mongo for users, admin-chain changes, nginx for other domains, committing VPS secrets.
