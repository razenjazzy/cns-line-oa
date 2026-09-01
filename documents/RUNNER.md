# Runner System

A single orchestrator (`runner.sh`) to set up, verify, run, and validate deployment for
both halves of this repo:

- **backend** — `cns-line-oa` TypeScript/Express LINE bot
- **claw** — `clawframework` Python research framework (main.py + clawspring)

## Quick start

```bash
./runner.sh setup          # install backend npm deps + claw python deps
./runner.sh health         # non-destructive full verification (compile + build + test)
./runner.sh all            # setup -> verify -> run backend server (blocking)
```

These are also exposed as npm scripts (`npm run runner:health`, etc.).

## Commands

| Command | What it does |
|---|---|
| `setup` | `npm install` + install clawframework python deps |
| `backend:install` | Install npm deps |
| `backend:build` | `tsc` TypeScript build |
| `backend:test` | Full Vitest suite |
| `backend:dev [port]` | Build + run backend server (blocking) |
| `backend:smoke [url]` | HTTP smoke test (`/healthz`, `/readyz`) of a running server |
| `claw:setup` | Provision python venv + deps |
| `claw:check` | Compile every `.py` in `clawframework` |
| `claw:run` | Run `clawframework/main.py` once (Groq by default) |
| `claw:tests` | clawspring pytest suite |
| `deploy:check [env]` | Deploy-env validation + `docker build` (no push) |
| `health` | `claw:check` + `backend:build` + `backend:test` |
| `all` | Setup → verify → run backend |

## Configuration

Defaults live in `runner.conf` (overridable via env vars):

- `PORT` / `BACKEND_PORT` — backend port (default 8080)
- `PYTHON_BIN` — python interpreter (default `.venv/bin/python`)
- `CLAW_PROVIDER` / `CLAW_PROMPT` — default model call for `claw:run`
- `DEPLOY_ENV` — deployment target for `deploy:check` (default staging)
- `SMOKE_BASE_URL` — optional remote URL for `backend:smoke`

## Notes

- `backend:dev`/`backend:smoke` require cloud service deps (Firestore etc.) to be
  reachable; `healthz`/`readyz` only serve once `startServer()`'s initialisation completes.
- `claw:run` needs a valid `GROQ_API_KEY` / `OPENROUTER_API_KEY` in the environment.
- `deploy:check` runs the existing `scripts/preflight-check.sh` + `docker build`
  (it never pushes).
