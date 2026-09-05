# Changelog

## v1.0.0 — Initial Release (2026-09-06)

Production cut of the Cloudnex LINE Official Account bot for Odoo sales.

### Features

- Odoo quotation lifecycle in LINE: Confirm, Send (composer + mail adapter + LINE card if linked), Invoice, customer Confirm (`QUOTE APPROVE`).
- Journey card shows `invoice_status` and `amount_invoiced` from the same order read.
- Unified LINE Flex visual language: tap-rows, footer CTAs, chips, `paddingBottom: lg`, tappable next step on cards.
- Opaque quote-list pagination (`date_order,id` cursor) with Next 5; date From/To pickers.
- Product-id form seeding (`FORM QUOTE CREATE FROM CARD` / `QUOTE CREATE id:<n>,...`) so product names with commas cannot break CSV.

### Security

- HMAC LINE webhook; Firestore identity; admin chain LINE id → profile → `odooVerified` → `ADMIN_USER_ID` → Odoo admin capability → `role=admin`.
- Postbacks allowlisted and bound as `kind|userId|exp` (15-minute TTL). Mutations such as Confirm/Send never run from raw `data`.
- OTP is not written to logs. Email on the send composer is admin-only.

### UX

- No “type the command” as the only recovery: PDPA (My data / Delete), voice fail (Home), missing product (Find product), reload fail (Check status).
- Optional form fields hide empty values; payment-term lists; LINE date picker for validity.

### Out of scope (v2)

- Register payment, deliveries/pickings, credit notes, CRM.
- Live Odoo `fields_get` of entire models (curated `skills/odoo-fields` only).
- LIFF / web mini-app.

### Verification

- `npx tsc --noEmit`
- Targeted Vitest including postback, Flex UX, quote-list cursor, guided forms, command validators, ERP adapter, service catalog.
