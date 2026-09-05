import type { Express } from 'express';
import { checkFirestoreReady } from '../services/firestore';
import { pingOdoo } from '../services/odoo';
import { getRateLimitRuntimeStatus } from '../services/rate-limit-store';
import { withTimeout } from './middleware';
import { getRateStore } from './runtime-state';
import { readyzTimeoutMs } from './env';

export const registerHealthRoutes = (app: Express): void => {
    app.get('/healthz', (_req, res) => {
        res.status(200).json({
            ok: true,
            service: 'cns-line-oa',
            environment: process.env.NODE_ENV || 'development',
            timestamp: new Date().toISOString(),
        });
    });

    app.get('/readyz', async (_req, res) => {
        const checks: Array<{ name: string; ok: boolean; message: string }> = [];

        try {
            const firestoreStatus = await withTimeout(
                checkFirestoreReady(),
                readyzTimeoutMs,
                `Firestore check timed out after ${readyzTimeoutMs}ms`
            );
            checks.push({ name: 'firestore', ok: firestoreStatus.ok, message: firestoreStatus.message });
        } catch (error) {
            checks.push({ name: 'firestore', ok: false, message: String(error) });
        }

        try {
            const odooStatus = await withTimeout(
                pingOdoo(),
                readyzTimeoutMs,
                `Odoo check timed out after ${readyzTimeoutMs}ms`
            );
            checks.push({
                name: 'odoo',
                ok: /connected successfully/i.test(odooStatus),
                message: odooStatus,
            });
        } catch (error) {
            checks.push({ name: 'odoo', ok: false, message: String(error) });
        }

        try {
            const limiterHealth = await withTimeout(
                getRateStore().healthCheck(),
                readyzTimeoutMs,
                `Rate limit store check timed out after ${readyzTimeoutMs}ms`
            );
            const limiterRuntime = getRateLimitRuntimeStatus();
            const limiterDegraded = limiterRuntime.configuredMode === 'redis' && limiterRuntime.activeBackend !== 'redis';
            checks.push({
                name: 'rateLimiter',
                ok: limiterHealth.ok && !limiterDegraded,
                message: limiterDegraded
                    ? `Configured redis but active backend is ${limiterRuntime.activeBackend}${limiterRuntime.fallbackReason ? ` (${limiterRuntime.fallbackReason})` : ''}`
                    : limiterHealth.message,
            });
        } catch (error) {
            checks.push({ name: 'rateLimiter', ok: false, message: String(error) });
        }

        const ready = checks.every(check => check.ok);
        return res.status(ready ? 200 : 503).json({
            ready,
            checks,
            uptimeSeconds: Number(process.uptime().toFixed(0)),
            timestamp: new Date().toISOString(),
        });
    });
};
