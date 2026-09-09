# Design System — LINE Flex Messages

Everything here is already implemented in `src/line/templates.ts`; this
document exists so the next person adding a screen (or designing a rich-menu
image) doesn't have to reverse-engineer it from code. When code and this
doc disagree, the code is correct — update this file to match. Tray and Flex
visuals are frozen until `documents/USER_JOURNEY.md` is signed off.

## Color tokens

Defined as `BRAND` in `src/line/templates.ts`:

| Token | Hex | Use |
|---|---|---|
| `teal` | `#0B6E6A` | Primary brand color — headers, primary buttons |
| `tealStrong` | `#063F3D` | Info-tone header/accent, daily-report header |
| `tealTint` | `#E3F0EE` | Light highlight boxes, secondary-button backgrounds |
| `gold` | `#A97A2B` | LANG (English on) and VERIFY (sales session on) only — never Home/commerce/orders/help |
| `goldTint` | `#F4E9D4` | Warning highlight boxes, secondary-button backgrounds |
| `ink` | `#10201E` | Primary body text |
| `inkSoft` | `#5B6C69` | Secondary/caption text |
| `surface` | `#FFFFFF` | Card/bubble background |
| `paper` | `#F1F4F2` | (reserved — page-level background, unused inside Flex bubbles) |

Result icons (`createResultIconBox`): 22px rounded square, `#12B76A` + white tick
for success, `#B42318` + white cross for fail. Used on optional-field chips
and Action Verify result cards, with `spacing: md` between icon and text.

Two extra colors for error tone: `#B42318` (icon/accent) and `#7A271A`
(error body text).

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
- **body** — white (`surface`) background; `paddingBottom: lg` so copy is
  not flush against footer buttons; highlight box in the tone tint; chips
  and labeled fields in `paper` / `tealTint` rounded boxes.
- **footer** — 1–2 primary CTAs. Secondary quote actions use More (quick
  replies or a second bubble), not a wall of tiny buttons.

## Action kinds

1. **List row** (`createTapRow`) — rounded 12px box, icon in the label,
   size `lg` on NAV Home/service rows, not bold. Home, service menus, GUIDE topics, pickers, quote
   list, optional-field rows, Language/Guide on Home. Not LINE `type: button`.
2. **Footer CTA** — Confirm/Send/Verify stay LINE `button` with the contrast rule.
3. **Input** — prefill keyboard or LINE `datetimepicker` only when the user
   must enter a **new** value. Date is a LINE date sheet, not a drawn clock.

Never re-ask a field the current card already established. Seed
`pendingFlow` / last-product context instead.

## Type scale

`xs` captions, `md` titles, `lg` NAV menu rows (not bold), `xl` hero numbers.

LINE has no native dropdown: Odoo lists are tap rows + quick replies
(max 13). Button labels cap at 20 characters. Half-width pairs stay short
(**Download**, **Invoice**, **Print**) so LINE does not clip them.

## Quick replies

`createBotTextFlexMessage` and `createFormPromptFlexMessage` both accept
`quickReplyActions` (max 13 items — LINE's hard cap, enforced by
`src/line/message-limits.ts`). Use them for the two-tap patterns already in
the product: Confirm/Cancel on a destructive action (`DELETE MY DATA`),
Skip/Cancel on an optional form field, 👍/👎 on an AI-fallback answer. Don't
build a new one-off destructive-confirm flow without them — LINE's own
"clarify before you commit" idiom is a quick reply, not a typed follow-up
command.

## Rich menu (native LINE tray)

The chat-bar **Menu** panel is a PNG (`assets/rich-menu/`), not Flex. Compact
LINE size **2500×843** (not the tall 2500×1686 canvas). Tokens:

- Canvas: `#F3F5F4`. Tile pad **20px**, corner radius **28px**, label **48px**
  semibold sentence case
- Default tiles: `tealTint` fill, `tealStrong` marks
- Language gold **only** on the English tray (LANG on). Thai tray: Language regular
- Verify gold **only** on `*-verified` PNGs (sales session on). Tap Verify again, TTL, or unfollow → regular
- Home / Products & Quotes / Order Status / Help are never gold. Current screen = `teal`
- After a tray tap LINE links `menu-{lang}-{id}.png` or `menu-{lang}-{id}-verified.png` via `LINE_RICH_MENU_JSON`
- Layout 2×3, icon above text: Home (`NAV HOME`), Verify, Products & Quotes
  (`NAV commerce`), Order Status (`FORM ORDER STATUS`), Help (`GUIDE`),
  Language
- Languages: `menu-en.png` + `menu-th.png`, plus `*-verified.png` when the
  sales session is on. Default is English (Language gold, Verify regular).
  `LANG` and session state link `LINE_RICH_MENU_TH` / `LINE_RICH_MENU_EN`
  plus verified ids from `LINE_RICH_MENU_JSON`
- Chat bar: `Menu` / `เมนู`

Regenerate with `npm run rich-menu:generate`. Publish with
`npm run rich-menu:upload` on a laptop, then set the new
`LINE_RICH_MENU_JSON` (and EN/TH ids) on Railway. Railway does not publish
the tray; it only stores the rich-menu ids. Upload does not delete older menus.

**Freeze:** do not restyle this tray until `documents/USER_JOURNEY.md` is
signed off with screenshots.
