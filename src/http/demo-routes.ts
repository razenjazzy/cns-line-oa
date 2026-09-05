import type { Express } from 'express';
import { buildDemoPage } from '../demo/page';
import { getAgentName } from '../line/channels';
import { resolveCommandReply } from '../line/command-router';
import { getUserLanguage, getUserProfile } from '../services/firestore';
import { getDemoOverview, runDemoJourney } from '../services/demo';
import { getDemoPlatformPayload } from '../platform/service-modules';
import { getPlatformFlags } from '../platform/status';
import { createDemoSessionToken, safeTokenMatch } from '../services/demo-session';
import { getPricingModel, runPricingSimulation, updatePricingModel } from '../services/pricing-control';
import { runRuntimeProbes, collectProbeFailures } from '../services/runtime-probes';
import { jsonParser } from './middleware';
import { getRateStore } from './runtime-state';
import {
    clearDemoSessionCookie,
    ensureDemoSessionStateLoaded,
    getActiveDemoSessionSecret,
    getPreviousDemoSessionSecretGraceActive,
    requireDemoControlAccess,
    setDemoSessionCookie,
    verifyIncomingDemoSession,
} from './demo-session';
import {
    allowDemoHeaderTokenFallbackInProd,
    demoControlToken,
    demoSessionTtlMinutes,
    isDemoControlEnabled,
    isProduction,
    isWebhookTestEnabled,
    opsApiToken,
    readyzTimeoutMs,
    webhookTestToken,
} from './env';

