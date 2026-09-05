import { describe, expect, it } from 'vitest';
import { FLOW_SPECS } from '../src/services/guided-forms';
import { parseOdooFieldSkill } from '../src/services/odoo-field-skills';

describe('parseOdooFieldSkill', () => {
  it('parses an allowlisted field map and rejects fields_get-style dumps', () => {
    const parsed = parseOdooFieldSkill('validity-date.md', `---
model: sale.order
field: validity_date
widget: date
flow: QUOTE_CREATE
flowField: validityDate
---
`);
    expect(parsed).toEqual({
      file: 'validity-date.md',
      model: 'sale.order',
      field: 'validity_date',
      widget: 'date',
      flow: 'QUOTE_CREATE',
      flowField: 'validityDate',
      loader: undefined,
    });
    expect(parseOdooFieldSkill('bad.md', '---\nwidget: list\n---')).toBeNull();
  });
});

describe('FLOW_SPECS skill overlay', () => {
  it('marks quote validity as a date widget from skills/odoo-fields', () => {
    const field = FLOW_SPECS.QUOTE_CREATE.fields.find(item => item.key === 'validityDate');
    expect(field?.widget).toBe('date');
  });
});
