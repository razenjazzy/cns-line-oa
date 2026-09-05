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

export const parseStoredUserProfile = (
    data: Record<string, unknown>,
    isPendingFlowActive: PendingFlowPredicate,
): UserProfile => {
    const rawPendingFlow = data.pendingFlow as PendingFlowState | undefined;
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
