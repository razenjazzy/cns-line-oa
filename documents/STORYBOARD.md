# Storyboard — Odoo Sales via LINE OA

## Status as of 2026-09-04

A step-by-step walkthrough of the actual Sales-user and customer journey as
it exists today, built from what's actually shipped and verified this
session (not aspirational — every ✅ item has been live-tested against the
real staging Odoo). Cross-references `documents/BACKLOG.md` for what's
explicitly deferred or blocked, rather than duplicating that detail here.

**Legend:** ✅ built & live-verified · 🚧 built, not yet click-tested on a
real device · ⬜ not built · 🔒 blocked by Odoo-side configuration, not code

---

## Actors

- **Customer** — starts unverified; some actions (approving their own
  quote) require completing identity verification first.
- **Sales / Admin user** — a LINE user who has verified their Odoo identity
  *and* is on the `ADMIN_USER_ID` allowlist (`src/services/admin-authorization.ts`).
  Drives quote creation and the lifecycle on the customer's behalf.

---

## Phase 1 — Onboarding & identity

1. Anyone messages the OA for the first time → PDPA data-collection notice
   (once) + the Flex Home menu. ✅
2. `VERIFY START <phone>` → Odoo partner lookup, OTP + magic-link challenge
   created, reply shows a tappable "Verify now" button (not raw text). ✅
3. `VERIFY OTP <code>` (typed) **or** tapping the magic link → verified.
   The magic-link path now auto-returns to the LINE chat (`LINE_CHANNEL_BASIC_ID`
   deep link + auto-redirect) instead of stranding the user in-browser, and
   pushes a Flex success card with a Home button instead of plain text. ✅
   *(both were real bugs fixed this session)*
4. `ADMIN VERIFY` / `ADMIN ENABLE` → elevates to admin role. Full chain:
   LINE identity → `odooVerified` → `ADMIN_USER_ID` allowlist → Odoo
   admin-capability check → role grant, audited. ✅

## Phase 2 — Product & catalog discovery

5. `PRODUCT FIND <name>` / `FORM PRODUCT FIND` → product lookup; the
   guided form shows real product names as tappable chips instead of
   requiring exact typing. ✅
6. `SERVICE LIST` / `FORM SERVICE READ` (+ `UPDATE`/`DELETE`, admin) →
   service catalog, same picker-chip treatment. ✅

## Phase 3 — Quotation creation (the core Sales flow)

7. `FORM QUOTE CREATE` → 4 mandatory fields one at a time (product via
   picker, quantity, customer name, phone) → **one grouped summary card**
   for the 5 optional fields (customer reference, discount %, payment
   term, note, validity date) — tap any to fill it and return to the same
   card, or finalize immediately with whatever's set. ✅
8. If the caller is already Odoo-verified, creating the quote requires a
   **fresh step-up OTP** (shown inline, 10-minute window) before it
   actually runs — re-proves identity for a create/edit/delete action,
   separate from the one-time `odooVerified` flag. ✅
9. Quote created → rich journey card: Odoo-matching status bar
   (Quotation → Quotation Sent → Sales Order), line items as readable
   rows, total, role-aware action buttons. ✅

## Phase 4 — Quotation lifecycle (admin-driven)

10. `QUOTE STATUS <id>` / `QUOTE LIST [phone]` — view-only, **not**
    step-up-gated. List rows show name, status, date, and total as plain
    readable text (not squeezed into a 20-char button label). ✅
11. `QUOTE ADD <id> <product>,<qty>` — add a line; rejects re-adding a
    product already on the quote (points at `QUOTE EDIT` instead) rather
    than silently creating a duplicate line. ✅
12. `QUOTE EDIT <id> <product>,<qty>` — change an existing line's quantity. ✅
13. `QUOTE CANCEL <id>`. ✅
14. `QUOTE CONFIRM <id>` — Quotation → Sales Order; customer is pushed the
    updated card automatically. ✅
15. `QUOTE SEND <id>` — pushes the Approve/View card to the customer
    (requires them already verified — LINE can't message someone who's
    never interacted with the OA; the admin is told plainly if the
    customer isn't linked, not left guessing). ✅
16. `QUOTE APPROVE <id>` — customer-only; server-side checks the order's
    `partner_id` actually matches the requester's own `odooPartnerId`
    before approving, regardless of which buttons the client happened to
    render. ✅
17. `QUOTE INVOICE <id>` — mirrors Odoo web's own "Create Invoice" button
    exactly (same wizard action, same `invoice_status === 'to invoice'`
    visibility condition). ✅
18. `QUOTE MESSAGE <id> <text>` — admin sends a short custom message to
    that quote's customer (transactional, no marketing-consent check
    needed). ✅
