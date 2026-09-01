import { Firestore, FieldValue } from '@google-cloud/firestore';

let db: Firestore | null = null;

export type PendingFlowState = {
    flow: string;
    stepIndex: number;
    collected: Record<string, string>;
    expiresAt: string;
};

type CachedUserState = {
    language?: UserLanguage;
    role?: UserRole;
    odooPartnerId?: number;
    odooVerified?: boolean;
    odooVerifiedAt?: string;
    displayName?: string;
    phone?: string;
    escalatedToHuman?: boolean;
    pendingFlow?: PendingFlowState;
    firstMessageAt?: string;
    consentNoticeShownAt?: string;
    marketingOptIn?: boolean;
};

const isPendingFlowActive = (pendingFlow: PendingFlowState | undefined | null): pendingFlow is PendingFlowState => {
    return Boolean(pendingFlow) && new Date((pendingFlow as PendingFlowState).expiresAt).getTime() > Date.now();
};

type CachedUserStateEntry = {
    state: CachedUserState;
    updatedAt: number;
};

const USER_STATE_CACHE_MAX = Number(process.env.USER_STATE_CACHE_MAX || 10000);
const USER_STATE_CACHE_TTL_MS = Number(process.env.USER_STATE_CACHE_TTL_MS || 60 * 60 * 1000);
const userStateCache = new Map<string, CachedUserStateEntry>();

export type FirestoreWriteResult = {
    ok: boolean;
    error?: string;
};

export type GroupBuyStatus = 'open' | 'confirmed' | 'cancelled' | 'expired';

export type GroupBuyRecord = {
    id: string;
    creatorUserId: string;
    productQuery: string;
    productName?: string;
    productId?: number;
    targetQty: number;
    joinedQty: number;
    participantCount: number;
    status: GroupBuyStatus;
    createdAt: string;
    updatedAt: string;
    expiresAt?: string;
    confirmedAt?: string;
    cancelledAt?: string;
    confirmedBy?: string;
    cancelledBy?: string;
    odooOrderRef?: string;
    odooOrderTotal?: number;
};

export type GroupBuyWriteResult = {
    ok: boolean;
    data?: GroupBuyRecord;
    error?: string;
};

type GroupBuyJoinResult = {
    ok: boolean;
    data?: GroupBuyRecord;
    error?: string;
    joinedQtyByUser?: number;
};

const logFirestoreError = (action: string, error: unknown) => {
    console.warn(`Firestore ${action} failed:`, error);
};

const toErrorMessage = (error: unknown): string => {
    if (error instanceof Error && error.message) return error.message;
    return String(error);
};

const withFirestoreRead = async <T>(action: string, fallback: T, operation: (database: Firestore) => Promise<T>): Promise<T> => {
    const database = getDb();
    if (!database) return fallback;

    try {
        return await operation(database);
    } catch (error) {
        logFirestoreError(action, error);
        return fallback;
    }
};

const withFirestoreWrite = async (action: string, operation: (database: Firestore) => Promise<void>): Promise<FirestoreWriteResult> => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: `Firestore ${action} failed: Firestore not initialized` };
    }

    try {
        await operation(database);
        return { ok: true };
    } catch (error) {
        logFirestoreError(action, error);
        return { ok: false, error: `Firestore ${action} failed: ${String(error)}` };
    }
};

const groupBuyCollection = 'groupBuys';

const toPositiveInt = (value: unknown, fallback: number): number => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : fallback;
};

const toOptionalString = (value: unknown): string | undefined => {
    if (typeof value !== 'string') return undefined;
    const normalized = value.trim();
    return normalized || undefined;
};

const toGroupBuyRecord = (id: string, raw: Record<string, unknown>): GroupBuyRecord => {
    const statusRaw = toOptionalString(raw.status);
    const status: GroupBuyStatus = statusRaw === 'confirmed' || statusRaw === 'cancelled' || statusRaw === 'expired' ? statusRaw : 'open';
    const createdAt = toOptionalString(raw.createdAt) || new Date(0).toISOString();
    const updatedAt = toOptionalString(raw.updatedAt) || createdAt;
    const productIdRaw = toPositiveInt(raw.productId, 0);

    return {
        id,
        creatorUserId: toOptionalString(raw.creatorUserId) || '',
        productQuery: toOptionalString(raw.productQuery) || '',
        productName: toOptionalString(raw.productName),
        productId: productIdRaw > 0 ? productIdRaw : undefined,
        targetQty: toPositiveInt(raw.targetQty, 1),
        joinedQty: toPositiveInt(raw.joinedQty, 0),
        participantCount: toPositiveInt(raw.participantCount, 0),
        status,
        createdAt,
        updatedAt,
        expiresAt: toOptionalString(raw.expiresAt),
        confirmedAt: toOptionalString(raw.confirmedAt),
        cancelledAt: toOptionalString(raw.cancelledAt),
        confirmedBy: toOptionalString(raw.confirmedBy),
        cancelledBy: toOptionalString(raw.cancelledBy),
        odooOrderRef: toOptionalString(raw.odooOrderRef),
        odooOrderTotal: typeof raw.odooOrderTotal === 'number' ? raw.odooOrderTotal : undefined,
    };
};

/**
 * A session past its expiresAt is treated as expired even before any write
 * has persisted that transition — reads settle it lazily, writes persist it
 * opportunistically the next time someone acts on the session.
 */
