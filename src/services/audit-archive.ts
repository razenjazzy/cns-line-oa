/**
 * Audit trail archive & rotation policy.
 *
 * The `auditLog` Firestore collection (src/services/firestore.ts) is written
 * on every privileged action (role grant/revoke, user/service CRUD, channel
 * config changes) and is meant to stay small and fast — it backs the
 * /ops/audit-log endpoint and admin tooling. Left unbounded it grows forever
 * and slows those reads down.
 *
 * This module is the other half: on a schedule (see src/jobs/audit-rotation.ts
 * and the /ops/audit-log/rotate route), it moves anything older than the
 * retention window into BigQuery (cheap, queryable, effectively permanent),
 * then deletes it from Firestore — but only after the archive write actually
 * succeeds. If BigQuery isn't configured or a batch fails to archive, nothing
 * is deleted; the job is safe to re-run and never trades data loss for a
 * smaller collection.
 *
 * Full policy: documents/AUDIT_LOG_POLICY.md
 */

import {
  AuditLogEntry,
  deleteAuditEventsByIds,
  listAuditEventsOlderThan,
} from './firestore';
import { AuditArchiveRow, insertAuditArchiveRows } from './bigquery';

const truthy = (value: string | undefined): boolean => /^(1|true|yes|on)$/i.test(value || '');

export type AuditArchiveConfig = {
  retentionDays: number;
  archiveEnabled: boolean;
  datasetId: string;
  tableId: string;
  batchSize: number;
  maxBatchesPerRun: number;
};

export const getAuditArchiveConfig = (): AuditArchiveConfig => {
  const retentionDays = Math.max(1, Math.trunc(Number(process.env.AUDIT_RETENTION_DAYS) || 90));
  // Firestore batch writes cap at 500 ops; also used as the read page size so
  // every fetched page is fully deletable in one batch.
  const batchSize = Math.min(500, Math.max(1, Math.trunc(Number(process.env.AUDIT_ROTATE_BATCH_SIZE) || 500)));
  const maxBatchesPerRun = Math.max(1, Math.trunc(Number(process.env.AUDIT_ROTATE_MAX_BATCHES) || 20));

  return {
    retentionDays,
    // Defaults to enabled; the archive write itself no-ops safely (skips
    // deletion) if GOOGLE_CLOUD_PROJECT/BigQuery isn't actually configured,
    // so this flag exists to let an operator explicitly pause rotation
    // without touching infra config.
    archiveEnabled: process.env.AUDIT_ARCHIVE_ENABLED === undefined ? true : truthy(process.env.AUDIT_ARCHIVE_ENABLED),
    datasetId: process.env.AUDIT_ARCHIVE_DATASET?.trim() || 'ops_archive',
    tableId: process.env.AUDIT_ARCHIVE_TABLE?.trim() || 'audit_log',
    batchSize,
    maxBatchesPerRun,
  };
};

export const computeCutoffIso = (retentionDays: number, now: Date = new Date()): string => {
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
};

const toArchiveRow = (entry: AuditLogEntry, archivedAt: string): AuditArchiveRow => ({
  id: entry.id,
  action: entry.action,
  outcome: entry.outcome,
  actorUserId: entry.actorUserId,
  channelId: entry.channelId,
  targetId: entry.targetId,
  detail: entry.detail,
  createdAt: entry.createdAt,
  archivedAt,
});

export type AuditRotationResult = {
  ok: boolean;
  archived: number;
  deleted: number;
  batches: number;
  cutoff: string;
  skippedReason?: 'archive_disabled' | 'bigquery_unavailable' | 'no_events_due';
  error?: string;
};

/**
 * Archives-then-deletes audit events older than the retention window, one
 * page at a time, up to maxBatchesPerRun pages per call. Never throws —
 * every failure mode is reported in the returned result so callers (the ops
 * route, the LINE admin command, the CLI) can surface it without a try/catch.
 */
export const archiveAndRotateAuditLog = async (): Promise<AuditRotationResult> => {
  const config = getAuditArchiveConfig();
  const cutoff = computeCutoffIso(config.retentionDays);

  if (!config.archiveEnabled) {
    return { ok: true, archived: 0, deleted: 0, batches: 0, cutoff, skippedReason: 'archive_disabled' };
  }

  let archived = 0;
  let deleted = 0;
  let batches = 0;

  try {
    while (batches < config.maxBatchesPerRun) {
      const page = await listAuditEventsOlderThan(cutoff, config.batchSize);
      if (!page.length) break;

      const archivedAt = new Date().toISOString();
      const archiveResult = await insertAuditArchiveRows(
        config.datasetId,
        config.tableId,
        page.map(entry => toArchiveRow(entry, archivedAt)),
      );

      if (!archiveResult.ok) {
        // Fail safe: nothing in this or any later page gets deleted this run.
        // Same events are picked up again on the next scheduled/manual run.
        // Partial progress from earlier pages this run still stands (ok:true);
        // `error` explains why the run stopped early rather than draining fully.
        return {
          ok: batches > 0,
          archived,
          deleted,
          batches,
          cutoff,
          skippedReason: batches === 0 && archiveResult.error?.includes('not configured') ? 'bigquery_unavailable' : undefined,
          error: archiveResult.error,
        };
      }

      archived += page.length;

      const deleteResult = await deleteAuditEventsByIds(page.map(entry => entry.id));
      batches += 1;
      if (!deleteResult.ok) {
        // Archived but not deleted is safe (worst case: re-archived next run,
        // BigQuery insert is append-only so a duplicate row is harmless).
        return { ok: false, archived, deleted, batches, cutoff, error: deleteResult.error };
      }

      deleted += page.length;
      if (page.length < config.batchSize) break; // drained the backlog
    }

    if (batches === 0) {
      return { ok: true, archived: 0, deleted: 0, batches: 0, cutoff, skippedReason: 'no_events_due' };
    }

    return { ok: true, archived, deleted, batches, cutoff };
  } catch (error) {
    return { ok: false, archived, deleted, batches, cutoff, error: String((error as Error).message || error) };
  }
};
