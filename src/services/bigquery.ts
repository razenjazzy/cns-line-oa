import { BigQuery } from '@google-cloud/bigquery';

let bigquery: BigQuery | null = null;

const getBigQuery = (): BigQuery | null => {
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
