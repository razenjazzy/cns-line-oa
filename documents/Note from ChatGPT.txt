LINE Rich Message UI Plan

Goal
Make the LINE OA feel like an interactive customer-service bot, not a command
terminal. Customers should be able to tap menu buttons, choose services, and
fill required information through the normal LINE chat input one step at a time.

Important LINE UX Rule
Flex Message does not provide a real text input field inside the message bubble.
The best native pattern is:

1. User taps a button.
2. Bot asks for one piece of information.
3. User types the answer in the LINE chat input box.
4. Bot validates the answer and asks the next question.
5. Bot submits the final command after all required fields are collected.

Flexbox-Inspired Design Elements

Use the W3C CSS Flexbox mental model when designing LINE Flex Messages. LINE Flex
Message is not full CSS, but the same layout ideas make customer journeys easier
to understand:

- Container first:
  Treat every bubble as a flex container with clear sections: header, body,
  footer.

- Main axis:
  Use vertical layout for journeys, forms, menus, and summaries. A vertical main
  axis matches how people read chat messages.

- Cross axis:
  Use horizontal layout only for small peer actions, such as Language + Guide or
  Back + Home.

- Nested boxes:
  Build two-dimensional layouts by nesting horizontal boxes inside vertical
  boxes. Example: a vertical product card with one horizontal row for price and
  stock.

- Logical order:
  Keep source order and visual order the same. Header comes first, then context,
  then actions. Avoid visual reordering that makes the chat hard to follow.

- Equal-size action blocks:
  Keep service buttons the same height and spacing. Customers should scan the
  menu without guessing which action is more important.

- Bottom action area:
  Place primary actions in the body or footer consistently. The final Home or
  Back button should always sit at the bottom.

- Wrapping:
  Enable text wrapping on titles, labels, and descriptions. Never rely on a long
  single-line label fitting inside a button or bubble.

- Overflow safety:
  Use short labels, truncate button labels when needed, and split long choices
  into carousel bubbles.

- Avoid out-of-flow overlays:
  The W3C flexbox specification notes that absolutely positioned children do not
  participate in flex layout. For this LINE OA, avoid overlay-style UI ideas.
  Keep every visible element inside the normal header/body/footer flow so nothing
  covers text, buttons, or status information.

Design Source

- W3C CSS Flexible Box Layout Module Level 1:
  https://www.w3.org/TR/css-flexbox-1/#abspos-items

Current Architecture To Use

LINE webhook
-> src/line/webhook.ts
-> src/line/command-router.ts
-> src/services/service-catalog.ts
-> src/line/templates.ts
-> src/services/guided-forms.ts
-> Odoo / Firestore / external services

Do not create a second router for rich messages. Buttons should send normal
message text such as NAV HOME, NAV commerce, FORM DEMO QUOTE, or SERVICE LIST.
That keeps rich UI and text-command fallback in the same command path.

UX Journey Map

The customer should always understand three things:

1. Where am I?
2. What can I do next?
3. What information does the bot need from me?

Journey screen sequence:

Screen 1: Home Menu
- Purpose: choose a service.
- Layout: vertical bubble with service buttons.
- Exit paths: service button, language, guide.

Screen 2: Service Action Menu
- Purpose: choose one task inside the selected service.
- Layout: vertical bubble with action buttons and Home in footer.
- Exit paths: action button, Home.

Screen 3: Guided Form Prompt
- Purpose: collect one required value.
- Layout: text prompt with quick replies.
- Exit paths: user answer, Cancel, Skip when optional.

Screen 4: Validation Feedback
- Purpose: explain an invalid answer and ask again.
- Layout: short text prompt with Cancel and optional Skip.
- Exit paths: corrected answer, Cancel.

Screen 5: Result Message
- Purpose: show what happened.
- Layout: summary Flex bubble or carousel.
- Exit paths: Home, related next action.

Screen 6: Recovery Menu
- Purpose: help after unclear input or unknown command.
- Layout: short text plus Home Menu Flex bubble.
- Exit paths: any menu button.

First-Click Menu

When the customer sends any start/help/menu text:

- MENU
- HELP
- START
- OPTIONS
- เริ่มต้น

The bot should immediately reply with a Flex Message menu, not a long text list.

Concrete layout:

Flex Message: Home Menu

type: bubble

header box:
- background: brand teal
- text: "<agent name> menu"
- subtext: "Tap a service to continue"
- text color: white or light tint only

body box:
- vertical layout
- one primary button per service
- examples:
  - Verify account
  - Products & Quotes
  - Catalog
  - Group-Buy
  - Reporting, admin only
  - Customers, admin only

footer box:
- horizontal layout
- secondary button: Language
- secondary button: Guide

Button actions:
- Verify account -> FORM VERIFY
- Products & Quotes -> NAV commerce
- Catalog -> NAV catalog
- Customers -> NAV directory
- Reporting -> NAV reporting
- Group-Buy -> NAV groupBuy
- Language -> LANG EN or LANG TH
- Guide -> GUIDE

Service Action Menu

After the customer taps a service button, the bot should reply with another Flex
Message showing the actions inside that service.

Concrete layout:

Flex Message: Service Actions

