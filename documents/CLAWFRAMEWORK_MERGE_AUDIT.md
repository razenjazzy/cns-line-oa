# ClawFramework merge audit

## Phase 1 decision

This repository already contains the only parts that are actually required for runtime integration:

- [src/services/clawframework.ts](../src/services/clawframework.ts) — the TypeScript adapter that calls the Python bridge in dev/staging only.
- [src/services/chat.ts](../src/services/chat.ts) — the provider cascade integrating the ClawFramework bridge as a fallback layer.
- [clawframework/bridge.py](../clawframework/bridge.py) — the Python entry point that actually exposes the provider call.
- [src/services/ai-circuit-breaker.ts](../src/services/ai-circuit-breaker.ts) — the retry/circuit logic used around the bridge.

These are the only live runtime pieces that matter to the production app.

## Keep in backup

The following should remain in backup or as optional reference material and not be merged into the main runtime:

- [.backup/clawframework-vendor](../.backup/clawframework-vendor) — full vendor source snapshot; historical/reference only.
- [clawframework/clawspring](../clawframework/clawspring) — the full ClawSpring workspace, including REPL, memory, voice, plugin, task, multi-agent, and MCP subsystems. This is a strong reference implementation, but it is not required to run the current LINE/Odoo service.
- [clawframework/main.py](../clawframework/main.py) — demo/CLI entrypoint, not used by the app runtime.
- [clawframework/server.py](../clawframework/server.py) — optional server helper, not currently used by the app.
- [clawframework/mock.py](../clawframework/mock.py) — mock/testing harness, not required for this project runtime.

## Required to merge

Only the minimal boundary should be kept active:

1. A small TypeScript adapter file, already present in [src/services/clawframework.ts](../src/services/clawframework.ts)
2. A single Python bridge script, already present in [clawframework/bridge.py](../clawframework/bridge.py)
3. Runtime hooks in [src/services/chat.ts](../src/services/chat.ts) and [src/services/ai-circuit-breaker.ts](../src/services/ai-circuit-breaker.ts)
4. Environment-gated usage only (`CLAWFRAMEWORK_ENABLED`, `NODE_ENV !== 'production'`)

This is the smallest and safest integration footprint.

## Duplicates and dead code

The current repo already shows duplication risk without final merge:

- The full ClawSpring framework in [clawframework/clawspring](../clawframework/clawspring) overlaps with the repo's own AI/chat infrastructure and should not be merged into the main app layer.
- Most of the ClawSpring Python packages (`memory`, `plugin`, `task`, `voice`, `mcp`, `multi_agent`) are features this LINE/Odoo app is not directly using.
- Those components are reference-grade, not runtime-critical for the current system.
- They should not be copied into production code unless we intentionally decide to adopt a full agent shell.

## Recommendation for Phase 1

Do not merge the full ClawSpring vendor tree into the active app. Keep it in backup/reference and keep only the minimal bridge contract active.

The Phase 1 cleanup should do the following:

- keep active runtime files as-is
- move full vendor/reference code to backup
- preserve the small adapter pattern between TypeScript and Python
- avoid any broad rewrite or cross-copying from the larger ClawSpring framework

## Next phase

Phase 2 will be a strict extraction step:

- isolate only the reusable orchestration patterns that matter to this app
- remove unnecessary ClawSpring references from the production path
- leave the full framework archive intact in backup
- build a small enterprise adapter contract around Odoo + LINE + optional future ERP providers
