import { messagingApi } from '@line/bot-sdk';
import { generateInsights, InsightLanguage } from '../services/vertexai';
import { createDailyReportFlexMessage } from '../line/templates';
import { getUserLanguage, saveReportLog } from '../services/firestore';
import { isOdooConfigured } from '../services/odoo';
import { getErpAdapter } from '../erp/registry';
import { appLogger, createExecutionId } from '../services/logger';

// Lazy: read env vars at call time so dotenv.config() has already run
const getClient = (): messagingApi.MessagingApiClient | null => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: token });
};

const isValidLineUserId = (value: string): boolean => /^U[a-f0-9]{32}$/i.test(value);

export const runDailyReport = async (language?: InsightLanguage) => {
  const executionId = createExecutionId('daily-report');
  appLogger.info('job_started', { job: 'daily_report', executionId });

  if (!isOdooConfigured()) {
    throw new Error('Odoo is not configured. Please set ODOO_URL/ODOO_DB/ODOO_USERNAME/ODOO_API_KEY.');
  }

  const snapshot = await getErpAdapter().getDailySnapshot();
  if (!snapshot.length) {
    throw new Error('No sales data was found in Odoo for the selected time windows.');
  }

  const data = JSON.stringify(snapshot);
  const hasSales = snapshot.some(row => row.salesYesterday > 0 || row.revenueYesterday > 0);
  if (hasSales) {
    console.log(`Loaded ${snapshot.length} sales rows from Odoo.`);
  } else {
    console.log(`Loaded ${snapshot.length} Odoo inventory rows (no recent sales found).`);
  }

  const ADMIN_USER_ID = process.env.ADMIN_USER_ID || '';
  const resolvedLanguage: InsightLanguage = language || (ADMIN_USER_ID ? await getUserLanguage(ADMIN_USER_ID) : 'th');
  const insights = await generateInsights(data, resolvedLanguage);

  const client = getClient();

  if (!client) {
    console.log('LINE credentials not provided. Skipping LINE message.');
  } else if (!ADMIN_USER_ID || !isValidLineUserId(ADMIN_USER_ID)) {
    console.log('ADMIN_USER_ID is missing or invalid. Skipping LINE push.');
  } else {
    const message = createDailyReportFlexMessage(data, insights, resolvedLanguage);
    try {
      await client.pushMessage({ to: ADMIN_USER_ID, messages: [message] });
      console.log('Report sent to LINE');
    } catch (error) {
      // Do not fail the whole job for push errors; keep report generation resilient.
      console.error('Failed to push report to LINE:', error);
    }
  }

  await saveReportLog(new Date().toISOString().split('T')[0], { insights });
  appLogger.info('job_completed', { job: 'daily_report', executionId });
};
