import type { OdooVerificationChallengeResult } from './types';

export type VerificationStartInput = {
    userId: string;
    channelId: string;
    partnerId: number;
    phone: string;
    otpCode: string;
    linkToken: string;
    ttlMinutes?: number;
};

export type VerificationRepository = {
    create: (input: VerificationStartInput) => Promise<OdooVerificationChallengeResult>;
    consumeOtp: (input: { userId: string; otpCode: string }) => Promise<OdooVerificationChallengeResult>;
    consumeToken: (token: string) => Promise<OdooVerificationChallengeResult>;
    findVerifiedUserIdByPhone: (phone: string) => Promise<string | null>;
};

export const createVerificationRepository = (operations: VerificationRepository): VerificationRepository => operations;
