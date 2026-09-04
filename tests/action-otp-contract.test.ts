import { describe, expect, it, vi } from 'vitest';
import { createActionOtpRepository } from '../src/services/firestore/action-otp-contract';

describe('action OTP repository contract', () => {
  it('preserves create and consume as separate step-up operations', async () => {
    const operations = {
      create: vi.fn(),
      consume: vi.fn(),
    };
    const repository = createActionOtpRepository(operations);
    operations.consume.mockResolvedValue({ ok: true, data: { status: 'verified' } });

    const result = await repository.consume({ userId: 'U-user', otpCode: '123456' });
    expect(result.ok).toBe(true);
    expect(operations.consume).toHaveBeenCalledWith({ userId: 'U-user', otpCode: '123456' });
  });
});