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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cancelGroupBuy = exports.confirmGroupBuy = exports.joinGroupBuy = exports.attachGroupBuyOdooOrder = exports.listGroupBuysByCreator = exports.getGroupBuyById = exports.createGroupBuy = exports.consumeActionOtpChallenge = exports.createActionOtpChallenge = exports.consumeOdooVerificationByToken = exports.consumeOdooVerificationByOtp = exports.createOdooVerificationChallenge = exports.deleteAuditEventsByIds = exports.listAuditEventsOlderThan = exports.listRecentAuditEvents = exports.listRecentAuditEventsPage = exports.recordAuditEvent = exports.transitionStoredApproval = exports.getApprovalRecord = exports.saveApprovalRecord = exports.setPlatformConfig = exports.getPlatformConfig = exports.findVerifiedUserIdByPhone = exports.setUserOdooVerificationStatus = exports.setUserOdooPartner = exports.setUserSalesTier = exports.setUserRole = exports.setUserPendingFlow = exports.recordChatFeedback = exports.filterMarketingOptedInUserIds = exports.deleteUserProfile = exports.setMarketingOptIn = exports.setLastActionOtpAt = exports.markConsentNoticeShown = exports.getUserProfile = exports.setUserLanguage = exports.getUserLanguage = exports.saveReportLog = exports.markUserFirstContact = exports.setEscalationState = exports.getEscalationState = exports.saveConversationMessage = exports.getConversationHistory = exports.updateUserScore = exports.checkFirestoreReady = void 0;
const firestore_1 = require("@google-cloud/firestore");
const app_config_1 = require("./app-config");
const logger_1 = require("./logger");
const core_1 = require("./firestore/core");
const platform_config_1 = require("./firestore/platform-config");
const user_profile_repository_1 = require("./firestore/user-profile-repository");
const verification_1 = require("./firestore/verification");
const action_otp_1 = require("./firestore/action-otp");
const action_otp_store_1 = require("./firestore/action-otp-store");
const approval_store_1 = require("./firestore/approval-store");
const audit_store_1 = require("./firestore/audit-store");
const group_buy_store_1 = require("./firestore/group-buy-store");
const communication_1 = require("./firestore/communication");
const verification_store_1 = require("./firestore/verification-store");
const verification_consume_1 = require("./firestore/verification-consume");
const verification_token_1 = require("./firestore/verification-token");
const report_store_1 = require("./firestore/report-store");
__exportStar(require("./firestore/types"), exports);
let db = null;
const auditLogger = (0, logger_1.createLogger)('audit');
const approvalRecords = new Map();
const isPendingFlowActive = (pendingFlow) => {
    return Boolean(pendingFlow) && new Date(pendingFlow.expiresAt).getTime() > Date.now();
};
const USER_STATE_CACHE_MAX = Number(process.env.USER_STATE_CACHE_MAX || 10000);
const USER_STATE_CACHE_TTL_MS = Number(process.env.USER_STATE_CACHE_TTL_MS || 60 * 60 * 1000);
const userStateCache = new Map();
const logFirestoreError = (action, error) => {
    console.warn(`Firestore ${action} failed:`, error);
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
        // Not configured is not a failure: the caller already applied its
        // optimistic cache update, and that cache is the authoritative
        // store in this mode. Report success so callers don't treat a
        // by-design degraded mode as a broken write.
        return { ok: true, notConfigured: true, error: `Firestore ${action} skipped: Firestore not initialized` };
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
        // ignoreUndefinedProperties: the Firestore SDK otherwise throws on any
        // write containing an `undefined` field (found live this session —
        // clearing an optional field by setting it to `undefined` silently
        // failed the whole write and rolled the optimistic cache update back,
        // discarding real user input). Dropping the field instead — the same
        // effect merge:true already has for an omitted key — matches how every
        // write in this file is meant to behave, so this closes that entire
        // class of bug rather than just the one call site that surfaced it.
        if (credentialsJson) {
            db = new firestore_1.Firestore({ projectId, credentials: JSON.parse(credentialsJson), ignoreUndefinedProperties: true });
        }
        else {
            db = new firestore_1.Firestore({ projectId, ignoreUndefinedProperties: true });
        }
    }
    catch (error) {
        console.warn('Failed to initialize Firestore:', error);
    }
    return db;
};
const groupBuyStore = (0, group_buy_store_1.createGroupBuyStore)({
    database: getDb,
    read: withFirestoreRead,
    write: withFirestoreWrite,
    toOptionalString: core_1.toOptionalString,
    toPositiveInt: core_1.toPositiveInt,
    toErrorMessage: core_1.toErrorMessage,
});
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
const userProfileRepository = (0, user_profile_repository_1.createUserProfileRepository)({
    getCached: getCachedUserState,
    mergeCached: mergeCachedUserState,
    getPrevious: userId => userStateCache.get(userId),
    restorePrevious: (userId, previous) => {
        if (previous)
            userStateCache.set(userId, previous);
        else
            userStateCache.delete(userId);
    },
    deleteCached: userId => userStateCache.delete(userId),
    read: withFirestoreRead,
    write: withFirestoreWrite,
    defaultLanguage: (0, app_config_1.getDefaultLanguage)('en'),
    pendingFlowIsActive: isPendingFlowActive,
});
const communicationRepository = (0, communication_1.createCommunicationRepository)({
    read: withFirestoreRead,
    write: withFirestoreWrite,
});
exports.updateUserScore = communicationRepository.updateUserScore;
exports.getConversationHistory = communicationRepository.getConversationHistory;
exports.saveConversationMessage = communicationRepository.saveConversationMessage;
const getEscalationState = async (userId) => {
    return withFirestoreRead('getEscalationState', getCachedUserState(userId).escalatedToHuman || false, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const escalatedToHuman = doc.data()?.escalatedToHuman || false;
        mergeCachedUserState(userId, { escalatedToHuman });
        return escalatedToHuman;
    });
};
exports.getEscalationState = getEscalationState;
exports.setEscalationState = userProfileRepository.setEscalation;
/**
 * Records the timestamp of a user's first-ever message so the bot can open
 * the nav-button menu immediately on first contact instead of requiring a
 * command. Returns true when persisted (the write succeeded, regardless of
 * whether it was actually the first message).
 */
