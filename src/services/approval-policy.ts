export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'completed';

export type ApprovalRecord = {
  id: string;
  actorUserId: string;
  commandId: string;
  targetId?: string;
  channelId?: string;
  status: ApprovalStatus;
  createdAt: string;
  expiresAt: string;
  approverUserId?: string;
  approvedAt?: string;
  rejectedAt?: string;
  completedAt?: string;
};

export type ApprovalTransition =
  | { type: 'approve'; approverUserId: string }
  | { type: 'reject'; approverUserId: string }
  | { type: 'complete' }
  | { type: 'expire' };

export type ApprovalResult =
  | { ok: true; record: ApprovalRecord }
  | { ok: false; reason: 'not_found' | 'already_expired' | 'invalid_transition' | 'self_approval' };

export const isApprovalRecord = (value: unknown): value is ApprovalRecord => {
  if (!value || typeof value !== 'object') return false;
  const record = value as Partial<ApprovalRecord>;
  return typeof record.id === 'string'
    && typeof record.actorUserId === 'string'
    && typeof record.commandId === 'string'
    && typeof record.status === 'string'
    && typeof record.createdAt === 'string'
    && typeof record.expiresAt === 'string';
};

const isPastExpiry = (record: ApprovalRecord, now: Date): boolean => {
  return now.getTime() >= new Date(record.expiresAt).getTime();
};

export const createApprovalRecord = (params: {
  id: string;
  actorUserId: string;
  commandId: string;
  targetId?: string;
  channelId?: string;
  now?: Date;
  ttlMs?: number;
}): ApprovalRecord => {
  const now = params.now || new Date();
  const ttlMs = params.ttlMs ?? 10 * 60 * 1000;

  return {
    id: params.id,
    actorUserId: params.actorUserId,
    commandId: params.commandId,
    ...(params.targetId ? { targetId: params.targetId } : {}),
    ...(params.channelId ? { channelId: params.channelId } : {}),
    status: 'pending',
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttlMs).toISOString(),
  };
};

export const transitionApproval = (
  record: ApprovalRecord,
  transition: ApprovalTransition,
  now = new Date()
): ApprovalResult => {
  if (record.status === 'pending' && isPastExpiry(record, now) && transition.type !== 'expire') {
    return { ok: true, record: { ...record, status: 'expired' } };
  }

  if (transition.type === 'expire') {
    return record.status === 'pending'
      ? { ok: true, record: { ...record, status: 'expired' } }
      : { ok: false, reason: 'invalid_transition' };
  }

  if (transition.type === 'approve') {
    if (record.status !== 'pending') return { ok: false, reason: 'invalid_transition' };
    if (transition.approverUserId === record.actorUserId) return { ok: false, reason: 'self_approval' };
    return {
      ok: true,
      record: {
        ...record,
        status: 'approved',
        approverUserId: transition.approverUserId,
        approvedAt: now.toISOString(),
      },
    };
  }

  if (transition.type === 'reject') {
    if (record.status !== 'pending') return { ok: false, reason: 'invalid_transition' };
    return {
      ok: true,
      record: {
        ...record,
        status: 'rejected',
        approverUserId: transition.approverUserId,
        rejectedAt: now.toISOString(),
      },
    };
  }

  if (record.status !== 'approved') return { ok: false, reason: 'invalid_transition' };
  return {
    ok: true,
    record: { ...record, status: 'completed', completedAt: now.toISOString() },
  };
};