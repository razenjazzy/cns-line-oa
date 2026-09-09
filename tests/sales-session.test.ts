import { describe, expect, it } from 'vitest';
import { hasActiveSalesSession, salesSessionExpired, salesSessionExpiresAtFromNow, salesSessionTtlHours } from '../src/services/sales-session';

describe('sales session', () => {
  it('defaults TTL to 24 hours and honors SALES_SESSION_TTL_HOURS', () => {
    expect(salesSessionTtlHours({})).toBe(24);
    expect(salesSessionTtlHours({ SALES_SESSION_TTL_HOURS: '8' })).toBe(8);
    const expires = salesSessionExpiresAtFromNow(0, { SALES_SESSION_TTL_HOURS: '1' });
    expect(new Date(expires).getTime()).toBe(60 * 60 * 1000);
  });

  it('is gold-on only for a sales tier with a future expiry', () => {
    const later = new Date(Date.now() + 60_000).toISOString();
    expect(hasActiveSalesSession({ odooVerified: true, salesTier: 'salesperson', salesSessionExpiresAt: later })).toBe(true);
    expect(hasActiveSalesSession({ odooVerified: true, salesTier: 'sales_manager', salesSessionExpiresAt: later })).toBe(true);
    expect(hasActiveSalesSession({ odooVerified: true, salesSessionExpiresAt: later })).toBe(false);
    expect(hasActiveSalesSession({ odooVerified: false, salesTier: 'salesperson', salesSessionExpiresAt: later })).toBe(false);
    expect(hasActiveSalesSession({ odooVerified: true, salesTier: 'salesperson' })).toBe(false);
  });

  it('treats a past expiry as expired so VERIFY can turn regular', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    const profile = { odooVerified: true, salesTier: 'salesperson' as const, salesSessionExpiresAt: past };
    expect(hasActiveSalesSession(profile)).toBe(false);
    expect(salesSessionExpired(profile)).toBe(true);
  });
});