const computeEffectiveGroupBuyStatus = (record: GroupBuyRecord, nowMs: number): GroupBuyStatus => {
    if (record.status === 'open' && record.expiresAt && new Date(record.expiresAt).getTime() <= nowMs) {
        return 'expired';
    }
    return record.status;
};

const withEffectiveStatus = (record: GroupBuyRecord, nowMs: number = Date.now()): GroupBuyRecord => {
    const effectiveStatus = computeEffectiveGroupBuyStatus(record, nowMs);
    return effectiveStatus === record.status ? record : { ...record, status: effectiveStatus };
};

const getDb = (): Firestore | null => {
  if (db) return db;
  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  if (!projectId) return null;
  try {
    // On Cloud Run, Application Default Credentials resolve automatically
    // via the attached service account. On a non-GCP host (e.g. a Railway
    // test deploy) there's no such identity, so allow credentials to be
    // supplied inline as JSON instead of relying on ADC.
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
    if (credentialsJson) {
      db = new Firestore({ projectId, credentials: JSON.parse(credentialsJson) });
    } else {
      db = new Firestore({ projectId });
    }
  } catch (error) {
    console.warn('Failed to initialize Firestore:', error);
  }
  return db;
};

export const checkFirestoreReady = async (): Promise<{ ok: boolean; message: string }> => {
    const database = getDb();
    if (!database) {
        return { ok: false, message: 'Firestore is not configured (missing GOOGLE_CLOUD_PROJECT).' };
    }

    try {
        await database.collection('_health').doc('readyz').get();
        return { ok: true, message: 'Firestore reachable.' };
    } catch (error) {
        return { ok: false, message: `Firestore check failed: ${String(error)}` };
    }
};

const pruneUserStateCache = () => {
    const now = Date.now();

    for (const [userId, entry] of userStateCache.entries()) {
        if (now - entry.updatedAt > USER_STATE_CACHE_TTL_MS) {
            userStateCache.delete(userId);
        }
    }

    if (userStateCache.size <= USER_STATE_CACHE_MAX) return;

    const overflow = userStateCache.size - USER_STATE_CACHE_MAX;
    let removed = 0;
    for (const key of userStateCache.keys()) {
        userStateCache.delete(key);
        removed += 1;
        if (removed >= overflow) break;
    }
};

const getCachedUserState = (userId: string): CachedUserState => {
    const cached = userStateCache.get(userId);
    if (!cached) return {};

    if (Date.now() - cached.updatedAt > USER_STATE_CACHE_TTL_MS) {
        userStateCache.delete(userId);
        return {};
    }

    return cached.state;
};

const mergeCachedUserState = (userId: string, patch: CachedUserState): CachedUserState => {
        const current = getCachedUserState(userId);
        const next = { ...current, ...patch };
        userStateCache.set(userId, { state: next, updatedAt: Date.now() });
        pruneUserStateCache();
        return next;
};

export const saveReportLog = async (reportId: string, data: any) => {
    return withFirestoreWrite('saveReportLog', async (database) => {
        const docRef = database.collection('reports').doc(reportId);
        await docRef.set({
            ...data,
            createdAt: FieldValue.serverTimestamp(),
        });
    });
}

export const updateUserScore = async (userId: string, interactionType: string) => {
    return withFirestoreWrite('updateUserScore', async (database) => {
        const docRef = database.collection('users').doc(userId);
        const scoreIncrement = interactionType === 'product_inquiry' ? 5 : 1;

        await docRef.set({
            lastInteractionAt: FieldValue.serverTimestamp(),
            engagementScore: FieldValue.increment(scoreIncrement)
        }, { merge: true });
    });
};

export const getConversationHistory = async (userId: string): Promise<any[]> => {
    return withFirestoreRead('getConversationHistory', [], async (database) => {
        const snapshot = await database.collection('users').doc(userId).collection('messages')
            .orderBy('timestamp', 'asc')
            .limitToLast(10)
            .get();

        return snapshot.docs.map(doc => doc.data());
    });
};

export const saveConversationMessage = async (userId: string, role: 'user' | 'model', text: string) => {
    return withFirestoreWrite('saveConversationMessage', async (database) => {
        await database.collection('users').doc(userId).collection('messages').add({
            role,
            text,
            timestamp: FieldValue.serverTimestamp(),
        });
    });
};

export const getEscalationState = async (userId: string): Promise<boolean> => {
    return withFirestoreRead('getEscalationState', getCachedUserState(userId).escalatedToHuman || false, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const escalatedToHuman = doc.data()?.escalatedToHuman || false;
        mergeCachedUserState(userId, { escalatedToHuman });
        return escalatedToHuman;
    });
};

export const setEscalationState = async (userId: string, escalated: boolean) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { escalatedToHuman: escalated });
    const result = await withFirestoreWrite('setEscalationState', async (database) => {
        await database.collection('users').doc(userId).set({ escalatedToHuman: escalated }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        } else {
            userStateCache.delete(userId);
        }
    }
    return result;
};

/**
 * Records the timestamp of a user's first-ever message so the bot can open
 * the nav-button menu immediately on first contact instead of requiring a
 * command. Returns true when persisted (the write succeeded, regardless of
 * whether it was actually the first message).
 */
