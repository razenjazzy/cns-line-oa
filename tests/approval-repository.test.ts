import { describe, expect, it } from 'vitest';
import { createApprovalRecord } from '../src/services/approval-policy';
import { getApprovalRecord, saveApprovalRecord, transitionStoredApproval } from '../src/services/firestore';

describe('approval repository', () => {
  it('round-trips approval records through the local fallback store', async () => {
    const record = createApprovalRecord({
      id: `approval-${Date.now()}`,
      actorUserId: 'U-actor',
      commandId: 'QUOTE_CANCEL',
      targetId: '42',
      channelId: 'default',
    });

    const saved = await saveApprovalRecord(record);
    expect(saved.ok).toBe(true);
    expect(await getApprovalRecord(record.id)).toEqual(record);
  });

  it('returns null for an empty approval id', async () => {
    expect(await getApprovalRecord('  ')).toBeNull();
  });

  it('applies valid transitions in the local fallback repository', async () => {
    const record = createApprovalRecord({
      id: `approval-transition-${Date.now()}`,
      actorUserId: 'U-actor',
      commandId: 'QUOTE_CREATE',
    });
    await saveApprovalRecord(record);

    const result = await transitionStoredApproval(record.id, {
      type: 'approve',
      approverUserId: 'U-admin',
    });

    expect(result.ok && result.record.status).toBe('approved');
    expect((await getApprovalRecord(record.id))?.approverUserId).toBe('U-admin');
  });
});