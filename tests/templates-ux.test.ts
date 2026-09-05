import { describe, expect, it } from 'vitest';
import { createOptionalSummaryFlexMessage, createProductCardFlexMessage, createQuotationJourneyFlexMessage, createQuotationListFlexMessage } from '../src/line/templates';

describe('product card quote CTA', () => {
  it('starts quote create from the card without re-asking the product', () => {
    const message = createProductCardFlexMessage('App Premium', 100, 3, 'en');
    const json = JSON.stringify(message);
    expect(json).toContain('FORM QUOTE CREATE FROM CARD');
    expect(json).not.toContain('"text":"FORM QUOTE CREATE"');
  });
});

describe('optional summary', () => {
  it('hides empty values and does not show not set', () => {
    const message = createOptionalSummaryFlexMessage({
      title: 'Quote',
      fields: [{ index: 4, label: 'Note' }, { index: 5, label: 'Discount', value: '10' }],
      language: 'en',
      finalizeLabel: 'Create now',
    });
    const json = JSON.stringify(message);
    expect(json).not.toContain('not set');
    expect(json).toContain('10');
    expect(json).toContain('✓');
  });
});

describe('quotation journey invoice chip', () => {
  it('shows Odoo invoice_status on the card', () => {
    const message = createQuotationJourneyFlexMessage({
      id: 1,
      name: 'S0001',
      state: 'sale',
      amount_total: 100,
      invoice_status: 'to invoice',
      amount_invoiced: 0,
      partner_id: [9, 'Somchai'],
      lines: [{ productName: 'App', qty: 1, priceUnit: 100, subtotal: 100 }],
    }, { role: 'admin' }, 'en');
    expect(JSON.stringify(message)).toContain('To invoice');
  });
});

describe('quotation list subtitle', () => {
  it('uses Quotation: date | customer', () => {
    const message = createQuotationListFlexMessage([
      {
        id: 1,
        name: 'S0001',
        state: 'draft',
        amount_total: 100,
        partner_id: [9, 'Somchai'],
        date_order: '2026-09-05 10:00:00',
      },
    ], false, 'en', undefined, undefined, undefined, 'Utest');
    expect(JSON.stringify(message)).toContain('Quotation: 2026-09-05 | Somchai');
    expect(JSON.stringify(message)).toContain('quote.list.from|Utest');
  });
});
