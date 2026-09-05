import { Firestore } from '@google-cloud/firestore';
import { getDefaultLanguage } from './app-config';
import { createLogger } from './logger';
import type { ApprovalRecord, ApprovalResult, ApprovalTransition } from './approval-policy';
import type { AuditLogFilters } from './audit-query';
import { toErrorMessage, toOptionalString, toPositiveInt } from './firestore/core';
import { createPlatformConfigRepository } from './firestore/platform-config';
import { createUserProfileRepository } from './firestore/user-profile-repository';
import { parseOdooVerificationChallenge } from './firestore/verification';
import { parseActionOtpChallenge } from './firestore/action-otp';
import { createActionOtpStore } from './firestore/action-otp-store';
import { createApprovalStore } from './firestore/approval-store';
import { createAuditStore } from './firestore/audit-store';
import { createGroupBuyStore } from './firestore/group-buy-store';
import { createCommunicationRepository } from './firestore/communication';
import { createVerificationStore } from './firestore/verification-store';
import { createVerificationConsumer } from './firestore/verification-consume';
import { createVerificationTokenConsumer } from './firestore/verification-token';
import { createReportStore } from './firestore/report-store';
import type {
    ActionOtpChallenge,
    ActionOtpChallengeResult,
    AuditLogEntry,
    FirestoreWriteResult,
    GroupBuyWriteResult,
    OdooVerificationChallenge,
    OdooVerificationChallengeResult,
    PendingFlowState,
    UserLanguage,
    UserRole,
} from './firestore/types';
export * from './firestore/types';

let db: Firestore | null = null;
const auditLogger = createLogger('audit');
const approvalRecords = new Map<string, ApprovalRecord>();

type CachedUserState = {
    language?: UserLanguage;
    role?: UserRole;
    odooPartnerId?: number;
    odooVerified?: boolean;
    displayName?: string;
    phone?: string;
    escalatedToHuman?: boolean;
    pendingFlow?: PendingFlowState;
    firstMessageAt?: string;
    consentNoticeShownAt?: string;
    marketingOptIn?: boolean;
    /** Last time this user completed the step-up OTP gate for a mutating quote action. */
    lastActionOtpAt?: string;
    salesTier?: 'salesperson' | 'sales_manager';
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

const logFirestoreError = (action: string, error: unknown) => {
    console.warn(`Firestore ${action} failed:`, error);
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
        // Not configured is not a failure: the caller already applied its
        // optimistic cache update, and that cache is the authoritative
        // store in this mode. Report success so callers don't treat a
        // by-design degraded mode as a broken write.
        return { ok: true, notConfigured: true, error: `Firestore ${action} skipped: Firestore not initialized` };
    }

    try {
        await operation(database);
        return { ok: true };
    } catch (error) {
        logFirestoreError(action, error);
        return { ok: false, error: `Firestore ${action} failed: ${String(error)}` };
    }
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
    // ignoreUndefinedProperties: the Firestore SDK otherwise throws on any
    // write containing an `undefined` field (found live this session —
    // clearing an optional field by setting it to `undefined` silently
    // failed the whole write and rolled the optimistic cache update back,
    // discarding real user input). Dropping the field instead — the same
    // effect merge:true already has for an omitted key — matches how every
    // write in this file is meant to behave, so this closes that entire
    // class of bug rather than just the one call site that surfaced it.
    if (credentialsJson) {
      db = new Firestore({ projectId, credentials: JSON.parse(credentialsJson), ignoreUndefinedProperties: true });
    } else {
      db = new Firestore({ projectId, ignoreUndefinedProperties: true });
    }
  } catch (error) {
    console.warn('Failed to initialize Firestore:', error);
  }
  return db;
};

const groupBuyStore = createGroupBuyStore({
    database: getDb,
    read: withFirestoreRead,
    write: withFirestoreWrite,
    toOptionalString,
    toPositiveInt,
    toErrorMessage,
});

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

const userProfileRepository = createUserProfileRepository({
    getCached: getCachedUserState,
    mergeCached: mergeCachedUserState,
    getPrevious: userId => userStateCache.get(userId),
    restorePrevious: (userId, previous) => {
        if (previous) userStateCache.set(userId, previous as CachedUserStateEntry);
        else userStateCache.delete(userId);
    },
    deleteCached: userId => userStateCache.delete(userId),
    read: withFirestoreRead,
    write: withFirestoreWrite,
    defaultLanguage: getDefaultLanguage('en'),
    pendingFlowIsActive: isPendingFlowActive,
});

