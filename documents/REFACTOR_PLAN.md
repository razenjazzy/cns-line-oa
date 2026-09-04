# Refactor Plan — Service-Based Structure

Baseline captured 2026-09-04: `npm run build` ✅, Vitest 22 files / 158 tests ✅.
Strategy: **barrel-preserving splits**. Every god-file becomes a folder of domain
modules plus a thin barrel at the original path, so the 30+ existing import sites
do not change. Verify with `npm run build && npm test` after every step.

## Hotspots (lines → target split)

| File | Lines | Problem | Target |
|---|---|---|---|
| src/services/firestore.ts | 1672 | 55 exports, 6 domains in one file | services/firestore/* + barrel |
| src/services/odoo.ts | 1436 | 37 exports, client + 5 domains | services/odoo/* + barrel |
| src/line/templates.ts | 939 | all Flex builders mixed | line/templates/* + barrel |
| src/demo/page.ts | 909 | giant HTML string in TS | demo/assets + thin page.ts |
| src/index.ts | 827 | 27 routes + middleware + wiring | src/http/* route modules |

## Step 2 — firestore.ts split (most dependents: ~20 import sites)

Create `src/services/firestore/` with modules; keep `src/services/firestore.ts`
as pure re-export barrel. Node/TS resolve `services/firestore` to the `.ts` file
first, so all imports keep working.

Progress 2026-09-04: shared public contracts are extracted to
`src/services/firestore/types.ts` and re-exported by `firestore.ts`. Runtime
domain implementations remain in the original file until each domain is
moved and verified independently.

Progress update: shared scalar normalization helpers are extracted to
`src/services/firestore/core.ts`; database initialization and fallback policy
remain in `firestore.ts` until the next core extraction slice.

Progress update: platform configuration collection access is now implemented
in `src/services/firestore/platform-config.ts` through injected Firestore
read/write primitives; the original exports remain compatibility wrappers.

Verified with the full suite, build, lint, and diff check. Next domain slice:
verification and action-OTP persistence, after the user/profile mapping
extraction completed with authentication and consent defaults preserved.

Progress update: Odoo verification challenge mapping is extracted to
`src/services/firestore/verification.ts`; challenge persistence remains in
`firestore.ts` until the next verification slice.

Progress update: action-OTP challenge mapping is extracted to
`src/services/firestore/action-otp.ts`; OTP persistence and transaction logic
remain in `firestore.ts` until the next action-OTP slice.

Verified with the full suite, build, lint, and diff check. Group-buy record
mapping and lazy expiry logic are now extracted to
`src/services/firestore/group-buy.ts`; transactional join/confirm/cancel
behavior remains in `firestore.ts`.

Next domain slice: extract audit record mapping and query normalization while
preserving archive rotation and operations-view pagination.

Progress update: audit document mapping is extracted to
`src/services/firestore/audit.ts`; recent-event filtering, cursor pagination,
archive reads, and retention deletion remain behaviorally unchanged.

The Firestore refactor's low-risk mapping layer is now fully verified across
all planned domains. Remaining extraction work is the higher-risk persistence
and cache ownership move; proceed only with a compatibility barrel and one
domain at a time. The next major phase is the Odoo service split.

Completion status: Firestore domain ownership is complete for profile,
communication, verification, action OTP, group-buy, approval, and audit
operations. Remaining compatibility code is limited to shared bootstrap/cache,
report persistence, and phone lookup helpers. These are lower-value than the
Odoo migration and should not trigger a broad rewrite.

- `core.ts` — client init, in-memory fallback cache, `checkFirestoreReady`, `FirestoreWriteResult`
- `users.ts` — `UserProfile`, `UserLanguage`, `UserRole`, `PendingFlowState`,
  profile/language/role/partner/consent/marketing/feedback/messages/score/escalation/pendingFlow/`lastActionOtpAt` (lines ~291–870)
- `verification.ts` — `OdooVerificationChallenge*`, `createOdooVerificationChallenge`,
  `consumeOdooVerificationByOtp/ByToken`, `findVerifiedUserIdByPhone` (lines ~404–1120)
- `action-otp.ts` — `ActionOtpChallenge*`, create/consume (lines ~1121–1286)
- `group-buy.ts` — `GroupBuyRecord/Status/WriteResult`, CRUD + join/confirm/cancel (lines ~72–236, 1287–1534)
- `audit.ts` — `AuditAction`, `recordAuditEvent`, list/delete rotation queries (lines ~1535–1672)
- `platform-config.ts` — `get/setPlatformConfig`, `saveReportLog`

Move code bottom-up (audit → group-buy → action-otp → verification → users →
config → core) to keep intra-file deps one-directional: everything depends on
`core.ts` only.

## Step 3 — odoo.ts split

Same barrel trick at `src/services/odoo.ts`, modules under `src/services/odoo/`:

- `types.ts` — `OdooProduct`, `OdooSaleOrder(Line)`, `OdooDailySalesItem`, `OdooServiceItem`, `OdooPartner`
- `client.ts` — env config, JSON-RPC transport, timeouts, read/write retry policy,
  `isOdooConfigured`, `pingOdoo`, `verifyOdooAdminAccess` (lines ~1–363)
- `catalog.ts` — `findProductByQuery`, `listProducts`, service catalog CRUD (lines ~364–417, 1063–1310)
- `sales.ts` — sale-order read/confirm/send/cancel/lines/invoice/portal/PDF,
  `createQuotationFromLine`, payment terms (lines ~418–878)
- `partners.ts` — `getPartnerByPhone/Id`, create/update/delete partner (lines ~879–1062)
- `reporting.ts` — `getDailySalesSnapshot`, `seedOdooSampleSalesData` (lines ~1311–1436)

Do not change retry/idempotency semantics — `templates.ts` imports `OdooSaleOrder`
type; keep type exports in barrel.

Progress 2026-09-04: public Odoo contracts are extracted to
`src/services/odoo/types.ts` and re-exported by `odoo.ts`. RPC transport,
retry policy, and domain implementations remain unchanged.

Progress update: Odoo configuration and transient-error classification are
extracted to `src/services/odoo/client.ts`; the existing service delegates to
these helpers while RPC transport and retry execution remain unchanged.

Progress update: domain facades and barrels are available for Firestore users,
verification, action OTP, group-buy, audit, and Odoo admin/catalog/sales/
partners/reporting. These facades preserve the existing services as the
implementation backend while the remaining internal ownership moves stay
incremental and test-gated.

Progress update: `user-profile-repository.ts` now owns the runtime
`getUserLanguage`, `setUserLanguage`, and `getUserProfile` paths through
injected cache and Firestore dependencies. Authentication, consent, role, and
verification defaults remain unchanged. Next slice: move adjacent profile
writes and consent operations.

Progress update: the same repository now owns escalation, first-contact,
consent notice, marketing opt-in, pending-flow, role, partner, verification
status, OTP freshness, and profile deletion writes. The profile domain is
runtime-migrated and fully regression-validated. Remaining Firestore work is
conversation/score/feedback ownership plus challenge and group-buy persistence.

Progress update: `communication.ts` now owns conversation history, message
writes, user scoring, and chat feedback through injected Firestore primitives.
The profile and communication ownership moves are fully regression-validated;
remaining Firestore persistence moves are verification, action OTP, group-buy,
approval, and audit operations.

Progress update: verification now has an explicit repository contract covering
challenge creation, OTP consumption, token consumption, and verified-phone
lookup. Existing implementations remain behind the compatibility barrel until
the next persistence move is validated.

Progress update: action OTP now has a separate repository contract covering
challenge creation and step-up consumption; it remains intentionally distinct
from Odoo identity verification.

Both challenge contracts are regression-validated. Next Firestore slice:
formalize group-buy repository operations before moving its transactional
implementation behind the domain boundary.

Progress update: group-buy repository contract now explicitly covers create,
read, list, Odoo-order attachment, join, confirm, and cancel operations with
actor/admin context preserved.

The contract is verified with the full suite. The next group-buy step is to
move its transaction implementation behind this boundary one operation at a
time; until then `firestore.ts` remains the compatibility implementation.

Progress update: group-buy `getById`, `listByCreator`, and `attachOdooOrder`
now run through `group-buy-store.ts`. Transactional `join`, `confirm`, and
`cancel` remain in `firestore.ts` for a separately validated migration.

Progress update: group-buy create, read, list, join, confirm, cancel, and
Odoo-order attachment now run through `group-buy-store.ts`. The complete
group-buy runtime domain is migrated and regression-validated.

Next domain slice: move verification challenge persistence behind
`verification-repository.ts` while preserving OTP/magic-link transactions and
the token index.

Progress update: verification challenge creation now runs through
`verification-store.ts`, including atomic challenge/token-index creation and
the no-Firestore in-memory fallback. OTP and magic-link consumption remain for
the next migration slice.

Progress update: verification OTP and magic-link consumption now run through
`verification-consume.ts` and `verification-token.ts`. Their Firestore
transactions, token-index updates, lockout, expiry, and in-memory fallback
behavior are fully regression-validated.

Progress update: action-OTP creation and consumption now run through
`action-otp-store.ts`, preserving step-up lockout, expiry, replay command, and
in-memory fallback behavior. The action-OTP domain is runtime-migrated and
fully validated.

Progress update: approval save, read, atomic transition, and dedicated audit
emission now run through `approval-store.ts`. The `QUOTE APPROVE` runtime path
continues to use the same compatibility exports and remains fully validated.

Next Firestore slice: move audit persistence, pagination, archive reads, and
retention deletion behind `audit-repository.ts`.

Progress update: audit writes, recent-event pagination, archive reads, and
retention deletion now run through `audit-store.ts`, preserving request
correlation, filters, cursor behavior, and archive-then-delete semantics.

The Odoo client foundation is verified with the full suite, build, lint, and
diff check. Next domain slice: extract catalog read/mapping logic while
preserving service catalog CRUD and Odoo retry semantics.

Efficiency milestone: the ERP adapter now consumes Odoo catalog, sales,
partner, and reporting domain facades directly. This activates the domain
boundary for the provider abstraction without duplicating RPC logic; the
remaining Odoo task is internal ownership migration of `odoo.ts`.

Progress update: the main runtime commerce, quotation, customer, and service
catalog workflows now resolve through `src/erp/registry.ts` and the typed ERP
adapter. Remaining direct Odoo imports are compatibility utilities whose
implementations have not moved yet (`pingOdoo`, demo seeding, and related
status wiring); they are intentionally retained until a physical body split
can be made as one mechanical, separately validated change.

Budget decision: treat the Odoo domain facades plus direct ERP-adapter usage as
the stable boundary. Physically moving all Odoo function bodies is deferred to
one mechanical, separately validated change because it has higher regression
risk and little product value by itself.

## Step 4 — index.ts → src/http/

Extract route groups into modules exporting `registerXxxRoutes(app, deps)`:

- `http/ops-routes.ts` — `/ops/kpi`, `/ops/audit-log*`, `/ops/demo-session/rotate`, `/ops/workflow-audit`
- `http/demo-routes.ts` — `/demo/**` (session + panel APIs)
- `http/jobs-routes.ts` — `/jobs/*`
- `http/verify-routes.ts` — `/verify/odoo`
- `http/middleware.ts` — request-id, CSP, JSON cap, rate limiter wiring
- `index.ts` keeps: app creation, middleware order, `/healthz` `/readyz`,
  `/webhook*` registration, listen + SIGTERM.

Keep `resolveCommandReply` reuse in `/demo/chat` and `/webhook-test` untouched.

## Step 5 — templates.ts + demo/page.ts

- `line/templates/`: `shared.ts` (palette, `formatMoney`, bubble helpers),
  `menu.ts` (home/service), `catalog.ts` (product/order cards),
  `quotation.ts` (journey/list), `forms.ts` (prompt/optional-summary),
  `report.ts` (daily report); barrel at `line/templates.ts`.
- `demo/page.ts`: move HTML/CSS/JS string into `demo/page.html` loaded once at
  startup (or a `demo/assets.ts` template module); page.ts keeps handler logic only.

## Rules (from CLAUDE.md, non-negotiable)

- No behavior changes; no new dependencies; no routing logic duplicated.
- Keep auth chain (LINE → profile → odooVerified → ADMIN_USER_ID → Odoo admin check) intact.
- After each step: `npm run build && npm test` must stay 135/135 green.

## Step 6 — Final gate

Full suite + `npm run lint`; update `documents/PROJECT_SUMMARY.md` inventory;
update repo memory with new structure facts.
