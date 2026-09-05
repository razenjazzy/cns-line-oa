# Enterprise standard architecture for cns-line-oa

## Objective

Keep the project in a clean, testable, staging-safe, and enterprise-ready shape without adding a generic framework layer on top of the live runtime.

This project should stay built around:

- LINE-first interaction
- Odoo ERP integration
- optional AI provider orchestration
- strict runtime security and approval rules
- staging-safe deployment discipline

## Standard principles

1. Production code is the runtime contract.
2. Reference frameworks stay in backup.
3. Only deploy-safe files are committed for staging.
4. Live business logic stays in the app, not in a vendor clone.
5. Multi-ERP and multi-provider support is adapter-based, not hardcoded.
6. Security is fail-closed and audit-first.
7. Logs are structured JSON and redact credential-shaped fields.

## Canonical structure

```text
src/
  app/
    bootstrap.ts
    config.ts
  core/
    auth/
    audit/
    security/
    policy/
  line/
    webhook.ts
    command-router.ts
    handlers/
    templates/
    channels.ts
  erp/
    adapter.ts
    odoo/
    future/
  ai/
    providers.ts
    circuit-breaker.ts
    bridge.ts
  ops/
    cli/
    mcp/
    jobs/
  ux/
    commands/
    menus/
    dashboards/
    forms/
  services/
    firestore.ts
    odoo.ts
    clawframework.ts
```

## Standard design rules

### 1) Keep the adapter boundary

ERP logic must be behind a single adapter contract.

- `listProducts`
- `getCustomer`
- `createQuotation`
- `confirmOrder`
- `createInvoice`
- `getStatus`
- `syncPartner`

Odoo remains the default adapter, but the app calls the interface, not Odoo-specific functions directly.

### 2) Keep the command layer registry-based

Commands must be defined as metadata objects, not ad hoc free-text branching.

Each command should include:

- id
- label
- category
- allowed channels
- allowed roles
- approval requirement
- validation schema
- handler function

This is the standard for long-term UI and ERP expansion.

### 3) Keep the security chain explicit

The current project already has the correct enforcement chain:

LINE identity -> Firestore profile -> odooVerified -> ADMIN_USER_ID allowlist -> Odoo admin capability -> role assignment

This must remain intact and be treated as a fixed baseline.

### 4) Standard logging and audit trail

Use `src/services/logger.ts` for application logs. Entries include an ISO
timestamp, level, scope, message, and structured fields. Credential-shaped
fields are redacted before output. `recordAuditEvent()` remains the durable
business audit trail in Firestore and emits a non-sensitive structured log
after a successful write. Audit details must never contain passwords, API keys,
tokens, OTPs, or raw personal payloads.

### 5) Configurable language and services

`DEFAULT_LANGUAGE` accepts `th` or `en`. It is used when no stored user
language is available. `ENABLED_SERVICES` is a comma-separated global allowlist
for `commerce`, `directory`, `catalog`, `reporting`, and `groupBuy`. Channel
overrides remain more specific and continue to apply after the global list.
Omitting `ENABLED_SERVICES` preserves the existing unrestricted behavior.

Admins can inspect channel service state with `ADMIN CONFIG [channelId]`. Its
Flex controls submit the existing complete-list command
`ADMIN CHANNEL <channelId> SERVICES <list|ALL>`, so there is no second hidden
configuration protocol.

### 6) Keep dev/reference code outside deploy scope

The repo may contain:

- reference frameworks
- backup archives
- docs and research material
- dev helpers

These must stay outside the staging production runtime commit unless the release specifically requires them.

### 7) Keep the AI bridge optional and environment-gated

The ClawFramework bridge remains an optional fallback in dev/staging only and must never become a production dependency without explicit gating and validation.

### 8) Optional ops platform adapters (not a second bot)

These sit **on top of** LINE + Firestore + `resolveCommandReply`. They must not replace identity, ERP, or webhook signature validation.

- **REST + Swagger:** Zod schemas generate OpenAPI at `/api-docs.json`; Swagger UI at `/api-docs` (off in production unless `ENABLE_API_DOCS`; then ops-token gated).
- **GraphQL Yoga:** `POST /graphql` mirrors existing ops/job functions only. Same `OPS_API_TOKEN` / `ADMIN_SECRET_TOKEN` as REST. LINE events never go through GraphQL.
- **MongoDB:** Optional RAG/embeddings (`skill_embeddings`, `chat_embeddings`) via `BaseRepository`. Firestore remains the system of record for users, OTP, group-buy, and audit.
- **BullMQ:** Optional. Default webhook is still synchronous. `LINE_WEBHOOK_ASYNC=true` requires Redis; workers use `replyMessage` then `pushMessage` if the reply token is stale. `npm run worker` or `RUN_BULLMQ_WORKER=true`.
- **Pino + OpenTelemetry:** Structured logs keep redaction. Tracing is off unless `OTEL_ENABLED=true`.

## Phase backlog

### Phase 1 — repo hardening and deploy discipline

- keep runtime files separate from backup/reference code
- keep staging deploy tree minimal and commit-safe
- maintain main repo for active development

### Phase 2 — ERP adapter contract

- create the ERP interface layer
- keep Odoo as the first implementation
- define extension points for future ERP providers

### Phase 3 — command grid and UX config

- define command metadata registry
- add role/channel visibility
- add approval and write gating
- extend LINE Flex menu generation from the registry

### Phase 4 — enterprise security enhancement

- add write approval pipeline
- add audit/event logging for every change
- enforce config traceability
- keep fail-closed handling for admin and ops endpoints

### Phase 5 — validation and release discipline

- staging validation first
- production only after signoff
- maintain a clean commit boundary between dev and deploy branches

## Recommended next implementation branch

The next repo-standard implementation should focus on three artifacts:

1. an ERP adapter contract
2. a command registry model
3. a staging-safe deploy allowlist

Those are the core items that convert this app from a service bot into a reusable enterprise integration platform.
