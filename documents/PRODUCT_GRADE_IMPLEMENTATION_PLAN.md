# CNS LINE OA Product-Grade Implementation Plan

Updated: 2026-09-04

## Mission

Deliver a maintainable, reusable, secure, bilingual LINE-to-ERP platform with a product-grade operator experience. The 10/10 target means every production capability is implemented, observable, tested, deployable, documented, and validated in staging. It does not mean adding speculative framework code.

## Product boundaries

### Core users

- Customers: browse products, request quotations, verify identity, view status, approve quotes, and receive support.
- Sales/operators: manage quotations, customer communication, and operational workflows through authorized channels.
- Administrators: configure services, manage users/catalog, review audit events, and operate release controls.
- Agents/automation: use MCP and CLI surfaces through the same authenticated server APIs.

### Supported interaction surfaces

- LINE webhook for production conversations.
- LINE Flex cards, quick replies, guided forms, and text-command fallback.
- `/demo` and `/webhook-test` for controlled development and staging validation.
- Authenticated ops/admin HTTP APIs.
- `cns` CLI and `cns-mcp` agent tools.

## Target architecture

```text
Transport
  LINE webhook | demo | ops API | CLI | MCP
      -> authentication, channel resolution, request ID, rate limits
      -> identity and profile context
      -> policy evaluation
      -> one command/workflow dispatcher
      -> domain application services
          -> ERP adapter
          -> Firestore repositories
          -> LINE/messaging adapters
          -> AI provider gateway
      -> audit event + metrics + structured logs
```

## A-Z delivery plan

### A. Architecture control

- Keep `CLAUDE.md` authoritative for runtime constraints.
- Keep this plan authoritative for product delivery status.
- Preserve compatibility barrels during large refactors.
- Reject duplicate webhook, router, ERP, or authorization paths.

**Gate:** architecture decision records exist for every cross-cutting change.

### B. Business domain boundaries

- Separate customer, quotation, catalog, reporting, group-buy, identity, and configuration use cases.
- Keep transport handlers thin and application services testable without LINE or Odoo.

**Gate:** handlers contain orchestration, not raw persistence or RPC policy.

### C. Configuration

- Validate environment configuration at startup without logging secrets.
- Support `DEFAULT_LANGUAGE`, `ENABLED_SERVICES`, channel overrides, feature flags, and provider settings.
- Store runtime admin configuration changes with actor and audit metadata.

**Gate:** invalid configuration fails closed or uses an explicit documented fallback.

### D. Data and repositories

- Split Firestore into domain modules behind the existing barrel.
- Add repository methods for approvals, users, channels, audit, and reports.
- Use explicit schemas and runtime validation at persistence boundaries.

**Gate:** configured-store and degraded in-memory behavior are both tested.

### E. ERP integration

- Keep Odoo as the default adapter.
- Migrate product search, partner lookup, quotation creation, order status, confirmation, invoices, and reporting through the adapter.
- Preserve retry and idempotency semantics.
- Add capability errors for unsupported operations.
- Add a second provider only when a real provider requirement exists.

**Gate:** application services do not construct Odoo RPC payloads directly.

### F. Feature flags and services

- Apply global service allowlists and channel overrides to both menus and typed commands.
- Keep disabled services unreachable through manual command input.
- Add rollout and allowlist controls for risky features.

**Gate:** menu, typed command, API, and background-job paths share policy tests.

### G. Governance and approvals

- Persist approval records with actor, command, target, channel, state, timestamps, and expiry.
- Enforce atomic transitions and prevent self-approval.
- Require explicit approval for externally visible or destructive operations.
- Never store OTPs, access tokens, or raw personal payloads in approval records.

**Gate:** requested, approved, rejected, expired, and completed states are durable and auditable.

### H. Human support and escalation

- Preserve escalation state and human-agent routing.
- Add operator-visible context without exposing unnecessary customer data.
- Ensure escalation can be closed or transferred with audit records.

**Gate:** escalated conversations cannot accidentally execute normal automated workflows.

### I. Internationalization

- Support Thai and English user preferences.
- Use `DEFAULT_LANGUAGE` only when no stored preference exists.
- Route new reusable copy through `i18n.ts`.
- Keep command names stable across languages while labels and replies localize.

**Gate:** every new customer-facing surface has Thai and English copy.

### J. Jobs and automation

- Keep scheduled work outside the app process.
- Make report, segmentation, rotation, and future jobs idempotent.
- Add job run IDs, outcomes, duration, and safe failure reasons.

**Gate:** retries cannot duplicate customer messages or ERP creates.

### K. KPI and observability

- Standardize structured JSON logs with scope, request ID, actor context, action, outcome, and duration.
- Redact credentials, OTPs, raw message content, and unnecessary personal data.
- Track request, command, ERP, AI, Firestore, rate-limit, and job metrics.

**Gate:** an operator can trace a failure without reading secrets or raw conversation content.

### L. LINE UX

- Keep a compact role-aware service home.
- Add grouped admin service configuration with confirmation for disabling core services.
- Use summary cards before destructive or externally visible actions.
- Keep buttons as real command text and retain typed fallback.
- Respect LINE message, label, quick-reply, and alt-text limits.

