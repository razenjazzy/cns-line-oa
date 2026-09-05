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
  Drives quote creation and the lifecycle on the customer's behalf. If their
  verified Odoo partner also has a linked `res.users` login in a Sales
  security group, `ADMIN ENABLE` additionally resolves a `salesTier`
  (`salesperson`/`sales_manager`) — a `salesperson` gets the day-to-day
  actions (Confirm/Send/Add/Edit/Message) but not Cancel/Invoice, which stay
  manager-level. No linked Odoo user (the common case, and today's own test
  account) keeps the full admin action set exactly as before this existed.

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
5. `ADMIN ENABLE` additionally attempts to resolve an Odoo-native
   `salesTier` from the partner's linked `res.users` login (see Actors
   above). 🚧 — built and unit-tested at the mapper layer, but not yet
   click-tested end-to-end on a live LINE client against a real tiered
   Sales User/Manager Odoo login (none exists yet to test against).

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
12a. `QUOTE REMOVE <id> <product>` — delete an existing line entirely
    (mirrors Odoo web's own line-delete). ✅
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

- `USER`/`SERVICE` CRUD via guided forms. ✅ — step-up-OTP-gated (closed 2026-09-05, `tests/action-otp-gate.test.ts`)
- `DAILY REPORT` (AI-summarized daily report), `SEGMENT CUSTOMERS` (segmentation + targeted multicast). ✅
- `/ops/audit-log` + BigQuery archive/rotation, `/ops/kpi`, `/ops/workflow-audit`. ✅
- CLI (`cns`) and MCP server exposing the same ops endpoints as agent tools. ✅

## UX/polish feedback items — mostly closed 2026-09-05

These come directly from your last two rounds of feedback. Three of the
four are now shipped (rich menu, `GUIDE`, header consistency); the
remaining two are real scope, just not attempted yet:

- ✅ Rich-menu redesign — closed 2026-09-05. The live account's rich menu
  (`richmenu-5e5e12e9...`, "Cloudnex Card Menu EN") wasn't set as default
  and had two real bugs: "Order Status" sent `DEMO ORDER`, a command
  renamed away long ago with zero handler matches left in the codebase
  (would have silently done nothing for a real user); "Language" always
  sent the fixed `LANG TH` (no real toggle). Created a new rich menu
  (`richmenu-ca2d88b1...`, chatBarText "เมนู / Menu" replacing the generic
  "Tap to open") with the same 6-button layout but `ORDER STATUS` and the
  new bare `LANG` toggle (see `src/line/handlers/language.ts`) in place of
  the two broken actions, and set it as the account's active default —
  confirmed live via `get_rich_menu_list`. The old menu was left in place,
  inactive, as a rollback option (user's choice) rather than deleted.
- ✅ `GUIDE`/help command redesign — closed 2026-09-05. `GUIDE` now shows a
  tappable category menu (8 topics, mirroring service-catalog.ts's
  ServiceKeys plus 3 general ones); each topic drills into
  `GUIDE <category>`, a card of prefill buttons (tap → keyboard opens
  pre-filled with a real, editable example command) instead of one long
  plain-text wall. Also closed a real content gap found in the process:
  the old guide never mentioned the quote lifecycle (`QUOTE ADD`/`EDIT`/
  `CANCEL`/etc.), `MESSAGE CUSTOMER`, `QUOTE STATUS`/`LIST`, `VERIFY START`,
  or any Group-Buy command — all shipped features that had no guide entry
  at all. Now covered (`src/line/command-guide.ts`, `src/line/templates/guide.ts`).
- ✅ Consistent header treatment (meaningful title/subtitle) across every
  Flex card — closed 2026-09-05. Three outliers found and fixed:
  `createDailyReportFlexMessage` and `createQuotationListFlexMessage` had
  title-only headers (no subtitle line, and the daily report was also
  missing `paddingAll`) where every other card already had both;
  `createAdminConfigFlexMessage` used `BRAND.tealStrong` for its header
  background where every other card uses `BRAND.teal`. All three now
  match the dominant pattern. Action buttons were not added to headers —
  no card in this codebase puts buttons there today (including the
  quotation journey card, on closer look); actions live in the footer
  everywhere, so that stays as-is rather than inventing a new pattern.
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
| Enterprise-grade hardening (auth, audit, step-up security) | **~95%** (was ~70%) | Step-up OTP (now covering the full quote lifecycle **and** `USER`/`SERVICE` CRUD), full admin-authorization chain, audit trail + archive, `ADMIN CONFIG` UI, ansible fallback-secret removal, `salesTier` Odoo-role gating, `tests/http-auth.test.ts`/`tests/action-otp-gate.test.ts` regression coverage, and Track A3's audit sweep (which found and fixed a real authorization bypass on `DAILY REPORT`/`SEGMENT CUSTOMERS`) are all shipped since this was last written (see `ENTERPRISE_ROADMAP.md` — security now scores 10/10). Remaining gap: Odoo-touching handlers still have no automated test coverage beyond live verification (a deliberate choice — no mocking pattern exists yet for `odoo.ts`, not introduced speculatively). |
| UX consistency & polish | **~95%** (was ~50%) | Every item on this pass's list is now shipped: design-system pass, picker chips, the summary card, the per-card header consistency sweep, the `GUIDE` overhaul, and the rich-menu redesign (which also fixed a live, real bug — a broken button no real user could have used). Remaining: natural-language/fuzzy matching against real phrasing variety, and multi-channel broadcast outside a customer's Odoo-linked identity — both still explicitly not started, per the "Not built yet" list above. |

**Overall: roughly 3/4 of the core sales journey is built and verified.**
The remaining quarter splits between genuinely blocked items (Odoo
configuration, not this codebase's job) and UX/polish work that's been
scoped but not built yet.

---

## UI/UX feedback round — 2026-09-05

A 10-item feedback batch, mostly bug reports from real testing. Each was
investigated against the actual code (not assumed) before any fix — three
turned out to be real, confirmed, previously-unreported bugs; two were
confirmed working-as-designed with an explanation; the rest were shipped
as scoped enhancements.

- ✅ **Nav menu font size** — LINE's `type: 'button'` component has no
  `size` property at all (client-controlled fixed font); converted the
  Home menu and per-service action menus to tappable text rows
  (`createTapRow`, `size: 'lg'`) instead.
- ✅ **Verify link broken** — real bug: no `app.set('trust proxy', ...)`
  meant `req.protocol` reported the reverse proxy's internal `http` hop
  instead of the real public `https`, so the magic link came out dead on
  Railway (or any similar deployment). Fixed, verified live via
  `X-Forwarded-Proto`. Recommend also setting `PUBLIC_BASE_URL` and
  `LINE_CHANNEL_BASIC_ID` in the real deployed environment — both are
  unset in `.env` here, which weakens the link/return-to-chat fallback
  further even with the code fix in place.
- **Customer shown as "Line OA Demo"** — confirmed not a bug: that's the
  real linked Odoo partner's actual name (`order.partner_id`). User will
  rename the partner record directly in Odoo.
- ✅ **Optional-fields "losing its previous trail"** — a real,
  reproducible bug, not user error: answering one optional field could
  silently overwrite a *different* field's already-collected answer.
  Root cause: Firestore's `.set(data, {merge: true})` doesn't clear a
  nested field that's simply omitted from a write, only one explicitly
  set — traced to `editingFieldIndex`'s clear-on-answer path, fixed with
  the same null-as-clear-marker convention `salesTier` already uses, and
  covered by a new regression test.
- ✅ **Checkbox display + default value** — added ☑/☐ glyphs to the
  optional-fields summary card, and a computed default (+30 days) for
  the quote's "Valid until" field — still fully editable/clearable.
- **Language default & toggle** — confirmed already correct: new users
  default to English (`DEFAULT_LANGUAGE` env), and the nav footer's
  Language button already toggles both directions correctly per-request.
- ✅ **Product search picker** — `PRODUCT FIND` was hardcoded 3 layers
  deep to return only 1 result even when several products matched (e.g.
  "App" matching multiple plans), silently acting on whichever Odoo
  returned first. Added a real multi-match query and a picker card shown
  when a search is ambiguous.
- ✅ **Language consistency in AI fallback tiers** — two real gaps found:
  the ClawFramework bridge tier (dev/staging only) passed zero language
  instruction to the model at all; Gemini's system instruction didn't
  address what to do when the user's own message is in the other
  language (a known LLM drift pattern). Both strengthened — the Gemini
  fix is a probabilistic improvement, not a hard guarantee, since free-text
  model output can't be deterministically forced the way template-driven
  replies can.
- **"Where's the Send button/feature"** — confirmed it exists (`QUOTE
  SEND`) and works end-to-end; it's only shown while a quote is in
  draft/sent state and disappears after Confirm, matching Odoo's own
  button-visibility convention. Likely just missed if tested against an
  already-confirmed quote.
- ✅ **Card compactness + interactive human handoff** — `HUMAN OFF`/
  `RESUME BOT` (new) lets a user de-escalate; the AI-chat fallback now
  checks escalation state first and steps aside with a resume button
  instead of talking over a real person. Quotation-journey and
  product-detail card footers now merge the trailing Home button into
  the last row instead of always giving it a dedicated one, cutting one
  row in most states without cramming any row past 2 buttons.
