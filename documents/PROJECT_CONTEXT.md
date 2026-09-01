# Project Overview

## Purpose
[What the application does]

## Tech Stack
- TypeScript
- Node.js
- LINE Messaging API
- [database]
- [deployment]

## Architecture

src/index.ts
Application entry point.

src/line/webhook.ts
Receives LINE webhook events.

src/line/command-router.ts
Routes user commands.

src/line/command-validators.ts
Validates command input.

src/line/messaging.ts
Handles LINE messages.

src/line/templates.ts
Message templates.

src/jobs/
Scheduled/background jobs.

## Coding Rules

- TypeScript strict mode.
- Do not use `any`.
- Reuse existing services where possible.
- Do not modify unrelated files.
- Do not introduce dependencies without approval.
- Run typecheck before considering a task complete.

## Current Development Status

[Feature 1] — Complete
[Feature 2] — In progress
[Feature 3] — Planned