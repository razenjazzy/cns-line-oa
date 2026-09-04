import { describe, expect, it, vi } from 'vitest';
import { createReportStore } from '../src/services/firestore/report-store';

describe('report store', () => {
  it('writes reports through the shared persistence boundary', async () => {
    const write = vi.fn(async () => ({ ok: true }));
    const store = createReportStore({ write });

    await expect(store.save('2026-09-04', { insights: 'Stable sales' })).resolves.toEqual({ ok: true });
    expect(write).toHaveBeenCalledWith('saveReportLog', expect.any(Function));
  });
});