# Enterprise Roadmap — Odoo-native permissions, admin config UI, multi-ERP stance, and a scored gap analysis

## Status as of 2026-09-04

This is a planning document, not a changelog — nothing here is built yet.
The Odoo-permissions piece in particular touches the authorization chain
`CLAUDE.md` explicitly protects ("Do not weaken or bypass any link in this
chain"), so it's written up for your review before any code changes, same
as every other architecturally-significant change this session went
through Plan Mode for.

---

## 1. Odoo-native role/permission-based actions

### What you asked
Send/Confirm/Add/Edit (and the rest) should be gated by the verified
person's *actual Odoo role and permissions* — not a separate LINE-only
admin flag — so a Sales User and a Sales Manager (as Odoo itself defines
them) get different actions automatically.

### What I found, live, against the real Odoo instance

- **The admin account currently used for testing has no linked `res.users`
  login at all** — `res.users.search_read([['partner_id','=',12]])` returns
  `[]`. This matters a lot: Odoo's `res.partner` (a contact/customer) and
  `res.users` (an actual employee login with security groups) are related
  but separate models. `VERIFY START` today only ever binds to a
  **partner** — it has no path to a `res.users` record at all. Odoo-native
  role checking is *only possible* for a LINE user whose phone belongs to
  someone who **also** has a real Odoo employee login — true for genuine
  sales staff, never true for an ordinary customer (correctly — customers
  shouldn't have Odoo logins).
- **Field names differ from the Odoo docs you'll find online.** This
  instance (Odoo SaaS 19.3) has renamed the classic `groups_id` field to
  `group_ids`/`all_group_ids` on `res.users`, and `res.groups` has no
  `category_id` field the way older Odoo versions did. Any implementation
  needs to discover the real field names live (same pattern `getPartnerPhoneFields`
  in `odoo.ts` already uses for `res.partner.mobile` variability) rather
  than hardcoding field names from memory or generic docs.

### Proposed design (additive — does not touch the protected chain)

The existing chain stays exactly as-is: LINE identity → `profile.odooVerified`
→ `ADMIN_USER_ID` allowlist (fails closed) → Odoo admin-capability
precondition → `profile.role = 'admin'`. This proposal adds a **second,
finer-grained layer on top**, only for users who already cleared that gate:

1. **`VERIFY START`/`ADMIN ENABLE`** additionally attempts to resolve the
   verified partner's linked `res.users` record (`res.users.search_read`
   by `partner_id`). Not found → no change from today's behavior (plain
   `admin`/`user` role, full admin action set for `admin` — same as now).
2. **When found**, read that user's `group_ids` (real field name,
   discovered live) and check membership in Odoo's own Sales security
   groups (`sales_team.group_sale_salesman` vs `sales_team.group_sale_manager`,
   to be confirmed present via `res.groups` once the right query field is
   found on this instance).
3. Store a coarse `profile.salesTier: 'salesperson' | 'sales_manager' | undefined`
   — not the raw group list, so every call site checks one simple value.
4. **Button/handler gating becomes tiered, not just binary**: e.g. a
   `salesperson` gets Add/Edit/Send/Approve-response but not Cancel/Invoice
   (Odoo's own convention: cancellation and invoicing are typically
   manager-level actions); `sales_manager` gets everything `admin` gets
   today. Undefined tier (no linked Odoo user, or Odoo user with neither
   group) → **falls back to today's plain admin/customer behavior** —
   fails toward the current known-good state, never toward more access.

### Step-by-step to-dos

