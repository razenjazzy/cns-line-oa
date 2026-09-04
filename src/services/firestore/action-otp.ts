import type { ActionOtpChallenge } from './types';

type StringNormalizer = (value: unknown) => string | undefined;

export const parseActionOtpChallenge = (
    id: string,
    raw: Record<string, unknown>,
    toOptionalString: StringNormalizer,
): ActionOtpChallenge => {
    const statusRaw = toOptionalString(raw.status);
    const status: 'pending' | 'verified' | 'expired' = statusRaw === 'verified' || statusRaw === 'expired' ? statusRaw : 'pending';
    return {
        id,
        userId: toOptionalString(raw.userId) || '',
        channelId: toOptionalString(raw.channelId) || 'default',
        otpCode: toOptionalString(raw.otpCode) || '',
        pendingCommandText: toOptionalString(raw.pendingCommandText) || '',
        status,
        attemptCount: Math.max(0, Math.trunc(typeof raw.attemptCount === 'number' ? raw.attemptCount : 0)),
        expiresAt: toOptionalString(raw.expiresAt) || new Date(0).toISOString(),
        createdAt: toOptionalString(raw.createdAt) || new Date(0).toISOString(),
        updatedAt: toOptionalString(raw.updatedAt) || new Date(0).toISOString(),
    };
};
