# CNS LINE OA Architecture Review

Updated: 2026-09-04

## Executive assessment

The platform has a strong production-oriented foundation: one LINE webhook flow, one command router, modular handlers, Odoo retry/idempotency controls, Firestore graceful degradation, bilingual responses, channel-aware service gating, OTP step-up protection, audit retention, and staging-first deployment discipline.

It is not yet a 10/10 enterprise platform. The remaining work is primarily integration and consistency rather than a full rewrite: make policy authoritative at every entry point, persist approvals, finish the ERP boundary migration, improve correlation and observability, complete the barrel-preserving refactor, and synchronize documentation.

Current maturity estimate: **74/100**.

This score measures implemented and verified behavior, not planned architecture.

## Scorecard

| Area | Score | Current evidence | Main gap |
|---|---:|---|---|
| Runtime architecture | 82 | Single webhook/router path and modular handler registry | Large service and route files remain |
| LINE UX | 82 | Flex cards, guided forms, quick replies, navigation, text fallback | Admin configuration UI and broader menu projection |
| Odoo capability | 78 | Products, partners, quotations, orders, invoices, reports | Delivery unavailable on current Odoo; limited automated integration tests |
| ERP abstraction | 55 | Contract is active and the ERP adapter consumes Odoo catalog/sales/partner/reporting facades | Most legacy runtime consumers still call the compatibility Odoo service |
| Security | 78 | Verification, admin allowlist, Odoo capability check, OTP, tokens, rate limits | Approval persistence and finer Odoo-native roles |
| Approval workflow | 74 | Pure state model, Firestore/local-fallback repository, atomic Firestore transitions, dedicated audit events, request correlation, and controlled `QUOTE APPROVE` adoption are implemented | Broader workflow adoption remains |
| Audit and logging | 72 | Firestore audit trail, archive rotation, structured logger, dedicated approval events, and correlation across HTTP-facing privileged handlers | Logger adoption and correlation for background/non-HTTP callers remain |
| Language configuration | 70 | Thai/English user preference and configurable default | Several inline translation sources remain |
| Service configuration | 78 | Global and channel gates now apply to menus and typed commands | Admin UX and configuration traceability remain |
| Reliability/performance | 76 | Retries, circuit breakers, caching, rate limits, graceful fallbacks | Need production latency/error measurements |
| Testing | 86 | 22 files and 158 tests pass | No standard mocked Odoo/Firestore handler integration pattern |
| Documentation | 72 | Architecture, deployment, audit, and refactor documents exist | Status and file-name drift requires consolidation |
| Deployment discipline | 80 | Staging preparation and release gates documented | Staging smoke evidence must be maintained per release |
| Reference isolation | 90 | ClawSpring/vendor material isolated from runtime | Keep the boundary explicit in CI and deploy scripts |

## Canonical architecture

```text
LINE webhook / webhook-test / demo-chat
  -> channel resolution and signature or session authentication
  -> request ID, rate limit, and security middleware
  -> Firestore profile and language context
  -> one command router
       -> pending guided form
       -> first-contact and consent behavior
       -> global + channel service policy
       -> guided form start
       -> ordered command handler registry
       -> near-miss guidance
       -> AI fallback
  -> domain services
       -> ERP adapter boundary
       -> Firestore state and audit trail
       -> LINE Flex/messaging
  -> structured logs, metrics, and release evidence
```

## Design principles to preserve

- `resolveCommandReply` remains the only LINE command execution path.
- `COMMAND_HANDLERS` remains the execution registry; metadata must not become a second router.
- `SERVICE_CATALOG` and global configuration must govern both menus and typed commands.
- The authorization chain remains: LINE identity -> Firestore profile -> `odooVerified` -> `ADMIN_USER_ID` allowlist -> Odoo admin capability -> role assignment.
- Quote mutations retain step-up OTP protection until a separate security decision expands its scope.
- ClawSpring remains an optional, environment-gated development/staging bridge and reference source, not a production vendor clone.
- Credentials remain environment-only and never enter logs, skills, MCP arguments, or audit details.

## Recommended UX upgrades

### 1. Role-aware service home

Render the existing service catalog as a compact grouped Flex menu. Show only services allowed by global configuration, channel override, and user role. Keep button actions as real command text so the current router remains authoritative.

### 2. Admin configuration journey

Add an `ADMIN CONFIG` command that shows service rows with current state and channel scope. Each toggle should submit the existing `ADMIN CHANNEL <channel> <service> on/off` command. Add a confirmation step for disabling commerce, directory, or catalog services.

### 3. Guided write confirmation

Before a destructive or externally visible operation, show a summary card containing target, action, and expiry. The existing OTP mechanism remains the final step-up gate. Never trust the button alone; repeat all authorization checks server-side.

### 4. Language selector and copy policy

Keep `LANG EN` and `LANG TH` as the user-level controls. Use `i18n.ts` for all new reusable copy. Use `DEFAULT_LANGUAGE` only as a fallback, never as an override of an explicit profile preference.

### 5. Operational audit view

Extend the existing `/ops/audit-log` surface with filters for action, actor, channel, outcome, and time window. Do not expose OTPs, access tokens, raw message text, or unnecessary personal data.

## Refactor sequence

1. Complete global policy regression coverage and document the invariant.
2. Persist approval records through a Firestore repository with idempotent transitions.
3. Emit audit events for approval requested, approved, rejected, expired, and completed.
4. Split `firestore.ts` into domain modules with a compatibility barrel.
5. Split `odoo.ts` into client, catalog, sales, partner, and reporting modules with a compatibility barrel.
6. Migrate product lookup and quotation creation through the ERP adapter.
7. Extract HTTP route modules without changing middleware order.
8. Split LINE templates and demo assets.
9. Project verified command metadata into menus.
10. Run staging smoke tests, update release evidence, and only then consider production promotion.

## Completion gates

A slice is complete only when:

- behavior is covered by a focused test or documented manual integration check;
- `npm run build` passes;
- `npm test` passes for shared behavior or refactors;
- `npm run lint` has no new warnings;
- authorization and audit behavior are reviewed when security-sensitive;
- staging deploy preparation includes only intended runtime files;
- documentation and environment examples match the implementation.

## Current blockers to 10/10

- Approval adoption currently covers `QUOTE APPROVE`; broader privileged workflows and correlation for background/non-HTTP callers remain.
- ERP adapter is not yet the sole application-facing ERP boundary.
- Structured logging is only partially adopted.
- Odoo/Firestore side effects lack a consistent automated integration-test pattern.
- The five documented large-file splits are not complete.
- Admin service configuration is not yet available as a friendly LINE UX.
- Documentation needs one authoritative status inventory.

## Reference material policy

The active runtime uses the small bridge and adapter patterns required by this repository. The full `clawframework/` and `.backup/clawframework-vendor/` trees remain reference material. They may inform provider fallback, skills, tools, memory, and task patterns, but should not be copied into the production runtime without a concrete requirement, security review, dependency review, and staging validation.
