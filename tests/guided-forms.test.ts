import { describe, expect, it } from 'vitest';
import { FLOW_SPECS, getFlowByStartCommand } from '../src/services/guided-forms';

describe('getFlowByStartCommand', () => {
  it('resolves each flow by its exact start command', () => {
    expect(getFlowByStartCommand('FORM USER CREATE')?.key).toBe('USER_CREATE');
    expect(getFlowByStartCommand('FORM USER READ')?.key).toBe('USER_READ');
    expect(getFlowByStartCommand('FORM SERVICE CREATE')?.key).toBe('SERVICE_CREATE');
    expect(getFlowByStartCommand('FORM SERVICE READ')?.key).toBe('SERVICE_READ');
    expect(getFlowByStartCommand('FORM PRODUCT FIND')?.key).toBe('PRODUCT_FIND');
    expect(getFlowByStartCommand('FORM ORDER STATUS')?.key).toBe('ORDER_STATUS');
    expect(getFlowByStartCommand('FORM QUOTE CREATE')?.key).toBe('QUOTE_CREATE');
  });

  it('returns null for an unknown form command', () => {
    expect(getFlowByStartCommand('FORM NOPE')).toBeNull();
  });
});

describe('lookup flows', () => {
  it('builds product, order, user, and service lookup commands', () => {
    expect(FLOW_SPECS.PRODUCT_FIND.buildFinalCommand({ productName: 'App Premium Plan' })).toBe('PRODUCT FIND App Premium Plan');
    expect(FLOW_SPECS.ORDER_STATUS.buildFinalCommand({ reference: 'SO0001' })).toBe('ORDER STATUS SO0001');
    expect(FLOW_SPECS.USER_READ.buildFinalCommand({ phone: '0812345678' })).toBe('USER READ 0812345678');
    expect(FLOW_SPECS.SERVICE_READ.buildFinalCommand({ identifier: 'SVC-PREMIUM' })).toBe('SERVICE READ SVC-PREMIUM');
  });

  it('keeps admin-only protection on user lookup', () => {
    expect(FLOW_SPECS.USER_READ.requiresAdmin).toBe(true);
    expect(FLOW_SPECS.PRODUCT_FIND.requiresAdmin).toBe(false);
    expect(FLOW_SPECS.ORDER_STATUS.requiresAdmin).toBe(false);
    expect(FLOW_SPECS.SERVICE_READ.requiresAdmin).toBe(false);
  });
});

describe('USER_CREATE flow', () => {
  const spec = FLOW_SPECS.USER_CREATE;

  it('requires admin', () => {
    expect(spec.requiresAdmin).toBe(true);
  });

  it('validates each field', () => {
    const [name, phone, email] = spec.fields;
    expect(name.validate('Somchai')).toBe(true);
    expect(name.validate('  ')).toBe(false);
    expect(phone.validate('0812345678')).toBe(true);
    expect(phone.validate('abc')).toBe(false);
    expect(email.validate('')).toBe(true);
    expect(email.validate('somchai@example.com')).toBe(true);
    expect(email.validate('not-an-email')).toBe(false);
  });

  it('builds the final command with an optional email included', () => {
    const cmd = spec.buildFinalCommand({ name: 'Somchai', phone: '0812345678', email: 'somchai@example.com' });
    expect(cmd).toBe('USER CREATE Somchai,0812345678,somchai@example.com');
  });

  it('builds the final command with the optional email omitted', () => {
    const cmd = spec.buildFinalCommand({ name: 'Somchai', phone: '0812345678', email: '' });
    expect(cmd).toBe('USER CREATE Somchai,0812345678');
  });
});

describe('SERVICE_CREATE flow', () => {
  const spec = FLOW_SPECS.SERVICE_CREATE;

  it('requires admin and validates a positive price', () => {
    expect(spec.requiresAdmin).toBe(true);
    const priceField = spec.fields.find(f => f.key === 'price')!;
    expect(priceField.validate('990')).toBe(true);
    expect(priceField.validate('0')).toBe(false);
    expect(priceField.validate('abc')).toBe(false);
  });

  it('builds the final command', () => {
    const cmd = spec.buildFinalCommand({ name: 'Premium Support', code: 'SVC-PREMIUM', price: '990' });
    expect(cmd).toBe('SERVICE CREATE Premium Support,SVC-PREMIUM,990');
  });
});

