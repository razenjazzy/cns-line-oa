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

const app = express();
// Railway (and most PaaS hosts) terminate TLS at a reverse proxy and forward
// plain HTTP internally, so req.protocol reports 'http' even on a real
// https:// deployment unless Express is told to trust the proxy's
// X-Forwarded-Proto header. Without this, any link built from a request's
// baseUrl (e.g. the VERIFY START magic link in user-verification.ts) comes
// out as a broken http:// URL. `1` trusts exactly one hop, matching a
// single reverse-proxy deployment shape — not a blanket "trust anything".
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

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);

const startServer = async () => {
    setRateStore(await createRateLimitStoreFromEnv(fallbackRateStore));
    await ensureDemoSessionStateLoaded();
    const server = app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });

    // Cloud Run (and most orchestrators) send SIGTERM before killing an
    // instance on scale-down/redeploy. Stop accepting new connections and let
    // in-flight requests finish, instead of dropping them mid-response.
    const shutdown = (signal: string) => {
        console.log(`Received ${signal}, shutting down gracefully...`);
        const forceExitTimer = setTimeout(() => {
            console.warn(`Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS}ms; forcing exit.`);
            process.exit(1);
        }, SHUTDOWN_TIMEOUT_MS);
        forceExitTimer.unref();

        server.close((err) => {
            if (err) {
                console.error('Error during server close:', err);
                process.exit(1);
            }
            clearTimeout(forceExitTimer);
            console.log('Server closed. Exiting.');
            process.exit(0);
        });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
};

startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
