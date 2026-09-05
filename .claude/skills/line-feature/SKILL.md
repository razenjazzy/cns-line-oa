# LINE Feature Implementation

Use this skill for features affecting LINE interactions.

## Relevant architecture

Primary flow:

LINE webhook
→ `src/line/webhook.ts`
→ user/profile lookup
→ `src/line/command-router.ts`
→ service logic
→ LINE reply / Flex UI.

## Investigation

Inspect only the files relevant to the requested feature.

Start with:

- `src/line/webhook.ts`
- `src/line/command-router.ts`
- `src/line/templates.ts`
- `src/line/messaging.ts`
- directly related files in `src/services/`
- relevant tests

Do not explore the whole repository unnecessarily.

## Implementation

Preserve the existing architecture.

Do not duplicate command-routing logic.

Reuse:

- existing command patterns
- existing services
- existing Firestore user/profile patterns
- existing LINE Flex Message patterns

For multi-LINE OA support:

1. Resolve the channel.
2. Validate the request using that channel's credentials.
3. Create channel context.
4. Pass channel context into the existing flow.
5. Reuse the existing command router.

Do not create separate webhook or router implementations for every LINE OA.

## Interactive UI

Prefer existing LINE-native patterns:

- Flex Messages
- Buttons
- Quick replies
- Guided navigation

Keep text-command compatibility where practical.

Nav Home / action lists / GUIDE topics use `createTapRow` (`sm`, icon in the label, no bold). Footer Language/Guide/Home stay `createMessageActionButton`. Prefill or date picker only when the user must type a new value. Do not re-ask a product (or other field) the current card already showed.

For Odoo field → LINE widget maps (not chat commands), see `skills/odoo-fields/`.

## Verification

Run targeted tests first.

Then run:

```bash
npm run build
