import { describe, expect, it } from 'vitest';
import { sanitizeLogValue } from '../src/services/logger';

describe('sanitizeLogValue', () => {
  it('redacts credential-shaped keys including otp and token', () => {
    const sanitized = sanitizeLogValue({
      userId: 'U123',
      otp: '123456',
      accessToken: 'secret-token',
      nested: { apiKey: 'abc', phone: '0812345678' },
    }) as Record<string, unknown>;

    expect(sanitized.userId).toBe('U123');
    expect(sanitized.otp).toBe('[REDACTED]');
    expect(sanitized.accessToken).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).apiKey).toBe('[REDACTED]');
    expect((sanitized.nested as Record<string, unknown>).phone).toBe('0812345678');
  });
});
