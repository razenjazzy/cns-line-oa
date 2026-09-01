import { BigQuery } from '@google-cloud/bigquery';

let bigquery: BigQuery | null = null;

export const getBigQuery = (): BigQuery | null => {
  if (bigquery) return bigquery;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) return null;
  try {
    bigquery = new BigQuery({ projectId });
  } catch (error) {
    console.warn('Failed to initialize BigQuery:', error);
  }
  return bigquery;
};

export interface UserCohortData {
  userId: string;
  totalPurchases: number;
  lastActiveDaysAgo: number;
  browsePurchaseRatio: number;
}

export const getCohortData = async (): Promise<UserCohortData[]> => {
  const bigquery = getBigQuery();
  if (!bigquery) {
    console.warn('BigQuery is not initialized. Segmentation job will skip because no real cohort data is available.');
    return [];
  }

  // In a real scenario, this would query your BigQuery analytics dataset
  const query = `
    SELECT
      userId,
      COUNT(orderId) as totalPurchases,
      DATE_DIFF(CURRENT_DATE(), MAX(interactionDate), DAY) as lastActiveDaysAgo,
      SAFE_DIVIDE(COUNT(browseEvent), COUNT(orderId)) as browsePurchaseRatio
    FROM \`analytics.user_behavior\`
    GROUP BY userId
    LIMIT 100
  `;

  try {
    const [job] = await bigquery.createQueryJob({ query });
    const [rows] = await job.getQueryResults();
    return rows as UserCohortData[];
  } catch (err) {
    console.error('Error querying BigQuery:', err);
    return [];
  }
};

// ---------------------------------------------------------------------------
// Audit log cold storage — used by src/services/audit-archive.ts to give
// rotated-out Firestore audit rows a permanent, queryable home instead of
// deleting them outright.
// ---------------------------------------------------------------------------

export type AuditArchiveRow = {
  id: string;
  action: string;
  outcome: string;
  actorUserId: string;
  channelId: string | null;
  targetId: string | null;
  detail: string | null;
  createdAt: string;
  archivedAt: string;
};

const AUDIT_ARCHIVE_SCHEMA = [
  { name: 'id', type: 'STRING', mode: 'REQUIRED' },
  { name: 'action', type: 'STRING', mode: 'REQUIRED' },
  { name: 'outcome', type: 'STRING', mode: 'REQUIRED' },
  { name: 'actorUserId', type: 'STRING', mode: 'NULLABLE' },
  { name: 'channelId', type: 'STRING', mode: 'NULLABLE' },
  { name: 'targetId', type: 'STRING', mode: 'NULLABLE' },
  { name: 'detail', type: 'STRING', mode: 'NULLABLE' },
  { name: 'createdAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
  { name: 'archivedAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
] as const;

/**
 * Idempotent get-or-create for the archive dataset/table so the rotation job
 * works against a fresh project without any manual BigQuery setup step.
 * Table is day-partitioned on createdAt, matching how it will actually be
 * queried (by date range), and keeps re-provisioning cheap on every run.
 */
const ensureAuditArchiveTable = async (bq: BigQuery, datasetId: string, tableId: string) => {
  const dataset = bq.dataset(datasetId);
  const [datasetExists] = await dataset.exists();
  if (!datasetExists) await dataset.create();

  const table = dataset.table(tableId);
  const [tableExists] = await table.exists();
  if (!tableExists) {
    await dataset.createTable(tableId, {
      schema: { fields: AUDIT_ARCHIVE_SCHEMA as unknown as Record<string, unknown>[] },
      timePartitioning: { type: 'DAY', field: 'createdAt' },
    });
  }
  return table;
};

export type ArchiveResult = { ok: boolean; error?: string };

/**
 * Appends a page of rotated-out audit rows to the cold-storage table. Never
 * deletes or overwrites — the rotation job only removes the matching
 * Firestore rows after this resolves ok, so a failure here just means
 * "try this same page again next run."
 */
export const insertAuditArchiveRows = async (
  datasetId: string,
  tableId: string,
  rows: AuditArchiveRow[]
): Promise<ArchiveResult> => {
  if (!rows.length) return { ok: true };

  const bq = getBigQuery();
  if (!bq) return { ok: false, error: 'BigQuery is not configured (GOOGLE_CLOUD_PROJECT is unset).' };

  try {
    const table = await ensureAuditArchiveTable(bq, datasetId, tableId);
    await table.insert(rows, { ignoreUnknownValues: false, skipInvalidRows: false });
    return { ok: true };
  } catch (error) {
    console.error('Failed to archive audit rows to BigQuery:', error);
    return { ok: false, error: String((error as Error).message || error) };
  }
};
