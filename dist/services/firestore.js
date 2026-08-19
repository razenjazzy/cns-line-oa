"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listRecentAuditEvents = exports.recordAuditEvent = exports.cancelGroupBuy = exports.confirmGroupBuy = exports.joinGroupBuy = exports.attachGroupBuyOdooOrder = exports.listGroupBuysByCreator = exports.getGroupBuyById = exports.createGroupBuy = exports.consumeOdooVerificationByToken = exports.consumeOdooVerificationByOtp = exports.createOdooVerificationChallenge = exports.setPlatformConfig = exports.getPlatformConfig = exports.setUserOdooVerificationStatus = exports.setUserOdooPartner = exports.setUserRole = exports.setUserPendingFlow = exports.getUserProfile = exports.setUserLanguage = exports.getUserLanguage = exports.setEscalationState = exports.getEscalationState = exports.saveConversationMessage = exports.getConversationHistory = exports.updateUserScore = exports.saveReportLog = exports.checkFirestoreReady = void 0;
const firestore_1 = require("@google-cloud/firestore");
let db = null;
const isPendingFlowActive = (pendingFlow) => {
    return Boolean(pendingFlow) && new Date(pendingFlow.expiresAt).getTime() > Date.now();
};
const USER_STATE_CACHE_MAX = Number(process.env.USER_STATE_CACHE_MAX || 10000);
const USER_STATE_CACHE_TTL_MS = Number(process.env.USER_STATE_CACHE_TTL_MS || 60 * 60 * 1000);
const userStateCache = new Map();
const logFirestoreError = (action, error) => {
    console.warn(`Firestore ${action} failed:`, error);
};
const toErrorMessage = (error) => {
    if (error instanceof Error && error.message)
        return error.message;
    return String(error);
};
const withFirestoreRead = async (action, fallback, operation) => {
    const database = getDb();
    if (!database)
        return fallback;
    try {
        return await operation(database);
    }
    catch (error) {
        logFirestoreError(action, error);
        return fallback;
    }
};
const withFirestoreWrite = async (action, operation) => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: `Firestore ${action} failed: Firestore not initialized` };
    }
    try {
        await operation(database);
        return { ok: true };
    }
    catch (error) {
        logFirestoreError(action, error);
        return { ok: false, error: `Firestore ${action} failed: ${String(error)}` };
    }
};
const groupBuyCollection = 'groupBuys';
const toPositiveInt = (value, fallback) => {
    if (typeof value !== 'number' || !Number.isFinite(value))
        return fallback;
    const normalized = Math.trunc(value);
    return normalized > 0 ? normalized : fallback;
};
const toOptionalString = (value) => {
    if (typeof value !== 'string')
        return undefined;
    const normalized = value.trim();
    return normalized || undefined;
};
const toGroupBuyRecord = (id, raw) => {
    const statusRaw = toOptionalString(raw.status);
    const status = statusRaw === 'confirmed' || statusRaw === 'cancelled' || statusRaw === 'expired' ? statusRaw : 'open';
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
const computeEffectiveGroupBuyStatus = (record, nowMs) => {
    if (record.status === 'open' && record.expiresAt && new Date(record.expiresAt).getTime() <= nowMs) {
        return 'expired';
    }
    return record.status;
};
const withEffectiveStatus = (record, nowMs = Date.now()) => {
    const effectiveStatus = computeEffectiveGroupBuyStatus(record, nowMs);
    return effectiveStatus === record.status ? record : { ...record, status: effectiveStatus };
};
const getDb = () => {
    if (db)
        return db;
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    if (!projectId)
        return null;
    try {
        // On Cloud Run, Application Default Credentials resolve automatically
        // via the attached service account. On a non-GCP host (e.g. a Railway
        // test deploy) there's no such identity, so allow credentials to be
        // supplied inline as JSON instead of relying on ADC.
        const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON?.trim();
        if (credentialsJson) {
            db = new firestore_1.Firestore({ projectId, credentials: JSON.parse(credentialsJson) });
        }
        else {
            db = new firestore_1.Firestore({ projectId });
        }
    }
    catch (error) {
        console.warn('Failed to initialize Firestore:', error);
    }
    return db;
};
const checkFirestoreReady = async () => {
    const database = getDb();
    if (!database) {
        return { ok: false, message: 'Firestore is not configured (missing GOOGLE_CLOUD_PROJECT).' };
    }
    try {
        await database.collection('_health').doc('readyz').get();
        return { ok: true, message: 'Firestore reachable.' };
    }
    catch (error) {
        return { ok: false, message: `Firestore check failed: ${String(error)}` };
    }
};
exports.checkFirestoreReady = checkFirestoreReady;
const pruneUserStateCache = () => {
    const now = Date.now();
    for (const [userId, entry] of userStateCache.entries()) {
        if (now - entry.updatedAt > USER_STATE_CACHE_TTL_MS) {
            userStateCache.delete(userId);
        }
    }
    if (userStateCache.size <= USER_STATE_CACHE_MAX)
        return;
    const overflow = userStateCache.size - USER_STATE_CACHE_MAX;
    let removed = 0;
    for (const key of userStateCache.keys()) {
        userStateCache.delete(key);
        removed += 1;
        if (removed >= overflow)
            break;
    }
};
const getCachedUserState = (userId) => {
    const cached = userStateCache.get(userId);
    if (!cached)
        return {};
    if (Date.now() - cached.updatedAt > USER_STATE_CACHE_TTL_MS) {
        userStateCache.delete(userId);
        return {};
    }
    return cached.state;
};
const mergeCachedUserState = (userId, patch) => {
    const current = getCachedUserState(userId);
    const next = { ...current, ...patch };
    userStateCache.set(userId, { state: next, updatedAt: Date.now() });
    pruneUserStateCache();
    return next;
};
const saveReportLog = async (reportId, data) => {
    return withFirestoreWrite('saveReportLog', async (database) => {
        const docRef = database.collection('reports').doc(reportId);
        await docRef.set({
            ...data,
            createdAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
};
exports.saveReportLog = saveReportLog;
const updateUserScore = async (userId, interactionType) => {
    return withFirestoreWrite('updateUserScore', async (database) => {
        const docRef = database.collection('users').doc(userId);
        const scoreIncrement = interactionType === 'product_inquiry' ? 5 : 1;
        await docRef.set({
            lastInteractionAt: firestore_1.FieldValue.serverTimestamp(),
            engagementScore: firestore_1.FieldValue.increment(scoreIncrement)
        }, { merge: true });
    });
};
exports.updateUserScore = updateUserScore;
const getConversationHistory = async (userId) => {
    return withFirestoreRead('getConversationHistory', [], async (database) => {
        const snapshot = await database.collection('users').doc(userId).collection('messages')
            .orderBy('timestamp', 'asc')
            .limitToLast(10)
            .get();
        return snapshot.docs.map(doc => doc.data());
    });
};
exports.getConversationHistory = getConversationHistory;
const saveConversationMessage = async (userId, role, text) => {
    return withFirestoreWrite('saveConversationMessage', async (database) => {
        await database.collection('users').doc(userId).collection('messages').add({
            role,
            text,
            timestamp: firestore_1.FieldValue.serverTimestamp(),
        });
    });
};
exports.saveConversationMessage = saveConversationMessage;
const getEscalationState = async (userId) => {
    return withFirestoreRead('getEscalationState', getCachedUserState(userId).escalatedToHuman || false, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const escalatedToHuman = doc.data()?.escalatedToHuman || false;
        mergeCachedUserState(userId, { escalatedToHuman });
        return escalatedToHuman;
    });
};
exports.getEscalationState = getEscalationState;
const setEscalationState = async (userId, escalated) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { escalatedToHuman: escalated });
    const result = await withFirestoreWrite('setEscalationState', async (database) => {
        await database.collection('users').doc(userId).set({ escalatedToHuman: escalated }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        }
        else {
            userStateCache.delete(userId);
        }
    }
    return result;
};
exports.setEscalationState = setEscalationState;
const ODOO_VERIFY_OTP_MAX_ATTEMPTS = Number(process.env.ODOO_VERIFY_OTP_MAX_ATTEMPTS || 5);
const odooVerificationCollection = 'odooVerifications';
const odooVerificationTokenIndexCollection = 'odooVerificationTokens';
const platformConfigCollection = 'platformConfig';
const toOdooVerificationChallenge = (id, raw) => {
    const statusRaw = toOptionalString(raw.status);
    const status = statusRaw === 'verified' || statusRaw === 'expired' ? statusRaw : 'pending';
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
const getUserLanguage = async (userId) => {
    return withFirestoreRead('getUserLanguage', getCachedUserState(userId).language || 'en', async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const lang = doc.data()?.language;
        const language = lang === 'th' ? 'th' : 'en';
        mergeCachedUserState(userId, { language });
        return language;
    });
};
exports.getUserLanguage = getUserLanguage;
const setUserLanguage = async (userId, language) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { language });
    const result = await withFirestoreWrite('setUserLanguage', async (database) => {
        await database.collection('users').doc(userId).set({ language }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        }
        else {
            userStateCache.delete(userId);
        }
    }
    return result;
};
exports.setUserLanguage = setUserLanguage;
const getUserProfile = async (userId) => {
    const cached = getCachedUserState(userId);
    const fallbackProfile = {
        language: cached.language || 'en',
        role: cached.role || 'user',
        odooPartnerId: cached.odooPartnerId,
        odooVerified: cached.odooVerified || false,
        odooVerifiedAt: cached.odooVerifiedAt,
        displayName: cached.displayName,
        phone: cached.phone,
        pendingFlow: isPendingFlowActive(cached.pendingFlow) ? cached.pendingFlow : undefined,
    };
    return withFirestoreRead('getUserProfile', fallbackProfile, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const data = doc.data() || {};
        const rawPendingFlow = data.pendingFlow;
        const profile = {
            language: data.language === 'th' ? 'th' : 'en',
            role: data.role === 'admin' ? 'admin' : 'user',
            odooPartnerId: typeof data.odooPartnerId === 'number' ? data.odooPartnerId : undefined,
            odooVerified: data.odooVerified === true,
            odooVerifiedAt: typeof data.odooVerifiedAt === 'string' ? data.odooVerifiedAt : undefined,
            displayName: typeof data.displayName === 'string' ? data.displayName : undefined,
            phone: typeof data.phone === 'string' ? data.phone : undefined,
            pendingFlow: isPendingFlowActive(rawPendingFlow) ? rawPendingFlow : undefined,
        };
        mergeCachedUserState(userId, profile);
        return profile;
    });
};
exports.getUserProfile = getUserProfile;
const setUserPendingFlow = async (userId, pendingFlow) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { pendingFlow: pendingFlow || undefined });
    const result = await withFirestoreWrite('setUserPendingFlow', async (database) => {
        await database.collection('users').doc(userId).set({ pendingFlow }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        }
        else {
            userStateCache.delete(userId);
        }
    }
    return result;
};
exports.setUserPendingFlow = setUserPendingFlow;
const setUserRole = async (userId, role) => {
    const previous = userStateCache.get(userId);
    mergeCachedUserState(userId, { role });
    const result = await withFirestoreWrite('setUserRole', async (database) => {
        await database.collection('users').doc(userId).set({ role }, { merge: true });
    });
    if (!result.ok) {
        if (previous) {
            userStateCache.set(userId, previous);
        }
        else {
            userStateCache.delete(userId);
        }
    }
    return result;
};
exports.setUserRole = setUserRole;
const setUserOdooPartner = async (userId, partnerId, displayName, phone) => {
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
        }
        else {
            userStateCache.delete(userId);
        }
    }
    return result;
};
exports.setUserOdooPartner = setUserOdooPartner;
const setUserOdooVerificationStatus = async (userId, verified, verifiedAt) => {
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
        }
        else {
            userStateCache.delete(userId);
        }
    }
    return result;
};
exports.setUserOdooVerificationStatus = setUserOdooVerificationStatus;
const getPlatformConfig = async (key) => {
    const normalizedKey = key.trim();
    if (!normalizedKey)
        return null;
    return withFirestoreRead('getPlatformConfig', null, async (database) => {
        const snap = await database.collection(platformConfigCollection).doc(normalizedKey).get();
        if (!snap.exists)
            return null;
        const raw = (snap.data() || {});
        if (!raw.value || typeof raw.value !== 'object')
            return null;
        return raw.value;
    });
};
exports.getPlatformConfig = getPlatformConfig;
const setPlatformConfig = async (key, value) => {
    const normalizedKey = key.trim();
    if (!normalizedKey) {
        return { ok: false, error: 'Firestore setPlatformConfig failed: key is required' };
    }
    return withFirestoreWrite('setPlatformConfig', async (database) => {
        await database.collection(platformConfigCollection).doc(normalizedKey).set({
            key: normalizedKey,
            value,
            updatedAt: new Date().toISOString(),
            updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
};
exports.setPlatformConfig = setPlatformConfig;
const createOdooVerificationChallenge = async (params) => {
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
        const challenge = {
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
                createdAtServer: firestore_1.FieldValue.serverTimestamp(),
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.set(tokenRef, {
                challengeId: challenge.id,
                userId: params.userId,
                status: 'pending',
                expiresAt,
                createdAt,
                updatedAt: createdAt,
                createdAtServer: firestore_1.FieldValue.serverTimestamp(),
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
            });
        });
        return { ok: true, data: challenge };
    }
    catch (error) {
        logFirestoreError('createOdooVerificationChallenge', error);
        return { ok: false, error: `Firestore createOdooVerificationChallenge failed: ${toErrorMessage(error)}` };
    }
};
exports.createOdooVerificationChallenge = createOdooVerificationChallenge;
const consumeOdooVerificationByOtp = async (params) => {
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
            if (pending.empty)
                throw new Error('verification_not_found');
            const newest = pending.docs[0];
            const newestChallenge = toOdooVerificationChallenge(newest.id, (newest.data() || {}));
            if (newestChallenge.attemptCount >= ODOO_VERIFY_OTP_MAX_ATTEMPTS) {
                tx.update(newest.ref, {
                    status: 'expired',
                    updatedAt: new Date().toISOString(),
                    updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
                });
                throw new Error('verification_locked');
            }
            let selectedRef = null;
            let selected = null;
            for (const doc of pending.docs) {
                const row = toOdooVerificationChallenge(doc.id, (doc.data() || {}));
                if (row.otpCode === params.otpCode) {
                    selectedRef = doc;
                    selected = row;
                    break;
                }
            }
            if (!selectedRef || !selected) {
                tx.update(newest.ref, {
                    attemptCount: firestore_1.FieldValue.increment(1),
                    updatedAt: new Date().toISOString(),
                    updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
                });
                throw new Error('verification_invalid_otp');
            }
            if (new Date(selected.expiresAt).getTime() <= Date.now()) {
                tx.update(selectedRef.ref, {
                    status: 'expired',
                    updatedAt: new Date().toISOString(),
                    updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
                });
                throw new Error('verification_expired');
            }
            const now = new Date().toISOString();
            tx.update(selectedRef.ref, {
                status: 'verified',
                verifiedAt: now,
                updatedAt: now,
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.set(database.collection(odooVerificationTokenIndexCollection).doc(selected.linkToken), {
                status: 'verified',
                updatedAt: now,
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            return {
                ...selected,
                status: 'verified',
                verifiedAt: now,
                updatedAt: now,
            };
        });
        return { ok: true, data: result };
    }
    catch (error) {
        logFirestoreError('consumeOdooVerificationByOtp', error);
        return { ok: false, error: `Firestore consumeOdooVerificationByOtp failed: ${toErrorMessage(error)}` };
    }
};
exports.consumeOdooVerificationByOtp = consumeOdooVerificationByOtp;
const consumeOdooVerificationByToken = async (token) => {
    const database = getDb();
    if (!database) {
        return { ok: false, error: 'Firestore consumeOdooVerificationByToken failed: Firestore not initialized' };
    }
    try {
        const result = await database.runTransaction(async (tx) => {
            const tokenRef = database.collection(odooVerificationTokenIndexCollection).doc(token);
            const tokenSnap = await tx.get(tokenRef);
            if (!tokenSnap.exists)
                throw new Error('verification_token_not_found');
            const tokenData = (tokenSnap.data() || {});
            const challengeId = toOptionalString(tokenData.challengeId) || '';
            const status = toOptionalString(tokenData.status) || 'pending';
            const expiresAt = toOptionalString(tokenData.expiresAt) || '';
            if (!challengeId)
                throw new Error('verification_token_invalid');
            if (status !== 'pending')
                throw new Error('verification_token_already_used');
            if (expiresAt && new Date(expiresAt).getTime() <= Date.now())
                throw new Error('verification_expired');
            const challengeRef = database.collection(odooVerificationCollection).doc(challengeId);
            const challengeSnap = await tx.get(challengeRef);
            if (!challengeSnap.exists)
                throw new Error('verification_not_found');
            const challenge = toOdooVerificationChallenge(challengeSnap.id, (challengeSnap.data() || {}));
            if (challenge.status !== 'pending')
                throw new Error('verification_already_used');
            if (new Date(challenge.expiresAt).getTime() <= Date.now())
                throw new Error('verification_expired');
            const now = new Date().toISOString();
            tx.update(challengeRef, {
                status: 'verified',
                verifiedAt: now,
                updatedAt: now,
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
            });
            tx.update(tokenRef, {
                status: 'verified',
                updatedAt: now,
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
            });
            return {
                ...challenge,
                status: 'verified',
                verifiedAt: now,
                updatedAt: now,
            };
        });
        return { ok: true, data: result };
    }
    catch (error) {
        logFirestoreError('consumeOdooVerificationByToken', error);
        return { ok: false, error: `Firestore consumeOdooVerificationByToken failed: ${toErrorMessage(error)}` };
    }
};
exports.consumeOdooVerificationByToken = consumeOdooVerificationByToken;
const createGroupBuy = async (params) => {
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
        const payload = {
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
            createdAtServer: firestore_1.FieldValue.serverTimestamp(),
            updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
        });
        return { ok: true, data: payload };
    }
    catch (error) {
        logFirestoreError('createGroupBuy', error);
        return { ok: false, error: `Firestore createGroupBuy failed: ${toErrorMessage(error)}` };
    }
};
exports.createGroupBuy = createGroupBuy;
const getGroupBuyById = async (groupBuyId) => {
    return withFirestoreRead('getGroupBuyById', null, async (database) => {
        const snap = await database.collection(groupBuyCollection).doc(groupBuyId).get();
        if (!snap.exists)
            return null;
        return withEffectiveStatus(toGroupBuyRecord(snap.id, (snap.data() || {})));
    });
};
exports.getGroupBuyById = getGroupBuyById;
const listGroupBuysByCreator = async (creatorUserId, limit = 5) => {
    return withFirestoreRead('listGroupBuysByCreator', [], async (database) => {
        const snapshot = await database.collection(groupBuyCollection)
            .where('creatorUserId', '==', creatorUserId)
            .orderBy('updatedAt', 'desc')
            .limit(limit)
            .get();
        return snapshot.docs.map(doc => withEffectiveStatus(toGroupBuyRecord(doc.id, (doc.data() || {}))));
    });
};
exports.listGroupBuysByCreator = listGroupBuysByCreator;
const attachGroupBuyOdooOrder = async (groupBuyId, params) => {
    return withFirestoreWrite('attachGroupBuyOdooOrder', async (database) => {
        await database.collection(groupBuyCollection).doc(groupBuyId).set({
            odooOrderRef: params.odooOrderRef,
            ...(typeof params.odooOrderTotal === 'number' ? { odooOrderTotal: params.odooOrderTotal } : {}),
            updatedAt: new Date().toISOString(),
            updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
        }, { merge: true });
    });
};
exports.attachGroupBuyOdooOrder = attachGroupBuyOdooOrder;
const joinGroupBuy = async (params) => {
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
            const current = toGroupBuyRecord(groupSnap.id, (groupSnap.data() || {}));
            const now0 = Date.now();
            const effectiveStatus = computeEffectiveGroupBuyStatus(current, now0);
            if (effectiveStatus !== 'open') {
                if (effectiveStatus === 'expired' && current.status === 'open') {
                    tx.update(groupRef, {
                        status: 'expired',
                        updatedAt: new Date(now0).toISOString(),
                        updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
                    });
                }
                throw new Error(`groupbuy_not_open:${effectiveStatus}`);
            }
            const participantRef = groupRef.collection('participants').doc(params.userId);
            const participantSnap = await tx.get(participantRef);
            const participantData = participantSnap.data();
            const previousQty = toPositiveInt(participantData?.totalQty, 0);
            const nextQtyByUser = previousQty + params.qty;
            const isNewParticipant = !participantSnap.exists;
            const now = new Date().toISOString();
            tx.set(participantRef, {
                userId: params.userId,
                totalQty: nextQtyByUser,
                updatedAt: now,
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
                ...(participantSnap.exists ? {} : { createdAt: now, createdAtServer: firestore_1.FieldValue.serverTimestamp() }),
            }, { merge: true });
            tx.update(groupRef, {
                joinedQty: firestore_1.FieldValue.increment(params.qty),
                participantCount: firestore_1.FieldValue.increment(isNewParticipant ? 1 : 0),
                updatedAt: now,
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
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
    }
    catch (error) {
        logFirestoreError('joinGroupBuy', error);
        return { ok: false, error: `Firestore joinGroupBuy failed: ${toErrorMessage(error)}` };
    }
};
exports.joinGroupBuy = joinGroupBuy;
const updateGroupBuyStatus = async (params) => {
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
            const current = toGroupBuyRecord(groupSnap.id, (groupSnap.data() || {}));
            const nowMs = Date.now();
            const effectiveStatus = computeEffectiveGroupBuyStatus(current, nowMs);
            const cancellable = effectiveStatus === 'open' || effectiveStatus === 'expired';
            const confirmable = effectiveStatus === 'open';
            const allowed = params.nextStatus === 'confirmed' ? confirmable : cancellable;
            if (effectiveStatus === 'expired' && current.status === 'open' && params.nextStatus === 'confirmed') {
                tx.update(groupRef, {
                    status: 'expired',
                    updatedAt: new Date(nowMs).toISOString(),
                    updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
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
                    updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
                });
                return {
                    ...current,
                    status: 'confirmed',
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
                updatedAtServer: firestore_1.FieldValue.serverTimestamp(),
            });
            return {
                ...current,
                status: 'cancelled',
                cancelledAt: now,
                cancelledBy: params.actorUserId,
                updatedAt: now,
            };
        });
        return { ok: true, data: updated };
    }
    catch (error) {
        logFirestoreError('updateGroupBuyStatus', error);
        return { ok: false, error: `Firestore updateGroupBuyStatus failed: ${toErrorMessage(error)}` };
    }
};
const confirmGroupBuy = async (groupBuyId, actorUserId, actorIsAdmin) => {
    return updateGroupBuyStatus({ groupBuyId, actorUserId, actorIsAdmin, nextStatus: 'confirmed' });
};
exports.confirmGroupBuy = confirmGroupBuy;
const cancelGroupBuy = async (groupBuyId, actorUserId, actorIsAdmin) => {
    return updateGroupBuyStatus({ groupBuyId, actorUserId, actorIsAdmin, nextStatus: 'cancelled' });
};
exports.cancelGroupBuy = cancelGroupBuy;
const auditLogCollection = 'auditLog';
/**
 * Append-only audit trail for admin/privileged actions. Never blocks or
 * fails the caller's command reply — logging failures are only warned.
 */
const recordAuditEvent = async (params) => {
    const database = getDb();
    if (!database)
        return;
    try {
        await database.collection(auditLogCollection).add({
            action: params.action,
            outcome: params.outcome,
            actorUserId: params.actorUserId,
            channelId: params.channelId || null,
            targetId: params.targetId || null,
            detail: params.detail || null,
            createdAt: new Date().toISOString(),
            createdAtServer: firestore_1.FieldValue.serverTimestamp(),
        });
    }
    catch (error) {
        logFirestoreError('recordAuditEvent', error);
    }
};
exports.recordAuditEvent = recordAuditEvent;
const listRecentAuditEvents = async (limit = 50) => {
    return withFirestoreRead('listRecentAuditEvents', [], async (database) => {
        const snapshot = await database.collection(auditLogCollection)
            .orderBy('createdAt', 'desc')
            .limit(Math.min(Math.max(limit, 1), 200))
            .get();
        return snapshot.docs.map(doc => {
            const raw = (doc.data() || {});
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
exports.listRecentAuditEvents = listRecentAuditEvents;
