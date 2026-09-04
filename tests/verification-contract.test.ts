import { describe, expect, it, vi } from 'vitest';
import { createVerificationRepository } from '../src/services/firestore/verification-contract';

describe('verification repository contract', () => {
  it('preserves the explicit verification operation boundary', async () => {
    const operations = {
      create: vi.fn(),
      consumeOtp: vi.fn(),
      consumeToken: vi.fn(),
      findVerifiedUserIdByPhone: vi.fn(),
    };
    const repository = createVerificationRepository(operations);
    operations.findVerifiedUserIdByPhone.mockResolvedValue('U-user');

    expect(await repository.findVerifiedUserIdByPhone('0812345678')).toBe('U-user');
    expect(operations.findVerifiedUserIdByPhone).toHaveBeenCalledWith('0812345678');
  });
});