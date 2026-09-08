import { describe, expect, it } from 'vitest';
import { createFormPromptFlexMessage, createOptionalSummaryFlexMessage, createProductCardFlexMessage, createQuotationEditFlexMessage, createQuotationJourneyFlexMessage, createQuotationListFlexMessage, createQuotationMoreFlexMessage, createQuoteSendComposerFlexMessage } from '../src/line/templates';

describe('form prompt options', () => {
  it('keeps product chips in quickReply and out of the bubble body', () => {
    const message = createFormPromptFlexMessage({
      title: 'Create a quote',
      prompt: 'Product name?',
      stepIndex: 0,
      totalSteps: 9,
      language: 'en',
      options: ['App Premium', 'App Basic'],
    });
    const json = JSON.stringify(message);
    expect(json).toContain('"text":"App Premium"');
    expect(message.quickReply?.items).toBeDefined();
    const body = JSON.stringify(message.contents);
    expect(body).not.toContain('App Premium');
    expect(json).toContain('Tap an option below');
  });
});

describe('product card quote CTA', () => {
  it('starts quote create from the card without re-asking the product', () => {
    const message = createProductCardFlexMessage('App Premium', 100, 3, 'en');
    const json = JSON.stringify(message);
    expect(json).toContain('FORM QUOTE CREATE FROM CARD');
    expect(json).not.toContain('"text":"FORM QUOTE CREATE"');
  });
});