export const markUserFirstContact = async (userId: string): Promise<boolean> => {
    const previous = userStateCache.get(userId);
    const now = new Date().toISOString();
    mergeCachedUserState(userId, { firstMessageAt: now });
    const result = await withFirestoreWrite('markUserFirstContact', async (database) => {
        await database.collection('users').doc(userId).set({ firstMessageAt: now }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        } else {
            userStateCache.delete(userId);
        }
    }
    return result.ok;
};

export type UserLanguage = 'th' | 'en';
export type UserRole = 'admin' | 'user';

export type UserProfile = {
    language: UserLanguage;
    role: UserRole;
    odooPartnerId?: number;
    odooVerified: boolean;
    odooVerifiedAt?: string;
    displayName?: string;
    phone?: string;
    pendingFlow?: PendingFlowState;
    firstMessageAt?: string;
    /** Set once, the first time the PDPA data-collection notice is shown. */
    consentNoticeShownAt?: string;
    /** Explicit opt-in for marketing/campaign multicasts. Defaults to false
     *  (opt-out) — following the LINE OA is not treated as marketing consent. */
    marketingOptIn: boolean;
};

export type OdooVerificationChallenge = {
    id: string;
    userId: string;
    channelId: string;
    partnerId: number;
    phone: string;
    otpCode: string;
    linkToken: string;
    status: 'pending' | 'verified' | 'expired';
    attemptCount: number;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
    verifiedAt?: string;
};

export type OdooVerificationChallengeResult = {
    ok: boolean;
    data?: OdooVerificationChallenge;
    error?: string;
};

const ODOO_VERIFY_OTP_MAX_ATTEMPTS = Number(process.env.ODOO_VERIFY_OTP_MAX_ATTEMPTS || 5);
const odooVerificationCollection = 'odooVerifications';
const odooVerificationTokenIndexCollection = 'odooVerificationTokens';
const platformConfigCollection = 'platformConfig';

const toOdooVerificationChallenge = (id: string, raw: Record<string, unknown>): OdooVerificationChallenge => {
    const statusRaw = toOptionalString(raw.status);
    const status: 'pending' | 'verified' | 'expired' = statusRaw === 'verified' || statusRaw === 'expired' ? statusRaw : 'pending';
    const createdAt = toOptionalString(raw.createdAt) || new Date(0).toISOString();
    const updatedAt = toOptionalString(raw.updatedAt) || createdAt;

    return {
        id,
        userId: toOptionalString(raw.userId) || '',
        channelId: toOptionalString(raw.channelId) || 'default',
        partnerId: toPositiveInt(raw.partnerId, 0),
        phone: toOptionalString(raw.phone) || '',
        otpCode: toOptionalString(raw.otpCode) || '',
        linkToken: toOptionalString(raw.linkToken) || '',
        status,
        attemptCount: Math.max(0, Math.trunc(typeof raw.attemptCount === 'number' ? raw.attemptCount : 0)),
        expiresAt: toOptionalString(raw.expiresAt) || createdAt,
        createdAt,
        updatedAt,
        verifiedAt: toOptionalString(raw.verifiedAt),
    };
};

export const getUserLanguage = async (userId: string): Promise<UserLanguage> => {
    return withFirestoreRead('getUserLanguage', getCachedUserState(userId).language || 'en', async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const lang = doc.data()?.language;
        const language = lang === 'th' ? 'th' : 'en';
        mergeCachedUserState(userId, { language });
        return language;
    });
};

export const setUserLanguage = async (userId: string, language: UserLanguage) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { language });
    const result = await withFirestoreWrite('setUserLanguage', async (database) => {
        await database.collection('users').doc(userId).set({ language }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        } else {
            userStateCache.delete(userId);
        }
    }
    return result;
};

export const getUserProfile = async (userId: string): Promise<UserProfile> => {
    const cached = getCachedUserState(userId);
    const fallbackProfile: UserProfile = {
        language: cached.language || 'en',
        role: cached.role || 'user',
        odooPartnerId: cached.odooPartnerId,
        odooVerified: cached.odooVerified || false,
        odooVerifiedAt: cached.odooVerifiedAt,
        displayName: cached.displayName,
        phone: cached.phone,
        pendingFlow: isPendingFlowActive(cached.pendingFlow) ? cached.pendingFlow : undefined,
        firstMessageAt: cached.firstMessageAt,
        consentNoticeShownAt: cached.consentNoticeShownAt,
        marketingOptIn: cached.marketingOptIn || false,
    };

    return withFirestoreRead('getUserProfile', fallbackProfile, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const data = doc.data() || {};

        const rawPendingFlow = data.pendingFlow as PendingFlowState | undefined;
        const profile: UserProfile = {
            language: data.language === 'th' ? 'th' : 'en',
            role: data.role === 'admin' ? 'admin' : 'user',
            odooPartnerId: typeof data.odooPartnerId === 'number' ? data.odooPartnerId : undefined,
            odooVerified: data.odooVerified === true,
            odooVerifiedAt: typeof data.odooVerifiedAt === 'string' ? data.odooVerifiedAt : undefined,
            displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
            phone: typeof data.phone === 'string' ? data.phone : undefined,
            pendingFlow: isPendingFlowActive(rawPendingFlow) ? rawPendingFlow : undefined,
            firstMessageAt: typeof data.firstMessageAt === 'string' ? data.firstMessageAt : undefined,
            consentNoticeShownAt: typeof data.consentNoticeShownAt === 'string' ? data.consentNoticeShownAt : undefined,
            marketingOptIn: data.marketingOptIn === true,
        };

        mergeCachedUserState(userId, profile);
        return profile;
    });
};

