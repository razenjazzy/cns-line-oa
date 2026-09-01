# Bot skills

Drop a `.md` file in this folder to add a new bot command — no code
required. The app loads every file here once at startup (restart the
server, or redeploy, to pick up changes/new files).

## Format

```markdown
---
command: HOURS
aliases: OPENING HOURS, เวลาเปิด
adminOnly: false
---

# th
ร้านเปิดทุกวันจันทร์-เสาร์ เวลา 09:00-18:00 น. ค่ะ

# en
We're open Monday-Saturday, 09:00-18:00.
```

- `command` — the word(s) a user types to trigger this skill (required).
- `aliases` — comma-separated extra trigger phrases (optional).
- `adminOnly` — `true` to restrict this skill to admins (optional, default `false`).
- `# th` / `# en` — the reply text in each language. At least one is required.

## Arguments

If either language body contains `{query}`, the skill matches as a prefix
(e.g. `TRACK 1234` for a skill with `command: TRACK`) and `{query}` is
replaced with whatever the user typed after the command word. Without
`{query}`, the skill only matches the exact command/alias with nothing
else after it.

## Rules

- A skill can never override a built-in command (`DEMO PRODUCT`, `USER
  CREATE`, `ADMIN VERIFY`, etc.) — built-in commands always take priority.
  Pick a `command` word that isn't already in use; try `SKILLS` in chat to
  see everything currently loaded (built-in menu commands aren't listed
  there, only skills).
- Keep replies short — they render as a LINE Flex Message card, not a wall
  of text.
- This is a static-reply mechanism only. For anything that needs to look
  up live data (Odoo, Firestore) or write anything, that's a TypeScript
  handler in `src/line/handlers/`, not a skill file.

See `src/services/skill-loader.ts` for the implementation.
