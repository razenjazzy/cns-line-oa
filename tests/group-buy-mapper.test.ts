import { describe, expect, it } from 'vitest';
import { parseGroupBuyRecord, withEffectiveGroupBuyStatus } from '../src/services/firestore/group-buy';

const normalize = (value: unknown): string | undefined => typeof value === 'string' ? value.trim() || undefined : undefined;
const positiveInt = (value: unknown, fallback: number): number => typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.trunc(value) : fallback;

describe('group-buy record mapper', () => {
  it('normalizes a persisted group-buy record', () => {
    const record = parseGroupBuyRecord('gb-1', {
      creatorUserId: 'U-creator',
      productQuery: ' App Premium Plan ',
      targetQty: 25.8,
      joinedQty: 3.4,
      participantCount: 2.9,
      status: 'confirmed',
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:01:00.000Z',
    }, normalize, positiveInt);

    expect(record).toMatchObject({
      id: 'gb-1',
      creatorUserId: 'U-creator',
      productQuery: 'App Premium Plan',
      targetQty: 25,
      joinedQty: 3,
      participantCount: 2,
      status: 'confirmed',
    });
  });

  it('fails closed to open and marks expired open records lazily', () => {
    const record = parseGroupBuyRecord('gb-2', { status: 'invalid', expiresAt: '2026-09-03T00:00:00.000Z' }, normalize, positiveInt);
    expect(record.status).toBe('open');
    expect(withEffectiveGroupBuyStatus(record, new Date('2026-09-04T00:00:00.000Z').getTime()).status).toBe('expired');
  });
});