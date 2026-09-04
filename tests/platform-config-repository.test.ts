import { describe, expect, it, vi } from 'vitest';
import { createPlatformConfigRepository } from '../src/services/firestore/platform-config';

describe('platform config repository', () => {
  it('rejects empty keys before touching persistence', async () => {
    const read = vi.fn();
    const write = vi.fn();
    const repository = createPlatformConfigRepository({ read, write });

    expect(await repository.get('  ')).toBeNull();
    expect(await repository.set('  ', { enabled: true })).toEqual({
      ok: false,
      error: 'Firestore setPlatformConfig failed: key is required',
    });
    expect(read).not.toHaveBeenCalled();
    expect(write).not.toHaveBeenCalled();
  });
});