exports.markUserFirstContact = userProfileRepository.markFirstContact;
const ODOO_VERIFY_OTP_MAX_ATTEMPTS = Number(process.env.ODOO_VERIFY_OTP_MAX_ATTEMPTS || 5);
/**
 * In-memory fallback store for OTP/magic-link verification challenges, used
 * only when Firestore isn't configured (e.g. a Railway test deploy with no
 * GOOGLE_CLOUD_PROJECT). Unlike the userStateCache-backed profile fields,
 * this record has no Firestore counterpart to optimistically shadow — it's
 * the *only* store when Firestore is absent, so verification would
 * otherwise be structurally impossible to complete on such a deploy (every
 * createOdooVerificationChallenge call would report failure, and
 * startOdooUserVerification would tell the user "could not start
 * verification" no matter what). Node is single-threaded and every mutation
 * below runs with no `await` in between reading and writing an entry, so
 * this is safe for a single process without needing real transactions —
 * it just isn't shared across multiple instances/replicas, same limitation
 * as userStateCache.
 */
const inMemoryVerificationChallenges = new Map();
const generateInMemoryId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
const createOdooVerificationChallengeInMemory = (params) => {
    const now = new Date();
    const ttlMinutes = Math.max(1, Math.trunc(params.ttlMinutes || Number(process.env.ODOO_VERIFY_OTP_TTL_MINUTES || 10)));
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();
    const challenge = {
        id: generateInMemoryId(),
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
    inMemoryVerificationChallenges.set(challenge.id, challenge);
    return { ok: true, data: challenge };
};
const consumeOdooVerificationByOtpInMemory = (params) => {
    const pending = Array.from(inMemoryVerificationChallenges.values())
        .filter(c => c.userId === params.userId && c.status === 'pending')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);
    if (!pending.length)
        return { ok: false, error: 'verification_not_found' };
    const newest = pending[0];
    if (newest.attemptCount >= ODOO_VERIFY_OTP_MAX_ATTEMPTS) {
        newest.status = 'expired';
        newest.updatedAt = new Date().toISOString();
        return { ok: false, error: 'verification_locked' };
    }
    const selected = pending.find(c => c.otpCode === params.otpCode);
    if (!selected) {
        newest.attemptCount += 1;
        newest.updatedAt = new Date().toISOString();
        return { ok: false, error: 'verification_invalid_otp' };
    }
    if (new Date(selected.expiresAt).getTime() <= Date.now()) {
        selected.status = 'expired';
        selected.updatedAt = new Date().toISOString();
        return { ok: false, error: 'verification_expired' };
    }
    const now = new Date().toISOString();
    selected.status = 'verified';
    selected.verifiedAt = now;
    selected.updatedAt = now;
    return { ok: true, data: { ...selected } };
};
const consumeOdooVerificationByTokenInMemory = (token) => {
    const challenge = Array.from(inMemoryVerificationChallenges.values()).find(c => c.linkToken === token);
    if (!challenge)
        return { ok: false, error: 'verification_token_not_found' };
    if (challenge.status !== 'pending')
        return { ok: false, error: 'verification_already_used' };
    if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
        challenge.status = 'expired';
        challenge.updatedAt = new Date().toISOString();
        return { ok: false, error: 'verification_expired' };
    }
    const now = new Date().toISOString();
    challenge.status = 'verified';
    challenge.verifiedAt = now;
    challenge.updatedAt = now;
    return { ok: true, data: { ...challenge } };
};
const verificationStore = (0, verification_store_1.createVerificationStore)({
    database: getDb,
    inMemoryCreate: createOdooVerificationChallengeInMemory,
    ttlMinutes: input => Math.max(1, Math.trunc(input.ttlMinutes || Number(process.env.ODOO_VERIFY_OTP_TTL_MINUTES || 10))),
});
const platformConfigRepository = (0, platform_config_1.createPlatformConfigRepository)({
    read: withFirestoreRead,
    write: withFirestoreWrite,
});
const reportStore = (0, report_store_1.createReportStore)({ write: withFirestoreWrite });
exports.saveReportLog = reportStore.save;
const toOdooVerificationChallenge = (id, raw) => (0, verification_1.parseOdooVerificationChallenge)(id, raw, core_1.toOptionalString, core_1.toPositiveInt);
const verificationConsumer = (0, verification_consume_1.createVerificationConsumer)({
    database: getDb,
    inMemoryConsumeOtp: consumeOdooVerificationByOtpInMemory,
    parse: toOdooVerificationChallenge,
    maxAttempts: ODOO_VERIFY_OTP_MAX_ATTEMPTS,
});
const verificationTokenConsumer = (0, verification_token_1.createVerificationTokenConsumer)({
    database: getDb,
    inMemoryConsume: consumeOdooVerificationByTokenInMemory,
    parse: toOdooVerificationChallenge,
});
exports.getUserLanguage = userProfileRepository.getLanguage;
exports.setUserLanguage = userProfileRepository.setLanguage;
exports.getUserProfile = userProfileRepository.getProfile;
/**
 * PDPA data-collection notice — shown once at first contact (see
 * command-router.ts). Notice-only, not a blocking consent gate: it informs
 * without adding friction to first use.
 */
