import { describe, expect, it } from 'vitest';
import { canManageQuoteLines, isQuoteStaff, quoteJourneyRole } from '../src/line/quote-access';

describe('quote access from Odoo sales groups', () => {
  it('gives Confirm/Send staff cards to sales users without LINE admin', () => {
    const sales = { role: 'user' as const, salesTier: 'salesperson' as const };
    expect(isQuoteStaff(sales)).toBe(true);
    expect(quoteJourneyRole(sales)).toBe('admin');
    expect(canManageQuoteLines(sales)).toBe(false);
  });

  it('keeps Edit/Cancel for LINE admin and Odoo sales managers', () => {
    expect(canManageQuoteLines({ role: 'admin', salesTier: undefined })).toBe(true);
    expect(canManageQuoteLines({ role: 'user', salesTier: 'sales_manager' })).toBe(true);
  });

  it('gives portal customers the buyer card, not Confirm/Send', () => {
    const customer = { role: 'user' as const, salesTier: undefined };
    expect(isQuoteStaff(customer)).toBe(false);
    expect(quoteJourneyRole(customer)).toBe('customer');
  });
});
