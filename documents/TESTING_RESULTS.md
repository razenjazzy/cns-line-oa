# Testing

## Automated suite

```bash
npm test
```

Vitest, pure-function level — parsers, validators, and config resolution,
no live network/Firestore/Odoo calls:

| File | Covers |
|---|---|
| `command-validators.test.ts` | Multi-field command payload parsing (USER/SERVICE CREATE/UPDATE, QUOTE CREATE) |
| `guided-forms.test.ts` | `FORM *` flow specs and field validation |
| `service-catalog.test.ts` | Command→service mapping, channel gating |
| `group-buy.test.ts` | `START/JOIN/STATUS/CONFIRM/CANCEL GROUPBUY` parsing, incl. `<hours>` expiry field |
| `admin-authorization.test.ts` | `ADMIN_USER_ID` allowlist chain, fail-closed behavior |
| `demo-session.test.ts` | HMAC token creation/verification, rotation grace window |
| `channels.test.ts` | Per-channel credential/service resolution from env |
| `user-verification-parser.test.ts` | OTP/phone parsing |
| `pricing-control.test.ts` | Cost model sanitization |
| `cli.test.ts` | CLI argument parsing |
| `ops-client.test.ts` | Ops-client config resolution from env |

Run `npm run lint` and `npx tsc --noEmit` alongside `npm test` — all three
are expected to report zero errors on `main`.

## What's not covered by the automated suite

`resolveCommandReply` (the full dispatch pipeline) and every
Firestore/Odoo-backed write path are integration-level and are **not**
exercised by CI. They've been verified manually in this project's history
against a live Odoo instance via `/webhook-test` and the `cns` CLI (`cns
chat "..."`, `cns kpi`, `cns audit`) — see git history / PR discussions for
specific verification runs. If you change routing logic in
`command-router.ts` or any `handlers/*.ts`, verify manually with:

```bash
npm run build
npm run dev &
npm run cli -- chat "FEATURES"
npm run cli -- chat "PRODUCT FIND <something in your Odoo catalog>"
```

against a real `.env` before considering the change done — the Vitest
suite passing does not by itself confirm the dispatch pipeline works.

## Known environment-specific gaps at time of writing

- `vertexai.ts` still uses a permanent `vertexUnavailable` boolean (unlike
  `chat.ts`'s `AiCircuitBreaker`) — a single 404 there disables daily-report
  insights, intent classification, and voice transcription until process
  restart. Not yet fixed.
- No payment workflow (pending/paid/expired/refunded) for group-buy.
- Group-buy tier pricing and per-user min/max join caps are not implemented
  — deliberately deferred pending business-policy decisions.