**Gate:** every primary workflow has a happy path, validation error, retry path, cancel path, and bilingual copy.

### M. MCP and CLI

- Keep MCP and CLI thin clients over authenticated server APIs.
- Never accept credentials as tool arguments.
- Require explicit confirmation flags for mutations.
- Return machine-readable outcomes and safe human-readable summaries.

**Gate:** MCP/CLI cannot bypass HTTP authorization or application policy.

### N. Network and webhook security

- Resolve channel before signature verification.
- Use the channel-specific secret and access token.
- Reject unknown channels.
- Keep body limits, rate limits, CSP, generic auth errors, and request IDs active.

**Gate:** negative tests cover missing, wrong, replayed, and cross-channel credentials.

### O. Odoo security

- Preserve LINE identity -> Firestore profile -> `odooVerified` -> `ADMIN_USER_ID` -> Odoo capability -> role assignment.
- Apply server-side authorization independently of rendered buttons.
- Do not infer admin capability from LINE identity alone.
- Keep write retry limited to idempotent operations.

**Gate:** authorization tests cover every ERP mutation class.

### P. Performance

- Bound all network calls with timeouts.
- Use read retries only for transient failures.
- Use idempotent write retries only where safe.
- Limit Firestore cache size and TTL.
- Bound LINE batches, AI prompts, report sizes, and job pages.

**Gate:** staging records p50/p95 latency and failure rates for webhook, ERP, AI, and Firestore paths.

### Q. Quality and testing

- Keep pure parser/policy tests fast.
- Add mocked adapter contract tests for Odoo-facing application services.
- Add route authentication tests and staging smoke tests.
- Add contract tests for Flex message limits and bilingual labels.

**Gate:** no changed security or shared-policy path ships without focused regression coverage.

### R. Refactoring

Execute barrel-preserving splits in this order:

1. `src/services/firestore.ts`
2. `src/services/odoo.ts`
3. `src/index.ts` route groups
4. `src/line/templates.ts`
5. `src/demo/page.ts`

**Gate:** build and full suite remain green after each split; no behavior rewrite during structure work.

### S. Staging and release

- Build a clean staging tree.
- Exclude backup, reference, local env, tests, and development-only material unless explicitly required.
- Run preflight, build, tests, lint, smoke checks, and evidence generation.
- Promote to production only after staging signoff.

**Gate:** every release has a commit boundary, evidence, rollback plan, and owner approval.

### T. Tenant and channel isolation

- Keep channel credentials and service scopes isolated.
- Include channel scope in identity, configuration, audit, and outbound messaging decisions.
- Prevent profile or pending-flow leakage across conversations.

**Gate:** cross-channel and group/room state isolation tests pass.

### U. User privacy

- Keep consent notice, data inspection, deletion request, and marketing opt-in behavior.
- Minimize audit and log data.
- Define retention for operational records and archive before deletion.

**Gate:** privacy actions are tested and audit records do not recreate deleted personal payloads.

### V. Validation and contracts

- Validate environment values, command payloads, persisted records, adapter responses, and external API results.
- Prefer explicit typed results over synthetic success values.

**Gate:** malformed external data fails safely and visibly.

### W. Workflow composition

- Model multi-step actions as workflows over domain services.
- Keep guided forms as input collection that reconstructs the canonical command.
- Use approval records for durable cross-request state.

**Gate:** no workflow introduces a second implementation of an existing command.

### X. Experience design

- Use consistent typography, color, spacing, labels, tone, and error language in Flex cards.
- Prefer scanning-friendly grouped actions over long command instructions.
- Keep destructive actions visually distinct and confirmable.

**Gate:** UX review covers mobile LINE viewport, dark-mode readability, long labels, and bilingual text.

### Y. Yardsticks for 10/10

The platform reaches the target only when all are true:

- 100% of runtime command paths use shared service and authorization policy.
- 100% of privileged mutations emit safe audit events.
- 100% of approval transitions are durable and atomic.
- 100% of user-facing new copy is bilingual.
- 100% of release candidates pass build, tests, lint, smoke, and security checks.
- 0 credentials, OTPs, or raw message payloads appear in logs or audit details.
- 0 duplicate routing or ERP implementations exist.
- p95 staging latency and failure budgets are documented and within target.

### Z. Zero-regression definition

A change is complete only when behavior is validated, security is reviewed, documentation is synchronized, staging deployment is reproducible, and rollback is understood. “Compiles” alone is not completion.

## Immediate execution order

1. Extend approval adoption to the remaining explicitly approved privileged workflows.
2. Add correlation context to remaining non-HTTP callers where an execution ID is available; primary background jobs now generate execution IDs.
3. Add runtime adapter migration for product lookup and quotation creation.
4. Finish the required Firestore persistence/cache ownership moves behind the compatibility barrel, starting with profile writes and consent.
5. Begin the Odoo barrel-preserving split.
6. Add admin service-configuration Flex UX.
6. Add mocked ERP contract tests.
7. Run staging smoke and release evidence checks.

## Current honest status

The existing platform is approximately **74/100**. The foundations are strong, but the 10/10 target is blocked by integration work, not by missing framework bulk. The full ClawSpring/reference folders remain patterns and references; production behavior stays in the TypeScript application.
