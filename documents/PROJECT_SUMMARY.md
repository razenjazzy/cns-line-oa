# CNS LINE OA — Project Summary

## Status: In active development, core platform complete

### What this is

A TypeScript + Express backend that connects a LINE Official Account (or
multiple LINE OAs) to an Odoo ERP instance and a free-tier-first Gemini AI
layer, for Thai/English conversational commerce: product lookup, quotation
creation, order tracking, customer/service CRUD, group-buy campaigns, and
daily sales reporting — all delivered as LINE Flex Message cards with
tappable nav buttons, not a text-command terminal.

See `documents/ARCHITECHTURE_FLOW.md` for the original business case and
phased roadmap, and the top-level `CLAUDE.md` for the authoritative,
kept-current architecture reference agents should read before making changes.

---

## Project structure (`src/`, 45+ files)

```
src/
├── index.ts                    Express app: HTTP routes, health/readiness,
│                                ops endpoints, /webhook-test dev harness
├── cli/index.ts                Operator CLI (`cns`) — thin client over the
│                                ops/admin HTTP endpoints
├── mcp/server.ts                MCP server (`cns-mcp`) exposing the same
│                                endpoints as agent tools
├── ops-client/client.ts        Shared HTTP client used by cli/ and mcp/
├── jobs/
│   ├── daily-report.ts         Odoo sales/inventory → AI-summarized report
│   └── segmentation.ts         Cohort segmentation + targeted multicast
├── line/
│   ├── webhook.ts               LINE webhook (signature-validated, per
│   │                            channel, text + voice messages)
│   ├── command-router.ts        Single dispatcher: form intercept → first-
│   │                            contact menu → channel gate → handler
│   │                            registry → AI fallback
│   ├── handlers/                11 command-domain modules (admin,
│   │                            verification, commerce, user-directory,
│   │                            service-catalog-handler, group-buy,
│   │                            language, help, navigation, chat-fallback)
│   ├── templates.ts             Flex Message UI — forced-light-surface
│   │                            bubbles (readable in LINE dark mode)
│   ├── channels.ts              Per-channel LINE credentials + enabled
│   │                            services, env-only
│   ├── command-validators.ts    Payload parsers for multi-field commands
│   └── command-guide.ts         Near-miss command suggestions
└── services/
    ├── firestore.ts             User profiles, group-buy records, OTP
    │                            challenges, audit log, platform config
    ├── odoo.ts                  Odoo JSON-RPC integration (retries,
    │                            partner/product/quotation/order CRUD)
    ├── chat.ts                  Gemini chat with function-calling; system
    │                            prompt in Gemini's dedicated field (not
    │                            user role); AiCircuitBreaker-backed
    ├── vertexai.ts              Insights, intent classification, voice
    │                            transcription (Gemini AI Studio first,
    │                            Vertex only if GOOGLE_CLOUD_PROJECT is set)
    ├── ai-circuit-breaker.ts    Time-windowed open/half-open/closed circuit
    │                            (replaces permanent-failure booleans)
    ├── clawframework.ts         Optional dev/staging-only Groq/OpenRouter
    │                            bridge subprocess (never in production)
    ├── logger.ts                Structured JSON logger with redaction
    ├── app-config.ts            Configurable Thai/English defaults
    ├── firestore/types.ts       Shared Firestore contracts
    ├── firestore/core.ts        Shared Firestore normalization helpers
    ├── firestore/platform-config.ts  Platform config repository
    ├── firestore/user-profile.ts    Profile mapping and secure defaults
    ├── firestore/user-profile-repository.ts  Profile state repository
    ├── firestore/communication.ts  Conversation, scoring, and feedback repository
    ├── firestore/group-buy-contract.ts  Group-buy transaction contract
    ├── firestore/group-buy-store.ts  Complete group-buy runtime store
    ├── firestore/verification.ts    Verification challenge mapping
    ├── firestore/verification-store.ts  Verification creation persistence
    ├── firestore/verification-consume.ts  Verification OTP consumption
    ├── firestore/verification-token.ts  Verification magic-link consumption
    ├── firestore/action-otp.ts     Step-up OTP challenge mapping
    ├── firestore/action-otp-store.ts  Step-up OTP persistence and transactions
    ├── firestore/approval-store.ts  Approval persistence and atomic transitions
    ├── firestore/audit-store.ts  Audit persistence, pagination, and retention reads
    ├── firestore/group-buy.ts      Group-buy record mapping and expiry logic
    ├── firestore/audit.ts          Audit record mapping and query helpers
    ├── odoo/types.ts               Shared Odoo product/order/partner contracts
    ├── odoo/client.ts              Odoo configuration and transient-error policy
    ├── odoo/index.ts               Odoo domain exports for future consumers
    ├── service-catalog.ts       Single source of truth for both nav menus
    │                            and command-execution gating, including the
    │                            global service allowlist
    ├── guided-forms.ts          One-field-at-a-time FORM * flows
    ├── group-buy.ts             Group-buy lifecycle incl. expiry and
    │                            automatic Odoo quotation on confirm
    ├── user-verification.ts     Odoo OTP + magic-link verification
    ├── admin-authorization.ts   ADMIN_USER_ID allowlist check (fails closed)
    ├── adminAuth.ts / opsAuth.ts  Bearer-token middleware for admin/ops routes
    ├── rate-limit-store.ts      Redis-backed rate limiting, in-memory fallback
    ├── demo-session.ts          HMAC-signed, rotatable demo-panel sessions
    ├── pricing-control.ts       Cost model + pricing simulation
    ├── kpi.ts                   In-memory request/feature-gate counters
    └── runtime-probes.ts        Shared Firestore/Odoo/rate-limiter checks
```

