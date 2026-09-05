# CNS LINE OA

## Architecture

This is a TypeScript + Express backend for LINE Official Account integrations.

Main flow:

LINE event
→ `src/index.ts`
→ `src/line/webhook.ts`
→ Firestore user/profile lookup
→ `src/line/command-router.ts`
→ service integrations
→ LINE reply messages / Flex UI.

Optional ops adapters (not the LINE path): schema-driven `/api-docs`, `POST /graphql` (ops/jobs only), Mongo RAG embeddings, BullMQ webhook/jobs when env-gated. Firestore remains identity SoR. See `documents/ENTERPRISE_STANDARD.md` section 8. Environments: `documents/ENVIRONMENTS.md`. Demo-day presenter script: `documents/DEMO_DAY.md`. Railway staging: `documents/RAILWAY_STAGING.md`. Module inventory: `src/platform/service-modules.ts` (`GET /demo/platform`). Full runtime snapshot: `GET /readyz`, `GET /ops/platform`.

### Important existing areas

- `src/index.ts`: Express app and HTTP routes.
- `src/line/webhook.ts`: LINE webhook validation and event handling (default and per-channel routes; also handles voice messages via transcription).
- `src/line/command-router.ts`: main command and interaction routing, including guided-form and NAV navigation dispatch.
- `src/line/templates.ts`: LINE Flex Message UI (product/order cards, service home menu, service action menu).
- `src/line/messaging.ts`: LINE messaging operations (multicast, channel-scoped via `channels.ts`).
- `src/line/channels.ts`: multi-channel config resolver (channelId -> credentials + enabled services), env-only, no secrets in source.
- `src/services/firestore.ts`: user/profile and application state, including `pendingFlow` (guided-form) state.
- `src/services/service-catalog.ts`: generic service identifiers, command-to-service mapping, and the single source of truth for both channel navigation and command-execution gating.
- `src/services/guided-forms.ts`: step-by-step guided-form field specs for multi-field commands (reconstructs the equivalent single-line command on completion; not used in group/room chats).
- `src/services/user-verification.ts`: Odoo user verification (OTP + magic link, with attempt lockout).
- `src/services/admin-authorization.ts`: `ADMIN_USER_ID` allowlist check used by `ADMIN ENABLE`, applied after verification and before the Odoo admin-capability check.
- `src/services/adminAuth.ts`: admin HTTP protection.
- `src/services/opsAuth.ts`: operational API protection.
- `src/services/odoo.ts`: Odoo integration.
- `src/services/vertexai.ts`: Gemini integration for insights, intent classification, and voice-message transcription.
- `tests/`: Vitest tests.

Preserve this architecture unless a requirement clearly cannot fit it.

## User Identity and Authorization

The application currently uses LINE source identity and Firestore user profiles.

Existing mechanisms include:

- LINE user/conversation identity
- Odoo user verification
- Odoo verification state
- user roles including admin
- protected operational routes

Do not replace these mechanisms.

When adding authentication or authorization, extend the existing identity/profile model where possible.

Do not assume that LINE identity alone authorizes access to every service. A verified Odoo identity does not by itself grant admin or write access either — the enforced chain for the admin role is: LINE identity -> user profile -> `profile.odooVerified` -> `ADMIN_USER_ID` allowlist (`src/services/admin-authorization.ts`, fails closed if unset) -> Odoo admin-capability precondition -> role assignment. Do not weaken or bypass any link in this chain.

For multi-channel support, consider channel/service access separately from user identity. This is implemented: `src/line/channels.ts` resolves per-channel credentials and enabled services from environment variables only (never hardcoded), and `src/services/service-catalog.ts` is the single source of truth both command execution and channel navigation menus consult for service gating.

## LINE Architecture

The current LINE integration is centered around:

`webhook.ts` → `command-router.ts` → response messages.

Do not duplicate command-routing logic between webhook endpoints.

If multiple LINE OAs are added:

1. Resolve the channel first.
2. Validate using that channel's credentials.
3. Create channel context.
4. Pass channel context to the existing routing flow.
5. Reuse `resolveCommandReply` rather than duplicating routers.

