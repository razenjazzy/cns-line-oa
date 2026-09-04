import { archiveAndRotateAuditLog, AuditRotationResult } from '../services/audit-archive';
import { recordAuditEvent } from '../services/firestore';
import { appLogger, createExecutionId } from '../services/logger';

/**
 * Entry point for the audit-log archive & rotation policy — wired to
 * POST /ops/audit-log/rotate, the ADMIN AUDIT ROTATE LINE command, and the
 * `rotate-audit-log` CLI/MCP action. See documents/AUDIT_LOG_POLICY.md.
 */
export const runAuditRotationJob = async (actorUserId: string = 'system', executionId = createExecutionId('audit-rotation')): Promise<AuditRotationResult> => {
  appLogger.info('job_started', { job: 'audit_rotation', executionId });
  const result = await archiveAndRotateAuditLog();

  if (result.skippedReason) {
    appLogger.info('job_skipped', { job: 'audit_rotation', executionId, reason: result.skippedReason });
  } else if (!result.ok) {
    appLogger.error('job_failed', { job: 'audit_rotation', executionId, error: result.error });
  } else {
    appLogger.info('job_completed', { job: 'audit_rotation', executionId, archived: result.archived, deleted: result.deleted, batches: result.batches });
  }

  // Record the rotation itself as an audit event — never blocks or throws
  // (recordAuditEvent is fire-and-forget-safe), so it can't turn a
  // successful rotation into a reported failure.
  await recordAuditEvent({
    action: 'audit_rotate',
    outcome: result.ok ? 'success' : 'failure',
    actorUserId,
    requestId: executionId,
    detail: result.skippedReason || `archived=${result.archived},deleted=${result.deleted},batches=${result.batches}`,
  });

  return result;
};