---

## Key technologies

| Component | Technology | Notes |
|---|---|---|
| Framework | Express.js + TypeScript, strict mode | |
| LINE integration | `@line/bot-sdk` | Multi-channel, per-channel signature validation |
| AI | Gemini via `@google/genai` | AI Studio (free-tier) tried first; Vertex only if configured; optional Groq/OpenRouter bridge in dev/staging |
| Database | Google Cloud Firestore | Optional — app degrades gracefully without it |
| ERP | Odoo (JSON-RPC) | Products, partners, quotations, orders |
| Rate limiting | Redis, in-memory fallback | |
| Deployment | Docker, Cloud Run, Ansible (staging/production playbooks), Cloudflare Tunnel | |
| Ops tooling | `cns` CLI, `cns-mcp` MCP server | Both wrap the same authenticated HTTP endpoints |

---

## Security posture (see `CLAUDE.md` for the enforced chains)

- Admin role: LINE identity → `profile.odooVerified` → `ADMIN_USER_ID`
  allowlist (fails closed) → Odoo admin-capability check → role grant.
- Multi-channel credentials resolved from environment only, never hardcoded.
- Timing-safe token comparisons, HMAC-signed rotatable demo sessions.
- `escapeHtml()` + a global Content-Security-Policy header on the one
  server-rendered HTML route (`/verify/odoo`).
- Rate limiting on every public endpoint.
- Structured application logs and non-sensitive audit-event logging.
- ClawFramework's Groq/OpenRouter bridge is hard-gated to
  `NODE_ENV !== 'production'` and is never a runtime dependency of the
  shipped app — it's a design reference only (see `clawframework/README.MD`
  for why: decompiled/leaked source, academic-use disclaimer only).

---

## Testing

`npm test` runs the Vitest suite — pure-function/parser/validator-level
coverage (command validators, guided-forms, service-catalog, group-buy,
admin-authorization, demo-session, channels, user-verification parsing,
pricing-control, CLI arg parsing, ops-client config). Run `npm run lint`
and `npx tsc --noEmit` alongside it; all three are expected to be clean.
Firestore/Odoo-backed flows are integration-only and are verified manually
against a live Odoo instance and `/webhook-test` — there is no CI-run
integration suite yet.

---

## How to run

```bash
npm run dev              # local dev server, nodemon + ts-node
npm run build && npm start   # production build + run
npm test                 # Vitest suite
npm run lint              # ESLint
npm run cli -- help       # operator CLI
npm run mcp                # MCP server (stdio transport)
```

See `documents/QUICK_START.md` for environment variables and deployment.