/**
 * PDPA data-collection notice — shown once at first contact (see
 * command-router.ts). Notice-only, not a blocking consent gate: it informs
 * without adding friction to first use.
 */
export const markConsentNoticeShown = async (userId: string): Promise<boolean> => {
    const previous = userStateCache.get(userId);
    const now = new Date().toISOString();
    mergeCachedUserState(userId, { consentNoticeShownAt: now });
    const result = await withFirestoreWrite('markConsentNoticeShown', async (database) => {
        await database.collection('users').doc(userId).set({ consentNoticeShownAt: now }, { merge: true });
    });
    if (!result.ok) {
        if (previous) userStateCache.set(userId, previous);
        else userStateCache.delete(userId);
    }
    return result.ok;
};

export const setMarketingOptIn = async (userId: string, optIn: boolean) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { marketingOptIn: optIn });
    const result = await withFirestoreWrite('setMarketingOptIn', async (database) => {
        await database.collection('users').doc(userId).set({ marketingOptIn: optIn }, { merge: true });
    });
    if (!result.ok) {
        if (previous) userStateCache.set(userId, previous);
        else userStateCache.delete(userId);
    }
    return result;
};

/**
 * Data-subject erasure request (PDPA "right to delete"). Hard-deletes the
 * user's profile document — role, verification/Odoo link, language,
 * marketing preference, everything in `users/{userId}`. Does NOT touch the
 * append-only auditLog (a legitimate retained business record of past
 * actions, not personal-preference state) or odooVerification challenge
 * history. Returning to the bot after this creates a fresh, unverified
 * profile — that's the intended effect of erasure, not a bug.
 */
export const deleteUserProfile = async (userId: string): Promise<FirestoreWriteResult> => {
    userStateCache.delete(userId);
    return withFirestoreWrite('deleteUserProfile', async (database) => {
        await database.collection('users').doc(userId).delete();
    });
};

/**
 * Marketing-consent gate for multicast campaigns (src/jobs/segmentation.ts).
 * Single source of truth for "who's allowed to receive a promotional
 * message" so no campaign path can accidentally bypass the opt-in check.
 */
export const filterMarketingOptedInUserIds = async (userIds: string[]): Promise<string[]> => {
    const profiles = await Promise.all(userIds.map(async (userId) => ({ userId, profile: await getUserProfile(userId) })));
    return profiles.filter(({ profile }) => profile.marketingOptIn).map(({ userId }) => userId);
};

const chatFeedbackCollection = 'chatFeedback';

/**
 * Lightweight quality signal for AI-fallback replies (👍/👎 quick reply — see
 * src/line/handlers/chat-fallback.ts and src/line/handlers/feedback.ts).
 * Fire-and-forget like recordAuditEvent: never blocks or fails the reply
 * that triggered it.
 */
export const recordChatFeedback = async (params: {
    userId: string;
    rating: 'good' | 'bad';
    question?: string;
    answer?: string;
}): Promise<void> => {
    const database = getDb();
    if (!database) return;

    try {
        await database.collection(chatFeedbackCollection).add({
            userId: params.userId,
            rating: params.rating,
            question: params.question || null,
            answer: params.answer || null,
            createdAt: new Date().toISOString(),
            createdAtServer: FieldValue.serverTimestamp(),
        });
    } catch (error) {
        logFirestoreError('recordChatFeedback', error);
    }
};

export const setUserPendingFlow = async (userId: string, pendingFlow: PendingFlowState | null) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { pendingFlow: pendingFlow || undefined });
    const result = await withFirestoreWrite('setUserPendingFlow', async (database) => {
        await database.collection('users').doc(userId).set({ pendingFlow }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        } else {
            userStateCache.delete(userId);
        }
    }
    return result;
};

export const setUserRole = async (userId: string, role: UserRole) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { role });
    const result = await withFirestoreWrite('setUserRole', async (database) => {
        await database.collection('users').doc(userId).set({ role }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        } else {
            userStateCache.delete(userId);
        }
    }
    return result;
};

export const setUserOdooPartner = async (userId: string, partnerId: number, displayName?: string, phone?: string) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, {
        odooPartnerId: partnerId,
        ...(displayName ? { displayName } : {}),
        ...(phone ? { phone } : {}),
    });
    const result = await withFirestoreWrite('setUserOdooPartner', async (database) => {
        await database.collection('users').doc(userId).set({
            odooPartnerId: partnerId,
            ...(displayName ? { displayName } : {}),
            ...(phone ? { phone } : {}),
        }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        } else {
            userStateCache.delete(userId);
        }
    }
    return result;
};

export const setUserOdooVerificationStatus = async (userId: string, verified: boolean, verifiedAt?: string) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, {
        odooVerified: verified,
        ...(verifiedAt ? { odooVerifiedAt: verifiedAt } : {}),
    });

    const result = await withFirestoreWrite('setUserOdooVerificationStatus', async (database) => {
        await database.collection('users').doc(userId).set({
            odooVerified: verified,
            ...(verifiedAt ? { odooVerifiedAt: verifiedAt } : {}),
        }, { merge: true });
    });

    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        } else {
            userStateCache.delete(userId);
        }
    }
    return result;
};

export const getPlatformConfig = async <T = Record<string, unknown>>(key: string): Promise<T | null> => {
    const normalizedKey = key.trim();
    if (!normalizedKey) return null;

    return withFirestoreRead('getPlatformConfig', null, async (database) => {
        const snap = await database.collection(platformConfigCollection).doc(normalizedKey).get();
        if (!snap.exists) return null;

        const raw = (snap.data() || {}) as Record<string, unknown>;
        if (!raw.value || typeof raw.value !== 'object') return null;
        return raw.value as T;
    });
};

