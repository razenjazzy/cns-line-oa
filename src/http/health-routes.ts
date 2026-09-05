import type { Express } from 'express';
import { appEnv } from './env';
import { getPlatformStatus } from '../platform/status';

export const registerHealthRoutes = (app: Express): void => {
    app.get('/healthz', (_req, res) => {
        res.status(200).json({
            ok: true,
            service: 'cns-line-oa',
            environment: process.env.NODE_ENV || 'development',
            appEnv,
            timestamp: new Date().toISOString(),
        });
    });

    app.get('/readyz', async (_req, res) => {
        const status = await getPlatformStatus();
        return res.status(status.ready ? 200 : 503).json({
            ready: status.ready,
            checks: status.checks,
            flags: status.flags,
            warnings: status.warnings,
            uptimeSeconds: status.uptimeSeconds,
            timestamp: status.timestamp,
        });
    });
};
