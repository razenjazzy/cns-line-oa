# Backlog

## Standard implementation sequence for this repo

This repo should follow a staged, enterprise-safe path:

1. Keep only runtime files in staging deployment commits.
2. Keep reference/vendor frameworks in backup, not in active runtime.
3. Standardize the app around a clear ERP adapter layer.
4. Standardize LINE commands via a registry-driven config model.
5. Lock security and approval policy before broad production rollout.
6. Validate in staging, then promote to production only after signoff.

## Status as of 2026-09-04

The current architecture review is recorded in
`documents/ARCHITECTURE_REVIEW_V2.md` (corrected — an earlier version of
this note pointed at a `ARCHITECTURE_REVIEW_2026-09-04.md` that never
existed). The enterprise-hardening pass (ERP adapter, modular Firestore/
Odoo services, approval policy, audit query, structured logging — see
`documents/STAGED_IMPLEMENTATION_BACKLOG.md` Track A/B1/B2) has been
merged and verified: the baseline is now 38 Vitest files and 201 passing
tests (up from the earlier 21/158), plus a clean `npm run build` and
`npm run lint`. Next code priorities per the staged backlog: A3 (broader
privileged-write audit review), B3/B4 (further file splits), C2/C3 (menu
projection off the command registry, a future-ERP-provider spike) — none
of those are started.

Follow-up items after the quotation-journey P0/P1/P2 pass and the step-up
OTP / grouped optional-fields / sales messaging pass that followed it.
Nothing here blocks what's already shipped — these are the explicitly
deferred or not-yet-verified pieces.

---

## Deferred by explicit request — not yet scoped

- **"Edit/delete for authorized users"** — raised alongside the step-up OTP
  request, but the user asked to discuss the actual gap separately rather
  than guess at it. Not implemented. Come back to this once scoped.
- ~~**Step-up OTP scope**~~ — **closed 2026-09-05.** Now gates the quote
  lifecycle (`QUOTE CREATE`, `QUOTE ADD`/`EDIT`/`CANCEL`/`CONFIRM`/`SEND`/
  `INVOICE`/`APPROVE`/`MESSAGE`, `MESSAGE CUSTOMER`) **and** `USER`/`SERVICE`
  CRUD (`USER CREATE`/`UPDATE`/`DELETE`, `SERVICE CREATE`/`UPDATE`/`DELETE`).
  `ADMIN ENABLE`/`DISABLE` remain deliberately ungated — they already sit
  behind the stronger `ADMIN_USER_ID` allowlist + Odoo admin-capability
  chain, which a fresh OTP wouldn't meaningfully add to. Covered by
  `tests/action-otp-gate.test.ts`.

---

## Verification needed

- **Manual click-through of the new P0 buttons on the real LINE app**
  (Add item / Edit item / Cancel / Create invoice on the quotation card).
  The underlying Odoo RPC calls (`addSaleOrderLine`, `updateSaleOrderLineQty`,
  `cancelSaleOrder`, `createInvoiceForSaleOrder`) were verified directly
  against the real staging Odoo; the on-device tap flow (prefilled-keyboard
  buttons, in particular) has not been confirmed on a live LINE client.
- **Firestore composite index** for `(phone, odooVerified)` on the `users`
  collection (powers `findVerifiedUserIdByPhone`, used by `QUOTE SEND`).
  Not created yet — no real Firestore traffic has hit that query path.
  Firestore will surface an index-creation link in the error the first time
  it's needed; click that link rather than pre-creating the index blind.

## Infra / ops follow-up