exports.markConsentNoticeShown = userProfileRepository.markConsentNoticeShown;
exports.setLastActionOtpAt = userProfileRepository.setLastActionOtpAt;
exports.setMarketingOptIn = userProfileRepository.setMarketingOptIn;
/**
 * Data-subject erasure request (PDPA "right to delete"). Hard-deletes the
 * user's profile document — role, verification/Odoo link, language,
 * marketing preference, everything in `users/{userId}`. Does NOT touch the
 * append-only auditLog (a legitimate retained business record of past
 * actions, not personal-preference state) or odooVerification challenge
 * history. Returning to the bot after this creates a fresh, unverified
 * profile — that's the intended effect of erasure, not a bug.
 */
exports.deleteUserProfile = userProfileRepository.deleteProfile;
/**
 * Marketing-consent gate for multicast campaigns (src/jobs/segmentation.ts).
 * Single source of truth for "who's allowed to receive a promotional
 * message" so no campaign path can accidentally bypass the opt-in check.
 */
const filterMarketingOptedInUserIds = async (userIds) => {
    const profiles = await Promise.all(userIds.map(async (userId) => ({ userId, profile: await (0, exports.getUserProfile)(userId) })));
    return profiles.filter(({ profile }) => profile.marketingOptIn).map(({ userId }) => userId);
};
exports.filterMarketingOptedInUserIds = filterMarketingOptedInUserIds;
/**
 * Lightweight quality signal for AI-fallback replies (👍/👎 quick reply — see
 * src/line/handlers/chat-fallback.ts and src/line/handlers/feedback.ts).
 * Fire-and-forget like recordAuditEvent: never blocks or fails the reply
 * that triggered it.
 */
