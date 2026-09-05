export type PendingFlowState = {
    flow: string;
    stepIndex: number;
    collected: Record<string, string>;
    expiresAt: string;
    summaryMode?: boolean;
    editingFieldIndex?: number;
};

export type FirestoreWriteResult = {
    ok: boolean;
    error?: string;
    notConfigured?: boolean;
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

export type UserLanguage = 'th' | 'en';
export type UserRole = 'admin' | 'user';

/**
 * Odoo-native tier, resolved once (best-effort) at ADMIN ENABLE time from
 * the verified partner's linked res.users security-group membership — see
 * findOdooSalesTierByPartnerId in src/services/odoo/admin.ts. This is an
 * additive refinement layered on top of `role`, never a replacement for it:
 * only ever consulted for a profile that is already `role === 'admin'`.
 * Undefined (no linked Odoo user, or one in neither Sales group) means
 * "fall back to today's plain admin behavior" — fails toward the current
 * known-good state, never toward more access.
 */
export type OdooSalesTier = 'salesperson' | 'sales_manager';

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
    consentNoticeShownAt?: string;
    marketingOptIn: boolean;
    lastActionOtpAt?: string;
    salesTier?: OdooSalesTier;
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

export type ActionOtpChallenge = {
    id: string;
    userId: string;
    channelId: string;
    otpCode: string;
    pendingCommandText: string;
    status: 'pending' | 'verified' | 'expired';
    attemptCount: number;
    expiresAt: string;
    createdAt: string;
    updatedAt: string;
};

export type ActionOtpChallengeResult = {
    ok: boolean;
    data?: ActionOtpChallenge;
    error?: string;
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
    | 'audit_rotate'
    | 'quote_create'
    | 'quote_confirm'
    | 'quote_approve'
    | 'quote_send'
    | 'verification_success'
    | 'quote_cancel'
    | 'quote_add_line'
    | 'quote_edit_line'
    | 'quote_remove_line'
    | 'quote_invoice'
    | 'quote_message'
    | 'sales_message'
    | 'group_buy_odoo_order_create'
    | 'daily_report_trigger'
    | 'segment_customers_trigger'
    | 'approval_requested'
    | 'approval_approved'
    | 'approval_rejected'
    | 'approval_expired'
    | 'approval_completed';

export type AuditOutcome = 'success' | 'failure';

export type AuditLogEntry = {
    id: string;
    action: string;
    outcome: string;
    actorUserId: string;
    channelId: string | null;
    requestId: string | null;
    targetId: string | null;
    detail: string | null;
    createdAt: string;
};

export type AuditLogPage = {
    events: AuditLogEntry[];
    nextCursor?: string;
};
