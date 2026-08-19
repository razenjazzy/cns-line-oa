"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const page_1 = require("./demo/page");
const command_guide_1 = require("./line/command-guide");
const webhook_1 = require("./line/webhook");
const command_router_1 = require("./line/command-router");
const daily_report_1 = require("./jobs/daily-report");
const odoo_1 = require("./services/odoo");
const demo_1 = require("./services/demo");
const kpi_1 = require("./services/kpi");
const firestore_1 = require("./services/firestore");
const demo_session_1 = require("./services/demo-session");
const pricing_control_1 = require("./services/pricing-control");
const rate_limit_store_1 = require("./services/rate-limit-store");
const user_verification_1 = require("./services/user-verification");
const adminAuth_1 = require("./services/adminAuth");
const opsAuth_1 = require("./services/opsAuth");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 8080;
const isProduction = process.env.NODE_ENV === 'production';
const isWebhookTestEnabled = !isProduction || /^(1|true|yes|on)$/i.test(process.env.ENABLE_WEBHOOK_TEST || '');
const isDemoControlEnabled = !isProduction || /^(1|true|yes|on)$/i.test(process.env.ENABLE_DEMO_CONTROL_PANEL || '');
const allowDemoHeaderTokenFallbackInProd = /^(1|true|yes|on)$/i.test(process.env.ALLOW_DEMO_HEADER_TOKEN_FALLBACK || '');
const webhookTestToken = process.env.WEBHOOK_TEST_TOKEN?.trim() || '';
const opsApiToken = process.env.OPS_API_TOKEN?.trim() || '';
const demoControlToken = process.env.DEMO_CONTROL_TOKEN?.trim() || opsApiToken;
const initialDemoSessionSecret = process.env.DEMO_SESSION_SECRET?.trim() || demoControlToken;
const demoSessionTtlMinutes = Number(process.env.DEMO_SESSION_TTL_MINUTES || 30);
const demoSessionRotateGraceDefaultMinutes = Number(process.env.DEMO_SESSION_ROTATE_GRACE_MINUTES || 30);
const demoSessionCookieName = 'demo_control_session';
const demoSessionConfigKey = process.env.DEMO_SESSION_CONFIG_KEY?.trim() || 'demoSessionSecretsV1';
let activeDemoSessionSecret = initialDemoSessionSecret;
let previousDemoSessionSecret = null;
let demoSessionStateLoaded = false;
let demoSessionStateLoadPromise = null;
const jsonParser = express_1.default.json({ limit: process.env.MAX_JSON_BODY || '64kb' });
const readyzTimeoutMs = Number(process.env.READYZ_TIMEOUT_MS || 2500);
const getBearerToken = (authHeader) => {
    if (!authHeader?.startsWith('Bearer '))
        return '';
    return authHeader.substring(7);
};
const getDemoSessionVerifySecrets = () => {
    if (previousDemoSessionSecret && previousDemoSessionSecret.expiresAtMs <= Date.now()) {
        previousDemoSessionSecret = null;
    }
    return [
        activeDemoSessionSecret,
        previousDemoSessionSecret ? previousDemoSessionSecret.secret : '',
    ].filter(Boolean);
};
const persistDemoSessionState = async () => {
    if (!activeDemoSessionSecret)
        return;
    const payload = {
        activeSecret: activeDemoSessionSecret,
        updatedAt: new Date().toISOString(),
    };
    if (previousDemoSessionSecret) {
        payload.previousSecret = previousDemoSessionSecret.secret;
        payload.previousSecretExpiresAtMs = previousDemoSessionSecret.expiresAtMs;
    }
    const result = await (0, firestore_1.setPlatformConfig)(demoSessionConfigKey, payload);
    if (!result.ok) {
        console.warn('Failed to persist demo session state:', result.error);
    }
};
const ensureDemoSessionStateLoaded = async () => {
    if (demoSessionStateLoaded)
        return;
    if (demoSessionStateLoadPromise)
        return demoSessionStateLoadPromise;
    demoSessionStateLoadPromise = (async () => {
        const stored = await (0, firestore_1.getPlatformConfig)(demoSessionConfigKey);
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
    }
    finally {
        demoSessionStateLoadPromise = null;
    }
};
const requireDemoControlAccess = async (req, res, next) => {
    if (!isDemoControlEnabled) {
        return res.status(404).json({ error: 'Demo control panel is disabled.' });
    }
    if (!isProduction) {
        return next();
    }
    await ensureDemoSessionStateLoaded();
    const sessionToken = (0, demo_session_1.parseCookieValue)(req.get('cookie'), demoSessionCookieName);
    const verifySecrets = getDemoSessionVerifySecrets();
    if (sessionToken && verifySecrets.length) {
        const verifySession = (0, demo_session_1.verifyDemoSessionTokenWithSecrets)(sessionToken, verifySecrets);
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
    if (!(0, demo_session_1.safeTokenMatch)(token, demoControlToken)) {
        return res.status(401).json({ error: 'Unauthorized demo access' });
    }
    return next();
};
const clearDemoSessionCookie = (res) => {
    const secure = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${demoSessionCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
};
const setDemoSessionCookie = (res, token) => {
    const ttlSeconds = Math.max(60, Math.trunc(demoSessionTtlMinutes * 60));
    const secure = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${demoSessionCookieName}=${token}; Max-Age=${ttlSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`);
};
const RATE_STORE_MAX_KEYS = Number(process.env.RATE_STORE_MAX_KEYS || 50000);
const fallbackRateStore = new rate_limit_store_1.InMemoryRateLimitStore(RATE_STORE_MAX_KEYS, 60_000);
let rateStore = fallbackRateStore;
const createRateLimiter = (options) => {
    return async (req, res, next) => {
        const now = Date.now();
        try {
            await rateStore.sweep(now);
            const ip = req.ip || req.socket.remoteAddress || 'unknown';
            const key = `${options.label}:${ip}`;
            const window = await rateStore.consume(key, options.windowMs, now);
            if (window.count > options.max) {
                return res.status(429).json({ error: 'Too many requests' });
            }
        }
        catch (error) {
            console.warn('Rate limiter store error, allowing request:', String(error));
        }
        return next();
    };
};
const webhookLimiter = createRateLimiter({ windowMs: 60_000, max: 120, label: 'webhook' });
const webhookTestLimiter = createRateLimiter({ windowMs: 60_000, max: 30, label: 'webhook-test' });
const opsJobLimiter = createRateLimiter({ windowMs: 60_000, max: 10, label: 'ops-job' });
const verifyLinkLimiter = createRateLimiter({ windowMs: 60_000, max: 20, label: 'verify-odoo' });
const isReadOnlyWebhookTestCommand = (text) => {
    const upperText = text.trim().toUpperCase();
    if (!upperText)
        return true;
    if ((0, command_guide_1.isGuideCommand)(text))
        return true;
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
        'DEMO ODOO',
    ].includes(upperText)
        || upperText.startsWith('DEMO PRODUCT ')
        || upperText.startsWith('DEMO ORDER ')
        || upperText === 'DEMO PRODUCT'
        || upperText === 'DEMO ORDER';
};
const toSafeLogText = (text) => {
    if (!isProduction)
        return text;
    const compact = text.replace(/\s+/g, ' ').trim();
    const clipped = compact.slice(0, 32);
    return `${clipped}${compact.length > 32 ? '...' : ''}`;
};
const withTimeout = async (promise, timeoutMs, timeoutMessage) => {
    let timeoutHandle = null;
    const timeoutPromise = new Promise((_resolve, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
    });
    try {
        return await Promise.race([promise, timeoutPromise]);
    }
    finally {
        if (timeoutHandle)
            clearTimeout(timeoutHandle);
    }
};
app.use((req, res, next) => {
    const headerRequestId = req.get('x-request-id') || '';
    const requestId = headerRequestId || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('x-request-id', requestId);
    const startedAt = Date.now();
    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        (0, kpi_1.recordHttpRequest)(req.path, req.method, res.statusCode);
        const summary = {
            requestId,
            method: req.method,
            path: req.path,
            statusCode: res.statusCode,
            durationMs,
        };
        if (res.statusCode >= 500) {
            console.error('[http_access]', summary);
        }
        else if (res.statusCode >= 400) {
            console.warn('[http_access]', summary);
        }
        else {
            console.log('[http_access]', summary);
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
    const checks = [];
    try {
        const firestoreStatus = await withTimeout((0, firestore_1.checkFirestoreReady)(), readyzTimeoutMs, `Firestore check timed out after ${readyzTimeoutMs}ms`);
        checks.push({ name: 'firestore', ok: firestoreStatus.ok, message: firestoreStatus.message });
    }
    catch (error) {
        checks.push({ name: 'firestore', ok: false, message: String(error) });
    }
    try {
        const odooStatus = await withTimeout((0, odoo_1.pingOdoo)(), readyzTimeoutMs, `Odoo check timed out after ${readyzTimeoutMs}ms`);
        checks.push({
            name: 'odoo',
            ok: /connected successfully/i.test(odooStatus),
            message: odooStatus,
        });
    }
    catch (error) {
        checks.push({ name: 'odoo', ok: false, message: String(error) });
    }
    try {
        const limiterHealth = await withTimeout(rateStore.healthCheck(), readyzTimeoutMs, `Rate limit store check timed out after ${readyzTimeoutMs}ms`);
        const limiterRuntime = (0, rate_limit_store_1.getRateLimitRuntimeStatus)();
        const limiterDegraded = limiterRuntime.configuredMode === 'redis' && limiterRuntime.activeBackend !== 'redis';
        checks.push({
            name: 'rateLimiter',
            ok: limiterHealth.ok && !limiterDegraded,
            message: limiterDegraded
                ? `Configured redis but active backend is ${limiterRuntime.activeBackend}${limiterRuntime.fallbackReason ? ` (${limiterRuntime.fallbackReason})` : ''}`
                : limiterHealth.message,
        });
    }
    catch (error) {
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
app.get('/ops/kpi', opsAuth_1.requireOpsToken, (_req, res) => {
    res.status(200).json({
        ...(0, kpi_1.getKpiSnapshot)(),
        rateLimitRuntime: (0, rate_limit_store_1.getRateLimitRuntimeStatus)(),
    });
});
app.post('/ops/demo-session/rotate', opsAuth_1.requireOpsToken, jsonParser, async (req, res) => {
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
app.get('/ops/workflow-audit', opsAuth_1.requireOpsToken, async (_req, res) => {
    await ensureDemoSessionStateLoaded();
    const runtimeChecks = {
        firestoreReady: { ok: false, message: 'not_executed' },
        odooReady: { ok: false, message: 'not_executed' },
        rateLimiter: { ok: false, message: 'not_executed' },
    };
    try {
        const firestoreStatus = await withTimeout((0, firestore_1.checkFirestoreReady)(), readyzTimeoutMs, `Firestore check timed out after ${readyzTimeoutMs}ms`);
        runtimeChecks.firestoreReady = { ok: firestoreStatus.ok, message: firestoreStatus.message };
    }
    catch (error) {
        runtimeChecks.firestoreReady = { ok: false, message: String(error) };
    }
    try {
        const odooStatus = await withTimeout((0, odoo_1.pingOdoo)(), readyzTimeoutMs, `Odoo check timed out after ${readyzTimeoutMs}ms`);
        runtimeChecks.odooReady = {
            ok: /connected successfully/i.test(odooStatus),
            message: odooStatus,
        };
    }
    catch (error) {
        runtimeChecks.odooReady = { ok: false, message: String(error) };
    }
    try {
        const limiterHealth = await withTimeout(rateStore.healthCheck(), readyzTimeoutMs, `Rate limit store check timed out after ${readyzTimeoutMs}ms`);
        const limiterRuntime = (0, rate_limit_store_1.getRateLimitRuntimeStatus)();
        const limiterDegraded = limiterRuntime.configuredMode === 'redis' && limiterRuntime.activeBackend !== 'redis';
        runtimeChecks.rateLimiter = {
            ok: limiterHealth.ok && !limiterDegraded,
            message: limiterDegraded
                ? `Configured redis but active backend is ${limiterRuntime.activeBackend}${limiterRuntime.fallbackReason ? ` (${limiterRuntime.fallbackReason})` : ''}`
                : limiterHealth.message,
        };
    }
    catch (error) {
        runtimeChecks.rateLimiter = { ok: false, message: String(error) };
    }
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
            rateLimit: (0, rate_limit_store_1.getRateLimitRuntimeStatus)(),
        },
    };
    const failures = [];
    if (!audit.checks.security.opsTokenConfigured)
        failures.push('OPS_API_TOKEN is not configured');
    if (isProduction && !audit.checks.security.demoControlTokenConfigured)
        failures.push('DEMO_CONTROL_TOKEN is not configured for production');
    if (isProduction && !audit.checks.security.demoSessionSecretConfigured)
        failures.push('DEMO_SESSION_SECRET (or DEMO_CONTROL_TOKEN fallback) is not configured for production');
    if (isProduction && allowDemoHeaderTokenFallbackInProd)
        failures.push('ALLOW_DEMO_HEADER_TOKEN_FALLBACK should be disabled in production for session-only access');
    if (!audit.checks.security.webhookTestProductionSafe)
        failures.push('ENABLE_WEBHOOK_TEST is active in production without WEBHOOK_TEST_TOKEN');
    if (!runtimeChecks.firestoreReady.ok)
        failures.push(`Firestore runtime probe failed: ${runtimeChecks.firestoreReady.message}`);
    if (!runtimeChecks.odooReady.ok)
        failures.push(`Odoo runtime probe failed: ${runtimeChecks.odooReady.message}`);
    if (!runtimeChecks.rateLimiter.ok)
        failures.push(`Rate limiter runtime probe failed: ${runtimeChecks.rateLimiter.message}`);
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
    const result = await (0, user_verification_1.verifyOdooUserByToken)(token);
    const title = result.ok ? 'Verification Completed' : 'Verification Failed';
    const html = `<!doctype html><html><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" /><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,sans-serif;background:#f8fafc;color:#0f172a;margin:0;padding:32px}main{max-width:640px;margin:0 auto;background:#fff;padding:24px;border-radius:12px;box-shadow:0 8px 24px rgba(2,6,23,.08)}h1{margin:0 0 12px;font-size:24px}p{line-height:1.6}</style></head><body><main><h1>${title}</h1><p>${result.message}</p></main></body></html>`;
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
    if (!(0, demo_session_1.safeTokenMatch)(providedToken, demoControlToken)) {
        return res.status(401).json({ ok: false, error: 'Invalid demo access token.' });
    }
    const token = (0, demo_session_1.createDemoSessionToken)(activeDemoSessionSecret, Math.max(60, Math.trunc(demoSessionTtlMinutes * 60)));
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
        const sessionToken = (0, demo_session_1.parseCookieValue)(req.get('cookie'), demoSessionCookieName);
        const verifySecrets = getDemoSessionVerifySecrets();
        const sessionState = sessionToken && verifySecrets.length
            ? (0, demo_session_1.verifyDemoSessionTokenWithSecrets)(sessionToken, verifySecrets)
            : { ok: false, reason: 'missing_session' };
        const headerToken = req.get('x-demo-token') || req.get('x-ops-token') || '';
        const bearerToken = getBearerToken(req.get('authorization'));
        const token = headerToken || bearerToken;
        const tokenOk = allowDemoHeaderTokenFallbackInProd && demoControlToken ? (0, demo_session_1.safeTokenMatch)(token, demoControlToken) : false;
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
// LINE Webhook endpoint
app.post('/webhook', webhookLimiter, webhook_1.handleWebhook);
// Trigger daily report manually
app.post('/jobs/daily-report', jsonParser, adminAuth_1.adminOnly, opsJobLimiter, async (_req, res) => {
    try {
        await (0, daily_report_1.runDailyReport)();
        res.status(200).send('Daily report triggered successfully');
    }
    catch (error) {
        console.error('Error triggering daily report:', error);
        res.status(500).json({ error: 'Failed to trigger daily report' });
    }
});
// Trigger segmentation job manually
app.post('/jobs/segmentation', jsonParser, adminAuth_1.adminOnly, opsJobLimiter, async (_req, res) => {
    try {
        const { runSegmentationJob } = await Promise.resolve().then(() => __importStar(require('./jobs/segmentation')));
        await runSegmentationJob();
        res.status(200).send('Segmentation job triggered successfully');
    }
    catch (error) {
        console.error('Error triggering segmentation job:', error);
        res.status(500).json({ error: 'Failed to trigger segmentation job' });
    }
});
app.get('/demo', requireDemoControlAccess, (_req, res) => {
    res.type('html').send((0, page_1.buildDemoPage)());
});
app.get('/demo/connections', requireDemoControlAccess, async (req, res) => {
    try {
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const overview = await (0, demo_1.getDemoOverview)(baseUrl);
        res.json(overview);
    }
    catch (error) {
        console.error('Error loading demo connections:', error);
        res.status(500).json({ error: String(error) });
    }
});
app.post('/demo/journey', requireDemoControlAccess, jsonParser, async (req, res) => {
    try {
        const result = await (0, demo_1.runDemoJourney)(req.body || {});
        res.status(result.ok ? 200 : 400).json(result);
    }
    catch (error) {
        console.error('Error running demo journey:', error);
        res.status(500).json({ error: String(error) });
    }
});
app.get('/demo/pricing-model', requireDemoControlAccess, (_req, res) => {
    return (0, pricing_control_1.getPricingModel)()
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
        const updated = await (0, pricing_control_1.updatePricingModel)(req.body || {});
        res.json({
            ok: true,
            generatedAt: new Date().toISOString(),
            model: updated,
        });
    }
    catch (error) {
        res.status(400).json({ ok: false, error: String(error) });
    }
});
app.post('/demo/pricing-simulation', requireDemoControlAccess, jsonParser, async (req, res) => {
    try {
        await (0, pricing_control_1.getPricingModel)();
        const report = (0, pricing_control_1.runPricingSimulation)(req.body || {});
        res.json(report);
    }
    catch (error) {
        res.status(400).json({ error: String(error) });
    }
});
app.get('/demo/workflow-audit', requireDemoControlAccess, async (req, res) => {
    await ensureDemoSessionStateLoaded();
    const failures = [];
    if (!opsApiToken)
        failures.push('OPS_API_TOKEN is not configured');
    if (isProduction && !demoControlToken)
        failures.push('DEMO_CONTROL_TOKEN is not configured for production');
    if (isProduction && isWebhookTestEnabled && !webhookTestToken)
        failures.push('WEBHOOK_TEST_TOKEN should be configured when ENABLE_WEBHOOK_TEST is enabled in production');
    const runtimeChecks = {
        firestoreReady: { ok: false, message: 'not_executed' },
        odooReady: { ok: false, message: 'not_executed' },
        rateLimiter: { ok: false, message: 'not_executed' },
    };
    try {
        const firestoreStatus = await withTimeout((0, firestore_1.checkFirestoreReady)(), readyzTimeoutMs, `Firestore check timed out after ${readyzTimeoutMs}ms`);
        runtimeChecks.firestoreReady = { ok: firestoreStatus.ok, message: firestoreStatus.message };
    }
    catch (error) {
        runtimeChecks.firestoreReady = { ok: false, message: String(error) };
    }
    try {
        const odooStatus = await withTimeout((0, odoo_1.pingOdoo)(), readyzTimeoutMs, `Odoo check timed out after ${readyzTimeoutMs}ms`);
        runtimeChecks.odooReady = {
            ok: /connected successfully/i.test(odooStatus),
            message: odooStatus,
        };
    }
    catch (error) {
        runtimeChecks.odooReady = { ok: false, message: String(error) };
    }
    try {
        const limiterHealth = await withTimeout(rateStore.healthCheck(), readyzTimeoutMs, `Rate limit store check timed out after ${readyzTimeoutMs}ms`);
        const limiterRuntime = (0, rate_limit_store_1.getRateLimitRuntimeStatus)();
        const limiterDegraded = limiterRuntime.configuredMode === 'redis' && limiterRuntime.activeBackend !== 'redis';
        runtimeChecks.rateLimiter = {
            ok: limiterHealth.ok && !limiterDegraded,
            message: limiterDegraded
                ? `Configured redis but active backend is ${limiterRuntime.activeBackend}${limiterRuntime.fallbackReason ? ` (${limiterRuntime.fallbackReason})` : ''}`
                : limiterHealth.message,
        };
    }
    catch (error) {
        runtimeChecks.rateLimiter = { ok: false, message: String(error) };
    }
    if (!runtimeChecks.firestoreReady.ok)
        failures.push(`Firestore runtime probe failed: ${runtimeChecks.firestoreReady.message}`);
    if (!runtimeChecks.odooReady.ok)
        failures.push(`Odoo runtime probe failed: ${runtimeChecks.odooReady.message}`);
    if (!runtimeChecks.rateLimiter.ok)
        failures.push(`Rate limiter runtime probe failed: ${runtimeChecks.rateLimiter.message}`);
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
app.post('/jobs/seed-odoo', jsonParser, adminAuth_1.adminOnly, opsJobLimiter, async (_req, res) => {
    try {
        const status = await (0, odoo_1.seedOdooSampleSalesData)();
        res.status(200).send(status);
    }
    catch (error) {
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
            if (!(0, demo_session_1.safeTokenMatch)(incomingToken, webhookTestToken)) {
                return res.status(401).json({ error: 'Invalid webhook test token' });
            }
        }
        const userId = req.body.userId || 'test_user';
        const text = req.body.text || 'hello';
        if (isProduction && !isReadOnlyWebhookTestCommand(text)) {
            return res.status(403).json({
                error: 'Mutating webhook-test commands are disabled in production.',
            });
        }
        console.log(`[TEST] userId=${userId} text="${toSafeLogText(text)}"`);
        const agentName = process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
        const userLanguage = await (0, firestore_1.getUserLanguage)(userId);
        const profile = await (0, firestore_1.getUserProfile)(userId);
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const botMessages = await (0, command_router_1.resolveCommandReply)({
            text,
            userId,
            userLanguage,
            profile,
            agentName,
            baseUrl,
        });
        return res.json(botMessages);
    }
    catch (error) {
        console.error('Error in webhook-test:', error);
        res.status(500).json({ error: String(error) });
    }
});
const startServer = async () => {
    rateStore = await (0, rate_limit_store_1.createRateLimitStoreFromEnv)(fallbackRateStore);
    await ensureDemoSessionStateLoaded();
    app.listen(port, () => {
        console.log(`Server listening on port ${port}`);
    });
};
startServer().catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
