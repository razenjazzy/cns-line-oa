# CNS LINE OA — Quick Start

## Development

```bash
cp .env.example .env    # fill in the values you need (see "Configuration" below)
npm install
npm run dev              # nodemon + ts-node, watches src/
```

## Production

```bash
npm run build            # tsc -> dist/
npm start                # node dist/index.js
```

## Docker

```bash
docker build -t cns-line-oa .
docker run -p 8080:8080 --env-file .env cns-line-oa
```

There's also a lighter local dev container (`Dockerfile.dev` +
`docker-compose.dev.yml`) and a single `./runner.sh` orchestrator for
setup/build/test/health checks — see `RUNNER.md`.

## Free Cloudflare Tunnel

```bash
./deploy-cloudflare.sh   # builds the app and exposes localhost:8080 publicly
```

---

## Running fully on the free tier

Set `GOOGLE_AI_STUDIO_API_KEY` (or `GEMINI_API_KEY`) and **leave
`GOOGLE_CLOUD_PROJECT` unset**. `src/services/chat.ts` and `vertexai.ts`
both build the AI Studio client first and only construct billed Vertex AI
clients when `GOOGLE_CLOUD_PROJECT` is present — so with only the AI Studio
key set, the app never touches paid Vertex AI. `Firestore` and `Odoo` are
both optional too (the app degrades gracefully without them, using
in-memory/heuristic fallbacks), so a minimal free-tier setup only strictly
needs LINE credentials + `GOOGLE_AI_STUDIO_API_KEY`.

---

## Talking to the bot

On a user's **first message ever**, the bot immediately replies with a
Flex nav-button menu (no "START" keyword needed) — tap a service to drill
into its commands, or type any of these directly:

- `FEATURES` / `GUIDE` — capability list / full step-by-step command guide
- `VERIFY START <phone>` → `VERIFY OTP <code>` — bind your Odoo identity
- `FORM DEMO QUOTE` — guided, one-field-at-a-time quotation flow (or type
  the single-line form: `DEMO QUOTE <product>,<qty>,<customer>,<phone>`)
- `DEMO PRODUCT <name>` / `DEMO ORDER <ref>` — Odoo lookups
- `START GROUPBUY <product>,<targetQty>,<hours?>` /
  `JOIN GROUPBUY <id>,<qty?>` / `CONFIRM GROUPBUY <id>` — group-buy flow
  (gated by `GROUPBUY_ENABLED`/`GROUPBUY_ROLLOUT_PERCENT`)
- `ADMIN VERIFY` / `ADMIN ENABLE` — admin role request (requires
  `profile.odooVerified` + your LINE user ID in `ADMIN_USER_ID`)
- `LANG EN` / `LANG TH` — language switch

Any unrecognized command gets near-miss suggestions instead of a dead end.

### Web demo panel

With `ENABLE_DEMO_CONTROL_PANEL=true` (default outside production), open
`http://localhost:8080/demo`:

- `GET /demo/connections` — LINE/Odoo/Firestore connection status
- `POST /demo/journey` — end-to-end application-to-Odoo journey
- `POST /demo/chat` — chat widget backend, routes through the exact same
  `resolveCommandReply` real LINE traffic uses
- `POST /webhook-test` — simulate a LINE message without signature
  validation (mutating commands are blocked here in production unless
  explicitly enabled)

### Operator CLI and MCP server

```bash
npm run build
npm run cli -- help                 # cns operator CLI
CNS_BASE_URL=https://staging... OPS_API_TOKEN=... npm run cli -- kpi
npm run mcp                          # MCP server over stdio (for Claude Desktop/Code etc.)
```

Both wrap the same `/healthz`, `/readyz`, `/ops/kpi`, `/ops/workflow-audit`,
`/ops/demo-session/rotate`, and `/jobs/*` endpoints the app already
authenticates server-side — see `src/ops-client/client.ts`. Mutating
commands (`jobs:*`, `rotate-session`) require an explicit `--yes` flag on
the CLI; the MCP tool descriptions call out which ones are destructive so
a host app's approval UI can warn accordingly.

