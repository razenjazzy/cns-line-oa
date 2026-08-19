import { Firestore, FieldValue } from '@google-cloud/firestore';

let db: Firestore | null = null;

type CachedUserState = {
    language?: UserLanguage;
    role?: UserRole;
    odooPartnerId?: number;
    odooVerified?: boolean;
    odooVerifiedAt?: string;
    displayName?: string;
    phone?: string;
    escalatedToHuman?: boolean;
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
    db = new Firestore({ projectId });
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
};

export type OdooVerificationChallenge = {
    id: string;
    userId: string;
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
    };

    return withFirestoreRead('getUserProfile', fallbackProfile, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const data = doc.data() || {};

        const profile: UserProfile = {
            language: data.language === 'th' ? 'th' : 'en',
            role: data.role === 'admin' ? 'admin' : 'user',
            odooPartnerId: typeof data.odooPartnerId === 'number' ? data.odooPartnerId : undefined,
            odooVerified: data.odooVerified === true,
            odooVerifiedAt: typeof data.odooVerifiedAt === 'string' ? data.odooVerifiedAt : undefined,
            displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
            phone: typeof data.phone === 'string' ? data.phone : undefined,
        };

        mergeCachedUserState(userId, profile);
        return profile;
    });
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
                const newest = pending.docs[0];
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
