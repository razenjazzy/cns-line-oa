import { archiveAndRotateAuditLog, AuditRotationResult } from '../services/audit-archive';
import { recordAuditEvent } from '../services/firestore';

/**
 * Entry point for the audit-log archive & rotation policy — wired to
 * POST /ops/audit-log/rotate, the ADMIN AUDIT ROTATE LINE command, and the
 * `rotate-audit-log` CLI/MCP action. See documents/AUDIT_LOG_POLICY.md.
 */
export const runAuditRotationJob = async (actorUserId: string = 'system'): Promise<AuditRotationResult> => {
  console.log('Starting audit-log rotation job...');
  const result = await archiveAndRotateAuditLog();

  if (result.skippedReason) {
    console.log(`Audit-log rotation skipped: ${result.skippedReason}`);
  } else if (!result.ok) {
    console.error(`Audit-log rotation stopped early: ${result.error}`);
  } else {
    console.log(`Audit-log rotation complete: archived=${result.archived} deleted=${result.deleted} batches=${result.batches} cutoff=${result.cutoff}`);
  }

  // Record the rotation itself as an audit event — never blocks or throws
  // (recordAuditEvent is fire-and-forget-safe), so it can't turn a
  // successful rotation into a reported failure.
  await recordAuditEvent({
    action: 'audit_rotate',
    outcome: result.ok ? 'success' : 'failure',
    actorUserId,
    detail: result.skippedReason || `archived=${result.archived},deleted=${result.deleted},batches=${result.batches}`,
  });

  return result;
};
