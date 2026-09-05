import type { Express } from 'express';
import { getKpiSnapshot } from '../services/kpi';
import { listRecentAuditEventsPage } from '../services/firestore';
import { getRateLimitRuntimeStatus } from '../services/rate-limit-store';
import { runAuditRotationJob } from '../jobs/audit-rotation';
import { requireOpsToken } from '../services/ops-token-auth';
import { decodeAuditCursor, parseAuditLogFilters } from '../services/audit-query';
import { runRuntimeProbes, collectProbeFailures } from '../services/runtime-probes';
import { jsonParser } from './middleware';
import { getRateStore } from './runtime-state';
import {
    ensureDemoSessionStateLoaded,
    getActiveDemoSessionSecret,
    rotateDemoSessionSecret,
} from './demo-session';
import {
    allowDemoHeaderTokenFallbackInProd,
    demoControlToken,
    demoSessionRotateGraceDefaultMinutes,
    isDemoControlEnabled,
    isProduction,
    isWebhookTestEnabled,
    opsApiToken,
    readyzTimeoutMs,
    webhookTestToken,
} from './env';

export const registerOpsRoutes = (app: Express): void => {
    app.get('/ops/kpi', requireOpsToken, (_req, res) => {
        res.status(200).json({
            ...getKpiSnapshot(),
            rateLimitRuntime: getRateLimitRuntimeStatus(),
        });
    });

    app.get('/ops/audit-log', requireOpsToken, async (req, res) => {
        const limit = Number(req.query.limit) || 50;
        const page = await listRecentAuditEventsPage(
            limit,
            parseAuditLogFilters(req.query as Record<string, unknown>),
            decodeAuditCursor(req.query.cursor),
        );
        res.status(200).json({ ...page, count: page.events.length });
    });

    // Archives audit events past the retention window to BigQuery, then deletes
    // them from Firestore — see documents/AUDIT_LOG_POLICY.md. Safe to call on a
    // schedule (e.g. Cloud Scheduler) or by hand; no-ops safely if BigQuery isn't
    // configured, and never deletes anything that wasn't just archived.
    app.post('/ops/audit-log/rotate', requireOpsToken, jsonParser, async (_req, res) => {
        try {
            const result = await runAuditRotationJob('ops-api');
            res.status(result.ok ? 200 : 500).json(result);
        } catch (error) {
            console.error('Error running audit-log rotation:', error);
            res.status(500).json({ ok: false, error: 'Failed to run audit-log rotation.' });
        }
    });

    app.post('/ops/demo-session/rotate', requireOpsToken, jsonParser, async (req, res) => {
        await ensureDemoSessionStateLoaded();

        const newSecret = String(req.body?.newSecret || '').trim();
        const graceMinutes = Number(req.body?.graceMinutes ?? demoSessionRotateGraceDefaultMinutes);

        const result = await rotateDemoSessionSecret(newSecret, graceMinutes);
        if (!result.ok) {
            return res.status(400).json({ ok: false, error: result.error });
        }

        return res.json({
            ok: true,
            rotatedAt: new Date().toISOString(),
            graceMinutes: result.graceMinutes,
            previousSecretGraceActive: result.previousSecretGraceActive,
        });
    });

    app.get('/ops/workflow-audit', requireOpsToken, async (_req, res) => {
        await ensureDemoSessionStateLoaded();

        const runtimeChecks = await runRuntimeProbes(getRateStore(), readyzTimeoutMs);

        const audit = {
            generatedAt: new Date().toISOString(),
            checks: {
                security: {
                    opsTokenConfigured: Boolean(opsApiToken),
                    demoControlEnabled: isDemoControlEnabled,
                    demoControlTokenConfigured: Boolean(demoControlToken),
                    demoSessionOnlyProduction: !allowDemoHeaderTokenFallbackInProd,
                    demoSessionSecretConfigured: Boolean(getActiveDemoSessionSecret()),
                    webhookTestProductionSafe: !isProduction || !isWebhookTestEnabled || Boolean(webhookTestToken),
                },
                observability: {
                    requestIdLogging: true,
                    kpiEndpointProtected: Boolean(opsApiToken),
                    readyzWithDependencyChecks: true,
                    rateLimitRuntimeExposed: true,
                },
                runtime: runtimeChecks,
                workflowFeatures: {
                    groupBuyLifecycle: true,
                    odooVerificationOtpAndLink: true,
                    pricingControlModel: true,
                    demoRunbookPanel: true,
                    sharedRateLimitReady: runtimeChecks.rateLimiter.ok,
                },
            },
            runtimeConfig: {
                rateLimit: getRateLimitRuntimeStatus(),
            },
        };

        const failures: string[] = [];
        if (!audit.checks.security.opsTokenConfigured) failures.push('OPS_API_TOKEN is not configured');
        if (isProduction && !audit.checks.security.demoControlTokenConfigured) failures.push('DEMO_CONTROL_TOKEN is not configured for production');
        if (isProduction && !audit.checks.security.demoSessionSecretConfigured) failures.push('DEMO_SESSION_SECRET (or DEMO_CONTROL_TOKEN fallback) is not configured for production');
        if (isProduction && allowDemoHeaderTokenFallbackInProd) failures.push('ALLOW_DEMO_HEADER_TOKEN_FALLBACK should be disabled in production for session-only access');
        if (isProduction && isDemoControlEnabled) failures.push('Demo control panel (ENABLE_DEMO_CONTROL_PANEL) is enabled in production — confirm this is intentional and time-boxed, then disable it again.');
        if (!audit.checks.security.webhookTestProductionSafe) failures.push('ENABLE_WEBHOOK_TEST is active in production without WEBHOOK_TEST_TOKEN');

        failures.push(...collectProbeFailures(runtimeChecks));
        const score = Math.max(0, 100 - failures.length * 20);

        return res.status(200).json({
            ...audit,
            score,
            status: failures.length ? 'needs_attention' : 'ready',
            failures,
        });
    });
};