const communicationRepository = createCommunicationRepository({
    read: withFirestoreRead,
    write: withFirestoreWrite,
});

export const updateUserScore = communicationRepository.updateUserScore;
export const getConversationHistory = communicationRepository.getConversationHistory;
export const saveConversationMessage = communicationRepository.saveConversationMessage;

export const getEscalationState = async (userId: string): Promise<boolean> => {
    return withFirestoreRead('getEscalationState', getCachedUserState(userId).escalatedToHuman || false, async (database) => {
        const doc = await database.collection('users').doc(userId).get();
        const escalatedToHuman = doc.data()?.escalatedToHuman || false;
        mergeCachedUserState(userId, { escalatedToHuman });
        return escalatedToHuman;
    });
};

export const setEscalationState = userProfileRepository.setEscalation;

/**
 * Records the timestamp of a user's first-ever message so the bot can open
 * the nav-button menu immediately on first contact instead of requiring a
 * command. Returns true when persisted (the write succeeded, regardless of
 * whether it was actually the first message).
 */
export const markUserFirstContact = userProfileRepository.markFirstContact;

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
const inMemoryVerificationChallenges = new Map<string, OdooVerificationChallenge>();

const generateInMemoryId = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

const createOdooVerificationChallengeInMemory = (params: {
    userId: string;
    channelId: string;
    partnerId: number;
    phone: string;
    otpCode: string;
    linkToken: string;
    ttlMinutes?: number;
}): OdooVerificationChallengeResult => {
    const now = new Date();
    const ttlMinutes = Math.max(1, Math.trunc(params.ttlMinutes || Number(process.env.ODOO_VERIFY_OTP_TTL_MINUTES || 10)));
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ttlMinutes * 60 * 1000).toISOString();

    const challenge: OdooVerificationChallenge = {
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

const consumeOdooVerificationByOtpInMemory = (params: { userId: string; otpCode: string }): OdooVerificationChallengeResult => {
    const pending = Array.from(inMemoryVerificationChallenges.values())
        .filter(c => c.userId === params.userId && c.status === 'pending')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 5);

    if (!pending.length) return { ok: false, error: 'verification_not_found' };

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

const consumeOdooVerificationByTokenInMemory = (token: string): OdooVerificationChallengeResult => {
    const challenge = Array.from(inMemoryVerificationChallenges.values()).find(c => c.linkToken === token);
    if (!challenge) return { ok: false, error: 'verification_token_not_found' };
    if (challenge.status !== 'pending') return { ok: false, error: 'verification_already_used' };
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

const verificationStore = createVerificationStore({
    database: getDb,
    inMemoryCreate: createOdooVerificationChallengeInMemory,
    ttlMinutes: input => Math.max(1, Math.trunc(input.ttlMinutes || Number(process.env.ODOO_VERIFY_OTP_TTL_MINUTES || 10))),
});
const platformConfigRepository = createPlatformConfigRepository({
    read: withFirestoreRead,
    write: withFirestoreWrite,
});
const reportStore = createReportStore({ write: withFirestoreWrite });

export const saveReportLog = reportStore.save;

const toOdooVerificationChallenge = (id: string, raw: Record<string, unknown>): OdooVerificationChallenge =>
    parseOdooVerificationChallenge(id, raw, toOptionalString, toPositiveInt);

const verificationConsumer = createVerificationConsumer({
    database: getDb,
    inMemoryConsumeOtp: consumeOdooVerificationByOtpInMemory,
    parse: toOdooVerificationChallenge,
    maxAttempts: ODOO_VERIFY_OTP_MAX_ATTEMPTS,
});
const verificationTokenConsumer = createVerificationTokenConsumer({
    database: getDb,
    inMemoryConsume: consumeOdooVerificationByTokenInMemory,
    parse: toOdooVerificationChallenge,
});
export const getUserLanguage = userProfileRepository.getLanguage;

export const setUserLanguage = userProfileRepository.setLanguage;

export const getUserProfile = userProfileRepository.getProfile;

/**
 * PDPA data-collection notice — shown once at first contact (see
 * command-router.ts). Notice-only, not a blocking consent gate: it informs
 * without adding friction to first use.
 */
export const markConsentNoticeShown = userProfileRepository.markConsentNoticeShown;

export const setLastActionOtpAt = userProfileRepository.setLastActionOtpAt;

export const setMarketingOptIn = userProfileRepository.setMarketingOptIn;

/**
 * Data-subject erasure request (PDPA "right to delete"). Hard-deletes the
 * user's profile document — role, verification/Odoo link, language,
 * marketing preference, everything in `users/{userId}`. Does NOT touch the
 * append-only auditLog (a legitimate retained business record of past
 * actions, not personal-preference state) or odooVerification challenge
 * history. Returning to the bot after this creates a fresh, unverified
 * profile — that's the intended effect of erasure, not a bug.
 */
export const deleteUserProfile = userProfileRepository.deleteProfile;

/**
 * Marketing-consent gate for multicast campaigns (src/jobs/segmentation.ts).
 * Single source of truth for "who's allowed to receive a promotional
 * message" so no campaign path can accidentally bypass the opt-in check.
 */
export const filterMarketingOptedInUserIds = async (userIds: string[]): Promise<string[]> => {
    const profiles = await Promise.all(userIds.map(async (userId) => ({ userId, profile: await getUserProfile(userId) })));
    return profiles.filter(({ profile }) => profile.marketingOptIn).map(({ userId }) => userId);
};

/**
 * Lightweight quality signal for AI-fallback replies (👍/👎 quick reply — see
 * src/line/handlers/chat-fallback.ts and src/line/handlers/feedback.ts).
 * Fire-and-forget like recordAuditEvent: never blocks or fails the reply
 * that triggered it.
 */
export const recordChatFeedback = communicationRepository.recordChatFeedback;

export const setUserPendingFlow = userProfileRepository.setPendingFlow;

export const setUserRole = userProfileRepository.setRole;

export const setUserSalesTier = userProfileRepository.setSalesTier;

export const setUserOdooPartner = userProfileRepository.setOdooPartner;

export const setUserOdooVerificationStatus = userProfileRepository.setVerificationStatus;

const normalizePhoneForMatch = (value: string): string => value.replace(/[^0-9+]/g, '').trim();

/** Mirrors buildPhoneMatchVariants in odoo.ts (kept as a small local copy rather than a cross-file import, same as normalizePhone in user-verification.ts). */
const buildPhoneVariants = (phone: string): string[] => {
    const cleaned = normalizePhoneForMatch(phone);
    if (!cleaned) return [];

    const variants = new Set<string>([cleaned]);
    if (cleaned.startsWith('0') && cleaned.length >= 9) {
        variants.add(`+66${cleaned.slice(1)}`);
        variants.add(`66${cleaned.slice(1)}`);
    } else if (cleaned.startsWith('+66')) {
        variants.add(`0${cleaned.slice(3)}`);
        variants.add(cleaned.slice(1));
    } else if (cleaned.startsWith('66') && cleaned.length >= 10) {
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
export const findVerifiedUserIdByPhone = async (phone: string): Promise<string | null> => {
    const variants = buildPhoneVariants(phone);
    if (!variants.length) return null;

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
            if (!snap.empty) return snap.docs[0].id;
        } catch (error) {
            logFirestoreError('findVerifiedUserIdByPhone', error);
            // Fall through to the cache below rather than failing outright —
            // e.g. this same process just verified the user and the write
            // hasn't propagated to a query-consistent read yet.
        }
    }

    // In-memory-cache fallback — also the only path when Firestore isn't
    // configured at all (Railway test deploys, see FirestoreWriteResult).
    for (const [userId, entry] of userStateCache.entries()) {
        if (!entry.state.odooVerified || !entry.state.phone) continue;
        if (variants.includes(normalizePhoneForMatch(entry.state.phone))) return userId;
    }
    return null;
};

export const getPlatformConfig = platformConfigRepository.get;
export const setPlatformConfig = platformConfigRepository.set;

const approvalStore = createApprovalStore({
    database: getDb,
    write: withFirestoreWrite,
    read: withFirestoreRead,
    localRecords: approvalRecords,
    audit: async params => recordAuditEvent({ ...params, outcome: 'success' }),
});

const auditStore = createAuditStore({
    database: getDb,
    read: withFirestoreRead,
    write: withFirestoreWrite,
    normalize: toOptionalString,
    logRecorded: params => auditLogger.info('audit_event_recorded', params),
});

export const saveApprovalRecord = (record: ApprovalRecord, auditContext: { requestId?: string } = {}): Promise<FirestoreWriteResult> =>
    approvalStore.save(record, auditContext.requestId);

export const getApprovalRecord = approvalStore.get;

export const transitionStoredApproval = (
    approvalId: string,
    transition: ApprovalTransition,
    now = new Date(),
    auditContext: { requestId?: string } = {},
): Promise<ApprovalResult> => approvalStore.transition(approvalId, transition, now, auditContext.requestId);

export const recordAuditEvent = auditStore.record;
export const listRecentAuditEventsPage = auditStore.listPage;
export const listRecentAuditEvents = async (limit: number = 50, filters: AuditLogFilters = {}): Promise<AuditLogEntry[]> =>
    (await auditStore.listPage(limit, filters)).events;
export const listAuditEventsOlderThan = auditStore.listOlderThan;
export const deleteAuditEventsByIds = auditStore.deleteByIds;

export const createOdooVerificationChallenge = verificationStore.create;

export const consumeOdooVerificationByOtp = verificationConsumer.consumeOtp;

export const consumeOdooVerificationByToken = verificationTokenConsumer.consume;

// ---------------------------------------------------------------------------
// Step-up OTP for mutating quote actions — a lighter-weight sibling of the
// Odoo verification challenge above (OTP-only, no magic link/token-index,
// since this re-proves "still you" for an already-verified user rather than
// establishing identity from scratch). Same dual Firestore/in-memory-store
// convention, same attemptCount lockout via ODOO_VERIFY_OTP_MAX_ATTEMPTS.
// ---------------------------------------------------------------------------

const ACTION_OTP_TTL_MINUTES = Number(process.env.ACTION_OTP_TTL_MINUTES || 10);
/** In-memory fallback, same not-configured-Firestore rationale as inMemoryVerificationChallenges above. */
const inMemoryActionOtpChallenges = new Map<string, ActionOtpChallenge>();

const createActionOtpChallengeInMemory = (params: { userId: string; channelId: string; otpCode: string; pendingCommandText: string }): ActionOtpChallengeResult => {
    const now = new Date();
    const createdAt = now.toISOString();
    const expiresAt = new Date(now.getTime() + ACTION_OTP_TTL_MINUTES * 60 * 1000).toISOString();
    const challenge: ActionOtpChallenge = {
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

const consumeActionOtpChallengeInMemory = (params: { userId: string; otpCode: string }): ActionOtpChallengeResult => {
    const pending = Array.from(inMemoryActionOtpChallenges.values())
        .filter(c => c.userId === params.userId && c.status === 'pending')
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    if (!pending.length) return { ok: false, error: 'action_otp_not_found' };

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

const toActionOtpChallenge = (id: string, raw: Record<string, unknown>): ActionOtpChallenge =>
    parseActionOtpChallenge(id, raw, toOptionalString);

const actionOtpStore = createActionOtpStore({
    database: getDb,
    inMemoryCreate: createActionOtpChallengeInMemory,
    inMemoryConsume: consumeActionOtpChallengeInMemory,
    parse: toActionOtpChallenge,
    ttlMinutes: Math.max(1, Math.trunc(ACTION_OTP_TTL_MINUTES)),
    maxAttempts: ODOO_VERIFY_OTP_MAX_ATTEMPTS,
});

export const createActionOtpChallenge = actionOtpStore.create;

export const consumeActionOtpChallenge = actionOtpStore.consume;

export const createGroupBuy = groupBuyStore.create;

export const getGroupBuyById = groupBuyStore.getById;

export const listGroupBuysByCreator = groupBuyStore.listByCreator;
export const attachGroupBuyOdooOrder = groupBuyStore.attachOdooOrder;

export const joinGroupBuy = groupBuyStore.join;

export const confirmGroupBuy = (groupBuyId: string, actorUserId: string, actorIsAdmin: boolean): Promise<GroupBuyWriteResult> =>
    groupBuyStore.updateStatus({ groupBuyId, actorUserId, actorIsAdmin, nextStatus: 'confirmed' });

export const cancelGroupBuy = (groupBuyId: string, actorUserId: string, actorIsAdmin: boolean): Promise<GroupBuyWriteResult> =>
    groupBuyStore.updateStatus({ groupBuyId, actorUserId, actorIsAdmin, nextStatus: 'cancelled' });

/**
 * Append-only audit trail for admin/privileged actions. Never blocks or
 * fails the caller's command reply — logging failures are only warned.
 */
