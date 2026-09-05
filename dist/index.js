"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const middleware_1 = require("./http/middleware");
const runtime_state_1 = require("./http/runtime-state");
const demo_session_1 = require("./http/demo-session");
const rate_limit_store_1 = require("./services/rate-limit-store");
const health_routes_1 = require("./http/health-routes");
const ops_routes_1 = require("./http/ops-routes");
const verify_routes_1 = require("./http/verify-routes");
const webhook_routes_1 = require("./http/webhook-routes");
const jobs_routes_1 = require("./http/jobs-routes");
const demo_routes_1 = require("./http/demo-routes");
const app = (0, express_1.default)();
// Railway (and most PaaS hosts) terminate TLS at a reverse proxy and forward
// plain HTTP internally, so req.protocol reports 'http' even on a real
// https:// deployment unless Express is told to trust the proxy's
// X-Forwarded-Proto header. Without this, any link built from a request's
// baseUrl (e.g. the VERIFY START magic link in user-verification.ts) comes
// out as a broken http:// URL. `1` trusts exactly one hop, matching a
// single reverse-proxy deployment shape — not a blanket "trust anything".
app.set('trust proxy', 1);
const port = process.env.PORT || 8080;
app.use(middleware_1.cspMiddleware);
app.use(middleware_1.requestLoggingMiddleware);
(0, health_routes_1.registerHealthRoutes)(app);
(0, ops_routes_1.registerOpsRoutes)(app);
(0, verify_routes_1.registerVerifyRoutes)(app);
(0, webhook_routes_1.registerWebhookRoutes)(app);
(0, jobs_routes_1.registerJobsRoutes)(app);
(0, demo_routes_1.registerDemoRoutes)(app);
const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);
const startServer = async () => {
    (0, runtime_state_1.setRateStore)(await (0, rate_limit_store_1.createRateLimitStoreFromEnv)(runtime_state_1.fallbackRateStore));
    await (0, demo_session_1.ensureDemoSessionStateLoaded)();
    const server = app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
    // Cloud Run (and most orchestrators) send SIGTERM before killing an
    // instance on scale-down/redeploy. Stop accepting new connections and let
    // in-flight requests finish, instead of dropping them mid-response.
    const shutdown = (signal) => {
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
