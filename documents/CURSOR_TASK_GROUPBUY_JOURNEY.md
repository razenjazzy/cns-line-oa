# Cursor task: Group-Buy into the tappable journey + proactive notifications

Operate under this repo's existing protocol — `CURSOR.md` (execution pipeline)
and `AGENTS.md` (token budget rules). Do not re-derive the architecture
already documented there; this brief hands you the two confirmed gaps and
the exact reference patterns to mirror. Read only what's cited below plus
whatever `AGENTS.md`'s "Tool-First Reconnaissance" step tells you to check
live (build/tests).

## Why this task exists

User-facing goal: every necessity should be reachable "within a fingertip"
(tap, not type) via the LINE rich menu / nav / quick-replies, and the bot
should proactively notify users on state changes rather than requiring them
to poll. Two verified gaps against that goal, confirmed by direct grep
against current `main`:

1. **Group-Buy has no tap path.** `documents/USER_JOURNEY.md`'s compact
   2×3 tray is Home / Verify / Products & Quotes / Order Status / Help /
   Language — no Group-Buy. `START/JOIN/STATUS/CONFIRM/CANCEL GROUPBUY`
   are typed-command-only today (`src/services/group-buy.ts`,
   `src/line/handlers/group-buy.ts`).
2. **Group-Buy has no push notifications.** `src/line/quote-notify.ts`
   already pushes a Flex card to customer + sales admins on every
   quote/order state change (`notifyQuoteParties`, used throughout
   `src/line/handlers/quotation.ts` and `commerce.ts`). Group-Buy has no
   equivalent — nothing pushes when a session reaches target, is about to
   expire, gets confirmed (Odoo order created), or is cancelled.

## Scope

### A. Tap path for Group-Buy

- Add a `NAV groupBuy` (or existing service key — check
  `src/services/service-catalog.ts` for the current key/labels) entry to
  the home menu Flex (`src/line/templates/navigation.ts` or wherever the
  home-menu builder now lives post-split — see `AGENTS.md`'s note on
  `src/line/templates.ts` → `src/line/templates/*`).
- Add quick-reply chips for the in-flight actions a participant actually
  taps repeatedly: `JOIN GROUPBUY <id>`, `STATUS GROUPBUY <id>`, and (for
  the creator/admin) `CONFIRM GROUPBUY <id>` / `CANCEL GROUPBUY <id>` —
  mirror the chip pattern already used in `src/line/templates/quotation.ts`
  and `src/line/templates/forms.ts` (`quickReply` usage), not a new pattern.
- If the rich-menu image itself needs a 7th/replacement tile, that's a
  **separate** ask requiring new PNG art (`scripts/generate-rich-menu.mjs`,
  `npm run rich-menu:generate` / `:upload`) — don't block this task on
  that; a `NAV groupBuy` button inside the existing Home Flex (not the
  native LINE tray image) satisfies "within a fingertip" without touching
  frozen tray art. `documents/USER_JOURNEY.md`'s "Design freeze" section
  says: don't restyle existing Flex/tray, but adding a new home-menu row is
  additive, not a restyle.

### B. Proactive notifications for Group-Buy lifecycle

Add a `notifyGroupBuyParties`-style function (mirror
`notifyQuoteParties`'s shape in `src/line/quote-notify.ts`: resolve
recipient LINE user IDs, build a Flex card via
`sendTargetedFlexMessage`/`src/line/messaging.ts`, non-fatal try/catch at
every call site) covering these events, called from
`src/services/group-buy.ts` / `src/line/handlers/group-buy.ts`:

1. **Target reached** — push to the creator (and admins?) that the session
   is ready for `CONFIRM GROUPBUY`.
2. **Expiring soon** — if there's a scheduled/cron surface already in this
   repo (check `src/jobs/`), hook into it; otherwise flag as needing one
   rather than inventing a new scheduler.
3. **Confirmed** — push to every participant with the resulting Odoo order
   reference (group-buy confirm already creates a real Odoo quotation per
   existing code — reuse that reference, don't refetch).
4. **Cancelled** — push to every participant.

Every participant's LINE user ID is already the join-command's `userId` —
no new identity resolution needed (unlike quote-notify's phone/partner
lookup, participants are already LINE-identified).

## Constraints (from `AGENTS.md` — do not violate)

- No new dependencies.
- No duplicated routing — go through `resolveCommandReply`, don't add a
  parallel dispatch path.
- No auth-chain weakening — CONFIRM/CANCEL stay creator-or-admin only,
  per existing `group-buy.ts` checks.
- Barrel-preserving if you touch a split file (`templates.ts`,
  `firestore.ts`, `odoo.ts`, `index.ts` all have compatibility re-exports
  at their original path per `AGENTS.md` — don't update every import site).
- Keep behavior stable outside Group-Buy — this is additive, not a
  refactor of quote/order flows.

## Definition of done

- `npm run build` and the smallest relevant Vitest file(s) (group-buy,
  templates, messaging) pass; run the full suite only if shared behavior
  changed (`AGENTS.md` rule).
- Tap-only path: a user can join, check status, and (as creator/admin)
  confirm/cancel a group-buy without typing anything beyond the initial
  `START GROUPBUY <product>,<targetQty>,<hours?>`.
- Manual verification via `/webhook-test` or the `cns` CLI
  (`npm run cli -- chat "..."`) showing the new NAV entry and at least one
  notification firing (confirm or cancel) with real reply payloads pasted
  into your summary — not just "tests pass."
- Append new steps to `documents/USER_JOURNEY.md` (new lettered section,
  same format as A–D) and note capability status in
  `documents/STORYBOARD.md`, matching how prior UI-feedback rounds were
  recorded there — don't invent a new documentation format.
- Summary states exactly which files changed and which of the 4
  notification events (target-reached / expiring / confirmed / cancelled)
  got shipped vs. flagged as needing a scheduler that doesn't exist yet.
