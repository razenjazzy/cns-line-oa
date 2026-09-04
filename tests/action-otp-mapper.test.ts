import { describe, expect, it } from 'vitest';
import { parseActionOtpChallenge } from '../src/services/firestore/action-otp';

const normalize = (value: unknown): string | undefined => typeof value === 'string' ? value.trim() || undefined : undefined;

describe('action OTP challenge mapper', () => {
  it('preserves the replay command and normalizes the challenge', () => {
    expect(parseActionOtpChallenge('otp-1', {
      userId: 'U-user',
      channelId: ' sales ',
      otpCode: '123456',
      pendingCommandText: 'QUOTE CANCEL 42',
      status: 'verified',
      attemptCount: 2.8,
      expiresAt: '2026-09-04T00:10:00.000Z',
      createdAt: '2026-09-04T00:00:00.000Z',
      updatedAt: '2026-09-04T00:01:00.000Z',
    }, normalize)).toMatchObject({
      id: 'otp-1',
      channelId: 'sales',
      pendingCommandText: 'QUOTE CANCEL 42',
      status: 'verified',
      attemptCount: 2,
    });
  });

  it('fails closed to pending and safe defaults for malformed data', () => {
    expect(parseActionOtpChallenge('otp-2', { status: 'unknown', attemptCount: -1 }, normalize)).toMatchObject({
      id: 'otp-2',
      channelId: 'default',
      status: 'pending',
      attemptCount: 0,
      pendingCommandText: '',
    });
  });
});