# Cursor task: Live feature toggles for LINE OA Sales Administration

Operate under `CURSOR.md` / `AGENTS.md`. This brief includes the decided
final UX for both platforms — implement against this spec, don't redesign
it. If a step conflicts with something you find in code, the code's
existing security/gating behavior wins; flag the conflict instead of
silently picking one.

## Scope correction — read this before touching auth

This is **Sales Administration for the LINE OA**, not generic Odoo/ERP
admin. The connected Odoo instance is a single Sales app — there is no
multi-module ERP admin surface here, and the feature being toggled is
LINE bot commands, not Odoo configuration.

Two authorization concepts already exist in this codebase and must not be
conflated:

| Concept | What it is | Where it lives |
|---|---|---|
| `profile.role === 'admin'` | LINE-bot infra admin (seed data, `ADMIN VERIFY/ENABLE/DISABLE/ACCESS`) — allowlisted via `ADMIN_USER_ID`, fail-closed | `src/services/admin-authorization.ts`, `src/line/handlers/admin.ts` |
| `salesTier === 'sales_manager'` | **Sales Administrator** — derived live from the user's linked Odoo partner's Sales-app group (Sales Administrator vs. Sales User), synced by `syncStaffProfile` | `src/line/quote-access.ts`, `src/services/odoo/admin.ts` |

The existing canonical check to reuse, verbatim, is `canManageQuoteLines`
in `src/line/quote-access.ts`:

```ts
export const canManageQuoteLines = (profile: QuoteActor): boolean =>
  profile.salesTier === 'sales_manager' || profile.role === 'admin';
```

**This is the gate for the feature-toggle command below — a Sales
Administrator, with LINE infra-admin as a fallback/superuser, not the
`role === 'admin'` allowlist alone.** Do not invent a new gate function;
import and reuse `canManageQuoteLines`.

## Problem (verified, not assumed)

Every on/off switch in this app today is env-var + redeploy only:
`ENABLED_SERVICES`, `LINE_CHANNEL_<ID>_SERVICES` (`src/services/service-catalog.ts`,
`src/line/channels.ts`), `GROUPBUY_ENABLED`/`_ROLLOUT_PERCENT`/`_ALLOWED_USER_IDS`
(`src/services/feature-flags.ts`). A Sales Administrator cannot disable a
misbehaving LINE command (e.g. Odoo is down, kill `QUOTE CREATE` for 10
minutes) without an engineer doing a redeploy.

## Final UX — LINE side

**`SALES FEATURES`** (gated by `canManageQuoteLines`, *not* `ADMIN *` —
keep this command namespace separate from the existing infra-admin `ADMIN`
family so the two roles stay visibly distinct) replies with a Flex list,
one row per `ServiceKey` (`commerce`, `directory`, `catalog`, `reporting`,
`groupBuy` — these are Sales-app capability groups, not separate ERP
modules):

```
[key label]         [● ON  |  ○ OFF]   (env-forced / live-override / default)
```

- A row **env-forced off** (not in `ENABLED_SERVICES` or the channel's
  `_SERVICES` list) renders disabled/greyed with no toggle button — env is
  a hard ceiling, see precedence rule below.
- Otherwise a tappable button whose `action.text` is the literal command
  `SALES FEATURE <key> ON` / `SALES FEATURE <key> OFF` (whichever flips
  current state) — same "buttons submit real command text" convention as
  every other Flex button in this repo (`CLAUDE.md`).

**`SALES FEATURE <key> ON`** / **`SALES FEATURE <key> OFF`** (same
`canManageQuoteLines` gate) — applies the live override, replies with the
updated `SALES FEATURES` list, same pattern as `ADMIN ENABLE`'s reply.

## Final UX — web demo panel

New section in `src/demo/markup.ts`, after "Pricing Model Control" (mirror
that section's shape — form + Load + Save + `<pre>` output; see
`src/demo/markup.ts` ~line 86 and its `GET/PUT /demo/pricing-model` routes
for the pattern to copy):

```html
<article class="panel card span-12">
  <h2>Sales Feature Toggles</h2>
  <p>Live on/off overrides for LINE OA Sales commands, no redeploy.
  Env-forced-off capabilities can't be re-enabled here — see .env.</p>
  <table id="sales-feature-toggle-table"><!-- key | label | effective state | source | toggle --></table>
  <button id="save-sales-feature-toggles">Save</button>
  <pre id="sales-feature-toggle-output"></pre>
</article>
```