export const setPlatformConfig = async (key: string, value: Record<string, unknown>) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
        return { ok: false, error: 'Firestore setPlatformConfig failed: key is required' };
    }

    return withFirestoreWrite('setPlatformConfig', async (database) => {
        await database.collection(platformConfigCollection).doc(normalizedKey).set({
            key: normalizedKey,
            value,
            updatedAt: new Date().toISOString(),
            updatedAtServer: FieldValue.serverTimestamp(),
        }, { merge: true });
    });
};

export const createOdooVerificationChallenge = async (params: {
    userId: string;
    channelId: string;
    partnerId: number;
    phone: string;
    otpCode: string;
    linkToken: string;
    ttlMinutes?: number;
}): Promise<OdooVerificationChallengeResult> => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: 'Firestore createOdooVerificationChallenge failed: Firestore not initialized' };
    }

    try {
        const now = new Date();
        const ttlMinutes = Math.max(1, Math.trunc(params.ttlMinutes || Number(process.env.ODOO_VERIFY_OTP_TTL_MINUTES || 10)));
        const expiresAtDate = new Date(now.getTime() + ttlMinutes * 60 * 1000);
        const createdAt = now.toISOString();
        const expiresAt = expiresAtDate.toISOString();
        const challengeRef = database.collection(odooVerificationCollection).doc();

        const challenge: OdooVerificationChallenge = {
            id: challengeRef.id,
            userId: params.userId,
            channelId: params.channelId,
            partnerId: params.partnerId,
            phone: params.phone,
            otpCode: params.otpCode,
            linkToken: params.linkToken,
            status: 'pending',
            attemptCount: 0,
            expiresAt,
            createdAt,
            updatedAt: createdAt,
        };

        const tokenRef = database.collection(odooVerificationTokenIndexCollection).doc(params.linkToken);
        await database.runTransaction(async (tx) => {
            tx.set(challengeRef, {
                ...challenge,
                createdAtServer: FieldValue.serverTimestamp(),
                updatedAtServer: FieldValue.serverTimestamp(),
            });

            tx.set(tokenRef, {
                challengeId: challenge.id,
                userId: params.userId,
                status: 'pending',
                expiresAt,
                createdAt,
                updatedAt: createdAt,
                createdAtServer: FieldValue.serverTimestamp(),
                updatedAtServer: FieldValue.serverTimestamp(),
            });
        });

        return { ok: true, data: challenge };
    } catch (error) {
        logFirestoreError('createOdooVerificationChallenge', error);
        return { ok: false, error: `Firestore createOdooVerificationChallenge failed: ${toErrorMessage(error)}` };
    }
};

export const consumeOdooVerificationByOtp = async (params: {
    userId: string;
    otpCode: string;
}): Promise<OdooVerificationChallengeResult> => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: 'Firestore consumeOdooVerificationByOtp failed: Firestore not initialized' };
    }

    try {
        const result = await database.runTransaction(async (tx) => {
            const query = database.collection(odooVerificationCollection)
                .where('userId', '==', params.userId)
                .where('status', '==', 'pending')
                .orderBy('createdAt', 'desc')
                .limit(5);
            const pending = await tx.get(query);

            if (pending.empty) throw new Error('verification_not_found');

            const newest = pending.docs[0];
            const newestChallenge = toOdooVerificationChallenge(newest.id, (newest.data() || {}) as Record<string, unknown>);
            if (newestChallenge.attemptCount >= ODOO_VERIFY_OTP_MAX_ATTEMPTS) {
                tx.update(newest.ref, {
                    status: 'expired',
                    updatedAt: new Date().toISOString(),
                    updatedAtServer: FieldValue.serverTimestamp(),
                });
                throw new Error('verification_locked');
            }

            let selectedRef: any = null;
            let selected: OdooVerificationChallenge | null = null;

            for (const doc of pending.docs) {
                const row = toOdooVerificationChallenge(doc.id, (doc.data() || {}) as Record<string, unknown>);
                if (row.otpCode === params.otpCode) {
                    selectedRef = doc;
                    selected = row;
                    break;
                }
            }

            if (!selectedRef || !selected) {
                tx.update(newest.ref, {
                    attemptCount: FieldValue.increment(1),
                    updatedAt: new Date().toISOString(),
                    updatedAtServer: FieldValue.serverTimestamp(),
                });
                throw new Error('verification_invalid_otp');
            }

            if (new Date(selected.expiresAt).getTime() <= Date.now()) {
                tx.update(selectedRef.ref, {
                    status: 'expired',
                    updatedAt: new Date().toISOString(),
                    updatedAtServer: FieldValue.serverTimestamp(),
                });
                throw new Error('verification_expired');
            }

            const now = new Date().toISOString();
            tx.update(selectedRef.ref, {
                status: 'verified',
                verifiedAt: now,
                updatedAt: now,
                updatedAtServer: FieldValue.serverTimestamp(),
            });

            tx.set(database.collection(odooVerificationTokenIndexCollection).doc(selected.linkToken), {
                status: 'verified',
                updatedAt: now,
                updatedAtServer: FieldValue.serverTimestamp(),
            }, { merge: true });

            return {
                ...selected,
                status: 'verified' as const,
                verifiedAt: now,
                updatedAt: now,
            };
        });

        return { ok: true, data: result };
    } catch (error) {
        logFirestoreError('consumeOdooVerificationByOtp', error);
        return { ok: false, error: `Firestore consumeOdooVerificationByOtp failed: ${toErrorMessage(error)}` };
    }
};