type: bubble

header box:
- background: brand teal
- text: service name
- color: white

body box:
- vertical layout
- primary buttons for actions

footer box:
- primary or secondary button: Home
- action: NAV HOME

Products & Quotes actions:
- Find a product -> FORM DEMO PRODUCT
- Create a quote -> FORM DEMO QUOTE
- Check an order -> FORM DEMO ORDER

Catalog actions:
- Browse catalog -> SERVICE LIST
- Find a service -> FORM SERVICE READ
- Add an item -> FORM SERVICE CREATE, admin only

Customers actions:
- Look up a customer -> FORM USER READ, admin only
- Add a customer -> FORM USER CREATE, admin only

Reporting actions:
- Daily report -> DEMO REPORT, admin only

Guided Form Pattern

For actions that need information, use guided forms. The form should feel like a
chat conversation:

Example: Create Quote

User taps:
Create a quote

Bot asks:
"Product name?"

User types:
"App Premium Plan"

Bot asks:
"Quantity?"

User types:
"1"

Bot asks:
"Customer's name?"

User types:
"Somchai"

Bot asks:
"Customer's phone?"

User types:
"0812345678"

Bot submits:
DEMO QUOTE App Premium Plan,1,Somchai,0812345678

Bot replies with:
Order summary Flex Message

Guided forms to support:

- FORM VERIFY
  - phone
  - final command: VERIFY START <phone>

- FORM DEMO PRODUCT
  - productName
  - final command: DEMO PRODUCT <productName>

- FORM DEMO QUOTE
  - productName
  - qty
  - customerName
  - phone
  - final command: DEMO QUOTE <productName>,<qty>,<customerName>,<phone>

- FORM DEMO ORDER
  - reference
  - final command: DEMO ORDER <reference>

- FORM SERVICE READ
  - identifier
  - final command: SERVICE READ <identifier>

- FORM SERVICE CREATE, admin only
  - name
  - code
  - price
  - final command: SERVICE CREATE <name>,<code>,<price>

- FORM USER READ, admin only
  - phone
  - final command: USER READ <phone>

- FORM USER CREATE, admin only
  - name
  - phone
  - email, optional
  - final command: USER CREATE <name>,<phone>,<email?>

Carousel Layouts

Use carousel Flex Messages when the customer needs to compare multiple items.
Use a simple bubble menu when the customer needs to choose one navigation path.

Good carousel use cases:

- product search results
- catalog/service list
- group-buy campaigns
- recent orders
- recommended next actions after a completed flow

Concrete product carousel bubble:

header:
- product category or "Product"

body:
- product name
- price
- stock
- short description

footer buttons:
- Create quote -> FORM DEMO QUOTE, or prefilled DEMO QUOTE when safe
- More details -> DEMO PRODUCT <name>

Concrete order carousel bubble:

header:
- order reference

body:
- status
- total
- last update

footer buttons:
- Refresh status -> DEMO ORDER <reference>
- Home -> NAV HOME

Color And Visibility Rules

Avoid dark text on dark backgrounds.

Use this contrast pairing:

- teal background: white text
- teal button: default button text should be readable in LINE
- white surface: dark ink text
- light teal tint: dark teal or dark ink text
- gold button: white or high-contrast text

Do not place dark ink text directly on:

- teal
- tealStrong
- gold
- any dark background

Recommended color tokens:

- brand teal: #0B6E6A
- strong teal: #063F3D
- light teal tint: #E3F0EE
- gold: #A97A2B
- white surface: #FFFFFF
- dark ink: #10201E
- muted ink: #5B6C69

Customer Communication Principles

- Prefer buttons for common choices.
- Ask for one field at a time.
- Keep every prompt short.
- Always include Cancel during a form.
- Include Skip only for optional fields.
- Send Home after cancellation or unclear input.
- Hide admin-only buttons for normal customers.
- Keep text-command fallback available for staff and testing.
- Use bilingual Thai/English labels where the current user language requires it.

Implementation Checklist

- src/line/templates.ts
  - Home menu Flex bubble with nav buttons.
  - Service action Flex bubble with action buttons.
  - Product/order/result carousels when showing multiple records.
  - Explicit readable colors on every dark background.

- src/services/service-catalog.ts
  - Each visible service maps to user-friendly button actions.
  - Actions requiring data should use FORM commands.
  - Admin-only actions should be marked requiresAdmin.

- src/services/guided-forms.ts
  - Define every form field.
  - Validate each answer.
  - Rebuild the original command after completion.

- src/line/command-router.ts
  - MENU/HELP/START/OPTIONS should return NAV HOME Flex UI.
  - Empty parameter commands should start forms.
  - Completed forms should re-enter normal command handling.
  - Unknown or unclear input should include the Home menu.

Recommended Customer Flow

1. Customer opens chat.
2. Customer taps or types MENU.
3. Bot shows Home Menu.
4. Customer taps Products & Quotes.
5. Bot shows action buttons.
6. Customer taps Create a quote.
7. Bot asks required fields one at a time.
8. Customer fills answers in the LINE input box.
9. Bot creates quote in Odoo.
10. Bot replies with a clear summary Flex Message and a Home button.
