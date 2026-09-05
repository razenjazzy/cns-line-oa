# Demo day — 5 September 2026

Presenter script for a walkable architecture demo. Live surface: `/demo`. Web chat uses the same `resolveCommandReply` as LINE.

## Do not say

- GraphQL is how LINE events arrive.
- Mongo is the ERP or the user store.
- Admin is “just a LINE user who verified Odoo.”

## Stores in one sentence

Firestore holds LINE identity, PDPA, guided-form `pendingFlow`, group-buy sessions, audit, and chat history. Odoo holds partners, products, and quotations via `getErpAdapter()`. Mongo (optional) holds `skill_embeddings` and `chat_embeddings` only.

## Talk track (about 12 minutes)

1. Open `/demo`. If production-gated, log in with `DEMO_CONTROL_TOKEN`. Point at **Refresh Connections**: LINE, Firestore, Odoo. Mongo may be “not configured” — that is fine.
2. Open **Interactive Bot — Web Chat**. Send any first message. Expect PDPA + home menu. Same router as `POST /webhook`.
3. Use **Try “create a quote”** or type `FORM QUOTE CREATE`. Complete the guided fields. A real `sale.order` is created when Odoo is up. Mutations still need step-up OTP for verified users on LINE.
4. Click **Run Full Simulation Flow**. Walk the journey steps: seed, partner, product, quotation readback.
5. Optional read-only: `PRODUCT FIND App` via `/webhook-test` (sync; never enable async LINE on this demo host unless Redis + `npm run worker` are running).
6. Ops add-ons, not the bot: `/readyz`, `/ops/platform`, `/api-docs` and `POST /graphql` (`healthz` public; `platformModules` / `platformStatus` / `kpi` need ops token). Do not send LINE webhooks here.
7. If `MONGO_VECTOR_ENABLED` is off, skip FAQ. If on, unmatched chat may search embeddings after Gemini; `FEEDBACK GOOD` upserts Q/A into `chat_embeddings`.
8. Close: admin chain is LINE identity → Firestore profile → `odooVerified` → `ADMIN_USER_ID` allowlist → Odoo admin capability → `role = admin`.

## Commands worth typing live

| Command | Why |
|---|---|
| `NAV HOME` | Channel-gated Flex menu |
| `FORM PRODUCT FIND` | Catalog search in Odoo |
| `FORM QUOTE CREATE` | Commerce write path |
| `QUOTE LIST` | Readback |
| `VERIFY STATUS` | Identity, not admin |
| `SKILLS` | Markdown skills cannot override TS commands |

## Module map

`GET /demo/platform` and GraphQL `platformModules` (ops auth) return `src/platform/service-modules.ts`. That catalog is inventory and talk track, not a second command router.

## If something is red

- Odoo ping fails: still show chat + PDPA + home; skip quotation create.
- Firestore missing: identity and forms will fail; stop and fix `GOOGLE_CLOUD_PROJECT`.
- LINE token missing: `/demo/chat` still works; live OA webhook will not.