- **Staging deploy hygiene is already enforced — no separate mechanism
  needed.** Railway builds via `railway.json`'s `"builder": "DOCKERFILE"`,
  which runs `Dockerfile` against the build context `.dockerignore` defines.
  `.dockerignore` already excludes `.backup`, `clawframework`, `documents`,
  `tests`, `skills`, `ansible`, `.github`, `.vscode`, `.idea`, `.git`,
  `deploy.env.*`, `.mcp.json`, and `.env*` from ever reaching the build
  context, and the Dockerfile's stage 2 copies only `dist/` + production
  `node_modules` into the final runtime image. A `scripts/prepare-staging-deploy.sh`
  + `documents/STAGING_DEPLOY_POLICY.md` pair was added and then removed in
  this pass — it built a parallel worktree/branch mechanism that never
  actually plugged into Railway's real build path (Railway watches `main`
  and builds via Dockerfile directly), and would have reintroduced a
  permanently-diverging branch, the exact git-hygiene problem already
  cleaned up earlier this project. If the runtime-safe file list ever needs
  to change, edit `.dockerignore`/`Dockerfile` directly — that's the one
  enforced boundary, not a second script.
- **Re-enable the org policy** `constraints/iam.disableServiceAccountKeyCreation`
  on the `cns-line-oa` GCP project. It was disabled to mint the Firestore
  service-account key for Railway and never re-locked:
  `gcloud resource-manager org-policies enable-enforce constraints/iam.disableServiceAccountKeyCreation --project=cns-line-oa`
- **GitHub Actions `release.yml`** (GCP Cloud Run staging-preflight) has been
  failing since before this session, unrelated to any of this session's
  changes. Deprioritized in favor of Railway as the staging target; root
  cause not diagnosed (403 blocked job-log access without admin/`gh auth`).

## Deferred features (P2 scope, dropped deliberately)

- **Pricelist selection** on quote creation — `product.pricelist` has zero
  records on this Odoo instance right now, so there's nothing to pick from.
  Revisit once pricelists exist.
- **Salesperson / sales-team selection** on quote creation — only one
  internal Odoo user exists right now. Revisit once more salespeople are
  added; the field (`user_id`) and team (`team_id`) are already optional,
  unused columns on `sale.order`.
- **Delivery / shipment tracking** — blocked entirely. The `stock` and
  `sale_stock` apps are not installed on this Odoo instance, so there's no
  underlying feature to surface via LINE at all until that's an Odoo-side
  decision.

## Known limitations (accepted, not bugs)

- The rich-menu chat-bar label ("Tap to open") is English-only. LINE has no
  per-user-language chat-bar text without maintaining separate per-user rich
  menus (a meaningfully bigger feature than this).
- `QUOTE CREATE` always asks for customer name + phone, even when the caller
  is an already-verified admin creating their own quote — an explicit
  product decision made this session (kept for consistency/simplicity over
  saving a couple of taps).
- The optional trailing fields on the single-line `QUOTE CREATE` command
  (customer reference, note, payment term) have no comma-escaping — a comma
  inside one of them will misalign the fields after it, since `parseCsv` has
  no quoting support. Pre-existing limitation of the CSV-shaped command
  format, not introduced by this pass. The guided form (`FORM QUOTE CREATE`)
  avoids this entirely since each field is entered as its own message.

## Test coverage gap

- **Closed for the parsing/validation layer**: `parseOrderId` and
  `parseOrderIdAndProductQty` (`src/line/handlers/quotation.ts`) are now
  exported and covered in `tests/quotation-parsers.test.ts`, and
  `parseDemoQuotePayload`'s 5 new optional trailing fields are covered in
  `tests/command-validators.test.ts` — matching this codebase's existing
  test philosophy (pure parser/validator functions, not handler-level
  mocking; no test file anywhere mocks `odoo.ts`/`firestore.ts`).
- **Still not covered**: the P0 handlers' actual Odoo side-effects
  (`QUOTE ADD`/`EDIT`/`CANCEL`/`INVOICE`, `QUOTE LIST`, PDF link,
  payment-term resolution) — these were verified via live calls against
  real Odoo instead of unit tests, consistent with how every other
  Odoo-touching function in this codebase is verified (no `odoo.test.ts`
  exists at all). Would need a new mocking pattern (e.g. `vi.mock('../../services/odoo')`)
  introduced deliberately if this code needs to be safely refactored later —
  not added speculatively here since it's a genuinely new pattern for this
  codebase, not a reuse of an existing one.
