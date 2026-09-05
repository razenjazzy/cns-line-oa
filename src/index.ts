import express from 'express';
import dotenv from 'dotenv';
dotenv.config();

import { cspMiddleware, requestLoggingMiddleware } from './http/middleware';
import { fallbackRateStore, setRateStore } from './http/runtime-state';
import { ensureDemoSessionStateLoaded } from './http/demo-session';
import { createRateLimitStoreFromEnv } from './services/rate-limit-store';
import { registerHealthRoutes } from './http/health-routes';
import { registerOpsRoutes } from './http/ops-routes';
import { registerVerifyRoutes } from './http/verify-routes';
import { registerWebhookRoutes } from './http/webhook-routes';
import { registerJobsRoutes } from './http/jobs-routes';
import { registerDemoRoutes } from './http/demo-routes';
import { registerOpenApiRoutes } from './http/openapi-routes';
import { registerGraphqlRoutes } from './http/graphql-routes';
import { initTracing, shutdownTracing } from './observability/tracing';
import { startQueueWorkers } from './jobs/workers';
import { appEnv, isBullmqWorkerEnabled } from './http/env';
import { appLogger } from './services/logger';
import { closeMongo } from './infra/mongo/base-repository';
import { closeQueues } from './jobs/queue';
import { getErpAdapter } from './erp/registry';

const app = express();
app.set('trust proxy', 1);
const port = process.env.PORT || 8080;

app.use(cspMiddleware);
app.use(requestLoggingMiddleware);

registerHealthRoutes(app);
registerOpsRoutes(app);
registerVerifyRoutes(app);
registerWebhookRoutes(app);
registerJobsRoutes(app);
registerDemoRoutes(app);
registerOpenApiRoutes(app);

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);

const startServer = async () => {
    getErpAdapter();
    initTracing();
    await registerGraphqlRoutes(app);
    setRateStore(await createRateLimitStoreFromEnv(fallbackRateStore));
    await ensureDemoSessionStateLoaded();
    const workers = isBullmqWorkerEnabled ? startQueueWorkers() : [];
    const server = app.listen(port, () => {
        appLogger.info('server_listening', { port, appEnv, nodeEnv: process.env.NODE_ENV || 'development' });
    });

    const shutdown = (signal: string) => {
        appLogger.info('server_shutdown', { signal });
        const forceExitTimer = setTimeout(() => {
            appLogger.warn('shutdown_timeout');
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        forceExitTimer.unref();

        server.close((err) => {
            void (async () => {
                if (err) {
                    appLogger.error('server_close_error', { error: String(err) });
                    process.exit(1);
                }
                await Promise.all(workers.map((worker) => worker.close()));
                await closeQueues().catch(() => undefined);
                await closeMongo().catch(() => undefined);
                await shutdownTracing().catch(() => undefined);
                clearTimeout(forceExitTimer);
                appLogger.info('server_closed');
                process.exit(0);
            })();
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch(error => {
    appLogger.error('server_start_failed', { error: String(error) });
    process.exit(1);
});
