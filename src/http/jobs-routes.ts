import type { Express } from 'express';
import { runDailyReport } from '../jobs/daily-report';
import { seedOdooSampleSalesData } from '../services/odoo';
import { adminOnly } from '../services/admin-token-auth';
import { jsonParser, opsJobLimiter } from './middleware';
import { isOpsJobsAsync } from './env';
import { enqueueOpsJob } from '../jobs/queue';
import { appLogger } from '../services/logger';

const runJob = async (
  name: 'daily-report' | 'segmentation' | 'seed-odoo',
  execute: () => Promise<unknown>,
): Promise<{ status: number; body: unknown }> => {
  if (isOpsJobsAsync) {
    const jobId = await enqueueOpsJob(name);
    return { status: 202, body: { ok: true, accepted: true, jobId } };
  }
  const result = await execute();
  return { status: 200, body: result };
};

export const registerJobsRoutes = (app: Express): void => {
    app.post('/jobs/daily-report', jsonParser, adminOnly, opsJobLimiter, async (_req, res) => {
        try {
            const outcome = await runJob('daily-report', async () => {
                await runDailyReport();
                return 'Daily report triggered successfully';
            });
            if (typeof outcome.body === 'string') return res.status(outcome.status).send(outcome.body);
            return res.status(outcome.status).json(outcome.body);
        } catch (error) {
            appLogger.error('job_daily_report_failed', { error: String(error) });
            res.status(500).json({ error: 'Failed to trigger daily report' });
        }
    });

    app.post('/jobs/segmentation', jsonParser, adminOnly, opsJobLimiter, async (_req, res) => {
        try {
            const outcome = await runJob('segmentation', async () => {
                const { runSegmentationJob } = await import('../jobs/segmentation');
                await runSegmentationJob();
                return 'Segmentation job triggered successfully';
            });
            if (typeof outcome.body === 'string') return res.status(outcome.status).send(outcome.body);
            return res.status(outcome.status).json(outcome.body);
        } catch (error) {
            appLogger.error('job_segmentation_failed', { error: String(error) });
            res.status(500).json({ error: 'Failed to trigger segmentation job' });
        }
    });

    app.post('/jobs/seed-odoo', jsonParser, adminOnly, opsJobLimiter, async (_req, res) => {
        try {
            const outcome = await runJob('seed-odoo', async () => {
                return seedOdooSampleSalesData();
            });
            if (typeof outcome.body === 'string') return res.status(outcome.status).send(outcome.body);
            return res.status(outcome.status).json(outcome.body);
        } catch (error) {
            appLogger.error('job_seed_odoo_failed', { error: String(error) });
            res.status(500).json({ error: 'Failed to seed Odoo sample data' });
        }
    });
};
