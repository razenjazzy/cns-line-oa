# Backlog

## Status as of 2026-09-03

Follow-up items after the quotation-journey P0/P1/P2 pass (quote lifecycle
actions, optional Odoo fields, "my quotations" listing, Flex design-system
hardening, rich-menu fix). Nothing here blocks what's already shipped —
these are the explicitly deferred or not-yet-verified pieces.

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
- `DEMO QUOTE` always asks for customer name + phone, even when the caller
  is an already-verified admin creating their own quote — an explicit
  product decision made this session (kept for consistency/simplicity over
  saving a couple of taps).
- The optional trailing fields on the single-line `DEMO QUOTE` command
  (customer reference, note, payment term) have no comma-escaping — a comma
  inside one of them will misalign the fields after it, since `parseCsv` has
  no quoting support. Pre-existing limitation of the CSV-shaped command
  format, not introduced by this pass. The guided form (`FORM DEMO QUOTE`)
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
