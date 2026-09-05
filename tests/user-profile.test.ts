import { describe, expect, it } from 'vitest';
import { buildFallbackUserProfile, parseStoredUserProfile } from '../src/services/firestore/user-profile';

const pendingFlowIsActive = (pendingFlow: { expiresAt: string } | undefined | null): pendingFlow is { expiresAt: string } => {
  return Boolean(pendingFlow) && new Date(pendingFlow.expiresAt).getTime() > Date.now();
};

describe('Firestore user profile mapping', () => {
  it('preserves secure fallback defaults', () => {
    expect(buildFallbackUserProfile({}, pendingFlowIsActive, 'en')).toMatchObject({
      language: 'en',
      role: 'user',
      odooVerified: false,
      marketingOptIn: false,
    });
  });

  it('parses only recognized persisted role and verification values', () => {
    expect(parseStoredUserProfile({ language: 'th', role: 'admin', odooVerified: true, marketingOptIn: true }, pendingFlowIsActive)).toMatchObject({
      language: 'th',
      role: 'admin',
      odooVerified: true,
      marketingOptIn: true,
    });
    expect(parseStoredUserProfile({ language: 'fr', role: 'owner', odooVerified: 'true' }, pendingFlowIsActive)).toMatchObject({
      language: 'en',
      role: 'user',
      odooVerified: false,
      marketingOptIn: false,
    });
  });

  it('drops an expired pending flow instead of replaying stale state', () => {
    const profile = parseStoredUserProfile({ pendingFlow: { flow: 'QUOTE_CREATE', stepIndex: 1, collected: {}, expiresAt: '2020-01-01T00:00:00.000Z' } }, pendingFlowIsActive);
    expect(profile.pendingFlow).toBeUndefined();
  });

  it('parses a recognized salesTier and drops anything else, including the Firestore null clear-marker', () => {
    expect(parseStoredUserProfile({ salesTier: 'salesperson' }, pendingFlowIsActive).salesTier).toBe('salesperson');
    expect(parseStoredUserProfile({ salesTier: 'sales_manager' }, pendingFlowIsActive).salesTier).toBe('sales_manager');
    expect(parseStoredUserProfile({ salesTier: null }, pendingFlowIsActive).salesTier).toBeUndefined();
    expect(parseStoredUserProfile({ salesTier: 'owner' }, pendingFlowIsActive).salesTier).toBeUndefined();
    expect(parseStoredUserProfile({}, pendingFlowIsActive).salesTier).toBeUndefined();
  });

  it('passes salesTier through from the cache as-is (undefined unless a prior Odoo lookup already cached one)', () => {
    expect(buildFallbackUserProfile({ salesTier: 'sales_manager' }, pendingFlowIsActive, 'en').salesTier).toBe('sales_manager');
    expect(buildFallbackUserProfile({}, pendingFlowIsActive, 'en').salesTier).toBeUndefined();
  });
});