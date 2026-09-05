# Odoo field skills (allowlist)

These files map **named** Odoo fields to LINE widgets. They are **not**
chat commands (the FAQ loader only reads `skills/*.md`, not this folder).

The bot never calls `fields_get` on a whole model. Add a file here only
for a field the guided form already handles.

```markdown
---
model: product.product
field: name
widget: list
flow: QUOTE_CREATE
flowField: productName
loader: products
---
```

- `widget`: `text` | `list` | `date` | `toggle`
- `flow`: `FLOW_SPECS` key (`QUOTE_CREATE`, `PRODUCT_FIND`, …)
- `flowField`: guided-form field `key`
- `loader` (list only): `products` | `services` | `paymentTerms`