export const consumeOdooVerificationByToken = async (token: string): Promise<OdooVerificationChallengeResult> => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: 'Firestore consumeOdooVerificationByToken failed: Firestore not initialized' };
    }

    try {
        const result = await database.runTransaction(async (tx) => {
            const tokenRef = database.collection(odooVerificationTokenIndexCollection).doc(token);
            const tokenSnap = await tx.get(tokenRef);
            if (!tokenSnap.exists) throw new Error('verification_token_not_found');

            const tokenData = (tokenSnap.data() || {}) as Record<string, unknown>;
            const challengeId = toOptionalString(tokenData.challengeId) || '';
            const status = toOptionalString(tokenData.status) || 'pending';
            const expiresAt = toOptionalString(tokenData.expiresAt) || '';

            if (!challengeId) throw new Error('verification_token_invalid');
            if (status !== 'pending') throw new Error('verification_token_already_used');
            if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) throw new Error('verification_expired');

            const challengeRef = database.collection(odooVerificationCollection).doc(challengeId);
            const challengeSnap = await tx.get(challengeRef);
            if (!challengeSnap.exists) throw new Error('verification_not_found');

            const challenge = toOdooVerificationChallenge(challengeSnap.id, (challengeSnap.data() || {}) as Record<string, unknown>);
            if (challenge.status !== 'pending') throw new Error('verification_already_used');
            if (new Date(challenge.expiresAt).getTime() <= Date.now()) throw new Error('verification_expired');

            const now = new Date().toISOString();
            tx.update(challengeRef, {
                status: 'verified',
                verifiedAt: now,
                updatedAt: now,
                updatedAtServer: FieldValue.serverTimestamp(),
            });
            tx.update(tokenRef, {
                status: 'verified',
                updatedAt: now,
                updatedAtServer: FieldValue.serverTimestamp(),
            });

            return {
                ...challenge,
                status: 'verified' as const,
                verifiedAt: now,
                updatedAt: now,
            };
        });

        return { ok: true, data: result };
    } catch (error) {
        logFirestoreError('consumeOdooVerificationByToken', error);
        return { ok: false, error: `Firestore consumeOdooVerificationByToken failed: ${toErrorMessage(error)}` };
    }
};

export const createGroupBuy = async (params: {
    creatorUserId: string;
    productQuery: string;
    targetQty: number;
    productName?: string;
    productId?: number;
    expiresInHours?: number;
}): Promise<GroupBuyWriteResult> => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: 'Firestore createGroupBuy failed: Firestore not initialized' };
    }

    try {
        const now = new Date().toISOString();
        const expiresAt = params.expiresInHours && params.expiresInHours > 0
            ? new Date(Date.now() + params.expiresInHours * 60 * 60 * 1000).toISOString()
            : undefined;
        const docRef = database.collection(groupBuyCollection).doc();
        const payload: GroupBuyRecord = {
            id: docRef.id,
            creatorUserId: params.creatorUserId,
            productQuery: params.productQuery,
            ...(params.productName ? { productName: params.productName } : {}),
            ...(params.productId ? { productId: params.productId } : {}),
            targetQty: params.targetQty,
            joinedQty: 0,
            participantCount: 0,
            status: 'open',
            createdAt: now,
            updatedAt: now,
            ...(expiresAt ? { expiresAt } : {}),
        };

        await docRef.set({
            ...payload,
            createdAtServer: FieldValue.serverTimestamp(),
            updatedAtServer: FieldValue.serverTimestamp(),
        });

        return { ok: true, data: payload };
    } catch (error) {
        logFirestoreError('createGroupBuy', error);
        return { ok: false, error: `Firestore createGroupBuy failed: ${toErrorMessage(error)}` };
    }
};

export const getGroupBuyById = async (groupBuyId: string): Promise<GroupBuyRecord | null> => {
    return withFirestoreRead('getGroupBuyById', null, async (database) => {
        const snap = await database.collection(groupBuyCollection).doc(groupBuyId).get();
        if (!snap.exists) return null;
        return withEffectiveStatus(toGroupBuyRecord(snap.id, (snap.data() || {}) as Record<string, unknown>));
    });
};

export const listGroupBuysByCreator = async (creatorUserId: string, limit: number = 5): Promise<GroupBuyRecord[]> => {
    return withFirestoreRead('listGroupBuysByCreator', [], async (database) => {
        const snapshot = await database.collection(groupBuyCollection)
            .where('creatorUserId', '==', creatorUserId)
            .orderBy('updatedAt', 'desc')
            .limit(limit)
            .get();

        return snapshot.docs.map(doc => withEffectiveStatus(toGroupBuyRecord(doc.id, (doc.data() || {}) as Record<string, unknown>)));
    });
};

export const attachGroupBuyOdooOrder = async (
    groupBuyId: string,
    params: { odooOrderRef: string; odooOrderTotal?: number }
): Promise<FirestoreWriteResult> => {
    return withFirestoreWrite('attachGroupBuyOdooOrder', async (database) => {
        await database.collection(groupBuyCollection).doc(groupBuyId).set({
            odooOrderRef: params.odooOrderRef,
            ...(typeof params.odooOrderTotal === 'number' ? { odooOrderTotal: params.odooOrderTotal } : {}),
            updatedAt: new Date().toISOString(),
            updatedAtServer: FieldValue.serverTimestamp(),
        }, { merge: true });
    });
};

