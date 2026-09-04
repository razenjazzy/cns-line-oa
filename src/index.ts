import express from 'express';
import dotenv from 'dotenv';
import { buildDemoPage } from './demo/page';
import { isGuideCommand } from './line/command-guide';
import { handleWebhook } from './line/webhook';
import { getAgentName, resolveChannelConfig, resolveEffectiveChannelContext, resolveBasicId, DEFAULT_CHANNEL_ID } from './line/channels';
import { resolveCommandReply } from './line/command-router';
import { runDailyReport } from './jobs/daily-report';
import { runAuditRotationJob } from './jobs/audit-rotation';
import { pingOdoo, seedOdooSampleSalesData } from './services/odoo';
import { getDemoOverview, runDemoJourney } from './services/demo';
import { getKpiSnapshot, recordHttpRequest } from './services/kpi';
import { checkFirestoreReady, getPlatformConfig, getUserLanguage, getUserProfile, listRecentAuditEventsPage, setPlatformConfig } from './services/firestore';
import { createDemoSessionToken, parseCookieValue, safeTokenMatch, verifyDemoSessionTokenWithSecrets } from './services/demo-session';
import { getPricingModel, runPricingSimulation, updatePricingModel } from './services/pricing-control';
import { createRateLimitStoreFromEnv, getRateLimitRuntimeStatus, InMemoryRateLimitStore, type RateLimitStore } from './services/rate-limit-store';
import { verifyOdooUserByToken } from './services/user-verification';
import { buildCspHeader, escapeHtml } from './utils/html';
import { runRuntimeProbes, collectProbeFailures } from './services/runtime-probes';

import { adminOnly } from './services/admin-token-auth';
import { requireOpsToken } from './services/ops-token-auth';
import { appLogger } from './services/logger';
import { decodeAuditCursor, parseAuditLogFilters } from './services/audit-query';
dotenv.config();

const app = express();
const port = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';
const isWebhookTestEnabled = !isProduction || /^(1|true|yes|on)$/i.test(process.env.ENABLE_WEBHOOK_TEST || '');
const isDemoControlEnabled = !isProduction || /^(1|true|yes|on)$/i.test(process.env.ENABLE_DEMO_CONTROL_PANEL || '');
const allowDemoHeaderTokenFallbackInProd = !isProduction && /^(1|true|yes|on)$/i.test(process.env.ALLOW_DEMO_HEADER_TOKEN_FALLBACK || '');
const webhookTestToken = process.env.WEBHOOK_TEST_TOKEN?.trim() || '';
const opsApiToken = process.env.OPS_API_TOKEN?.trim() || '';
const demoControlToken = process.env.DEMO_CONTROL_TOKEN?.trim() || opsApiToken;
const initialDemoSessionSecret = process.env.DEMO_SESSION_SECRET?.trim() || demoControlToken;
const demoSessionTtlMinutes = Number(process.env.DEMO_SESSION_TTL_MINUTES || 30);
const demoSessionRotateGraceDefaultMinutes = Number(process.env.DEMO_SESSION_ROTATE_GRACE_MINUTES || 30);
const demoSessionCookieName = 'demo_control_session';
const demoSessionConfigKey = process.env.DEMO_SESSION_CONFIG_KEY?.trim() || 'demoSessionSecretsV1';

let activeDemoSessionSecret = initialDemoSessionSecret;
let previousDemoSessionSecret: { secret: string; expiresAtMs: number } | null = null;
let demoSessionStateLoaded = false;
let demoSessionStateLoadPromise: Promise<void> | null = null;
const jsonParser = express.json({ limit: process.env.MAX_JSON_BODY || '64kb' });
const readyzTimeoutMs = Number(process.env.READYZ_TIMEOUT_MS || 2500);

app.use((_req, res, next) => {
    res.setHeader('Content-Security-Policy', buildCspHeader());
    next();
});

const getBearerToken = (authHeader: string | undefined): string => {
  if (!authHeader?.startsWith('Bearer ')) return '';
  return authHeader.substring(7);
};

