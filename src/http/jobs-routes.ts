import type { Express } from 'express';
import { runDailyReport } from '../jobs/daily-report';
import { seedOdooSampleSalesData } from '../services/odoo';
import { adminOnly } from '../services/admin-token-auth';
import { jsonParser, opsJobLimiter } from './middleware';

export const registerJobsRoutes = (app: Express): void => {
    // Trigger daily report manually
    app.post('/jobs/daily-report', jsonParser, adminOnly, opsJobLimiter, async (_req, res) => {
        try {
            await runDailyReport();
            res.status(200).send('Daily report triggered successfully');
        } catch (error) {
            console.error('Error triggering daily report:', error);
            res.status(500).json({ error: 'Failed to trigger daily report' });
        }
    });

    // Trigger segmentation job manually
    app.post('/jobs/segmentation', jsonParser, adminOnly, opsJobLimiter, async (_req, res) => {
        try {
            const { runSegmentationJob } = await import('../jobs/segmentation');
            await runSegmentationJob();
            res.status(200).send('Segmentation job triggered successfully');
        } catch (error) {
            console.error('Error triggering segmentation job:', error);
            res.status(500).json({ error: 'Failed to trigger segmentation job' });
        }
    });

    // Seed Odoo sample data manually
    app.post('/jobs/seed-odoo', jsonParser, adminOnly, opsJobLimiter, async (_req, res) => {
        try {
            const status = await seedOdooSampleSalesData();
            res.status(200).send(status);
        } catch (error) {
            console.error('Error seeding Odoo sample data:', error);
            res.status(500).json({ error: 'Failed to seed Odoo sample data' });
        }
    });
};
