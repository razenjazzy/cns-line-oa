# Copilot Instructions for cns-line-oa

This repository is designed for efficient, budget-aware agent work. Keep every change narrow, architecture-aware, and verification-first.

## Budget-first operating rules

- Read only the exact file and nearby lines needed for the task.
- Start from [CLAUDE.md](../CLAUDE.md) and [documents/REFACTOR_PLAN.md](../documents/REFACTOR_PLAN.md) before exploring more.
- Prefer grep and symbol signatures over reading massive files end-to-end.
- Do not re-open the same file multiple times unless the missing fact is required for the fix.
- Stop as soon as the implementation path is clear.

## Repo-specific guardrails

- Do not duplicate command routing or webhook handling.
- Keep the auth flow intact: LINE identity -> Firestore profile -> odooVerified -> ADMIN_USER_ID -> Odoo admin capability -> role assignment.
- Use env-based channel configuration only; never hardcode LINE credentials.
- For large refactors, prefer barrel-preserving splits rather than breaking imports.
- Preserve the existing service boundaries and `resolveCommandReply` flow.

## Verification policy

- Prefer the smallest relevant test or build step.
- For refactors, keep validation focused and fast.
- Run the full suite only when the change affects shared behavior.
- Verify the result before claiming success.

## Do not do

- broad exploratory reads of the full codebase
- unnecessary rewrites or abstraction layers
- adding dependencies without a concrete need
- behavior changes that are unrelated to the task
- any weakening of the admin or verification chain

These instructions are intended to keep agent-driven work cheap, predictable, and consistent with the project architecture.