const getDemoSessionVerifySecrets = (): string[] => {
    if (previousDemoSessionSecret && previousDemoSessionSecret.expiresAtMs <= Date.now()) {
        previousDemoSessionSecret = null;
    }

    return [
        activeDemoSessionSecret,
        previousDemoSessionSecret ? previousDemoSessionSecret.secret : '',
    ].filter(Boolean) as string[];
};

const persistDemoSessionState = async (): Promise<void> => {
    if (!activeDemoSessionSecret) return;

    const payload: Record<string, unknown> = {
        activeSecret: activeDemoSessionSecret,
        updatedAt: new Date().toISOString(),
    };

    if (previousDemoSessionSecret) {
        payload.previousSecret = previousDemoSessionSecret.secret;
        payload.previousSecretExpiresAtMs = previousDemoSessionSecret.expiresAtMs;
    }

    const result = await setPlatformConfig(demoSessionConfigKey, payload);
    if (!result.ok) {
        console.warn('Failed to persist demo session state:', result.error);
    }
};

const ensureDemoSessionStateLoaded = async (): Promise<void> => {
    if (demoSessionStateLoaded) return;
    if (demoSessionStateLoadPromise) return demoSessionStateLoadPromise;

    demoSessionStateLoadPromise = (async () => {
        const stored = await getPlatformConfig<Record<string, unknown>>(demoSessionConfigKey);
        if (!stored) {
            demoSessionStateLoaded = true;
            return;
        }

        const activeSecret = typeof stored.activeSecret === 'string' ? stored.activeSecret.trim() : '';
        if (activeSecret) {
            activeDemoSessionSecret = activeSecret;
        }

        const previousSecret = typeof stored.previousSecret === 'string' ? stored.previousSecret.trim() : '';
        const previousExpiresAtMs = typeof stored.previousSecretExpiresAtMs === 'number'
            ? stored.previousSecretExpiresAtMs
            : Number(stored.previousSecretExpiresAtMs || 0);

        if (previousSecret && Number.isFinite(previousExpiresAtMs) && previousExpiresAtMs > Date.now()) {
            previousDemoSessionSecret = {
                secret: previousSecret,
                expiresAtMs: previousExpiresAtMs,
            };
        }

        demoSessionStateLoaded = true;
    })();

    try {
        await demoSessionStateLoadPromise;
    } finally {
        demoSessionStateLoadPromise = null;
    }
};

const requireDemoControlAccess = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!isDemoControlEnabled) {
        return res.status(404).json({ error: 'Demo control panel is disabled.' });
    }

    if (!isProduction) {
        return next();
    }

    await ensureDemoSessionStateLoaded();

    const sessionToken = parseCookieValue(req.get('cookie'), demoSessionCookieName);
    const verifySecrets = getDemoSessionVerifySecrets();

    if (sessionToken && verifySecrets.length) {
        const verifySession = verifyDemoSessionTokenWithSecrets(sessionToken, verifySecrets);
        if (verifySession.ok) {
            return next();
        }
    }

    if (!allowDemoHeaderTokenFallbackInProd) {
        return res.status(401).json({
            error: 'Demo session is required. Login via /demo/session/login before accessing /demo endpoints.',
        });
    }

    if (!demoControlToken) {
        console.warn('DEMO_CONTROL_TOKEN is not configured in production; denying access to /demo endpoints.');
        return res.status(503).json({ error: 'Demo control endpoints are unavailable because DEMO_CONTROL_TOKEN is not configured.' });
    }

    const headerToken = req.get('x-demo-token') || req.get('x-ops-token') || '';
    const bearerToken = getBearerToken(req.get('authorization'));
    const token = headerToken || bearerToken;
    if (!safeTokenMatch(token, demoControlToken)) {
        return res.status(401).json({ error: 'Unauthorized demo access' });
    }

    return next();
};

