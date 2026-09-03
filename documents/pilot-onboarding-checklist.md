# Pilot Onboarding Checklist

Use this for every new Cloudnex Connect pilot customer (Go-to-Market Phase 1–2).
Each pilot is a single-tenant deployment — its own Cloud Run service, its own
GCP project, its own env vars. Do not add a pilot customer as an additional
channel on an existing deployment; that's the multi-tenant model, which is
explicitly out of scope until the Phase 6 decision gate (see the strategy doc).

## Before you start

- [ ] Signed pilot agreement, time-boxed (4–6 weeks), with success metrics agreed in writing:
  - Response time to LINE-originated product/order questions
  - Order/quote volume created via LINE
  - Staff time saved vs. manual LINE↔Odoo copying
- [ ] Named pilot contact on the customer side, and a designated internal admin (their LINE user ID will be needed — see below)

## 1. LINE Official Account

- [ ] Create (or confirm) the customer's LINE Official Account in the LINE Developers console
- [ ] Create a Messaging API channel under it; note the **Channel Secret** and **Channel Access Token**
- [ ] Do **not** register the webhook URL yet — that happens after deploy (step 4)
- [ ] Confirm the OA's public-facing name/branding with the customer (see naming note below)

## 2. Odoo access

- [ ] Confirm the customer's Odoo instance URL and database name
- [ ] Create a **dedicated Odoo service account** for Cloudnex Connect (do not reuse a human user's login) with API key access, scoped to:
  - `res.partner` (read/write) — customer directory
  - `product.product` (read/write) — service/product catalog
  - `sale.order` (read/write) — quotations
- [ ] Verify the account can log in via XML-RPC before deploying (`ADMIN VERIFY` command will also confirm this post-deploy)

## 3. GCP project & secrets

- [ ] Provision a GCP project for this pilot (or a clearly isolated environment within an existing one)
- [ ] Enable Firestore (Native mode) — this is where user profiles, verification state, guided-form state, and the audit log live
- [ ] Provision Redis if running more than one instance (`RATE_LIMIT_STORE=redis`, `REDIS_URL=...`) — for a single-instance pilot, the in-memory fallback is acceptable
- [ ] Load secrets into `CLOUD_RUN_SECRETS` per `scripts/validate-deploy-env.sh` — do not put real credentials in a committed `deploy.env.*.yaml`

## 4. Configure and deploy

Copy `deploy.env.production.yaml.example` to a pilot-specific env file and set:

- [ ] `LINE_CHANNEL_SECRET`, `LINE_CHANNEL_ACCESS_TOKEN` (from step 1)
- [ ] `ODOO_URL`, `ODOO_DB`, `ODOO_USERNAME`, `ODOO_API_KEY` (from step 2)
- [ ] `GOOGLE_CLOUD_PROJECT`, `GOOGLE_CLOUD_LOCATION`
- [ ] `ADMIN_USER_ID` — the pilot admin's LINE user ID. **This is required for `ADMIN ENABLE` to work at all; it fails closed if unset.** Get it *before* the first deploy if possible (the admin can find their own LINE user ID via LINE's own tools), or have them send any message to the bot post-deploy and read their `userId` from the webhook logs (`📩 Message from source=...`), then redeploy with `ADMIN_USER_ID` set.
- [ ] `LINE_AGENT_NAME` — leave as the default (น้องโซระ) unless the customer has explicitly asked for a different persona name. Keeping it consistent across pilots builds Cloudnex's own brand recognition rather than white-labeling each deployment.
- [ ] `ENABLE_DEMO_CONTROL_PANEL=false` — confirm this stays off; it's not a pilot-customer-facing feature
- [ ] `RATE_LIMIT_STORE=redis` if multi-instance (see step 3)

Then:

- [ ] `npm run preflight:staging` (or `:prod`) — validates env, builds, tests
- [ ] `npm run deploy:staging` first, smoke-test, then promote to production
- [ ] Register `https://<pilot-host>/webhook` as the channel's webhook URL in the LINE Developers console
- [ ] Confirm `GET /healthz` and `GET /readyz` both return healthy

## 5. Verify end-to-end before training

- [ ] Message the bot as a test user: `OPTIONS`, `NAV HOME` — confirm the menu renders and only shows intended services
- [ ] `VERIFY START <a real Odoo contact's phone>` → `VERIFY OTP <code>` — confirm the verification loop works against their real Odoo data
- [ ] As the designated admin: `ADMIN VERIFY` → `ADMIN ENABLE` — confirm it succeeds (this is the point where `ADMIN_USER_ID` gets exercised for real)
- [ ] Run one real `PRODUCT FIND`, one `FORM QUOTE CREATE`, one `USER READ` against real Odoo data
- [ ] Check `GET /ops/audit-log` shows the admin grant and any test writes

## 6. Train the pilot's staff

- [ ] Walk 2–3 staff through `NAV HOME` → service menu → guided forms — not raw text commands
- [ ] Confirm at least one staff member can complete a quote end-to-end without engineering help (this is Phase 2's exit condition)
- [ ] Share the `GUIDE` command as their own reference

## 7. Start tracking

- [ ] Set a weekly check-in cadence for the pilot window
- [ ] Track the three agreed success metrics from day one, not just at the end
- [ ] Note real cost signals (message volume, Odoo call volume) — this pilot is what makes the pricing model's assumed tier mix real instead of assumed

## Known limitations to disclose to the pilot customer upfront

- Single-instance deployment: brief downtime during redeploys, no horizontal failover yet
- Guided forms are disabled in LINE group/room chats by design (shared conversation state — see `CLAUDE.md`)
- Voice messages are transcribed via Gemini; no cost accounting for this yet in the pricing model
