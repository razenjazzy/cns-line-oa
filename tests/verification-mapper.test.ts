import { describe, expect, it } from 'vitest';
import { parseOdooVerificationChallenge } from '../src/services/firestore/verification';

const toOptionalString = (value: unknown): string | undefined => typeof value === 'string' ? value.trim() || undefined : undefined;
const toPositiveInt = (value: unknown, fallback: number): number => typeof value === 'number' && value > 0 ? Math.trunc(value) : fallback;

describe('Odoo verification challenge mapper', () => {
  it('normalizes persisted challenge fields and safe defaults', () => {
    expect(parseOdooVerificationChallenge('challenge-1', {
      userId: 'U-user',
      channelId: 'sales',
      partnerId: 12.8,
      phone: ' 0812345678 ',
      otpCode: '123456',
      linkToken: 'token-value',
      status: 'verified',
      attemptCount: -2,
      expiresAt: '2026-09-04T00:10:00.000Z',
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:01:00.000Z',
    }, toOptionalString, toPositiveInt)).toMatchObject({
      id: 'challenge-1',
      userId: 'U-user',
      channelId: 'sales',
      partnerId: 12,
      phone: '0812345678',
      status: 'verified',
      attemptCount: 0,
    });
  });

  it('fails closed to pending for unknown challenge status', () => {
    expect(parseOdooVerificationChallenge('challenge-2', { status: 'unexpected' }, toOptionalString, toPositiveInt)).toMatchObject({
      id: 'challenge-2',
      status: 'pending',
      channelId: 'default',
      partnerId: 0,
    });
  });
});