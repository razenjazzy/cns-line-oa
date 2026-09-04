"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.insertAuditArchiveRows = exports.getCohortData = exports.getBigQuery = void 0;
const bigquery_1 = require("@google-cloud/bigquery");
let bigquery = null;
const getBigQuery = () => {
    if (bigquery)
        return bigquery;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId)
        return null;
    try {
        bigquery = new bigquery_1.BigQuery({ projectId });
    }
    catch (error) {
        console.warn('Failed to initialize BigQuery:', error);
    }
    return bigquery;
};
exports.getBigQuery = getBigQuery;
const getCohortData = async () => {
    const bigquery = (0, exports.getBigQuery)();
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
        return rows;
    }
    catch (err) {
        console.error('Error querying BigQuery:', err);
        return [];
    }
};
exports.getCohortData = getCohortData;
const AUDIT_ARCHIVE_SCHEMA = [
    { name: 'id', type: 'STRING', mode: 'REQUIRED' },
    { name: 'action', type: 'STRING', mode: 'REQUIRED' },
    { name: 'outcome', type: 'STRING', mode: 'REQUIRED' },
    { name: 'actorUserId', type: 'STRING', mode: 'NULLABLE' },
    { name: 'channelId', type: 'STRING', mode: 'NULLABLE' },
    { name: 'requestId', type: 'STRING', mode: 'NULLABLE' },
    { name: 'targetId', type: 'STRING', mode: 'NULLABLE' },
    { name: 'detail', type: 'STRING', mode: 'NULLABLE' },
    { name: 'createdAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
    { name: 'archivedAt', type: 'TIMESTAMP', mode: 'REQUIRED' },
];
/**
 * Idempotent get-or-create for the archive dataset/table so the rotation job
 * works against a fresh project without any manual BigQuery setup step.
 * Table is day-partitioned on createdAt, matching how it will actually be
 * queried (by date range), and keeps re-provisioning cheap on every run.
 */
const ensureAuditArchiveTable = async (bq, datasetId, tableId) => {
    const dataset = bq.dataset(datasetId);
    const [datasetExists] = await dataset.exists();
    if (!datasetExists)
        await dataset.create();
    const table = dataset.table(tableId);
    const [tableExists] = await table.exists();
    if (!tableExists) {
        await dataset.createTable(tableId, {
            schema: { fields: AUDIT_ARCHIVE_SCHEMA },
            timePartitioning: { type: 'DAY', field: 'createdAt' },
        });
    }
    return table;
};
/**
 * Appends a page of rotated-out audit rows to the cold-storage table. Never
 * deletes or overwrites — the rotation job only removes the matching
 * Firestore rows after this resolves ok, so a failure here just means
 * "try this same page again next run."
 */
const insertAuditArchiveRows = async (datasetId, tableId, rows) => {
    if (!rows.length)
        return { ok: true };
    const bq = (0, exports.getBigQuery)();
    if (!bq)
        return { ok: false, error: 'BigQuery is not configured (GOOGLE_CLOUD_PROJECT is unset).' };
    try {
        const table = await ensureAuditArchiveTable(bq, datasetId, tableId);
        await table.insert(rows, { ignoreUnknownValues: false, skipInvalidRows: false });
        return { ok: true };
    }
    catch (error) {
        console.error('Failed to archive audit rows to BigQuery:', error);
        return { ok: false, error: String(error.message || error) };
    }
};
exports.insertAuditArchiveRows = insertAuditArchiveRows;