describe('USER_UPDATE flow', () => {
  const spec = FLOW_SPECS.USER_UPDATE;

  it('requires admin and resolves by start command', () => {
    expect(spec.requiresAdmin).toBe(true);
    expect(getFlowByStartCommand('FORM USER UPDATE')?.key).toBe('USER_UPDATE');
  });

  it('builds the final command with skipped optional fields left blank', () => {
    const cmd = spec.buildFinalCommand({ phone: '0812345678', name: '', newPhone: '', email: '' });
    expect(cmd).toBe('USER UPDATE 0812345678,,,');
  });

  it('builds the final command with optional fields filled in', () => {
    const cmd = spec.buildFinalCommand({ phone: '0812345678', name: 'Somchai CEO', newPhone: '', email: 'somchai@example.com' });
    expect(cmd).toBe('USER UPDATE 0812345678,Somchai CEO,,somchai@example.com');
  });
});

describe('USER_DELETE flow', () => {
  const spec = FLOW_SPECS.USER_DELETE;

  it('requires admin and builds the final command', () => {
    expect(spec.requiresAdmin).toBe(true);
    expect(getFlowByStartCommand('FORM USER DELETE')?.key).toBe('USER_DELETE');
    expect(spec.buildFinalCommand({ phone: '0812345678' })).toBe('USER DELETE 0812345678');
  });
});

describe('SERVICE_UPDATE flow', () => {
  const spec = FLOW_SPECS.SERVICE_UPDATE;

  it('requires admin and resolves by start command', () => {
    expect(spec.requiresAdmin).toBe(true);
    expect(getFlowByStartCommand('FORM SERVICE UPDATE')?.key).toBe('SERVICE_UPDATE');
  });

  it('builds the final command with optional fields filled in', () => {
    const cmd = spec.buildFinalCommand({ identifier: 'SVC-PREMIUM', name: '', price: '1290', newCode: 'SVC-PRO' });
    expect(cmd).toBe('SERVICE UPDATE SVC-PREMIUM,,1290,SVC-PRO');
  });
});

describe('SERVICE_DELETE flow', () => {
  const spec = FLOW_SPECS.SERVICE_DELETE;

  it('requires admin and builds the final command', () => {
    expect(spec.requiresAdmin).toBe(true);
    expect(getFlowByStartCommand('FORM SERVICE DELETE')?.key).toBe('SERVICE_DELETE');
    expect(spec.buildFinalCommand({ identifier: 'SVC-PRO' })).toBe('SERVICE DELETE SVC-PRO');
  });
});

describe('QUOTE_CREATE flow', () => {
  const spec = FLOW_SPECS.QUOTE_CREATE;

  it('does not require admin', () => {
    expect(spec.requiresAdmin).toBe(false);
  });

  it('builds the final command with skipped optional fields left blank', () => {
    const cmd = spec.buildFinalCommand({ productName: 'App Premium Plan', qty: '1', customerName: 'Somchai', phone: '0812345678' });
    expect(cmd).toBe('QUOTE CREATE App Premium Plan,1,Somchai,0812345678,,,,,');
  });

  it('builds the final command with optional fields filled in', () => {
    const cmd = spec.buildFinalCommand({
      productName: 'App Premium Plan', qty: '1', customerName: 'Somchai', phone: '0812345678',
      customerReference: 'PO-1001', discountPercent: '10', validityDate: '2026-12-31',
      note: 'Rush order', paymentTerm: '30 Days',
    });
    expect(cmd).toBe('QUOTE CREATE App Premium Plan,1,Somchai,0812345678,PO-1001,10,2026-12-31,Rush order,30 Days');
  });

  it('gives validityDate a computed default (today + 30 days) and no other optional field one', () => {
    const validityField = spec.fields.find(f => f.key === 'validityDate')!;
    const defaultDate = validityField.defaultValue?.();
    expect(defaultDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(validityField.validate(defaultDate!)).toBe(true);

    const expected = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    expect(defaultDate).toBe(expected);

    const otherOptionalFields = spec.fields.filter(f => f.optional && f.key !== 'validityDate');
    expect(otherOptionalFields.every(f => !f.defaultValue)).toBe(true);
  });
});