exports.recordChatFeedback = communicationRepository.recordChatFeedback;
exports.setUserPendingFlow = userProfileRepository.setPendingFlow;
exports.setUserRole = userProfileRepository.setRole;
exports.setUserSalesTier = userProfileRepository.setSalesTier;
exports.setUserOdooPartner = userProfileRepository.setOdooPartner;
exports.setUserOdooVerificationStatus = userProfileRepository.setVerificationStatus;
const normalizePhoneForMatch = (value) => value.replace(/[^0-9+]/g, '').trim();
/** Mirrors buildPhoneMatchVariants in odoo.ts (kept as a small local copy rather than a cross-file import, same as normalizePhone in user-verification.ts). */
const buildPhoneVariants = (phone) => {
    const cleaned = normalizePhoneForMatch(phone);
    if (!cleaned)
        return [];
    const variants = new Set([cleaned]);
    if (cleaned.startsWith('0') && cleaned.length >= 9) {
        variants.add(`+66${cleaned.slice(1)}`);
        variants.add(`66${cleaned.slice(1)}`);
    }
    else if (cleaned.startsWith('+66')) {
        variants.add(`0${cleaned.slice(3)}`);
        variants.add(cleaned.slice(1));
    }
    else if (cleaned.startsWith('66') && cleaned.length >= 10) {
        variants.add(`0${cleaned.slice(2)}`);
        variants.add(`+${cleaned}`);
    }
    return Array.from(variants);
};
/**
 * The missing link for "admin creates a quote, LINE sends it to the
 * customer's phone": LINE can only push to a userId that has already
 * messaged the OA, so this only ever finds someone who has completed
 * VERIFY themselves at least once (odooVerified === true). Returns null
 * — not an error — when nobody has verified with that phone yet; callers
 * must treat that as "customer not linked", not retry.
 */
