import { describe, expect, it } from 'vitest';
import { createApprovalRecord, transitionApproval } from '../src/services/approval-policy';

const createdAt = new Date('2026-09-04T00:00:00.000Z');

describe('approval policy', () => {
  it('creates a pending record with an expiry and no secret fields', () => {
    const record = createApprovalRecord({
      id: 'approval-1',
      actorUserId: 'U-actor',
      commandId: 'QUOTE_CANCEL',
      targetId: '42',
      channelId: 'default',
      now: createdAt,
      ttlMs: 60_000,
    });

    expect(record).toEqual({
      id: 'approval-1',
      actorUserId: 'U-actor',
      commandId: 'QUOTE_CANCEL',
      targetId: '42',
      channelId: 'default',
      status: 'pending',
      createdAt: '2026-09-04T00:00:00.000Z',
      expiresAt: '2026-09-04T00:01:00.000Z',
    });
  });

  it('requires a different user to approve and completes the lifecycle', () => {
    const record = createApprovalRecord({ id: 'approval-2', actorUserId: 'U-actor', commandId: 'QUOTE_CREATE', now: createdAt });
    const approved = transitionApproval(record, { type: 'approve', approverUserId: 'U-admin' }, createdAt);
    expect(approved.ok && approved.record.status).toBe('approved');

    const completed = approved.ok
      ? transitionApproval(approved.record, { type: 'complete' }, createdAt)
      : approved;
    expect(completed.ok && completed.record.status).toBe('completed');
  });

  it('rejects self-approval and invalid transitions', () => {
    const record = createApprovalRecord({ id: 'approval-3', actorUserId: 'U-actor', commandId: 'USER_CREATE', now: createdAt });
    expect(transitionApproval(record, { type: 'approve', approverUserId: 'U-actor' }, createdAt)).toEqual({ ok: false, reason: 'self_approval' });
    expect(transitionApproval(record, { type: 'complete' }, createdAt)).toEqual({ ok: false, reason: 'invalid_transition' });
  });

  it('expires pending records and blocks later approval', () => {
    const record = createApprovalRecord({ id: 'approval-4', actorUserId: 'U-actor', commandId: 'SERVICE_CREATE', now: createdAt, ttlMs: 60_000 });
    const expired = transitionApproval(record, { type: 'expire' }, new Date('2026-09-04T00:02:00.000Z'));
    expect(expired.ok && expired.record.status).toBe('expired');

    const lateApproval = transitionApproval(record, { type: 'approve', approverUserId: 'U-admin' }, new Date('2026-09-04T00:02:00.000Z'));
    expect(lateApproval.ok && lateApproval.record.status).toBe('expired');
  });
});