This is implemented: `POST /webhook` (default channel, backward compatible) and `POST /webhook/:channelId` (additional channels) both go through the same `handleWebhook` middleware array in `src/line/webhook.ts`, which resolves credentials via `src/line/channels.ts` and rejects unknown/unconfigured channels before signature validation. `ChannelContext` flows into `CommandReplyContext.channel` for the one shared `resolveCommandReply`. Add new channels via `LINE_CHANNEL_<ID>_SECRET` / `_ACCESS_TOKEN` / `_SERVICES` env vars — no code changes needed per channel.

Keep LINE credentials outside source code.

## Interactive UI

Reuse and extend `src/line/templates.ts`.

Prefer LINE-native components over text instructions when they improve usability:

- Flex Messages
- Buttons
- Quick replies
- Carousel/list-like Flex layouts
- Rich menu integration where appropriate

Use simple action identifiers rather than exposing internal implementation details.

Preserve a text-command fallback for testing and power users unless intentionally removed.

Existing navigation/interaction patterns to reuse rather than duplicate:

- `NAV HOME` / `NAV <serviceKey>` / `BACK`: channel-aware Flex service menu and per-service action menu (`command-router.ts`, `templates.ts`, `service-catalog.ts`). Buttons submit real command text, never internal identifiers.
- `FORM <underlying command>` (e.g. `FORM USER CREATE`): guided, one-field-at-a-time quick-reply flow for multi-field commands, defined in `src/services/guided-forms.ts`. State lives in `profile.pendingFlow` (short TTL) and is intentionally disabled in group/room chats, since that state is shared per-conversation, not per-person. On completion it reconstructs the single-line command and re-enters `resolveCommandReply` — never duplicate the underlying command logic in a flow.
- Voice messages are transcribed (`src/services/vertexai.ts`, reusing the existing Gemini client) and fed into `resolveCommandReply` exactly like typed text — new commands do not need separate voice handling.

## Odoo Services

Current Odoo functionality is primarily command-driven.

When adding Sales, HR, or future Odoo services:

- Do not create separate copies of the LINE webhook.
- Route through the existing command-routing flow.
- Keep Odoo module logic in the existing service layer.
- Add new Odoo-specific files only when the current `odoo.ts` would otherwise become unreasonably large.

All ERP-specific calls go through `src/erp/registry.ts`'s `getErpAdapter()`
(backed today by `src/erp/odoo-adapter.ts`, which itself delegates to
`src/services/odoo/*`) — a handler file must never call Odoo RPC or
`odoo.ts` directly. This is the one seam a future second ERP provider would
implement against; `ERP_PROVIDER` fails closed for any value other than
`odoo` until a second adapter actually exists. Do not build a general
multi-ERP abstraction beyond this seam without a concrete second-provider
requirement to validate it against.

## Context and Cost Efficiency

Before changing code:

1. Read this file.
2. Locate the relevant entry point.
3. Read only directly related files.
4. Follow imports only when necessary.
5. Reuse existing patterns.
6. Stop exploration once the implementation path is clear.

Do not:

- Read the entire repository.
- Repeatedly inspect the same files.
- Refactor unrelated code.
- Add dependencies without need.
- Create generic frameworks without a concrete requirement.
- Launch multiple agents for overlapping investigation.

## Agents

Use a subagent only when an investigation is independent.

Examples:

- Security review of multi-channel webhook authentication.
- Independent test review after implementation.

Do not use agents for ordinary localized changes.

## MCP

Use MCP only when it provides information or actions unavailable from:

- the repository,
- existing code,
- installed dependencies,
- or current documentation.

Do not invoke MCP servers automatically.

The existing LINE MCP server should be used only when external LINE platform inspection or LINE-specific operations are needed.

## Testing

Run the smallest relevant test first.

Examples:

- `npm run test:validators`
- targeted Vitest file
- `npm run build`

Run the full suite only when the change affects shared behavior or targeted testing is insufficient.

## Final Response

Keep implementation summaries concise:

1. What changed
2. Files changed
3. Tests run
4. Required configuration
5. Remaining limitation, if any