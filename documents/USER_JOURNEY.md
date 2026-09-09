# User journey book — CloudNex Connect (LINE OA)

Capture this on the **staging** Official Account after Railway is green and the compact rich menu is published. English is the default. Thai appears only after **Language**. Do not screenshot OTP codes or real customer PII; use dummy Odoo partners.

Each step: send the listed command (tray or button), confirm the expected UI, then save one PNG into `documents/journey/` using the filename. Chat plus the native tray should be visible when the tray is part of the step.

Persona names: **Sora** (EN), **โซระ** (TH). Guide/home titles: **CloudNex Connect: Sora** / **CloudNex Connect: โซระ**.

---

## Setup (once per capture session)

1. Railway `/healthz` and `/readyz` are 200.
2. LINE webhook is `POST https://<host>/webhook`.
3. Compact tray is live (2×3: Home, Verify, Products & Quotes, Order Status, Help, Language). Gold is only on **Language** while English and on **Verify** while the sales session is on. After a generate/upload, set `LINE_RICH_MENU_EN`, `LINE_RICH_MENU_TH`, and `LINE_RICH_MENU_JSON` (includes `*-verified` ids) on Railway, then restart. Also `LINE_AGENT_NAME_EN=Sora` and `LINE_AGENT_NAME_TH=โซระ` or omit for the same defaults. `SALES_SESSION_TTL_HOURS` defaults to 24.
4. Sales onboard: add this Official Account as a friend, then **VERIFY**. Capture account language is English (or tap Language until English). Existing Firestore `language: th` stays Thai until Language is tapped.

---

## A — First open and tray

| # | Command | You should see | File |
|---|---|---|---|
| A1 | First message (any text) from a new user, or `NAV HOME` | PDPA notice (first contact only) + Flex home titled CloudNex Connect: Sora | `journey/a1-home-en.png` |
| A2 | Open chat-bar **Menu** | Compact 2×3: Home/Products/Orders/Help regular; **Verify regular** (off); **Language gold** (English on) | `journey/a2-tray-en.png` |
| A3 | `FORM VERIFY` (tray Verify) | Tray Verify turns **gold** on tap. Guided verify form in English. After success the gold stays (session on). Tap Verify again to unverify (regular). | `journey/a3-verify.png` |
| A4 | `NAV commerce` (tray Products & Quotes) | Service action list: find product, create quote, order status, my quotations | `journey/a4-products-quotes.png` |
| A5 | `FORM ORDER STATUS` (tray Order Status) | Order-status form prompt | `journey/a5-order-status.png` |
| A6 | `GUIDE` (tray Help) | Guide categories; header CloudNex Connect: Sora | `journey/a6-help-guide.png` |

---

## B — Sales: create, send, and confirm (tap order)

Capture on a LINE user who has **VERIFY** as an Odoo Sales User or Sales Administrator. `ADMIN ENABLE` is not required. Do not screenshot OTP codes. After each tap, wait for the **new** bubble (LINE never updates an old card).

| # | Tap / command | You should see | File |
|---|---|---|---|
| B1 | Tray **Products & Quotes** → **Create a quote**, or `FORM QUOTE CREATE` | Product name prompt. Product names in **chips under the composer**, not in the bubble body | `journey/b1-quote-product-chips.png` |
| B2 | Tap a product chip, then quantity | Quantity prompt | `journey/b2-quote-qty.png` |
| B3 | Customer name | Odoo partner **name chips** plus type-in | `journey/b3-quote-customer-name.png` |
| B4 | Customer phone | `Tap an option below…` then only **Saved in Odoo: &lt;phone&gt;**. Phone chips. After this phone is set, send later stores an OA-friend invite | `journey/b4-quote-phone.png` |
| B5 | Optional summary | Equal rows: label left, **value right bold**. Filled rows use a **green rounded-square tick** with a gap before the label | `journey/b5-quote-optional.png` |
| B6 | **Create now** (Action Verify on create) | **Quotation** card. Body: **Confirm \| Send**. Footer: **View Quote \| Download**, **More**, **Home** | `journey/b6-quote-draft.png` |
| B7 | **Send** | Composer (LINE / email chip / template). Action Verify only on confirm-send. Then Quotation Sent + success card. If the customer is not an OA friend: **Add friend** link + email, not “must VERIFY” | `journey/b8-quote-sent-admin.png` |
| B8 | Same order, **customer** OA card (after they add the OA / follow) | Body **Confirm**. Footer **View Quote \| Download**. No Send, More, or Home | `journey/b9-quote-sent-customer.png` |
| B9 | Staff **More** | More card: **Edit Quote**, Send Email, Cancel (Sales Admin only), Message customer, Create More, Back | `journey/b10-quote-more.png` |
| B10 | **Edit Quote** | **Edit Quote** card: each line Edit item / Remove; footer Add item + Back | `journey/b11-quote-edit.png` |

**Do not tap Confirm yet** if you still need B7–B8. Confirm on a draft jumps **Quotation → Sales Order** and skips Quotation Sent.

Footer **Send** and **More → Send Email** both open the same composer. Action Verify runs on confirm-send only.

