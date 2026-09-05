# Design System — LINE Flex Messages

Everything here is already implemented in `src/line/templates.ts`; this
document exists so the next person adding a screen (or designing a rich-menu
image) doesn't have to reverse-engineer it from code. When code and this
doc disagree, the code is correct — update this file to match.

## Color tokens

Defined as `BRAND` in `src/line/templates.ts`:

| Token | Hex | Use |
|---|---|---|
| `teal` | `#0B6E6A` | Primary brand color — headers, primary buttons |
| `tealStrong` | `#063F3D` | Info-tone header/accent, daily-report header |
| `tealTint` | `#E3F0EE` | Light highlight boxes, secondary-button backgrounds |
| `gold` | `#A97A2B` | Warning tone, secondary accent |
| `goldTint` | `#F4E9D4` | Warning highlight boxes, secondary-button backgrounds |
| `ink` | `#10201E` | Primary body text |
| `inkSoft` | `#5B6C69` | Secondary/caption text |
| `surface` | `#FFFFFF` | Card/bubble background |
| `paper` | `#F1F4F2` | (reserved — page-level background, unused inside Flex bubbles) |

Two colors outside `BRAND` are used for the error tone only: `#B42318`
(accent/header) and `#7A271A` (error body text, better contrast on the
error highlight box than pure `ink`).

## Tone → color mapping

Every message carries a `tone`: `info | success | warning | error`. It drives
three things at once — header accent color, the header's bold title-prefix
text ("Notice", "Done", "Needs attention"), and the body's highlight-box
background:

| Tone | Accent | Highlight box bg | Title prefix (EN / TH) |
|---|---|---|---|
| `info` | `tealStrong` | `tealTint` | *(none — uses the caller's own title)* |
| `success` | `teal` | `tealTint` | Done / สำเร็จ |
| `warning` | `gold` | `goldTint` | Notice / แจ้งเตือน |
| `error` | `#B42318` | `tealTint`, text in `#7A271A` | Needs attention / ต้องตรวจสอบ |

`inferTone()` (duplicated per-handler-file today, all following the same
regex-on-keywords pattern) derives this from the reply text itself — a
message containing "failed"/"ไม่สำเร็จ" becomes `error`, "success"/"สำเร็จ"
becomes `success`, etc. New handler files should copy that pattern rather
than inventing a new tone-detection scheme.

## Button contrast rule — read this before adding a button

**This was a real, shipped bug** (dark label text on a dark button
background, unreadable) — the rule below is how it was fixed, and why it
must hold for every future button:

LINE renders Flex button label text in a **fixed color LINE controls, not
you** — `style: 'primary'` always gets white text, `style: 'secondary'`
always gets dark text. The only thing `color` controls is the *background*.
That means:

- `style: 'primary'` → **must** use a dark/saturated `color` (`teal`,
  `tealStrong`, or the error red). White text needs a dark ground.
- `style: 'secondary'` → **must** use a light tint `color` (`tealTint` or
  `goldTint`). Dark text needs a light ground.

Never pair `secondary` with `teal`/`gold` (dark-on-dark, unreadable), and
never pair `primary` with a tint color (white-on-light, unreadable).

## Iconography

`SERVICE_ICON` in `templates.ts` — one emoji per service key, prefixed onto
its menu label:

| Service | Icon |
|---|---|
| `VERIFY` | 🔐 |
| `commerce` | 🛍️ |
| `directory` | 👥 |
| `catalog` | 📦 |
| `reporting` | 📊 |
| `groupBuy` | 🤝 |

A new service added to `SERVICE_CATALOG` (`src/services/service-catalog.ts`)
should get an entry here too, or it renders with no icon.

## Bubble anatomy

Every Flex message is a single `bubble` with the same three-part shape:

- **header** — colored background (tone accent or `teal`/`tealStrong`
  depending on message type), bold white title, an `xs`-size soft-white
  (`#DDEBE9`) subtitle line beneath it.
- **body** — white (`surface`) background; a highlight box in the tone's
  tint color for the main message; supporting rows in `ink`/`inkSoft`.
- **footer** — one or more full-width buttons, following the contrast rule
  above. The first/primary action always uses `teal`; a same-row secondary
  action uses the matching tint.

## Type scale

Only three text sizes appear anywhere: `xs` (captions, subtitles), `sm`
(body text and picker rows), `md`/`xl` (titles, hero numbers like a price or
total). NAV HOME / action lists reuse the committed rounded `box` tiles
(`cornerRadius` 12px, icon in the label). Type is `md` regular — not
`lg`+bold. LINE `button` components are for footers and GUIDE categories.

## Quick replies

`createBotTextFlexMessage` and `createFormPromptFlexMessage` both accept
`quickReplyActions` (max 13 items — LINE's hard cap, enforced by
`src/line/message-limits.ts`). Use them for the two-tap patterns already in
the product: Confirm/Cancel on a destructive action (`DELETE MY DATA`),
Skip/Cancel on an optional form field, 👍/👎 on an AI-fallback answer. Don't
build a new one-off destructive-confirm flow without them — LINE's own
"clarify before you commit" idiom is a quick reply, not a typed follow-up
command.

## What's intentionally out of scope here

The **LINE Rich Menu** (the persistent bottom-tray image) is a separate
visual surface from these Flex messages and is not covered by this token
set — it's a single uploaded PNG, currently auto-generated by tooling with
no icon/card/rounded-corner control (see the enterprise-readiness scope
report). When that gets a real design pass, it should still pull from the
`BRAND` palette above for consistency, even though the image itself lives
outside this codebase.