- [ ] Confirm with you: is `partner 12` (your current test account)
  *supposed* to have a real Odoo employee login, or is it a customer
  contact being used for admin testing? This decides whether the fallback
  path (today's binary admin/customer) needs to stay the *primary* path
  for your own testing, or whether you'll set up a proper linked
  `res.users` login to test the tiered behavior for real.
- [ ] Live field-discovery script (same technique used all session) to
  nail down the exact `res.groups`/security-group field names and IDs on
  this instance for Sales User vs Sales Manager.
- [ ] Extend `UserProfile`/Firestore with `salesTier`, written during
  `VERIFY`/`ADMIN ENABLE`, read-only elsewhere.
- [ ] Change `createQuotationJourneyFlexMessage`'s `options.role` from a
  binary `'admin' | 'customer'` to also carry `salesTier`, and gate each
  footer button individually instead of the current single `role === 'admin'` check.
- [ ] Mirror the same tiering in each handler's server-side check
  (`quotation.ts`) — never trust which buttons the client rendered, same
  discipline already used for `QUOTE APPROVE`'s partner-id check.
- [ ] Update `documents/STORYBOARD.md` once shipped.

---

## 2. Admin configuration UI — grouped Odoo-feature toggles

### What you asked
A configurable command/button/grid UX to group Odoo features for easy
on/off configuration.

### What already exists to build on
`src/services/service-catalog.ts` is already the single source of truth
for which commands belong to which feature group (`commerce`, `directory`,
`catalog`, `reporting`, `groupBuy`), and `src/line/channels.ts` +
`getChannelServiceOverride`/`setChannelServiceOverride` already implement
**per-channel, Firestore-backed, runtime-toggleable** feature flags — this
exact capability already exists, just not exposed as a friendly admin UI.

### Proposed design

- New `ADMIN CONFIG` command (admin-only) → a Flex card listing every
  `ServiceKey` (`Products & Quotes`, `Customers`, `Catalog`, `Reporting`,
  `Group-Buy`) as a toggle row — reusing the box-with-`action` tappable-row
  pattern already built for the quotation list this session (readable
  text, not squeezed into a button label), each row showing current
  on/off state and toggling via `ADMIN CHANNEL <id> <service> on/off`,
  which **already exists** as a command (`src/line/handlers/admin.ts`) —
  this is mostly a *UI* layer over an *already-built* backend, the
  cheapest item on this whole list.
- Group the toggle list visually (one card section per `ServiceKey`) so
  it reads as a grid, not a flat list — same rounded-row treatment as
  every other card this session.

### Step-by-step to-dos

- [ ] New `createAdminConfigFlexMessage` in `templates.ts` (reuse existing
  row/toggle visual patterns, no new component type needed).
- [ ] New `ADMIN CONFIG [channelId]` handler rendering it, admin-only.
- [ ] Confirm tapping a toggle round-trips through the *existing*
  `ADMIN CHANNEL` command rather than a new one — should need zero backend
  changes, this is a pure UI addition.

---

## 3. Multi-ERP integration architecture

### What you asked
Design the integration scope so Odoo isn't the only ERP this could ever
talk to.

### Honest recommendation: don't build the abstraction yet

`CLAUDE.md` is explicit about this exact situation: *"Do not... Create
generic frameworks without a concrete requirement."* There is no second
ERP integration requirement today — building an abstraction layer for a
hypothetical SAP/NetSuite/Dynamics integration right now would be
speculative generalization with no way to validate the abstraction is
even right, until a real second ERP shows up with its own constraints.

**What's worth doing instead, cheaply, now:** the seam already exists in
practice — every Odoo-specific call already funnels through
`src/services/odoo.ts`'s exported functions (`findProductByQuery`,
`createQuotationFromLine`, `confirmSaleOrder`, etc.), never called
directly from handler files against raw Odoo RPC shapes. That's already
the right shape for a future adapter boundary. The only concrete step
worth taking today is a short section in `CLAUDE.md` itself recording that
discipline explicitly, so it doesn't erode as more Odoo functions get
added — not a new interface/class hierarchy with no second implementation
to validate it against.

### Step-by-step to-dos (deliberately small)

- [ ] Add one paragraph to `CLAUDE.md`'s Odoo Services section: "all
  ERP-specific calls go through `src/services/odoo.ts`'s exported
  functions; a handler file must never call Odoo RPC directly" — codifying
  the boundary that already exists as a rule, not a refactor.
- [ ] Defer any actual `ErpAdapter` interface/second-implementation work
  until a real second ERP is in scope — revisit this section then.

---

## 4. Enterprise-grade scorecard (10/10 target)

| Dimension | Score | Why | To close the gap |
|---|---|---|---|
| **Feature completeness** (core Sales journey) | 8/10 | Full Quotation → Sales Order → Invoice lifecycle built & verified (`STORYBOARD.md`). Gaps: delivery (Odoo-blocked), pricelist/salesperson (no data yet), line removal (qty-edit only, no delete-a-line). | [ ] Add `QUOTE REMOVE <id> <product>` (delete a line entirely). [ ] Revisit pricelist/salesperson once Odoo has data. |
| **Security** | 7/10 | Full fail-closed admin chain, step-up OTP on every quote mutation, audit trail + BigQuery archive, ops-token-protected endpoints. Gaps: `USER`/`SERVICE` CRUD not step-up-gated; permissions are LINE-flag-based, not Odoo-role-based (this doc, section 1); no automated tests for the Odoo-touching handlers (verified live instead). | [ ] Extend step-up OTP's `GATED_MUTATION_PREFIXES` to `USER`/`SERVICE` CRUD. [ ] Section 1 above. [ ] Add `vi.mock('../../services/odoo')`-based handler tests if this code needs safe refactoring later. |
| **Configurability** | 6/10 | Per-channel service enable/disable already exists and is Firestore-backed (runtime-toggleable, no redeploy needed) — but has no admin-friendly UI (section 2), and language/copy is bilingual-hardcoded rather than a configurable string table beyond the quotation feature's own `i18n.ts`. | [ ] Section 2 above. [ ] Consider extending `i18n.ts`'s pattern to the rest of the app's inline `tr()` calls — large, flagged as low-value churn in `i18n.ts`'s own comments; revisit only if a third language is ever actually needed. |
| **Overall architecture / design quality** | 8/10 | Clean handler-registry plugin pattern, single source of truth for service gating, consistent Flex design system, dual Firestore/in-memory store pattern applied consistently, ops/CLI/MCP all sharing one HTTP surface. Gaps: the ERP boundary is implicit rather than documented (section 3); no per-tier permission model yet (section 1). | [ ] Section 3's one-paragraph `CLAUDE.md` addition. [ ] Section 1, once you've confirmed the design. |

**Nothing above is started** — this is the plan, laid out so you can pick
what to greenlight rather than me guessing at your priority order across
four genuinely separate initiatives.

---

## On `.backup/clawframework-vendor` / `claw-code-main.zip`

Checked a third way this round: neither location has a `.git` directory,
so there's no history to recover either. Confirmed via three independent
checks now (file contents, bytecode-only confirmation, git history) across
two separate locations on this machine. I'm not going to keep re-searching
the same places — if the real source exists, it's somewhere I haven't been
told about yet (another path, an external drive, a GitHub URL, a package
name to `pip install`/`npm install`). Point me at it and I'll go straight
there; until then there's nothing to "utilize" because there's nothing
there to read.
