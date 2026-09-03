import { describe, expect, it } from 'vitest';
import {
  parseDemoQuotePayload,
  parseServiceCreatePayload,
  parseServiceUpdatePayload,
  parseUserCreatePayload,
  parseUserUpdatePayload,
} from '../src/line/command-validators';

describe('command validators', () => {
  describe('parseUserCreatePayload', () => {
    it('parses valid input with normalized email', () => {
      const result = parseUserCreatePayload(' Somchai , 0812345678 , TEST@EXAMPLE.COM ');
      expect(result).toEqual({
        name: 'Somchai',
        phone: '0812345678',
        email: 'test@example.com',
      });
    });

    it('rejects invalid phone', () => {
      expect(parseUserCreatePayload('Somchai,abc,test@example.com')).toBeNull();
    });

    it('rejects invalid email', () => {
      expect(parseUserCreatePayload('Somchai,0812345678,wrong-email')).toBeNull();
    });
  });

  describe('parseUserUpdatePayload', () => {
    it('parses update with name only', () => {
      const result = parseUserUpdatePayload('0812345678,Somchai CEO,,');
      expect(result).toEqual({
        phone: '0812345678',
        name: 'Somchai CEO',
      });
    });

    it('parses update with new phone and email', () => {
      const result = parseUserUpdatePayload('0812345678,,0898765432,new@example.com');
      expect(result).toEqual({
        phone: '0812345678',
        newPhone: '0898765432',
        email: 'new@example.com',
      });
    });

    it('rejects when no updates are provided', () => {
      expect(parseUserUpdatePayload('0812345678,,,')).toBeNull();
    });
  });

  describe('parseServiceCreatePayload', () => {
    it('parses valid service create payload', () => {
      const result = parseServiceCreatePayload('Premium Support,PS-001,1290');
      expect(result).toEqual({
        name: 'Premium Support',
        code: 'PS-001',
        price: 1290,
      });
    });

    it('normalizes spaces in service code', () => {
      const result = parseServiceCreatePayload('Premium Support,PS 001,1290');
      expect(result?.code).toBe('PS-001');
    });

    it('rejects non-positive price', () => {
      expect(parseServiceCreatePayload('Premium Support,PS-001,0')).toBeNull();
    });
  });

  describe('parseServiceUpdatePayload', () => {
    it('parses valid service update payload', () => {
      const result = parseServiceUpdatePayload('PS-001,New Name,1490,PS-NEW');
      expect(result).toEqual({
        identifier: 'PS-001',
        name: 'New Name',
        price: 1490,
        newCode: 'PS-NEW',
      });
    });

    it('rejects invalid price when provided', () => {
      expect(parseServiceUpdatePayload('PS-001,New Name,abc,PS-NEW')).toBeNull();
    });

    it('rejects when nothing to update', () => {
      expect(parseServiceUpdatePayload('PS-001,,,')).toBeNull();
    });
  });

  describe('parseDemoQuotePayload', () => {
    it('parses valid quote payload', () => {
      const result = parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678');
      expect(result).toEqual({
        productName: 'App Premium Plan',
        qty: 2,
        customerName: 'Somchai',
        phone: '0812345678',
      });
    });

    it('rejects invalid quantity', () => {
      expect(parseDemoQuotePayload('App Premium Plan,0,Somchai,0812345678')).toBeNull();
      expect(parseDemoQuotePayload('App Premium Plan,10001,Somchai,0812345678')).toBeNull();
    });

    it('rejects invalid phone', () => {
      expect(parseDemoQuotePayload('App Premium Plan,2,Somchai,abc')).toBeNull();
    });

    it('parses the 5 optional trailing fields when all are provided', () => {
      const result = parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678,PO-1001,15,2026-12-31,Rush order,30 Days');
      expect(result).toEqual({
        productName: 'App Premium Plan',
        qty: 2,
        customerName: 'Somchai',
        phone: '0812345678',
        customerReference: 'PO-1001',
        discountPercent: 15,
        validityDate: '2026-12-31',
        note: 'Rush order',
        paymentTerm: '30 Days',
      });
    });

    it('omits optional fields entirely when left blank, same as today\'s behavior', () => {
      const result = parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678,,,,,');
      expect(result).toEqual({
        productName: 'App Premium Plan',
        qty: 2,
        customerName: 'Somchai',
        phone: '0812345678',
      });
    });

    it('omits optional fields entirely when the trailing fields are absent, not just blank', () => {
      const result = parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678');
      expect(result).not.toHaveProperty('customerReference');
      expect(result).not.toHaveProperty('discountPercent');
      expect(result).not.toHaveProperty('validityDate');
      expect(result).not.toHaveProperty('note');
      expect(result).not.toHaveProperty('paymentTerm');
    });

    it('rejects an out-of-range discount percent', () => {
      expect(parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678,,-1,,,')).toBeNull();
      expect(parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678,,101,,,')).toBeNull();
    });

    it('accepts discount percent boundary values 0 and 100', () => {
      expect(parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678,,0,,,')?.discountPercent).toBe(0);
      expect(parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678,,100,,,')?.discountPercent).toBe(100);
    });

    it('rejects a validity date that is not YYYY-MM-DD', () => {
      expect(parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678,,,31-12-2026,,')).toBeNull();
      expect(parseDemoQuotePayload('App Premium Plan,2,Somchai,0812345678,,,not-a-date,,')).toBeNull();
    });
  });
});