---

## C — Approve, Sales Order, invoice

| # | Tap / command | You should see | File |
|---|---|---|---|
| C1 | Customer **Confirm** | Thank-you + Sales Order (View Quote \| Download + **Invoice**). Staff is pushed a Sales Order card. Success uses the green square tick | `journey/c1-customer-approve.png` |
| C2 | Staff **Confirm** on a *sent* quote (if C1 was skipped) | **Sales Order**. Body: **Invoice \| Send Invoice**. Footer: View Quote \| Download, More, Home | `journey/c2-sales-order-admin.png` |
| C3 | Customer OA card after sale | **Sales Order**; View Quote \| Download and **Invoice**. No More/Home | `journey/c3-sales-order-customer.png` |
| C4 | Staff **Invoice** (when invoice chip is To invoice) | Same Sales Order card; invoice chip updates. **Send Invoice** opens the composer. After send: **Send Invoice \| Print**. Action Verify only on confirm-send | `journey/c4-invoice-staff.png` |

Odoo analog: Send marks the quote sent; Confirm/Approve converts to sales order; Invoice / Send Invoice match the SO header. Not on LINE: e-sign, payment, delivery.

---

## Sales Administrator — LINE feature toggles

Odoo **Sales Administrator** (`sales_manager` after VERIFY) or LINE `role=admin` can turn the five LINE service groups on/off without redeploy. Sales User is refused. `ADMIN ENABLE` is not required. Env `ENABLED_SERVICES` / channel `_SERVICES` is a hard ceiling — a live ON cannot resurrect a key env omitted.

| Command | You should see |
|---|---|
| `SALES FEATURES` | Flex list of `commerce`, `directory`, `catalog`, `reporting`, `groupBuy`. Env-forced-off rows are grey with no button. |
| `SALES FEATURE catalog OFF` | Same list with catalog off. `SERVICE LIST` is then refused. |
| `SALES FEATURE catalog ON` | Catalog restored. If catalog is missing from env, the command is refused. |

`SALES FEATURES` is unmapped in the service catalog so turning `commerce` off cannot hide the kill-switch.

---

## D — Language and Thai proof

| # | Command | You should see | File |
|---|---|---|---|
| D1 | `LANG` | Reply that language switched to Thai; **Language gold is removed** (regular) | `journey/d1-lang-toggle.png` |
| D2 | `NAV HOME` in Thai | CloudNex Connect: โซระ | `journey/d2-home-th.png` |
| D3 | Tray in Thai | Same six labels; Language **regular**; Verify gold only if the sales session is on | `journey/d3-tray-th.png` |
| D4 | `GUIDE` in Thai | Header CloudNex Connect: โซระ | `journey/d4-guide-th.png` |
| D5 | `LANG` back to English | English copy again | `journey/d5-lang-en.png` |

If `FORM FIELD 8` is tapped with no open form, the reply must follow the **current** language (English default), not mixed Thai chrome.

---

## Screenshots

Drop files next to this doc:

![A1 Home EN](journey/a1-home-en.png)
![A2 Tray EN](journey/a2-tray-en.png)
![A3 Verify](journey/a3-verify.png)
![A4 Products & Quotes](journey/a4-products-quotes.png)
![A5 Order status](journey/a5-order-status.png)
![A6 Help](journey/a6-help-guide.png)
![B1 Product chips](journey/b1-quote-product-chips.png)
![B2 Qty](journey/b2-quote-qty.png)
![B3 Customer name](journey/b3-quote-customer-name.png)
![B4 Phone](journey/b4-quote-phone.png)
![B5 Optional](journey/b5-quote-optional.png)
![B6 Draft](journey/b6-quote-draft.png)
![B8 Sent admin](journey/b8-quote-sent-admin.png)
![B9 Sent customer](journey/b9-quote-sent-customer.png)
![B10 More](journey/b10-quote-more.png)
![B11 Edit Quote](journey/b11-quote-edit.png)
![C1 Approve](journey/c1-customer-approve.png)
![C2 SO admin](journey/c2-sales-order-admin.png)
![C3 SO customer](journey/c3-sales-order-customer.png)
![C4 Invoice](journey/c4-invoice-staff.png)
![D1 Lang](journey/d1-lang-toggle.png)
![D2 Home TH](journey/d2-home-th.png)
![D3 Tray TH](journey/d3-tray-th.png)
![D4 Guide TH](journey/d4-guide-th.png)
![D5 Lang EN](journey/d5-lang-en.png)

Staging files named here are observational guides; recapture after this work. Unmapped extras stay out of the book. After capture, commit only the journey filenames.

---

## Design freeze

Live OA + this book are the source of truth. Do not restyle Flex or the tray unless a capture step fails. Bugs (wrong command, Thai on default English, missing Send) get a small fix and a re-shot of that page only.

Out of scope until a new ticket: Odoo e-sign, payment capture, customer invoice, extra npm UI packages, a second command router, GraphQL LINE events.

Related: `documents/STORYBOARD.md` (capability status), `documents/DESIGN_SYSTEM.md` (tokens).