const clearDemoSessionCookie = (res: express.Response) => {
    const secure = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${demoSessionCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
};

const setDemoSessionCookie = (res: express.Response, token: string) => {
    const ttlSeconds = Math.max(60, Math.trunc(demoSessionTtlMinutes * 60));
    const secure = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${demoSessionCookieName}=${token}; Max-Age=${ttlSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`);
};

const RATE_STORE_MAX_KEYS = Number(process.env.RATE_STORE_MAX_KEYS || 50000);
const fallbackRateStore = new InMemoryRateLimitStore(RATE_STORE_MAX_KEYS, 60_000);
let rateStore: RateLimitStore = fallbackRateStore;

const createRateLimiter = (options: { windowMs: number; max: number; label: string }) => {
    return async (req: express.Request, res: express.Response, next: express.NextFunction) => {
        const now = Date.now();
        try {
            await rateStore.sweep(now);
            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            const key = `${options.label}:${ip}`;
            const window = await rateStore.consume(key, options.windowMs, now);
            if (window.count > options.max) {
                return res.status(429).json({ error: 'Too many requests' });
            }
        } catch (error) {
            console.warn('Rate limiter store error, allowing request:', String(error));
        }
        return next();
    };
};

const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 120, label: 'webhook' });
const webhookTestLimiter = createRateLimiter({ windowMs: 60_000, max: 30, label: 'webhook-test' });
const opsJobLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: 'ops-job' });
const verifyLinkLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: 'verify-odoo' });

const isReadOnlyWebhookTestCommand = (text: string): boolean => {
    const upperText = text.trim().toUpperCase();
    if (!upperText) return true;
    if (isGuideCommand(text)) return true;

    return [
        'START',
        'HELP',
        'OPTIONS',
        'MENU',
        'FEATURES',
        'JOURNEY',
        'DEMO JOURNEY',
        'NAME',
        'LANG EN',
        'LANG TH',
        'THAI',
        'ENGLISH',
        'SYSTEM STATUS',
    ].includes(upperText)
        || upperText.startsWith('PRODUCT FIND ')
        || upperText.startsWith('ORDER STATUS ')
        || upperText === 'PRODUCT FIND'
        || upperText === 'ORDER STATUS';
};

const toSafeLogText = (text: string): string => {
    if (!isProduction) return text;
    const compact = text.replace(/\s+/g, ' ').trim();
    const clipped = compact.slice(0, 32);
    return `${clipped}${compact.length > 32 ? '...' : ''}`;
};

const withTimeout = async <T>(promise: Promise<T>, timeoutMs: number, timeoutMessage: string): Promise<T> => {
    let timeoutHandle: NodeJS.Timeout | null = null;
    const timeoutPromise = new Promise<T>((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });

    try {
        return await Promise.race([promise, timeoutPromise]);
    } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
    }
};

app.use((req, res, next) => {
    const headerRequestId = req.get('x-request-id') || '';
    const requestId = headerRequestId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('x-request-id', requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        recordHttpRequest(req.path, req.method, res.statusCode);
        const summary = {
            requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs,
        };

        if (res.statusCode >= 500) {
            appLogger.error('http_access', summary);
        } else if (res.statusCode >= 400) {
            appLogger.warn('http_access', summary);
        } else {
            appLogger.info('http_access', summary);
        }
    });

    return next();
});

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
            rateStore.healthCheck(),
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

    if (!newSecret || newSecret.length < 16) {
        return res.status(400).json({
            ok: false,
            error: 'newSecret is required and must be at least 16 characters.',
        });
    }

    if (activeDemoSessionSecret && activeDemoSessionSecret === newSecret) {
        return res.status(400).json({ ok: false, error: 'newSecret must differ from current active secret.' });
    }

    if (activeDemoSessionSecret) {
        const normalizedGraceMinutes = Math.max(0, Math.trunc(Number.isFinite(graceMinutes) ? graceMinutes : demoSessionRotateGraceDefaultMinutes));
        previousDemoSessionSecret = {
            secret: activeDemoSessionSecret,
            expiresAtMs: Date.now() + normalizedGraceMinutes * 60 * 1000,
        };
    }

    activeDemoSessionSecret = newSecret;
    await persistDemoSessionState();

    return res.json({
        ok: true,
        rotatedAt: new Date().toISOString(),
        graceMinutes: previousDemoSessionSecret ? Math.max(0, Math.round((previousDemoSessionSecret.expiresAtMs - Date.now()) / 60000)) : 0,
        previousSecretGraceActive: Boolean(previousDemoSessionSecret && previousDemoSessionSecret.expiresAtMs > Date.now()),
    });
});

app.get('/ops/workflow-audit', requireOpsToken, async (_req, res) => {
    await ensureDemoSessionStateLoaded();

    const runtimeChecks = await runRuntimeProbes(rateStore, readyzTimeoutMs);

    const audit = {
        generatedAt: new Date().toISOString(),
        checks: {
            security: {
                opsTokenConfigured: Boolean(opsApiToken),
                demoControlEnabled: isDemoControlEnabled,
                demoControlTokenConfigured: Boolean(demoControlToken),
                demoSessionOnlyProduction: !allowDemoHeaderTokenFallbackInProd,
                demoSessionSecretConfigured: Boolean(activeDemoSessionSecret),
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

    return res.status(failures.length ? 200 : 200).json({
        ...audit,
        score,
        status: failures.length ? 'needs_attention' : 'ready',
        failures,
    });
});

app.get('/verify/odoo', verifyLinkLimiter, async (req, res) => {
    const token = String(req.query.token || '');
    const result = await verifyOdooUserByToken(token);
    const title = result.ok ? 'Verification Completed' : 'Verification Failed';

    // Sends the user straight back into the LINE chat instead of leaving
    // them stranded in the browser. Prefers a deep link into this specific
    // OA's chat (needs LINE_CHANNEL_BASIC_ID / LINE_CHANNEL_<ID>_BASIC_ID
    // configured — the @xxx handle from LINE Official Account Manager);
    // falls back to the generic app-open scheme if that's not set, which is
    // still better than no link at all.
    const basicId = resolveBasicId(result.channelId || DEFAULT_CHANNEL_ID);
    const returnLink = basicId ? `https://line.me/R/ti/p/${encodeURIComponent(basicId)}` : 'line://';

    const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${escapeHtml(title)}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{max-width:640px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;box-shadow:0 8px 24px rgba(2,6,23,.08)}h1{margin:0 0 12px;font-size:24px}p{line-height:1.6}a.btn{display:inline-block;margin-top:16px;padding:12px 24px;background:#0B6E6A;color:#fff;text-decoration:none;border-radius:8px;font-weight:600}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(result.message)}</p><a class="btn" href="${escapeHtml(returnLink)}">${result.ok ? 'Return to chat' : 'Open LINE'}</a></main>${result.ok ? `<script>setTimeout(function(){ window.location.href = ${JSON.stringify(returnLink)}; }, 1500);</script>` : ''}</body></html>`;
    res.status(result.ok ? 200 : 400).type('html').send(html);
});

app.post('/demo/session/login', jsonParser, async (req, res) => {
    if (!isDemoControlEnabled) {
        return res.status(404).json({ error: 'Demo control panel is disabled.' });
    }

    await ensureDemoSessionStateLoaded();

    if (!demoControlToken || !activeDemoSessionSecret) {
        return res.status(503).json({ error: 'Demo session login unavailable because required token or session secret is missing.' });
    }

    const providedToken = String(req.body?.token || '').trim();
    if (!safeTokenMatch(providedToken, demoControlToken)) {
        return res.status(401).json({ ok: false, error: 'Invalid demo access token.' });
    }

    const token = createDemoSessionToken(activeDemoSessionSecret, Math.max(60, Math.trunc(demoSessionTtlMinutes * 60)));
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
        await ensureDemoSessionStateLoaded();
        const sessionToken = parseCookieValue(req.get('cookie'), demoSessionCookieName);
        const verifySecrets = getDemoSessionVerifySecrets();
        const sessionState = sessionToken && verifySecrets.length
            ? verifyDemoSessionTokenWithSecrets(sessionToken, verifySecrets)
            : { ok: false, reason: 'missing_session' };
        const headerToken = req.get('x-demo-token') || req.get('x-ops-token') || '';
        const bearerToken = getBearerToken(req.get('authorization'));
        const token = headerToken || bearerToken;
        const tokenOk = allowDemoHeaderTokenFallbackInProd && demoControlToken ? safeTokenMatch(token, demoControlToken) : false;

        return res.json({
            authenticated: sessionState.ok || tokenOk,
            sessionAuthenticated: sessionState.ok,
            tokenAuthenticated: tokenOk,
            sessionOnlyProduction: !allowDemoHeaderTokenFallbackInProd,
            previousSessionSecretGraceActive: Boolean(previousDemoSessionSecret && previousDemoSessionSecret.expiresAtMs > Date.now()),
        });
    };

    return handle().catch(error => {
        return res.status(500).json({ error: String(error) });
    });
});

// LINE Webhook endpoint (default channel, backward compatible)
app.post('/webhook', webhookLimiter, handleWebhook);

// LINE Webhook endpoint for additional configured channels
app.post('/webhook/:channelId', webhookLimiter, handleWebhook);

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
        const { runSegmentationJob } = await import('./jobs/segmentation');
        await runSegmentationJob();
        res.status(200).send('Segmentation job triggered successfully');
    } catch (error) {
        console.error('Error triggering segmentation job:', error);
        res.status(500).json({ error: 'Failed to trigger segmentation job' });
    }
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

