import type { Firestore } from '@google-cloud/firestore';
import { buildFallbackUserProfile, parseStoredUserProfile } from './user-profile';
import type { PendingFlowState, UserLanguage, UserProfile, UserRole } from './types';

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
    lastActionOtpAt?: string;
    salesTier?: 'salesperson' | 'sales_manager';
};

type RepositoryDependencies = {
    getCached: (userId: string) => CachedUserState;
    mergeCached: (userId: string, patch: CachedUserState) => CachedUserState;
    getPrevious: (userId: string) => unknown;
    restorePrevious: (userId: string, previous: unknown) => void;
    deleteCached: (userId: string) => void;
    read: <T>(action: string, fallback: T, operation: (database: Firestore) => Promise<T>) => Promise<T>;
    write: (action: string, operation: (database: Firestore) => Promise<void>) => Promise<{ ok: boolean; error?: string; notConfigured?: boolean }>;
    defaultLanguage: UserLanguage;
    pendingFlowIsActive: (pendingFlow: PendingFlowState | undefined | null) => pendingFlow is PendingFlowState;
};

export const createUserProfileRepository = (dependencies: RepositoryDependencies) => ({
    getLanguage: async (userId: string): Promise<UserLanguage> => dependencies.read(
        'getUserLanguage',
        dependencies.getCached(userId).language || dependencies.defaultLanguage,
        async database => {
            const doc = await database.collection('users').doc(userId).get();
            const language = doc.data()?.language === 'th' ? 'th' : 'en';
            dependencies.mergeCached(userId, { language });
            return language;
        },
    ),

    setLanguage: async (userId: string, language: UserLanguage) => {
        const previous = dependencies.getPrevious(userId);
        dependencies.mergeCached(userId, { language });
        const result = await dependencies.write('setUserLanguage', async database => {
            await database.collection('users').doc(userId).set({ language }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result;
    },

    getProfile: async (userId: string): Promise<UserProfile> => {
        const fallback = buildFallbackUserProfile(
            dependencies.getCached(userId),
            dependencies.pendingFlowIsActive,
            dependencies.defaultLanguage,
        );
        return dependencies.read('getUserProfile', fallback, async database => {
            const doc = await database.collection('users').doc(userId).get();
            const profile = parseStoredUserProfile((doc.data() || {}) as Record<string, unknown>, dependencies.pendingFlowIsActive);
            dependencies.mergeCached(userId, profile);
            return profile;
        });
    },

    setEscalation: async (userId: string, escalated: boolean) => {
        const previous = dependencies.getPrevious(userId);
        dependencies.mergeCached(userId, { escalatedToHuman: escalated });
        const result = await dependencies.write('setEscalationState', async database => {
            await database.collection('users').doc(userId).set({ escalatedToHuman: escalated }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result;
    },

    markFirstContact: async (userId: string): Promise<boolean> => {
        const previous = dependencies.getPrevious(userId);
        const firstMessageAt = new Date().toISOString();
        dependencies.mergeCached(userId, { firstMessageAt });
        const result = await dependencies.write('markUserFirstContact', async database => {
            await database.collection('users').doc(userId).set({ firstMessageAt }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result.ok;
    },

    markConsentNoticeShown: async (userId: string): Promise<boolean> => {
        const previous = dependencies.getPrevious(userId);
        const consentNoticeShownAt = new Date().toISOString();
        dependencies.mergeCached(userId, { consentNoticeShownAt });
        const result = await dependencies.write('markConsentNoticeShown', async database => {
            await database.collection('users').doc(userId).set({ consentNoticeShownAt }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result.ok;
    },

    setLastActionOtpAt: async (userId: string): Promise<boolean> => {
        const previous = dependencies.getPrevious(userId);
        const lastActionOtpAt = new Date().toISOString();
        dependencies.mergeCached(userId, { lastActionOtpAt });
        const result = await dependencies.write('setLastActionOtpAt', async database => {
            await database.collection('users').doc(userId).set({ lastActionOtpAt }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result.ok;
    },

    setMarketingOptIn: async (userId: string, optIn: boolean) => {
        const previous = dependencies.getPrevious(userId);
        dependencies.mergeCached(userId, { marketingOptIn: optIn });
        const result = await dependencies.write('setMarketingOptIn', async database => {
            await database.collection('users').doc(userId).set({ marketingOptIn: optIn }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result;
    },

    deleteProfile: async (userId: string) => {
        dependencies.deleteCached(userId);
        return dependencies.write('deleteUserProfile', async database => {
            await database.collection('users').doc(userId).delete();
        });
    },

    setPendingFlow: async (userId: string, pendingFlow: PendingFlowState | null) => {
        const previous = dependencies.getPrevious(userId);
        dependencies.mergeCached(userId, { pendingFlow: pendingFlow || undefined });
        // Firestore's `.set(data, {merge: true})` merges a nested map
        // field-by-field rather than replacing it wholesale — omitting
        // editingFieldIndex here (rather than explicitly nulling it) would
        // leave whatever was previously stored there untouched, so a
        // caller that means to clear it (see command-router.ts's
        // pendingWithoutEditingField) would silently have that clear
        // dropped on the next read from a cold cache. Same null-as-clear
        // convention setSalesTier already uses.
        const pendingFlowForWrite = pendingFlow
            ? { ...pendingFlow, editingFieldIndex: pendingFlow.editingFieldIndex ?? null }
            : pendingFlow;
        const result = await dependencies.write('setUserPendingFlow', async database => {
            await database.collection('users').doc(userId).set({ pendingFlow: pendingFlowForWrite }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result;
    },

    setRole: async (userId: string, role: UserRole) => {
        const previous = dependencies.getPrevious(userId);
        dependencies.mergeCached(userId, { role });
        const result = await dependencies.write('setUserRole', async database => {
            await database.collection('users').doc(userId).set({ role }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result;
    },

    /**
     * Odoo-native tier, resolved best-effort at ADMIN ENABLE time — see
     * findOdooSalesTierByPartnerId. Additive on top of `role`; never called
     * for a non-admin profile. Pass `undefined` to clear it back to the
     * fallback (plain admin behavior), e.g. on ADMIN DISABLE.
     */
    setSalesTier: async (userId: string, salesTier: 'salesperson' | 'sales_manager' | undefined) => {
        const previous = dependencies.getPrevious(userId);
        dependencies.mergeCached(userId, { salesTier });
        const result = await dependencies.write('setUserSalesTier', async database => {
            await database.collection('users').doc(userId).set({ salesTier: salesTier ?? null }, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result;
    },

    setOdooPartner: async (userId: string, partnerId: number, displayName?: string, phone?: string) => {
        const previous = dependencies.getPrevious(userId);
        const patch = {
            odooPartnerId: partnerId,
            ...(displayName ? { displayName } : {}),
            ...(phone ? { phone } : {}),
        };
        dependencies.mergeCached(userId, patch);
        const result = await dependencies.write('setUserOdooPartner', async database => {
            await database.collection('users').doc(userId).set(patch, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result;
    },

    setVerificationStatus: async (userId: string, verified: boolean, verifiedAt?: string) => {
        const previous = dependencies.getPrevious(userId);
        const patch = { odooVerified: verified, ...(verifiedAt ? { odooVerifiedAt: verifiedAt } : {}) };
        dependencies.mergeCached(userId, patch);
        const result = await dependencies.write('setUserOdooVerificationStatus', async database => {
            await database.collection('users').doc(userId).set(patch, { merge: true });
        });
        if (!result.ok) dependencies.restorePrevious(userId, previous);
        return result;
    },
});