export const joinGroupBuy = async (params: {
    groupBuyId: string;
    userId: string;
    qty: number;
}): Promise<GroupBuyJoinResult> => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: 'Firestore joinGroupBuy failed: Firestore not initialized' };
    }

    try {
        const result = await database.runTransaction(async (tx) => {
            const groupRef = database.collection(groupBuyCollection).doc(params.groupBuyId);
            const groupSnap = await tx.get(groupRef);
            if (!groupSnap.exists) {
                throw new Error('groupbuy_not_found');
            }

            const current = toGroupBuyRecord(groupSnap.id, (groupSnap.data() || {}) as Record<string, unknown>);
            const now0 = Date.now();
            const effectiveStatus = computeEffectiveGroupBuyStatus(current, now0);
            if (effectiveStatus !== 'open') {
                if (effectiveStatus === 'expired' && current.status === 'open') {
                    tx.update(groupRef, {
                        status: 'expired',
                        updatedAt: new Date(now0).toISOString(),
                        updatedAtServer: FieldValue.serverTimestamp(),
                    });
                }
                throw new Error(`groupbuy_not_open:${effectiveStatus}`);
            }

            const participantRef = groupRef.collection('participants').doc(params.userId);
            const participantSnap = await tx.get(participantRef);
            const participantData = participantSnap.data() as Record<string, unknown> | undefined;
            const previousQty = toPositiveInt(participantData?.totalQty, 0);
            const nextQtyByUser = previousQty + params.qty;
            const isNewParticipant = !participantSnap.exists;
            const now = new Date().toISOString();

            tx.set(participantRef, {
                userId: params.userId,
                totalQty: nextQtyByUser,
                updatedAt: now,
                updatedAtServer: FieldValue.serverTimestamp(),
                ...(participantSnap.exists ? {} : { createdAt: now, createdAtServer: FieldValue.serverTimestamp() }),
            }, { merge: true });

            tx.update(groupRef, {
                joinedQty: FieldValue.increment(params.qty),
                participantCount: FieldValue.increment(isNewParticipant ? 1 : 0),
                updatedAt: now,
                updatedAtServer: FieldValue.serverTimestamp(),
            });

            return {
                data: {
                    ...current,
                    joinedQty: current.joinedQty + params.qty,
                    participantCount: current.participantCount + (isNewParticipant ? 1 : 0),
                    updatedAt: now,
                },
                joinedQtyByUser: nextQtyByUser,
            };
        });

        return { ok: true, data: result.data, joinedQtyByUser: result.joinedQtyByUser };
    } catch (error) {
        logFirestoreError('joinGroupBuy', error);
        return { ok: false, error: `Firestore joinGroupBuy failed: ${toErrorMessage(error)}` };
    }
};

const updateGroupBuyStatus = async (params: {
    groupBuyId: string;
    actorUserId: string;
    actorIsAdmin: boolean;
    nextStatus: 'confirmed' | 'cancelled';
}): Promise<GroupBuyWriteResult> => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: 'Firestore updateGroupBuyStatus failed: Firestore not initialized' };
    }

    try {
        const updated = await database.runTransaction(async (tx) => {
            const groupRef = database.collection(groupBuyCollection).doc(params.groupBuyId);
            const groupSnap = await tx.get(groupRef);
            if (!groupSnap.exists) {
                throw new Error('groupbuy_not_found');
            }

            const current = toGroupBuyRecord(groupSnap.id, (groupSnap.data() || {}) as Record<string, unknown>);
            const nowMs = Date.now();
            const effectiveStatus = computeEffectiveGroupBuyStatus(current, nowMs);

            const cancellable = effectiveStatus === 'open' || effectiveStatus === 'expired';
            const confirmable = effectiveStatus === 'open';
            const allowed = params.nextStatus === 'confirmed' ? confirmable : cancellable;

            if (effectiveStatus === 'expired' && current.status === 'open' && params.nextStatus === 'confirmed') {
                tx.update(groupRef, {
                    status: 'expired',
                    updatedAt: new Date(nowMs).toISOString(),
                    updatedAtServer: FieldValue.serverTimestamp(),
                });
            }

            if (!allowed) {
                throw new Error(`groupbuy_not_open:${effectiveStatus}`);
            }

            if (!params.actorIsAdmin && current.creatorUserId !== params.actorUserId) {
                throw new Error('groupbuy_forbidden');
            }

            const now = new Date().toISOString();
            if (params.nextStatus === 'confirmed') {
                tx.update(groupRef, {
                    status: 'confirmed',
                    confirmedAt: now,
                    confirmedBy: params.actorUserId,
                    updatedAt: now,
                    updatedAtServer: FieldValue.serverTimestamp(),
                });

                return {
                    ...current,
                    status: 'confirmed' as const,
                    confirmedAt: now,
                    confirmedBy: params.actorUserId,
                    updatedAt: now,
                };
            }

            tx.update(groupRef, {
                status: 'cancelled',
                cancelledAt: now,
                cancelledBy: params.actorUserId,
                updatedAt: now,
                updatedAtServer: FieldValue.serverTimestamp(),
            });

            return {
                ...current,
                status: 'cancelled' as const,
                cancelledAt: now,
                cancelledBy: params.actorUserId,
                updatedAt: now,
            };
        });

        return { ok: true, data: updated };
    } catch (error) {
        logFirestoreError('updateGroupBuyStatus', error);
        return { ok: false, error: `Firestore updateGroupBuyStatus failed: ${toErrorMessage(error)}` };
    }
};