19. Steps 11–18 (every mutation) require the same fresh step-up OTP as
    quote creation. ✅

## Phase 5 — Documents & links

20. Every journey card offers "View Quote" (Odoo's own portal share link)
    and "Download PDF" (same link + `report_type=pdf`, confirmed to
    return a real PDF). ✅
21. `ORDER STATUS <ref>` now renders the **same** rich card as `QUOTE STATUS`
    instead of a bare text summary — one consistent design, not two. ✅

## Phase 6 — Sales ↔ customer messaging beyond a specific quote

22. `MESSAGE CUSTOMER <phone> <text>` / `FORM MESSAGE CUSTOMER` — general
    tool, admin-only, checks `profile.marketingOptIn` first (same gate
    the segmentation/broadcast job already used) and refuses rather than
    silently sending to someone who hasn't opted in via `PROMO ON`. ✅

## Phase 7 — Admin/ops surface (parallel track, not sales-journey-specific)

- `USER`/`SERVICE` CRUD via guided forms. ✅ — **not** step-up-OTP-gated yet (scoped out this pass, noted in BACKLOG.md)
- `DAILY REPORT` (AI-summarized daily report), `SEGMENT CUSTOMERS` (segmentation + targeted multicast). ✅
- `/ops/audit-log` + BigQuery archive/rotation, `/ops/kpi`, `/ops/workflow-audit`. ✅
- CLI (`cns`) and MCP server exposing the same ops endpoints as agent tools. ✅

## Not built yet — explicitly requested, not started

These come directly from your last two rounds of feedback and are real
scope, just not attempted in this pass:

- ⬜ Rich-menu (persistent bottom menu) font/legibility and a multi-purpose
  redesign (Home/Help/Search/Language icons; "Tap to open" → a
  purpose-specific label).
- ⬜ `GUIDE`/help command redesign — numbered/bulleted, nested interactive
  buttons ("smart IVR"-style) instead of a plain text wall.
- ⬜ Consistent header treatment (relevant action buttons + meaningful
  title/subtitle) across every Flex card — some cards already do this
  well (the quotation journey card), others are plainer.
- ⬜ Natural-language / fuzzy command matching ("add quotation" and similar
  phrasings resolving to the right command) — partially covered today by
  the keyword-guidance step and the Gemini AI fallback, not evaluated
  against real phrasing variety yet.
- ⬜ Multi-channel broadcast to a customer *outside* their Odoo-linked
  identity — today every messaging path (`QUOTE MESSAGE`, `MESSAGE
  CUSTOMER`, segmentation) requires a verified, Odoo-linked LINE user.

## Blocked — not code, Odoo-side decisions

- 🔒 Delivery/shipment tracking — the `stock`/`sale_stock` apps aren't
  installed on this Odoo instance at all.
- 🔒 Pricelist selection — zero pricelists exist right now.
- 🔒 Salesperson/team assignment — only one internal Odoo user exists.

## Deferred, scope not yet agreed

- **"Edit/delete for authorized users"** — raised, then explicitly parked
  by request for a separate conversation (see BACKLOG.md).
- **Private-channel / QR-code distribution** — a LINE Official Account
  Manager platform setting, not something this codebase controls.

---

## Rough completion estimate

A single number undersells how uneven this is across dimensions, but as a
working estimate:

| Area | Estimate | Basis |
|---|---|---|
| Core Quotation → Sales Order → Invoice lifecycle | **~85–90%** | Every step in Phases 3–5 is built and live-verified; the gap is almost entirely Odoo-side blocks (delivery, pricelists), not missing code. |
| Enterprise-grade hardening (auth, audit, step-up security) | **~70%** | Step-up OTP, full admin-authorization chain, audit trail + archive all shipped; `USER`/`SERVICE` CRUD isn't step-up-gated yet, and Odoo-touching handlers have no automated test coverage (verified live instead — see BACKLOG.md). |
| UX consistency & polish | **~50%** | Design-system pass, picker chips, and the summary card shipped broadly; the rich-menu redesign, `GUIDE` overhaul, and per-card header consistency sweep are explicitly not started. |

**Overall: roughly 3/4 of the core sales journey is built and verified.**
The remaining quarter splits between genuinely blocked items (Odoo
configuration, not this codebase's job) and UX/polish work that's been
scoped but not built yet.
