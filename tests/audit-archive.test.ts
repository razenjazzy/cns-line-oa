import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { archiveAndRotateAuditLog, computeCutoffIso, getAuditArchiveConfig } from '../src/services/audit-archive';

const ENV_KEYS = [
  'GOOGLE_CLOUD_PROJECT',
  'AUDIT_RETENTION_DAYS',
  'AUDIT_ARCHIVE_ENABLED',
  'AUDIT_ARCHIVE_DATASET',
  'AUDIT_ARCHIVE_TABLE',
  'AUDIT_ROTATE_BATCH_SIZE',
  'AUDIT_ROTATE_MAX_BATCHES',
] as const;

describe('computeCutoffIso', () => {
  it('subtracts the retention window in days from the given instant', () => {
    const now = new Date('2026-08-31T00:00:00.000Z');
    expect(computeCutoffIso(90, now)).toBe('2026-06-02T00:00:00.000Z');
    expect(computeCutoffIso(1, now)).toBe('2026-08-30T00:00:00.000Z');
  });
});

describe('getAuditArchiveConfig', () => {
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of ENV_KEYS) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (originalEnv[key] === undefined) delete process.env[key];
      else process.env[key] = originalEnv[key];
    }
  });

  it('applies safe defaults when nothing is configured', () => {
    expect(getAuditArchiveConfig()).toEqual({
      retentionDays: 90,
      archiveEnabled: true,
      datasetId: 'ops_archive',
      tableId: 'audit_log',
      batchSize: 500,
      maxBatchesPerRun: 20,
    });
  });

  it('reads overrides and clamps batch size to the Firestore batch-write cap', () => {
    process.env.AUDIT_RETENTION_DAYS = '30';
    process.env.AUDIT_ARCHIVE_ENABLED = 'false';
    process.env.AUDIT_ARCHIVE_DATASET = 'custom_ds';
    process.env.AUDIT_ARCHIVE_TABLE = 'custom_table';
    process.env.AUDIT_ROTATE_BATCH_SIZE = '9999';
    process.env.AUDIT_ROTATE_MAX_BATCHES = '3';

    const config = getAuditArchiveConfig();
    expect(config.retentionDays).toBe(30);
    expect(config.archiveEnabled).toBe(false);
    expect(config.datasetId).toBe('custom_ds');
    expect(config.tableId).toBe('custom_table');
    expect(config.batchSize).toBe(500); // clamped
    expect(config.maxBatchesPerRun).toBe(3);
  });

  it('rejects garbage numeric input by falling back to defaults', () => {
    process.env.AUDIT_RETENTION_DAYS = 'not-a-number';
    expect(getAuditArchiveConfig().retentionDays).toBe(90);
  });
});

describe('archiveAndRotateAuditLog', () => {
  const originalProject = process.env.GOOGLE_CLOUD_PROJECT;
  const originalEnabled = process.env.AUDIT_ARCHIVE_ENABLED;

  beforeEach(() => {
    // Matches the test environment's reality (no GCP credentials available):
    // Firestore/BigQuery both no-op, so this exercises the real fail-safe
    // path rather than a mock.
    delete process.env.GOOGLE_CLOUD_PROJECT;
    delete process.env.AUDIT_ARCHIVE_ENABLED;
  });

  afterEach(() => {
    if (originalProject === undefined) delete process.env.GOOGLE_CLOUD_PROJECT;
    else process.env.GOOGLE_CLOUD_PROJECT = originalProject;
    if (originalEnabled === undefined) delete process.env.AUDIT_ARCHIVE_ENABLED;
    else process.env.AUDIT_ARCHIVE_ENABLED = originalEnabled;
  });

  it('never throws and reports no_events_due when Firestore has nothing to page through', async () => {
    const result = await archiveAndRotateAuditLog();
    expect(result.ok).toBe(true);
    expect(result.archived).toBe(0);
    expect(result.deleted).toBe(0);
    // Firestore is unconfigured in this test env, so listAuditEventsOlderThan
    // returns [] via its fallback — the loop exits on the first empty page.
    expect(result.skippedReason).toBe('no_events_due');
  });

  it('honors AUDIT_ARCHIVE_ENABLED=false as an explicit no-op', async () => {
    process.env.AUDIT_ARCHIVE_ENABLED = 'false';
    const result = await archiveAndRotateAuditLog();
    expect(result).toMatchObject({ ok: true, archived: 0, deleted: 0, batches: 0, skippedReason: 'archive_disabled' });
  });
});