export const confirmGroupBuy = async (groupBuyId: string, actorUserId: string, actorIsAdmin: boolean): Promise<GroupBuyWriteResult> => {
    return updateGroupBuyStatus({ groupBuyId, actorUserId, actorIsAdmin, nextStatus: 'confirmed' });
};

export const cancelGroupBuy = async (groupBuyId: string, actorUserId: string, actorIsAdmin: boolean): Promise<GroupBuyWriteResult> => {
    return updateGroupBuyStatus({ groupBuyId, actorUserId, actorIsAdmin, nextStatus: 'cancelled' });
};

export type AuditAction =
    | 'role_grant'
    | 'role_revoke'
    | 'user_create'
    | 'user_update'
    | 'user_delete'
    | 'service_create'
    | 'service_update'
    | 'service_delete'
    | 'channel_config_update'
    | 'audit_rotate';

export type AuditOutcome = 'success' | 'failure';

const auditLogCollection = 'auditLog';

/**
 * Append-only audit trail for admin/privileged actions. Never blocks or
 * fails the caller's command reply — logging failures are only warned.
 */
export const recordAuditEvent = async (params: {
    action: AuditAction;
    outcome: AuditOutcome;
    actorUserId: string;
    channelId?: string;
    targetId?: string;
    detail?: string;
}): Promise<void> => {
    const database = getDb();
    if (!database) return;

    try {
        await database.collection(auditLogCollection).add({
            action: params.action,
            outcome: params.outcome,
            actorUserId: params.actorUserId,
            channelId: params.channelId || null,
            targetId: params.targetId || null,
            detail: params.detail || null,
            createdAt: new Date().toISOString(),
            createdAtServer: FieldValue.serverTimestamp(),
        });
    } catch (error) {
        logFirestoreError('recordAuditEvent', error);
    }
};

export type AuditLogEntry = {
    id: string;
    action: string;
    outcome: string;
    actorUserId: string;
    channelId: string | null;
    targetId: string | null;
    detail: string | null;
    createdAt: string;
};

export const listRecentAuditEvents = async (limit: number = 50): Promise<AuditLogEntry[]> => {
    return withFirestoreRead('listRecentAuditEvents', [], async (database) => {
        const snapshot = await database.collection(auditLogCollection)
            .orderBy('createdAt', 'desc')
            .limit(Math.min(Math.max(limit, 1), 200))
            .get();

        return snapshot.docs.map(doc => {
            const raw = (doc.data() || {}) as Record<string, unknown>;
            return {
                id: doc.id,
                action: toOptionalString(raw.action) || 'unknown',
                outcome: toOptionalString(raw.outcome) || 'unknown',
                actorUserId: toOptionalString(raw.actorUserId) || '',
                channelId: toOptionalString(raw.channelId) || null,
                targetId: toOptionalString(raw.targetId) || null,
                detail: toOptionalString(raw.detail) || null,
                createdAt: toOptionalString(raw.createdAt) || new Date(0).toISOString(),
            };
        });
    });
};

/**
 * Oldest-first page of audit events at/before a cutoff, for the archive-then-
 * delete rotation job (src/services/audit-archive.ts). Ascending order so a
 * partial run (capped by AUDIT_ROTATE_MAX_BATCHES) always drains the oldest
 * backlog first.
 */
export const listAuditEventsOlderThan = async (cutoffIso: string, limit: number): Promise<AuditLogEntry[]> => {
    return withFirestoreRead('listAuditEventsOlderThan', [], async (database) => {
        const snapshot = await database.collection(auditLogCollection)
            .where('createdAt', '<', cutoffIso)
            .orderBy('createdAt', 'asc')
            .limit(Math.min(Math.max(limit, 1), 500))
            .get();

        return snapshot.docs.map(doc => {
            const raw = (doc.data() || {}) as Record<string, unknown>;
            return {
                id: doc.id,
                action: toOptionalString(raw.action) || 'unknown',
                outcome: toOptionalString(raw.outcome) || 'unknown',
                actorUserId: toOptionalString(raw.actorUserId) || '',
                channelId: toOptionalString(raw.channelId) || null,
                targetId: toOptionalString(raw.targetId) || null,
                detail: toOptionalString(raw.detail) || null,
                createdAt: toOptionalString(raw.createdAt) || new Date(0).toISOString(),
            };
        });
    });
};

/**
 * Deletes a page of audit events by id. Only ever called by the rotation job
 * after those exact rows have been durably archived to BigQuery — never
 * exposed as a standalone bulk-delete to keep the audit trail append-mostly.
 * A single Firestore batch caps out at 500 writes, matching the rotation
 * job's max page size.
 */
export const deleteAuditEventsByIds = async (ids: string[]): Promise<FirestoreWriteResult> => {
    if (!ids.length) return { ok: true };

    return withFirestoreWrite('deleteAuditEventsByIds', async (database) => {
        const batch = database.batch();
        for (const id of ids) {
            batch.delete(database.collection(auditLogCollection).doc(id));
        }
        await batch.commit();
    });
};
