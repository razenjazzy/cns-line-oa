import type { PendingFlowState, UserLanguage, UserProfile, UserRole } from './types';

type CachedProfileState = {
    language?: UserLanguage;
    role?: UserRole;
    odooPartnerId?: number;
    odooVerified?: boolean;
    odooVerifiedAt?: string;
    displayName?: string;
    phone?: string;
    pendingFlow?: PendingFlowState;
    firstMessageAt?: string;
    consentNoticeShownAt?: string;
    marketingOptIn?: boolean;
    lastActionOtpAt?: string;
    salesTier?: 'salesperson' | 'sales_manager';
};

type PendingFlowPredicate = (pendingFlow: PendingFlowState | undefined | null) => pendingFlow is PendingFlowState;

export const buildFallbackUserProfile = (
    cached: CachedProfileState,
    isPendingFlowActive: PendingFlowPredicate,
    defaultLanguage: UserLanguage,
): UserProfile => ({
    language: cached.language || defaultLanguage,
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
    lastActionOtpAt: cached.lastActionOtpAt,
    salesTier: cached.salesTier,
});

/**
 * Firestore's `.set(data, {merge: true})` merges nested map fields
 * field-by-field rather than replacing them wholesale — a write that omits
 * `editingFieldIndex` (rather than explicitly nulling it) leaves whatever
 * was already stored there untouched. src/line/command-router.ts now
 * writes `editingFieldIndex: null` to actually clear it (the same
 * null-as-clear-marker convention `salesTier` already uses), so this reads
 * that back as "not editing" rather than passing a stale index through.
 */
const sanitizePendingFlow = (raw: PendingFlowState | undefined): PendingFlowState | undefined => {
    if (!raw) return raw;
    if (typeof raw.editingFieldIndex !== 'number') {
        const { editingFieldIndex: _ignored, ...rest } = raw;
        return rest;
    }
    return raw;
};

export const parseStoredUserProfile = (
    data: Record<string, unknown>,
    isPendingFlowActive: PendingFlowPredicate,
): UserProfile => {
    const rawPendingFlow = sanitizePendingFlow(data.pendingFlow as PendingFlowState | undefined);
    return {
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
        lastActionOtpAt: typeof data.lastActionOtpAt === 'string' ? data.lastActionOtpAt : undefined,
        salesTier: data.salesTier === 'salesperson' || data.salesTier === 'sales_manager' ? data.salesTier : undefined,
    };
};