const findVerifiedUserIdByPhone = async (phone) => {
    const variants = buildPhoneVariants(phone);
    if (!variants.length)
        return null;
    const database = getDb();
    if (database) {
        try {
            // Firestore 'in' supports up to 10 values; buildPhoneVariants never
            // produces more than 3, so a single composite query suffices.
            // Needs a composite index on (phone, odooVerified) — Firestore
            // surfaces the exact index-creation link in the error if missing.
            const snap = await database.collection('users')
                .where('phone', 'in', variants)
                .where('odooVerified', '==', true)
                .limit(1)
                .get();
            if (!snap.empty)
                return snap.docs[0].id;
        }
        catch (error) {
            logFirestoreError('findVerifiedUserIdByPhone', error);
            // Fall through to the cache below rather than failing outright —
            // e.g. this same process just verified the user and the write
            // hasn't propagated to a query-consistent read yet.
        }
    }
    // In-memory-cache fallback — also the only path when Firestore isn't
    // configured at all (Railway test deploys, see FirestoreWriteResult).
    for (const [userId, entry] of userStateCache.entries()) {
        if (!entry.state.odooVerified || !entry.state.phone)
            continue;
        if (variants.includes(normalizePhoneForMatch(entry.state.phone)))
            return userId;
    }
    return null;
};
exports.findVerifiedUserIdByPhone = findVerifiedUserIdByPhone;
exports.getPlatformConfig = platformConfigRepository.get;
exports.setPlatformConfig = platformConfigRepository.set;
const approvalStore = (0, approval_store_1.createApprovalStore)({
    database: getDb,
    write: withFirestoreWrite,
    read: withFirestoreRead,
    localRecords: approvalRecords,
    audit: async (params) => (0, exports.recordAuditEvent)({ ...params, outcome: 'success' }),
});
const auditStore = (0, audit_store_1.createAuditStore)({
    database: getDb,
    read: withFirestoreRead,
    write: withFirestoreWrite,
    normalize: core_1.toOptionalString,
    logRecorded: params => auditLogger.info('audit_event_recorded', params),
});
const saveApprovalRecord = (record, auditContext = {}) => approvalStore.save(record, auditContext.requestId);
exports.saveApprovalRecord = saveApprovalRecord;
exports.getApprovalRecord = approvalStore.get;
const transitionStoredApproval = (approvalId, transition, now = new Date(), auditContext = {}) => approvalStore.transition(approvalId, transition, now, auditContext.requestId);
exports.transitionStoredApproval = transitionStoredApproval;
exports.recordAuditEvent = auditStore.record;
exports.listRecentAuditEventsPage = auditStore.listPage;
const listRecentAuditEvents = async (limit = 50, filters = {}) => (await auditStore.listPage(limit, filters)).events;
exports.listRecentAuditEvents = listRecentAuditEvents;
exports.listAuditEventsOlderThan = auditStore.listOlderThan;
exports.deleteAuditEventsByIds = auditStore.deleteByIds;
exports.createOdooVerificationChallenge = verificationStore.create;
exports.consumeOdooVerificationByOtp = verificationConsumer.consumeOtp;
exports.consumeOdooVerificationByToken = verificationTokenConsumer.consume;
// ---------------------------------------------------------------------------
// Step-up OTP for mutating quote actions — a lighter-weight sibling of the
// Odoo verification challenge above (OTP-only, no magic link/token-index,
// since this re-proves "still you" for an already-verified user rather than
// establishing identity from scratch). Same dual Firestore/in-memory-store
// convention, same attemptCount lockout via ODOO_VERIFY_OTP_MAX_ATTEMPTS.
// ---------------------------------------------------------------------------
const ACTION_OTP_TTL_MINUTES = Number(process.env.ACTION_OTP_TTL_MINUTES || 10);
/** In-memory fallback, same not-configured-Firestore rationale as inMemoryVerificationChallenges above. */
const inMemoryActionOtpChallenges = new Map();
const createActionOtpChallengeInMemory = (params) => {
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ACTION_OTP_TTL_MINUTES * 60 * 1000).toISOString();
    const challenge = {
        id: generateInMemoryId(),
        userId: params.userId,
        channelId: params.channelId,
        otpCode: params.otpCode,
        pendingCommandText: params.pendingCommandText,
        status: 'pending',
        attemptCount: 0,
        expiresAt,
        createdAt,
        updatedAt: createdAt,
    };
    inMemoryActionOtpChallenges.set(challenge.id, challenge);
    return { ok: true, data: challenge };
};
const consumeActionOtpChallengeInMemory = (params) => {
    const pending = Array.from(inMemoryActionOtpChallenges.values())
        .filter(c => c.userId === params.userId && c.status === 'pending')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!pending.length)
        return { ok: false, error: 'action_otp_not_found' };
    const newest = pending[0];
    if (newest.attemptCount >= ODOO_VERIFY_OTP_MAX_ATTEMPTS) {
        newest.status = 'expired';
        newest.updatedAt = new Date().toISOString();
        return { ok: false, error: 'action_otp_locked' };
    }
    if (newest.otpCode !== params.otpCode) {
        newest.attemptCount += 1;
        newest.updatedAt = new Date().toISOString();
        return { ok: false, error: 'action_otp_invalid' };
    }
    if (new Date(newest.expiresAt).getTime() <= Date.now()) {
        newest.status = 'expired';
        newest.updatedAt = new Date().toISOString();
        return { ok: false, error: 'action_otp_expired' };
    }
    const now = new Date().toISOString();
    newest.status = 'verified';
    newest.updatedAt = now;
    return { ok: true, data: { ...newest } };
};
const toActionOtpChallenge = (id, raw) => (0, action_otp_1.parseActionOtpChallenge)(id, raw, core_1.toOptionalString);
const actionOtpStore = (0, action_otp_store_1.createActionOtpStore)({
    database: getDb,
    inMemoryCreate: createActionOtpChallengeInMemory,
    inMemoryConsume: consumeActionOtpChallengeInMemory,
    parse: toActionOtpChallenge,
    ttlMinutes: Math.max(1, Math.trunc(ACTION_OTP_TTL_MINUTES)),
    maxAttempts: ODOO_VERIFY_OTP_MAX_ATTEMPTS,
});
exports.createActionOtpChallenge = actionOtpStore.create;
exports.consumeActionOtpChallenge = actionOtpStore.consume;
exports.createGroupBuy = groupBuyStore.create;
exports.getGroupBuyById = groupBuyStore.getById;
exports.listGroupBuysByCreator = groupBuyStore.listByCreator;
exports.attachGroupBuyOdooOrder = groupBuyStore.attachOdooOrder;
exports.joinGroupBuy = groupBuyStore.join;
const confirmGroupBuy = (groupBuyId, actorUserId, actorIsAdmin) => groupBuyStore.updateStatus({ groupBuyId, actorUserId, actorIsAdmin, nextStatus: 'confirmed' });
exports.confirmGroupBuy = confirmGroupBuy;
const cancelGroupBuy = (groupBuyId, actorUserId, actorIsAdmin) => groupBuyStore.updateStatus({ groupBuyId, actorUserId, actorIsAdmin, nextStatus: 'cancelled' });
exports.cancelGroupBuy = cancelGroupBuy;
/**
 * Append-only audit trail for admin/privileged actions. Never blocks or
 * fails the caller's command reply — logging failures are only warned.
 */
