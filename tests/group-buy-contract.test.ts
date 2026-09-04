import { describe, expect, it, vi } from 'vitest';
import { createGroupBuyRepository } from '../src/services/firestore/group-buy-contract';

describe('group-buy repository contract', () => {
  it('keeps transactional operations and actor context explicit', async () => {
    const operations = {
      create: vi.fn(),
      getById: vi.fn(),
      listByCreator: vi.fn(),
      attachOdooOrder: vi.fn(),
      join: vi.fn(),
      confirm: vi.fn(),
      cancel: vi.fn(),
    };
    const repository = createGroupBuyRepository(operations);
    operations.confirm.mockResolvedValue({ ok: true });

    expect(await repository.confirm('gb-1', 'U-admin', true)).toEqual({ ok: true });
    expect(operations.confirm).toHaveBeenCalledWith('gb-1', 'U-admin', true);
  });
});