app.get('/demo/workflow-audit', requireDemoControlAccess, async (req, res) => {
    await ensureDemoSessionStateLoaded();

    const failures: string[] = [];
    if (!opsApiToken) failures.push('OPS_API_TOKEN is not configured');
    if (isProduction && !demoControlToken) failures.push('DEMO_CONTROL_TOKEN is not configured for production');
    if (isProduction && isWebhookTestEnabled && !webhookTestToken) failures.push('WEBHOOK_TEST_TOKEN should be configured when ENABLE_WEBHOOK_TEST is enabled in production');

    const runtimeChecks = await runRuntimeProbes(rateStore, readyzTimeoutMs);

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

// Local test endpoint — bypasses LINE signature validation
// Remove this before deploying to production
app.post('/webhook-test', jsonParser, webhookTestLimiter, async (req, res) => {
    try {
        if (!isWebhookTestEnabled) {
            return res.status(404).json({
                error: 'webhook-test is disabled in production. Set ENABLE_WEBHOOK_TEST=true to enable it.',
            });
        }

        if (webhookTestToken) {
            const incomingToken = req.get('x-webhook-test-token') || '';
            if (!safeTokenMatch(incomingToken, webhookTestToken)) {
                return res.status(401).json({ error: 'Invalid webhook test token' });
            }
        }

        const userId: string = req.body.userId || 'test_user';
        const text: string = req.body.text || 'hello';

        if (isProduction && !isReadOnlyWebhookTestCommand(text)) {
            return res.status(403).json({
                error: 'Mutating webhook-test commands are disabled in production.',
            });
        }

        // Optional: exercise multi-channel/service-gating behavior in tests.
        // Omitting channelId preserves prior behavior (unrestricted, no channel context).
        const rawChannelId = typeof req.body.channelId === 'string' ? req.body.channelId.trim() : '';
        let channel: { channelId: string; enabledServices: string[] | null } | undefined;
        if (rawChannelId) {
            const channelConfig = resolveChannelConfig(rawChannelId);
            if (!channelConfig) {
                return res.status(400).json({ error: `Unknown or unconfigured LINE channel: ${rawChannelId}` });
            }
            channel = await resolveEffectiveChannelContext(channelConfig);
        }

        console.log(`[TEST] userId=${userId} channelId=${rawChannelId || 'default'} text="${toSafeLogText(text)}"`);

        const agentName = getAgentName();
        const userLanguage = await getUserLanguage(userId);
        const profile = await getUserProfile(userId);
        const baseUrl = `${req.protocol}://${req.get('host')}`;

        const botMessages = await resolveCommandReply({
            text,
            userId,
            userLanguage,
            profile,
            agentName,
            baseUrl,
            requestId: String(res.getHeader('x-request-id') || '') || undefined,
            channel,
        });
        return res.json(botMessages);
    } catch (error) {
        console.error('Error in webhook-test:', error);
        res.status(500).json({ error: String(error) });
    }
});

const SHUTDOWN_TIMEOUT_MS = Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000);

const startServer = async () => {
    rateStore = await createRateLimitStoreFromEnv(fallbackRateStore);
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
