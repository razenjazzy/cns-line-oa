import express from 'express';
import { getPlatformConfig, setPlatformConfig } from '../services/firestore';
import { parseCookieValue, safeTokenMatch, verifyDemoSessionTokenWithSecrets } from '../services/demo-session';
import { getBearerToken } from './middleware';
import {
    allowDemoHeaderTokenFallbackInProd,
    demoControlToken,
    demoSessionConfigKey,
    demoSessionCookieName,
    demoSessionTtlMinutes,
    initialDemoSessionSecret,
    isDemoControlEnabled,
    isProduction,
} from './env';

// Module-scope singleton state — same shape and mutation pattern as the
// pre-split src/index.ts (rotate replaces the active secret and keeps the
// old one valid for a grace window). Shared by the ops rotate endpoint and
// every /demo/* route that needs to verify or issue a session.
let activeDemoSessionSecret = initialDemoSessionSecret;
let previousDemoSessionSecret: { secret: string; expiresAtMs: number } | null = null;
let demoSessionStateLoaded = false;
let demoSessionStateLoadPromise: Promise<void> | null = null;

export const getActiveDemoSessionSecret = (): string => activeDemoSessionSecret;
export const getPreviousDemoSessionSecretGraceActive = (): boolean =>
    Boolean(previousDemoSessionSecret && previousDemoSessionSecret.expiresAtMs > Date.now());

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

export const ensureDemoSessionStateLoaded = async (): Promise<void> => {
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

/**
 * Rotates the active demo-session secret, keeping the old one valid for
 * `graceMinutes` so sessions issued just before rotation don't immediately
 * invalidate. Mirrors the pre-split /ops/demo-session/rotate handler's
 * validation and state mutation exactly.
 */
export const rotateDemoSessionSecret = async (
    newSecret: string,
    graceMinutes: number,
): Promise<{ ok: true; graceMinutes: number; previousSecretGraceActive: boolean } | { ok: false; error: string }> => {
    if (!newSecret || newSecret.length < 16) {
        return { ok: false, error: 'newSecret is required and must be at least 16 characters.' };
    }

    if (activeDemoSessionSecret && activeDemoSessionSecret === newSecret) {
        return { ok: false, error: 'newSecret must differ from current active secret.' };
    }

    if (activeDemoSessionSecret) {
        const normalizedGraceMinutes = Math.max(0, Math.trunc(Number.isFinite(graceMinutes) ? graceMinutes : demoSessionRotateGraceDefault()));
        previousDemoSessionSecret = {
            secret: activeDemoSessionSecret,
            expiresAtMs: Date.now() + normalizedGraceMinutes * 60 * 1000,
        };
    }

    activeDemoSessionSecret = newSecret;
    await persistDemoSessionState();

    return {
        ok: true,
        graceMinutes: previousDemoSessionSecret ? Math.max(0, Math.round((previousDemoSessionSecret.expiresAtMs - Date.now()) / 60000)) : 0,
        previousSecretGraceActive: getPreviousDemoSessionSecretGraceActive(),
    };
};

// Small indirection so rotateDemoSessionSecret doesn't need to import env
// twice under two different names — kept local to avoid a circular-looking
// re-export.
const demoSessionRotateGraceDefault = (): number => Number(process.env.DEMO_SESSION_ROTATE_GRACE_MINUTES || 30);

export const clearDemoSessionCookie = (res: express.Response): void => {
    const secure = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${demoSessionCookieName}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`);
};

export const setDemoSessionCookie = (res: express.Response, token: string): void => {
    const ttlSeconds = Math.max(60, Math.trunc(demoSessionTtlMinutes * 60));
    const secure = isProduction ? '; Secure' : '';
    res.setHeader('Set-Cookie', `${demoSessionCookieName}=${token}; Max-Age=${ttlSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`);
};

export const requireDemoControlAccess = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
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

/** Verifies a session cookie or the header/bearer fallback — used by /demo/session/status. */
export const verifyIncomingDemoSession = async (req: express.Request): Promise<{
    sessionAuthenticated: boolean;
    tokenAuthenticated: boolean;
}> => {
    await ensureDemoSessionStateLoaded();
    const sessionToken = parseCookieValue(req.get('cookie'), demoSessionCookieName);
    const verifySecrets = getDemoSessionVerifySecrets();
    const sessionState = sessionToken && verifySecrets.length
        ? verifyDemoSessionTokenWithSecrets(sessionToken, verifySecrets)
        : { ok: false };
    const headerToken = req.get('x-demo-token') || req.get('x-ops-token') || '';
    const bearerToken = getBearerToken(req.get('authorization'));
    const token = headerToken || bearerToken;
    const tokenOk = allowDemoHeaderTokenFallbackInProd && demoControlToken ? safeTokenMatch(token, demoControlToken) : false;

    return { sessionAuthenticated: sessionState.ok, tokenAuthenticated: tokenOk };
};