export const registerDemoRoutes = (app: Express): void => {
    app.post('/demo/session/login', jsonParser, async (req, res) => {
        if (!isDemoControlEnabled) {
            return res.status(404).json({ error: 'Demo control panel is disabled.' });
        }

        await ensureDemoSessionStateLoaded();

        const activeSecret = getActiveDemoSessionSecret();
        if (!demoControlToken || !activeSecret) {
            return res.status(503).json({ error: 'Demo session login unavailable because required token or session secret is missing.' });
        }

        const providedToken = String(req.body?.token || '').trim();
        if (!safeTokenMatch(providedToken, demoControlToken)) {
            return res.status(401).json({ ok: false, error: 'Invalid demo access token.' });
        }

        const token = createDemoSessionToken(activeSecret, Math.max(60, Math.trunc(demoSessionTtlMinutes * 60)));
        setDemoSessionCookie(res, token);
        return res.json({ ok: true, ttlMinutes: demoSessionTtlMinutes });
    });

    app.post('/demo/session/logout', (_req, res) => {
        clearDemoSessionCookie(res);
        return res.json({ ok: true });
    });

    app.get('/demo/session/status', (req, res) => {
        if (!isDemoControlEnabled) {
            return res.status(404).json({ error: 'Demo control panel is disabled.' });
        }

        if (!isProduction) {
            return res.json({ authenticated: true, mode: 'development', sessionOnlyProduction: !allowDemoHeaderTokenFallbackInProd });
        }

        const handle = async () => {
            const { sessionAuthenticated, tokenAuthenticated } = await verifyIncomingDemoSession(req);

            return res.json({
                authenticated: sessionAuthenticated || tokenAuthenticated,
                sessionAuthenticated,
                tokenAuthenticated,
                sessionOnlyProduction: !allowDemoHeaderTokenFallbackInProd,
                previousSessionSecretGraceActive: getPreviousDemoSessionSecretGraceActive(),
            });
        };

        return handle().catch(error => {
            return res.status(500).json({ error: String(error) });
        });
    });

    app.get('/demo', requireDemoControlAccess, (_req, res) => {
        res.type('html').send(buildDemoPage());
    });

    app.get('/demo/connections', requireDemoControlAccess, async (req, res) => {
        try {
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const overview = await getDemoOverview(baseUrl);
            res.json(overview);
        } catch (error) {
            console.error('Error loading demo connections:', error);
            res.status(500).json({ error: String(error) });
        }
    });

    app.get('/demo/platform', requireDemoControlAccess, (_req, res) => {
        res.json({ ...getDemoPlatformPayload(), flags: getPlatformFlags() });
    });

    app.post('/demo/journey', requireDemoControlAccess, jsonParser, async (req, res) => {
        try {
            const result = await runDemoJourney(req.body || {});
            res.status(result.ok ? 200 : 400).json(result);
        } catch (error) {
            console.error('Error running demo journey:', error);
            res.status(500).json({ error: String(error) });
        }
    });

    // Interactive web chat widget: drives the exact same routing engine as the
    // LINE bot (resolveCommandReply), so the /demo panel previews real bot
    // behavior — including the auto-opened nav-button menu on first contact.
    app.post('/demo/chat', requireDemoControlAccess, jsonParser, async (req, res) => {
        try {
            const rawText = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
            if (!rawText) {
                return res.status(400).json({ error: 'Missing chat text.' });
            }

            const rawUserId = typeof req.body?.userId === 'string' ? req.body.userId.trim() : '';
            const userId = rawUserId && rawUserId.length <= 120 ? rawUserId : 'web_demo_user';

            const userLanguage = await getUserLanguage(userId);
            const profile = await getUserProfile(userId);
            const agentName = getAgentName();
            const baseUrl = `${req.protocol}://${req.get('host')}`;

            const botMessages = await resolveCommandReply({
                text: rawText,
                userId,
                userLanguage,
                profile,
                agentName,
                baseUrl,
                requestId: String(res.getHeader('x-request-id') || '') || undefined,
            });

            // Flatten the LINE messages into a minimal chat transcript the widget
            // can render: text messages keep their text, Flex messages surface a
            // friendly label (their altText) plus the raw shape for later styling.
            const transcript = botMessages.map(message => {
                if (message.type === 'text') {
                    return { kind: 'text', text: message.text };
                }
                return { kind: 'card', text: (message.type === 'flex' ? message.altText : 'Card') || 'Card' };
            });

            return res.json({ agentName, transcript });
        } catch (error) {
            console.error('Error in /demo/chat:', error);
            res.status(500).json({ error: String(error) });
        }
    });

    app.get('/demo/pricing-model', requireDemoControlAccess, (_req, res) => {
        return getPricingModel()
            .then(model => {
                res.json({
                    generatedAt: new Date().toISOString(),
                    model,
                });
            })
            .catch(error => {
                res.status(500).json({ error: String(error) });
            });
    });

    app.put('/demo/pricing-model', requireDemoControlAccess, jsonParser, async (req, res) => {
        try {
            const updated = await updatePricingModel(req.body || {});
            res.json({
                ok: true,
                generatedAt: new Date().toISOString(),
                model: updated,
            });
        } catch (error) {
            res.status(400).json({ ok: false, error: String(error) });
        }
    });

    app.post('/demo/pricing-simulation', requireDemoControlAccess, jsonParser, async (req, res) => {
        try {
            await getPricingModel();
            const report = runPricingSimulation(req.body || {});
            res.json(report);
        } catch (error) {
            res.status(400).json({ error: String(error) });
        }
    });

    app.get('/demo/workflow-audit', requireDemoControlAccess, async (_req, res) => {
        await ensureDemoSessionStateLoaded();

        const failures: string[] = [];
        if (!opsApiToken) failures.push('OPS_API_TOKEN is not configured');
        if (isDemoControlEnabled && !demoControlToken) failures.push('DEMO_CONTROL_TOKEN is not configured while the demo panel is enabled');
        if (isWebhookTestEnabled && isProduction && !webhookTestToken) failures.push('WEBHOOK_TEST_TOKEN should be configured when ENABLE_WEBHOOK_TEST is enabled on a NODE_ENV=production host');

        const runtimeChecks = await runRuntimeProbes(getRateStore(), readyzTimeoutMs);

        failures.push(...collectProbeFailures(runtimeChecks));

        const audit = {
            generatedAt: new Date().toISOString(),
            score: Math.max(0, 100 - failures.length * 20),
            status: failures.length ? 'needs_attention' : 'ready_for_uat',
            checks: {
                phase1SecurityBaseline: true,
                phase2ReadinessObservability: true,
                phase3OdooResilience: true,
                phase4CommandValidation: true,
                phase5FirestoreWriteSafety: true,
                phase6TestsAndRegression: true,
                phase7FeatureGateAndKpi: true,
                phase8GroupBuyLifecycle: true,
                phase9OdooUserVerification: true,
                phase10PricingAndCostControl: true,
                phase11ControlPanelSimulation: true,
            },
            runtime: runtimeChecks,
            failures,
            notes: [
                'Use /ops/workflow-audit with OPS token for security-deep audit details.',
                'Production launch requires DEMO_CONTROL_TOKEN and ENABLE_DEMO_CONTROL_PANEL=true only for authorized runs.',
            ],
        };

        res.json(audit);
    });
};
