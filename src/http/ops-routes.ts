import type { Express } from 'express';
import { getKpiSnapshot } from '../services/kpi';
import { listRecentAuditEventsPage } from '../services/firestore';
import { getRateLimitRuntimeStatus } from '../services/rate-limit-store';
import { runAuditRotationJob } from '../jobs/audit-rotation';
import { requireOpsToken } from '../services/ops-token-auth';
import { decodeAuditCursor, parseAuditLogFilters } from '../services/audit-query';
import { jsonParser } from './middleware';
import { appLogger } from '../services/logger';
import { ensureDemoSessionStateLoaded, rotateDemoSessionSecret } from './demo-session';
import { demoSessionRotateGraceDefaultMinutes } from './env';
import { buildWorkflowAudit } from './workflow-audit';
import { demoSessionRotateBodySchema } from './openapi/schemas';
import { getPlatformStatus } from '../platform/status';

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

    app.post('/ops/audit-log/rotate', requireOpsToken, jsonParser, async (_req, res) => {
        try {
            const result = await runAuditRotationJob('ops-api');
            res.status(result.ok ? 200 : 500).json(result);
        } catch (error) {
            appLogger.error('audit_rotate_failed', { error: String(error) });
            res.status(500).json({ ok: false, error: 'Failed to run audit-log rotation.' });
        }
    });

    app.post('/ops/demo-session/rotate', requireOpsToken, jsonParser, async (req, res) => {
        await ensureDemoSessionStateLoaded();

        const parsed = demoSessionRotateBodySchema.safeParse({
            newSecret: req.body?.newSecret,
            graceMinutes: req.body?.graceMinutes ?? demoSessionRotateGraceDefaultMinutes,
        });
        if (!parsed.success) {
            return res.status(400).json({ ok: false, error: 'newSecret is required and must be at least 16 characters.' });
        }

        const result = await rotateDemoSessionSecret(
            parsed.data.newSecret,
            parsed.data.graceMinutes ?? demoSessionRotateGraceDefaultMinutes,
        );
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
        return res.status(200).json(await buildWorkflowAudit());
    });

    app.get('/ops/platform', requireOpsToken, async (_req, res) => {
        return res.status(200).json(await getPlatformStatus());
    });
};
