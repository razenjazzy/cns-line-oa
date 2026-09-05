import { getRateStore } from './runtime-state';
import {
    allowDemoHeaderTokenFallbackInProd,
    demoControlToken,
    isDemoControlEnabled,
    isProduction,
    isWebhookTestEnabled,
    opsApiToken,
    readyzTimeoutMs,
    webhookTestToken,
} from './env';
import { getActiveDemoSessionSecret } from './demo-session';
import { collectProbeFailures, runRuntimeProbes } from '../services/runtime-probes';
import { getRateLimitRuntimeStatus } from '../services/rate-limit-store';

export const buildWorkflowAudit = async () => {
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

    return {
        ...audit,
        score: Math.max(0, 100 - failures.length * 20),
        status: failures.length ? 'needs_attention' : 'ready',
        failures,
    };
};
