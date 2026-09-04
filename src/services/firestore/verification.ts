import type { OdooVerificationChallenge } from './types';

type StringNormalizer = (value: unknown) => string | undefined;
type PositiveIntNormalizer = (value: unknown, fallback: number) => number;

export const parseOdooVerificationChallenge = (
    id: string,
    raw: Record<string, unknown>,
    toOptionalString: StringNormalizer,
    toPositiveInt: PositiveIntNormalizer,
): OdooVerificationChallenge => {
    const statusRaw = toOptionalString(raw.status);
    const status: 'pending' | 'verified' | 'expired' = statusRaw === 'verified' || statusRaw === 'expired' ? statusRaw : 'pending';
    const createdAt = toOptionalString(raw.createdAt) || new Date(0).toISOString();
    const updatedAt = toOptionalString(raw.updatedAt) || createdAt;

    return {
        id,
        userId: toOptionalString(raw.userId) || '',
        channelId: toOptionalString(raw.channelId) || 'default',
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