---

## Configuration

All variables are documented in `.env.example`. The essentials:

```env
PORT=8080
NODE_ENV=production

LINE_CHANNEL_SECRET=...
LINE_CHANNEL_ACCESS_TOKEN=...
ADMIN_USER_ID=U...                 # comma-separated allowlist for ADMIN ENABLE
LINE_AGENT_NAME=น้องโซระ

GOOGLE_AI_STUDIO_API_KEY=...        # free-tier Gemini; omit GOOGLE_CLOUD_PROJECT to stay free

ODOO_URL=...
ODOO_DB=...
ODOO_USERNAME=...
ODOO_API_KEY=...

OPS_API_TOKEN=...                   # protects /ops/* and the CLI/MCP tooling
ADMIN_SECRET_TOKEN=...              # protects /jobs/* and CLI jobs:* commands
```

Additional LINE OAs: `LINE_CHANNEL_<ID>_SECRET` / `_ACCESS_TOKEN` /
`_SERVICES`, received at `POST /webhook/<channelId>` — no code changes
needed per channel (see `src/line/channels.ts`).

### Finding your ADMIN_USER_ID

1. Send any message to the bot.
2. Check server logs: `📩 Message from source=... U...`
3. Add that ID to `ADMIN_USER_ID` (comma-separated for multiple admins).
4. As that user: `VERIFY START <phone-on-file-in-Odoo>` → `VERIFY OTP <code>`
   → `ADMIN ENABLE`.

---

## Architecture

```
LINE event / voice ─▶ webhook.ts ─▶ command-router.ts ─▶ handlers/*.ts ─▶ services ─▶ Flex reply
                                     │
                                     ├─ guided-form intercept
                                     ├─ first-contact nav menu
                                     ├─ per-channel service gate
                                     ├─ FORM * guided flow start
                                     ├─ handler registry (11 modules)
                                     └─ keyword guidance → Gemini/ClawBridge/Odoo-heuristic fallback
```

See `documents/PROJECT_SUMMARY.md` for the full file inventory and
`CLAUDE.md` for the enforced security chains.

---

## Testing

```bash
npm test          # Vitest suite — 70+ tests across parsers/validators/config
npm run lint        # ESLint
npx tsc --noEmit   # type-check
```

## Deployment

```bash
cp deploy.env.staging.yaml.example deploy.env.staging.yaml
cp deploy.env.production.yaml.example deploy.env.production.yaml

npm run preflight:staging && npm run deploy:staging
PRODUCTION_APPROVED=true npm run preflight:prod && npm run deploy:prod

npm run smoke -- https://YOUR-CLOUD-RUN-URL
npm run evidence -- https://YOUR-CLOUD-RUN-URL ./artifacts/deploy-evidence.json production
```

`preflight:*` runs deploy-env validation + cutover validation + build +
test. CI/CD workflow (`.github/workflows/release.yml`): staging deploys
automatically on `main` push (`preflight → deploy → smoke`); production
requires a manual run with `deploy_production=true` and
`PRODUCTION_APPROVED=true`, plus GitHub Environment approval gates.

An Ansible playbook set (`ansible/`) is also available for VM-based
staging/production provisioning (Docker, nginx, health checks) as an
alternative to Cloud Run.

### Troubleshooting

- **"GOOGLE_CLOUD_PROJECT not set"** — expected if you're intentionally
  running free-tier-only (AI Studio key only); not an error.
- **"LINE credentials missing"** — `/webhook` returns 200 no-op until
  `LINE_CHANNEL_SECRET`/`LINE_CHANNEL_ACCESS_TOKEN` are set.
- **`ADMIN ENABLE` fails** — check `ADMIN_USER_ID` includes your exact LINE
  user ID and that you've completed `VERIFY START`/`VERIFY OTP` first.
