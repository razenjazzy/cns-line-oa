# AGENTS.md

This repository is optimized for low-token, low-cost agent work. Follow these rules before making any changes.

## Core budget rules

1. Read the smallest possible context.
   - Start with [CLAUDE.md](CLAUDE.md) and [documents/REFACTOR_PLAN.md](documents/REFACTOR_PLAN.md).
   - Use search and symbol signatures first; avoid broad full-file reads unless the exact function or route is already identified.
   - Prefer narrow reads around known ranges, not whole files.

2. Do not re-explore known hotspots.
   - Already split, treat as source of truth (do not re-derive these shapes):
     - `src/services/firestore.ts` -> split into `src/services/firestore/*` + barrel
     - `src/services/odoo.ts` -> split into `src/services/odoo/*` + barrel
     - `src/index.ts` -> split into `src/http/*` route/middleware modules
       (health-routes, ops-routes, verify-routes, webhook-routes,
       jobs-routes, demo-routes, demo-session, middleware, runtime-state,
       env). `src/index.ts` itself is now a ~35-line orchestrator that only
       wires app.use()/registerXRoutes() calls — look in `src/http/` for
       actual route logic, not `src/index.ts`.
   - Planned but not yet split (`src/line/templates.ts`, `src/demo/page.ts`
     are still single flat files today) — see
     `documents/STAGED_IMPLEMENTATION_BACKLOG.md` Track B4 before assuming
     a `src/line/templates/*` directory exists.

3. Prefer targeted verification.
   - Run the smallest relevant test before and after a fix.
   - For refactors, use `npm run build` and the smallest affected Vitest file when possible.
   - Do not run the full suite unless the change affects shared behavior.

4. Keep behavior stable.
   - No new dependencies.
   - No duplicated routing.
   - No auth-chain weakening.
   - No separate LINE logic per service.

## Required repo constraints

- Preserve the architecture in [CLAUDE.md](CLAUDE.md).
- Keep LINE credentials in environment variables only.
- Reuse `resolveCommandReply` instead of duplicating webhook or command routing logic.
- Preserve the chain:
  `LINE identity -> Firestore profile -> odooVerified -> ADMIN_USER_ID allowlist -> Odoo admin capability -> role assignment`
- Preserve step-up OTP and write authorization checks.

## Refactor policy

Use barrel-preserving refactors whenever a large file is split:

- Create a folder for the feature or domain.
- Keep a thin re-export file at the original path.
- Do not update all import sites if a barrel can preserve compatibility.

Examples:

- `src/services/firestore.ts` should stay import-compatible while domain modules move under `src/services/firestore/`.
- `src/services/odoo.ts` should stay import-compatible while domain modules move under `src/services/odoo/`.
- `src/line/templates.ts` should stay import-compatible while UI modules move under `src/line/templates/`.

## Workflow for agents

1. Identify the exact file and symbol.
2. Check the existing plan before broad exploration.
3. Make one root-cause fix or one refactor step.
4. Verify with the smallest command that checks the changed behavior.
5. Stop once the targeted requirement is satisfied; do not broaden scope.

## Anti-patterns to avoid

- Reading too much of the repo to answer one localized question.
- Rewriting architecture without preserving the existing flow.
- Duplicating handlers, services, or route registration.
- Running broad suites for a tiny change.
- Creating generic frameworks without an actual use case.

## Completion standard

A task is only complete when:

- the exact behavior is validated,
- the relevant verification command passes, and
- the change stays within the repo’s architecture and budget constraints.

Use this file as the default operating policy for all future agent work in this repository.
