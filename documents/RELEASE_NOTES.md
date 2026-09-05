# Release notes — v1.0.0

**Date:** 2026-09-06  
**Package version:** `1.0.0` (already set in `package.json`)  
**Git tag (local, after cut):** `v1.0.0`

Initial production cut of **cns-line-oa**: LINE Official Account → Firestore identity → one `resolveCommandReply` → Flex. ERP only via `getErpAdapter()`.

## What shipped

### Features

- **Quotation workflow:** Odoo Confirm → Send → Invoice on the journey card, including `invoice_status` and `amount_invoiced`.
- **LINE Flex UI:** One visual language (list rows, footer CTAs, chips). Tappable next step; no Material widgets (LINE cannot host those).
- **Pagination:** Opaque cursor (`date_order,id`) for My quotations, replacing offset as the Next 5 path. Offset still accepted for old in-chat buttons.

### Security

- 15-minute TTL bound postbacks (`kind|userId|exp`).
- Authenticated admin chain unchanged (fail closed).
- Confirm/Send/Approve stay server-authorized. Product create uses product id, not a CSV fragment of the name.

### UX fixes

- Recovery is always a button: PDPA, voice fail, missing product, quote reload fail.
- Seeded quote-from-product-card skips re-asking the product name.

## Out of scope (v2 roadmap)

- Register payment
- Deliveries / pickings
- Credit notes
- CRM
- LIFF mini-app
- Unbounded `fields_get`

## Staging check (do this before push)

Set `APP_ENV=staging` (Railway image uses `NODE_ENV=production`). Walk:

`Home → product → quote qty → Confirm/Send → OTP Verify → list Next 5`

See `documents/ENVIRONMENTS.md` and `documents/RAILWAY_STAGING.md`.

## Push (not run in this cut)

```bash
git push origin main
git push origin v1.0.0
```

Wait for confirmation before those commands. CI/CD starts on push.