describe('optional summary', () => {
  it('shows label left and value right in equal rows without not set', () => {
    const message = createOptionalSummaryFlexMessage({
      title: 'Quote',
      fields: [{ index: 4, label: 'Note' }, { index: 5, label: 'Discount', value: '10' }, { index: 6, label: 'Valid until', value: '2026-10-06' }],
      language: 'en',
      finalizeLabel: 'Create now',
    });
    const json = JSON.stringify(message);
    expect(json).not.toContain('not set');
    expect(json).not.toContain('"text":"—"');
    expect(json).toContain('10');
    expect(json).toContain('Valid until');
    expect(json).toContain('2026-10-06');
    expect(json).toContain('"align":"end"');
    expect(json).toContain('"weight":"bold"');
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

describe('quotation journey state actions', () => {
  const order = {
    id: 17,
    name: 'S0017',
    amount_total: 100,
    partner_id: [9, 'Somchai'] as [number, string],
    lines: [{ productName: 'App', qty: 1, priceUnit: 100, subtotal: 100 }],
  };

  it('shows Confirm beside Send on a draft, then View Quote, Download PDF, More, and Home', () => {
    const message = createQuotationJourneyFlexMessage(
      { ...order, state: 'draft' },
      { role: 'admin', portalLink: 'https://example.com/q', pdfLink: 'https://example.com/p' },
      'en',
    );
    const json = JSON.stringify(message);
    const bubble = message.contents as { body?: { contents?: unknown[] }; footer?: { contents?: unknown[] } };
    expect(json).toContain('QUOTE CONFIRM 17');
    expect(json).toContain('QUOTE SEND 17');
    expect(json).toContain('QUOTE MORE 17');
    expect(json).toContain('NAV HOME');
    expect(json).toContain('View Quote');
    expect(json).toContain('Download PDF');
    expect(JSON.stringify(bubble.body)).toContain('QUOTE CONFIRM 17');
    expect(JSON.stringify(bubble.body)).toContain('QUOTE MORE 17');
    expect(JSON.stringify(bubble.footer)).toContain('View Quote');
    expect(JSON.stringify(bubble.footer)).not.toContain('QUOTE CONFIRM');
    expect(json).toContain('Quotation');
    expect(json).toContain('"text":"S0017"');
  });

  it('keeps Confirm, Send, Create More, and More for a salesperson', () => {
    const json = JSON.stringify(createQuotationJourneyFlexMessage(
      { ...order, state: 'draft' },
      { role: 'admin', salesTier: 'salesperson', portalLink: 'https://example.com/q', pdfLink: 'https://example.com/p' },
      'en',
    ));
    expect(json).toContain('QUOTE CONFIRM 17');
    expect(json).toContain('QUOTE SEND 17');
    expect(json).toContain('QUOTE MORE 17');
  });

  it('keeps Confirm and Send half-width on a sent quotation and labels Quotation Sent', () => {
    const json = JSON.stringify(createQuotationJourneyFlexMessage(
      { ...order, state: 'sent' },
      { role: 'admin', portalLink: 'https://example.com/q', pdfLink: 'https://example.com/p' },
      'en',
    ));
    expect(json).toContain('Quotation Sent');
    expect(json).toContain('QUOTE CONFIRM 17');
    expect(json).toContain('QUOTE SEND 17');
    expect(json).toContain('View Quote');
    expect(json).toContain('Download PDF');
  });

  it('gives the customer View Quote, Download PDF, and Approve when sent', () => {
    const json = JSON.stringify(createQuotationJourneyFlexMessage(
      { ...order, state: 'sent' },
      { role: 'customer', portalLink: 'https://example.com/q', pdfLink: 'https://example.com/p' },
      'en',
    ));
    expect(json).toContain('QUOTE APPROVE 17');
    expect(json).toContain('Approve');
    expect(json).toContain('View Quote');
    expect(json).toContain('Download PDF');
    expect(json).not.toContain('NAV HOME');
    expect(json).not.toContain('QUOTE CONFIRM');
    expect(json).not.toContain('QUOTE INVOICE');
  });

  it('gives the customer View Quote and Download PDF on a sales order, not invoice send', () => {
    const json = JSON.stringify(createQuotationJourneyFlexMessage(
      { ...order, state: 'sale', invoice_status: 'invoiced' },
      { role: 'customer', portalLink: 'https://example.com/q', pdfLink: 'https://example.com/p' },
      'en',
    ));
    expect(json).toContain('Sales Order');
    expect(json).toContain('Download PDF');
    expect(json).toContain('View Quote');
    expect(json).not.toContain('QUOTE APPROVE');
    expect(json).not.toContain('QUOTE INVOICE');
    expect(json).not.toContain('QUOTE CONFIRM');
    expect(json).not.toContain('NAV HOME');
  });

  it('shows Create Invoice beside Send Invoice on a sales order for staff', () => {
    const json = JSON.stringify(createQuotationJourneyFlexMessage(
      { ...order, state: 'sale', invoice_status: 'to invoice' },
      { role: 'admin', portalLink: 'https://example.com/q', pdfLink: 'https://example.com/p' },
      'en',
    ));
    expect(json).toContain('Sales Order');
    expect(json).toContain('QUOTE INVOICE 17');
    expect(json).toContain('QUOTE INVOICE SEND 17');
    expect(json).toContain('View Quote');
    expect(json).toContain('Download PDF');
    expect(json).toContain('NAV HOME');
    expect(json).not.toContain('QUOTE APPROVE');
  });
});

describe('quotation edit card', () => {
  it('opens from More as Edit Quote', () => {
    const json = JSON.stringify(createQuotationMoreFlexMessage({
      id: 17,
      name: 'S0017',
      state: 'draft',
      amount_total: 100,
      partner_id: [9, 'Somchai'],
    }, {}, 'en'));
    expect(json).toContain('Edit Quote');
    expect(json).toContain('QUOTE LINES 17');
  });

  it('lists lines with edit and remove prefills from More', () => {
    const message = createQuotationEditFlexMessage({
      id: 17,
      name: 'S0017',
      state: 'draft',
      amount_total: 100,
      partner_id: [9, 'Somchai'],
      lines: [{ productName: 'App Support Package', qty: 10, priceUnit: 539, subtotal: 5390 }],
    }, 'en');
    const json = JSON.stringify(message);
    expect(json).toContain('Edit Quote');
    expect(json).toContain('QUOTE EDIT 17 App Support Package,');
    expect(json).toContain('QUOTE REMOVE 17 App Support Package');
    expect(json).toContain('QUOTE ADD 17 ');
    expect(json).toContain('QUOTE MORE 17');
  });
});

describe('quote send composer', () => {
  it('offers the Odoo partner email as a chip and a type-email prefill', () => {
    const message = createQuoteSendComposerFlexMessage({
      id: 17,
      name: 'S0017',
      state: 'draft',
      amount_total: 100,
      partner_id: [9, 'Somchai'],
    }, 'somchai@example.com', 'en');
    const json = JSON.stringify(message);
    expect(json).toContain('QUOTE SEND CONFIRM 17 BOTH somchai@example.com');
    expect(json).toContain('Send LINE');
    expect(json).toContain('Send Email');
    expect(json).toContain('Send both');
    expect(json).toContain('Type email');
    expect(json).toContain('somchai@example.com');
  });

  it('uses invoice send confirm commands for the invoice composer', () => {
    const json = JSON.stringify(createQuoteSendComposerFlexMessage({
      id: 17,
      name: 'S0017',
      state: 'sale',
      amount_total: 100,
      partner_id: [9, 'Somchai'],
    }, 'somchai@example.com', 'en', 'invoice'));
    expect(json).toContain('Send invoice');
    expect(json).toContain('QUOTE INVOICE SEND CONFIRM 17 BOTH somchai@example.com');
    expect(json).not.toContain('QUOTE SEND CONFIRM 17');
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
