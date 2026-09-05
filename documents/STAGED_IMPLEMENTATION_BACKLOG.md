# Staged Implementation Backlog

Updated: 2026-09-04

This backlog converts the enterprise architecture plan into small, reversible implementation slices. Each slice must preserve current behavior and pass the focused verification command before the next slice begins.

## Operating rules

- Keep `resolveCommandReply` as the single LINE command entry point.
- Keep the authorization chain intact: LINE identity -> Firestore profile -> `odooVerified` -> `ADMIN_USER_ID` allowlist -> Odoo admin capability -> role assignment.
- Do not expand step-up OTP beyond the current quote lifecycle without a separate product and security decision.
- Keep ClawSpring reference code outside the production runtime path.
- Validate on staging before production promotion.
- Do not commit generated files, local env files, credentials, or reference-only code to the staging deploy boundary.

## Completed foundations

- Repository refactor map and budget-aware agent instructions.
- Selective ClawFramework merge decision and staging deployment policy.
- ERP adapter contract with the Odoo implementation.
- Command metadata registry with channel and role visibility.
- Fail-closed command policy evaluator.
- HTTP admin and operations authentication regression coverage.
- Structured JSON logging with redaction and configurable language/service defaults.
- Approval record persistence foundation with Firestore/local fallback and malformed-record validation.
- Atomic approval transition API using Firestore transactions with local fallback.
- Dedicated approval audit events and controlled `QUOTE APPROVE` runtime adoption.
- Request ID propagation through HTTP entry points and the approval lifecycle.
- Bounded audit query filters with opaque cursor pagination and hot/cold request-ID parity.
- Background job execution IDs for audit rotation, daily reporting, and segmentation.
- Firestore shared contract extraction to `src/services/firestore/types.ts` with barrel-compatible exports.
- Firestore core normalization helpers extracted to `src/services/firestore/core.ts` with full regression validation.
- Firestore platform configuration repository extracted with compatibility exports and focused contract coverage.
- Firestore refactor validation remains green after core and platform-config extraction.
- Odoo public type contracts extracted with adapter, quotation, group-buy, and template validation.
- Odoo client configuration and transient-error policy extracted with direct contract tests.
- Odoo client foundation verified with full suite, build, lint, and diff checks.
- ERP adapter migrated to consume Odoo domain facades for catalog, sales, partners, and reporting.
- Admin service-configuration Flex UX added through the existing ADMIN CHANNEL protocol.
- Admin configuration UX validated bilingually against LINE message limits and the full regression suite.
- Budget-optimized completion boundary established: Firestore runtime domains are migrated; Odoo facades are active and adapter-facing, while internal body movement is deferred as a separate mechanical refactor.
- Firestore and Odoo domain facade exports verified by public-surface tests.
- Firestore user-profile runtime ownership migrated for language/profile reads and language writes.
- Firestore profile-state writes and consent operations migrated behind the user-profile repository.
- Firestore communication persistence migrated for conversation history, messages, scoring, and feedback.
- Communication repository contract validated with the full 32-file, 180-test suite.
- Verification repository contract added for create/consume/lookup operations.
- Action-OTP repository contract added for isolated step-up create/consume operations.
- Verification and action-OTP contracts validated with the full 34-file, 182-test suite.
- Group-buy repository contract added for transactional operation boundaries.
- Group-buy contract validated with the full 35-file, 183-test suite.
- Verification challenge creation migrated behind `verification-store.ts` with token-index transaction preservation.
- Verification OTP and magic-link consumption migrated behind dedicated stores with full transaction behavior preserved.
- Action-OTP creation and consumption migrated behind `action-otp-store.ts` with full suite validation.
- Approval persistence and atomic transitions migrated behind `approval-store.ts` with audit callback preservation.
- Audit persistence, pagination, archive reads, and retention deletion migrated behind `audit-store.ts` with full validation.
- Group-buy read/list/Odoo-attachment operations migrated behind the store; transactional operations remain isolated for the next slice.
- Complete group-buy runtime persistence migration completed and validated, including transactional join/status operations.
- Firestore user/profile mapping extracted with secure-default regression coverage.
- Firestore verification challenge mapping extracted with status/default coverage.
- Firestore action-OTP challenge mapping extracted with replay/default coverage.
- Firestore group-buy record mapping and expiry logic extracted without changing transactions.
- Group-buy extraction validated with focused tests, full suite, build, lint, and diff checks.
- Firestore audit document mapping extracted with request-correlation/default coverage.
- Firestore mapping layer complete across all planned domains; persistence/cache ownership remains intentionally in the compatibility module.
- Track A3 privileged-write audit review complete: found and fixed a real authorization gap (DAILY REPORT/SEGMENT CUSTOMERS had no admin check), closed two audit-trail gaps (QUOTE APPROVE failure path, Group-Buy Odoo-order creation).
- QUOTE REMOVE shipped (delete a quote line entirely), closing the last named feature-completeness gap.
- Step-up OTP extended to USER/SERVICE CRUD, closing the last named security gap.
- Odoo-native sales-tier permissions (salesTier) shipped as an additive layer, fail-safe to today's behavior with no linked Odoo user.
- Track B3 HTTP route extraction complete: src/index.ts split into src/http/* (env, runtime-state, middleware, demo-session, and one file per route group). Verified via build/lint/test plus a live local smoke test.

## Track A: security and policy

### A1. Policy adoption review

- Compare command metadata with the existing handler registry and service catalog.
- Identify mismatches without changing runtime routing.
- Completed 2026-09-04: every metadata entry now records its real command prefix and existing handler owner; `ORDER_CONFIRM` intentionally maps to the existing `QUOTE CONFIRM` command.
- Acceptance: a documented mapping exists for every metadata command; no command is accidentally exposed by the new registry.
- Check: `npm run build && npm test`

### A2. Approval and audit contract

- Define a small approval record for privileged writes: actor, command, target, channel, status, timestamps, and expiry.
- Reuse existing Firestore audit records; do not create a second unrelated audit store.
- Completed 2026-09-04: pure approval state transitions now enforce expiry, different-user approval, and approved -> completed ordering in `src/services/approval-policy.ts`.
- Acceptance: denied, approved, expired, and completed outcomes are distinguishable and contain no secrets or OTP values.
- Check: focused unit tests for pure approval transitions, then `npm run build`.

### A3. Privileged-write audit review

- **Completed 2026-09-05** — swept every `getErpAdapter()`/Firestore-write
  call site in `src/line/handlers/*.ts`, `src/services/group-buy.ts`, and
  the jobs it triggers, checking each against "does this record an audit
  event on both success and failure."
- **Found and fixed a real authorization gap, not just an audit gap**:
  `DAILY REPORT` and `SEGMENT CUSTOMERS` (`src/line/handlers/commerce.ts`)
  had **no admin-role check at all** — unlike their sibling
  `SEED SAMPLE DATA` handler in the same file, which had the check all
  along. Any LINE user could trigger a bulk customer marketing multicast
  or force internal-sales-report generation just by typing the command
  text. This is the reason `service-catalog.ts`'s `requiresAdmin` flag is
  not itself an enforcement mechanism for typed commands — it only governs
  *menu visibility* (`getVisibleCommands`), not execution; execution-time
  admin gating is each handler's own responsibility, and these two missed
  it. Fixed by adding the same `profile.role !== 'admin'` check every other
  admin-only handler already has.
- Also closed two real audit-trail gaps found in the same sweep:
  `QUOTE APPROVE`'s failure path (when Odoo's confirm fails) recorded no
  audit event at all — success is audited via the `approval_requested`/
  `approved`/`completed` chain (Track A2), but that chain never fires on
  failure, so a distinct `quote_approve` failure event was added, plus a
  fallback success event for the rare case where the approval-record save
  itself fails after Odoo's confirm already succeeded. `group-buy.ts`'s
  Odoo-order auto-creation (on Group-Buy confirm) had no audit trail at
  all; added `group_buy_odoo_order_create` success/failure events.
- Acceptance: no password, API key, access token, OTP, or raw personal
  payload is written to audit detail — verified, all `detail` fields used
  are product ids, order names, or short fixed reason strings.
- Check: `npm run build && npm run lint && npm test` (39 files / 212 tests)
  all pass.

### A4. HTTP boundary hardening

- Keep admin and operations tokens environment-only and fail-closed.
- Add rate limiting and generic error responses where the existing middleware boundary supports them.
- Acceptance: missing configuration is unavailable, invalid credentials are unauthorized, and valid credentials do not bypass route-specific authorization.
- Check: `npx vitest run tests/http-auth.test.ts`.

## Track B: runtime structure

### B1. Firestore barrel-preserving split

- Extract `core`, `users`, `verification`, `action-otp`, `group-buy`, `audit`, and `platform-config` modules under `src/services/firestore/`.
- Keep `src/services/firestore.ts` as a compatibility barrel.
- Acceptance: import sites remain unchanged and behavior is identical.
- Check: `npm run build && npm test`.

### B2. Odoo barrel-preserving split

- Extract `types`, `client`, `catalog`, `sales`, `partners`, and `reporting` modules under `src/services/odoo/`.
- Keep retry and idempotency behavior unchanged.
- Keep `src/services/odoo.ts` as a compatibility barrel.
- Acceptance: adapter and all existing consumers compile without import rewrites.
- Check: `npm run build && npm test`.

### B3. HTTP route extraction

- **Completed 2026-09-05.** `src/index.ts` (836 lines, 27 routes) split into:
  `src/http/env.ts` (derived env constants), `src/http/runtime-state.ts`
  (the rate-store singleton, reassigned once at startup — every route reads
  the *current* value via `getRateStore()`, never a value captured at
  import time), `src/http/middleware.ts` (CSP, request-id/logging, the 4
  rate limiters, small shared helpers), `src/http/demo-session.ts` (the
  demo-session mutable state + `requireDemoControlAccess`/rotate/verify
  logic — kept as one cohesive module since ops and demo routes both need
  it), and one file per route group: `health-routes.ts`, `ops-routes.ts`,
  `verify-routes.ts`, `webhook-routes.ts`, `jobs-routes.ts`,
  `demo-routes.ts`. `src/index.ts` is now ~35 lines: create the app, two
  `app.use()` calls, six `registerXRoutes(app)` calls, `startServer()`.
- Verified behavior-preserving two ways: `npm run build`/`lint`/`test`
  (39 files / 212 tests) clean, **and** a live local smoke test (`node
  dist/index.js` against real `.env` credentials — no staging deploy
  access from this environment, so this was the closest equivalent):
  `/healthz`, `/readyz` (real Firestore+Odoo connectivity), `/webhook-test`
  (full `resolveCommandReply` round-trip, real Flex output), `/demo`,
  `/demo/session/status`, `/verify/odoo` all matched expected behavior.
  `/jobs/daily-report` correctly 401'd without a token; `/ops/kpi` and
  `/ops/demo-session/rotate` correctly 503'd without `OPS_API_TOKEN`
  configured, then were re-tested with a temporary token covering every
  validation branch of the rewritten rotate logic (too-short secret,
  valid rotation, rejecting a same-as-current secret) — all matched the
  original handler's behavior exactly.
- One pre-existing, unrelated behavior noted during the smoke test, not
  introduced by this split (confirmed via `git diff` showing
  `src/line/webhook.ts` untouched): `POST /webhook` with no LINE signature
  header returns 500, not a clean 4xx. Out of scope for B3 (route
  organization only) — worth a follow-up if it matters, since a malformed
  request from a non-LINE caller probably shouldn't 500.
- Acceptance: health, webhook, demo, ops, and job endpoints retain
  existing behavior — confirmed.
- Check: `npm run build`, `npm test`, and a live local smoke check (see
  above) all pass.

### B4. LINE template and demo asset split

- Split Flex builders under `src/line/templates/` with a compatibility barrel.
- Move static demo assets out of the large page module.
- Acceptance: generated LINE message shapes and demo rendering remain unchanged.
- Check: `npm run build && npm test`.

## Track C: provider and UX expansion

### C1. Adapter capability registry

- Add provider selection behind configuration, defaulting to Odoo.
- Reject unsupported capabilities explicitly instead of returning synthetic data.
- Acceptance: unavailable ERP operations fail clearly and no provider credentials are hardcoded.
- Check: adapter contract tests and build.

### C2. Registry-to-menu projection

- Project command metadata into LINE Flex menus only after the mapping review in A1.
- Continue sending real command text to the existing router.
- Acceptance: menus obey channel and role visibility, while typed commands retain current behavior.
- Check: command registry tests, template tests, and staging click-through.

### C3. Future ERP provider spike

- Implement a non-production contract test fixture for one future provider shape.
- Do not add live credentials, network calls, or production routing until a provider is selected.
- Acceptance: the Odoo adapter remains the default and all unsupported methods are explicit.
- Check: contract tests and build.

## Release gates

### Staging gate

1. Run the focused test for the changed slice.
2. Run `npm run build`.
3. Run `npm test` for shared behavior or refactors.
4. Run the staging preflight and smoke checks.
5. Runtime-file scoping is enforced by `.dockerignore` + the Dockerfile's
   multi-stage copy (Railway builds via `railway.json`'s `DOCKERFILE`
   builder) — see `BACKLOG.md`'s Infra/ops section. There is no separate
   deploy-tree script; a prior `scripts/prepare-staging-deploy.sh` attempt
   was removed for duplicating that already-enforced boundary without
   plugging into Railway's actual build path.
6. Review the diff and commit only the intended staging runtime files.

### Production gate

Production promotion requires staging validation, security review of changed authorization paths, clean deploy evidence, and explicit signoff. Production deployment is not part of ordinary development iterations.

## Suggested execution order

1. A1 policy adoption review.
2. A2 approval and audit contract.
3. A3 privileged-write audit review.
4. B1 Firestore split.
5. B2 Odoo split.
6. B3 HTTP route extraction.
7. B4 template and demo split.
8. C1 adapter capability registry.
9. C2 registry-to-menu projection.
10. C3 future provider contract spike.
