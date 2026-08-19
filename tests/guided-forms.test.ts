import { describe, expect, it } from 'vitest';
import { FLOW_SPECS, getFlowByStartCommand } from '../src/services/guided-forms';

describe('getFlowByStartCommand', () => {
  it('resolves each flow by its exact start command', () => {
    expect(getFlowByStartCommand('FORM USER CREATE')?.key).toBe('USER_CREATE');
    expect(getFlowByStartCommand('FORM SERVICE CREATE')?.key).toBe('SERVICE_CREATE');
    expect(getFlowByStartCommand('FORM DEMO QUOTE')?.key).toBe('DEMO_QUOTE');
  });

  it('returns null for an unknown form command', () => {
    expect(getFlowByStartCommand('FORM NOPE')).toBeNull();
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

describe('DEMO_QUOTE flow', () => {
  const spec = FLOW_SPECS.DEMO_QUOTE;

  it('does not require admin', () => {
    expect(spec.requiresAdmin).toBe(false);
  });

  it('builds the final command', () => {
    const cmd = spec.buildFinalCommand({ productName: 'App Premium Plan', qty: '1', customerName: 'Somchai', phone: '0812345678' });
    expect(cmd).toBe('DEMO QUOTE App Premium Plan,1,Somchai,0812345678');
  });
});
