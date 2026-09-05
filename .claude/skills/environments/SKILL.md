---
name: environments
description: Use when changing APP_ENV, Railway staging, production flags, .env.example, or deploy variables.
---

# Environment lanes

Read `documents/ENVIRONMENTS.md` and `src/http/env-params.ts`.

- `development`: local + `/demo` + `/webhook-test`
- `staging`: Railway. Must set `APP_ENV=staging` (image `NODE_ENV=production` otherwise fail-closes). Demo flags required for a walkable demo.
- `production`: demo and webhook-test stay off even if `ENABLE_*` is set.

Do not commit secrets. Audit coverage with `auditEnvParams` / `GET /ops/platform`.
