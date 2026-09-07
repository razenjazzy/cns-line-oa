# User journey book — CloudNex Connect (LINE OA)

Capture this on the **staging** Official Account after Railway is green and the compact rich menu is published. English is the default. Thai appears only after **Language**. Do not screenshot OTP codes or real customer PII; use dummy Odoo partners.

Each step: send the listed command (tray or button), confirm the expected UI, then save one PNG into `documents/journey/` using the filename. Chat plus the native tray should be visible when the tray is part of the step.

Persona names: **Sora** (EN), **โซระ** (TH). Guide/home titles: **CloudNex Connect: Sora** / **CloudNex Connect: โซระ**.

---

## Setup (once per capture session)

1. Railway `/healthz` and `/readyz` are 200.
2. LINE webhook is `POST https://<host>/webhook`.
3. Compact tray is live (2×3: Home, Verify, Products & Quotes, Order Status, Help, Language). If the tray is still the tall old grid, run `npm run rich-menu:generate` then `npm run rich-menu:upload` on a laptop, set these on Railway, restart:
   - `LINE_RICH_MENU_EN=richmenu-f6c30110b71f3635710f869521f4210c`
   - `LINE_RICH_MENU_TH=richmenu-cbfe12eff9d8432dde9df117e1a3ecad`
   (ids from the compact PNG upload on 2026-09-08). Also set `LINE_RICH_MENU_JSON` from that upload, plus `LINE_AGENT_NAME_EN=Sora` and `LINE_AGENT_NAME_TH=โซระ` or omit for the same defaults.
4. Capture account language is English (or tap Language until English). Existing Firestore `language: th` stays Thai until Language is tapped.

---

## A — First open and tray

| # | Command | You should see | File |
|---|---|---|---|
| A1 | First message (any text) from a new user, or `NAV HOME` | PDPA notice (first contact only) + Flex home titled CloudNex Connect: Sora | `journey/a1-home-en.png` |
| A2 | Open chat-bar **Menu** | Compact 2×3 PNG: Home, Verify (dark teal), Products & Quotes, Order Status, Help, Language (gold) | `journey/a2-tray-en.png` |
| A3 | `FORM VERIFY` (tray Verify) | Guided verify form in English | `journey/a3-verify.png` |
| A4 | `NAV commerce` (tray Products & Quotes) | Service action list: find product, create quote, order status, my quotations | `journey/a4-products-quotes.png` |
| A5 | `FORM ORDER STATUS` (tray Order Status) | Order-status form prompt | `journey/a5-order-status.png` |
| A6 | `GUIDE` (tray Help) | Guide categories; header CloudNex Connect: Sora | `journey/a6-help-guide.png` |

---

## B — Sales: create and send a quote

Admin chain must already be complete (`odooVerified` + `ADMIN_USER_ID` + Odoo admin capability).

| # | Command | You should see | File |
|---|---|---|---|
| B1 | `FORM QUOTE CREATE` | Product name prompt. Product names in **quick-reply chips only**, not listed in the bubble body | `journey/b1-quote-product-chips.png` |
| B2 | Pick a product chip, then quantity | Quantity prompt | `journey/b2-quote-qty.png` |
| B3 | Customer name | Odoo partner **name chips** plus type-in | `journey/b3-quote-customer-name.png` |
| B4 | Customer phone | Odoo **phone chips** (matched partner first) plus type-in | `journey/b4-quote-phone.png` |
| B5 | Optional summary | Equal rows: label left, **value right bold**. Payment term default Immediate Payment (or Odoo `default_get`) | `journey/b5-quote-optional.png` |
| B6 | Create now (after step-up OTP if asked) | Journey card label **Quotation**; footer **Confirm \| Send**, View Quote, Download PDF, **Create More**, Home. Edit/Cancel stay under More for admin / sales manager | `journey/b6-quote-draft.png` |
| B7 | `QUOTE SEND <id>` | Send composer: partner email as To, chip + Type email + Send | `journey/b7-quote-send-composer.png` |
| B8 | `QUOTE SEND CONFIRM <id>` or chip with email | Admin card **Quotation Sent**; Confirm remains. Customer (if verified) gets Approve / View Quote / Download PDF | `journey/b8-quote-sent-admin.png` |
| B9 | Same order, customer chat | Customer card: Approve, View Quote, Download PDF. No Confirm/Home | `journey/b9-quote-sent-customer.png` |

---

## C — Approve and sales order

| # | Command | You should see | File |
|---|---|---|---|
| C1 | Customer `QUOTE APPROVE <id>` | Customer thank-you; sales admin is pushed a confirmation-style journey card | `journey/c1-customer-approve.png` |
| C2 | Sales `QUOTE CONFIRM <id>` on a sent quote (if not already sale) | Label **Sales Order** | `journey/c2-sales-order-admin.png` |
| C3 | Customer chat after sale | **Sales Order**; only **Download PDF** | `journey/c3-sales-order-customer.png` |

Odoo web analog: email send uses partner email; confirm converts quotation → sales order; PDF is the order report. Not in this card: e-sign, payment, customer-side invoice (sales **More** only).

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
| D1 | `LANG` | Reply that language switched; tray PNG swaps | `journey/d1-lang-toggle.png` |
| D2 | `NAV HOME` in Thai | CloudNex Connect: โซระ | `journey/d2-home-th.png` |
| D3 | Tray in Thai | หน้าหลัก, ยืนยันตัวตน, สินค้าและใบเสนอราคา, สถานะออเดอร์, ช่วยเหลือ, ภาษา | `journey/d3-tray-th.png` |
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
![B7 Send composer](journey/b7-quote-send-composer.png)
![B8 Sent admin](journey/b8-quote-sent-admin.png)
![B9 Sent customer](journey/b9-quote-sent-customer.png)
![C1 Approve](journey/c1-customer-approve.png)
![C2 SO admin](journey/c2-sales-order-admin.png)
![C3 SO customer](journey/c3-sales-order-customer.png)
![D1 Lang](journey/d1-lang-toggle.png)
![D2 Home TH](journey/d2-home-th.png)
![D3 Tray TH](journey/d3-tray-th.png)
![D4 Guide TH](journey/d4-guide-th.png)
![D5 Lang EN](journey/d5-lang-en.png)

Until PNGs exist, GitHub will show broken images. That is expected. After capture, commit only those files.

---

## Design freeze

Live OA + this book are the source of truth. Do not restyle Flex or the tray unless a capture step fails. Bugs (wrong command, Thai on default English, missing Send) get a small fix and a re-shot of that page only.

Out of scope until a new ticket: Odoo e-sign, payment capture, customer invoice, extra npm UI packages, a second command router, GraphQL LINE events.

Related: `documents/STORYBOARD.md` (capability status), `documents/DESIGN_SYSTEM.md` (tokens).
