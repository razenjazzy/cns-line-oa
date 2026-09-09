import type { LastProductContext, PendingFlowState, UserLanguage, UserProfile, UserRole } from './types';

type CachedProfileState = {
    language?: UserLanguage;
    role?: UserRole;
    odooPartnerId?: number;
    odooVerified?: boolean;
    odooVerifiedAt?: string;
    displayName?: string;
    phone?: string;
    pendingFlow?: PendingFlowState;
    lastProductContext?: LastProductContext;
    lastQuoteListFrom?: string;
    firstMessageAt?: string;
    consentNoticeShownAt?: string;
    marketingOptIn?: boolean;
    lastActionOtpAt?: string;
    salesTier?: 'salesperson' | 'sales_manager';
    salesSessionExpiresAt?: string;
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
    lastProductContext: cached.lastProductContext,
    lastQuoteListFrom: cached.lastQuoteListFrom,
    firstMessageAt: cached.firstMessageAt,
    consentNoticeShownAt: cached.consentNoticeShownAt,
    marketingOptIn: cached.marketingOptIn || false,
    lastActionOtpAt: cached.lastActionOtpAt,
    salesTier: cached.salesTier,
    salesSessionExpiresAt: cached.salesSessionExpiresAt,
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
const parseLastProductContext = (raw: unknown): LastProductContext | undefined => {
    if (!raw || typeof raw !== 'object') return undefined;
    const value = raw as Record<string, unknown>;
    if (typeof value.productId !== 'number' || typeof value.productName !== 'string' || typeof value.expiresAt !== 'string') {
        return undefined;
    }
    if (new Date(value.expiresAt).getTime() <= Date.now()) return undefined;
    return { productId: value.productId, productName: value.productName, expiresAt: value.expiresAt };
};

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
        lastProductContext: parseLastProductContext(data.lastProductContext),
        lastQuoteListFrom: typeof data.lastQuoteListFrom === 'string' ? data.lastQuoteListFrom : undefined,
        firstMessageAt: typeof data.firstMessageAt === 'string' ? data.firstMessageAt : undefined,
        consentNoticeShownAt: typeof data.consentNoticeShownAt === 'string' ? data.consentNoticeShownAt : undefined,
        marketingOptIn: data.marketingOptIn === true,
        lastActionOtpAt: typeof data.lastActionOtpAt === 'string' ? data.lastActionOtpAt : undefined,
        salesTier: data.salesTier === 'salesperson' || data.salesTier === 'sales_manager' ? data.salesTier : undefined,
        salesSessionExpiresAt: typeof data.salesSessionExpiresAt === 'string' ? data.salesSessionExpiresAt : undefined,
    };
};