Backed by `GET/PUT /demo/sales-feature-toggles`, gated by the existing
`requireDemoControlAccess` middleware (same as `/demo/pricing-model`) —
this panel is an ops/staging convenience mirroring the LINE command, not a
separate authorization path. (The web panel itself doesn't need to
re-check `salesTier` — `requireDemoControlAccess` already restricts who
can reach `/demo/*` at all.)

## Backend design (the part that must not duplicate logic)

1. New `src/services/feature-toggles.ts`:
   - `getFeatureToggleOverrides(): Promise<Record<ServiceKey, boolean>>` —
     reads one doc from the existing `platformConfig` Firestore collection
     (`getPlatformConfig`/`setPlatformConfig`, already used by
     `pricing-control.ts` and demo-session secrets — reuse that store, do
     not add a new collection) under a new key, e.g. `salesFeatureTogglesV1`.
   - `setFeatureToggleOverride(key, enabled): Promise<...>` — writes it.
   - **Precedence rule (hard-code this, it's the whole safety model):**
     `effective = envConfigured(key) && (liveOverride(key) ?? true)`.
     Env absence/false is a ceiling the live override can never lift; the
     live override can only turn OFF something env allows, or restore it
     back ON. Ops still owns the hard boundary via env+redeploy; Sales
     Administrators get a fast kill switch under that ceiling, not a way
     around it.
   - **Caching:** `isServiceEnabledForChannel`/`getAvailableServices` in
     `service-catalog.ts` are called synchronously in the hot path
     (`command-router.ts` step 3, no `await` today). Do not make the whole
     gate chain async just for this. Cache the live-override doc in memory
     with a short TTL (mirror the lazy-load-once-then-cache pattern already
     in `pricing-control.ts`'s `ensurePricingModelLoaded`), and expose a
     synchronous `getCachedFeatureToggles()` for the hot path plus an
     explicit refresh on write (so `SALES FEATURE * ON/OFF` and the web
     panel's Save both invalidate/reload the cache immediately).

2. Wire the effective-state check into `service-catalog.ts`'s existing
   `isServiceEnabledForChannel`/`isServiceConfigured` — one gate function,
   consulted by both LINE nav rendering and command execution (already
   true today for env; extend it, don't add a second parallel check).

3. The new `SALES FEATURES`/`SALES FEATURE * ON/OFF` handler (new file,
   e.g. `src/line/handlers/sales-features.ts` — do not add this to
   `admin.ts`, it's a different role) and the new
   `/demo/sales-feature-toggles` route both call into
   `feature-toggles.ts` — zero toggle logic duplicated between the two
   surfaces.

## Constraints (from `AGENTS.md`)

- No new dependencies.
- No new Firestore collection — reuse `platformConfig`.
- Gate with `canManageQuoteLines` (Sales Administrator or LINE infra
  admin), not `profile.role === 'admin'` alone — do not weaken this to a
  looser check (e.g. `isQuoteStaff`, which also allows a plain
  `salesperson`/Sales User — that's the wrong tier for a kill switch).
- Barrel-preserving if you touch `service-catalog.ts` or `firestore.ts`.
- Env remains the hard ceiling — no code path lets a live override
  re-enable something env has disabled.

## Definition of done

- `npm run build` + the smallest relevant Vitest file(s) (service-catalog,
  feature-flags/feature-toggles, quote-access) pass.
- Manual proof via `/webhook-test` or `cns` CLI, as a user with
  `salesTier: 'sales_manager'`: `SALES FEATURES` lists all 5 keys with
  correct effective state; `SALES FEATURE catalog OFF` then a
  `SERVICE LIST` attempt is refused; `SALES FEATURE catalog ON` restores
  it — paste the actual reply payloads.
- Manual proof a plain `salesperson` (Sales User, not Sales Administrator)
  is refused `SALES FEATURES` outright.
- Manual proof the env ceiling holds: with a key absent from
  `ENABLED_SERVICES`, confirm `SALES FEATURE <key> ON` either refuses or
  has no effect (state which — refusal is preferred UX; say why if you
  chose silent no-op instead).
- Web panel: `GET/PUT /demo/sales-feature-toggles` round-trip correctly
  against a running dev server.
- Update `documents/USER_JOURNEY.md` (new lettered section) and
  `documents/DESIGN_SYSTEM.md` if this introduces a new Flex row token not
  already covered there.
