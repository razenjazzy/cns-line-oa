import type { ActionOtpChallengeResult } from './types';

export type ActionOtpStartInput = {
    userId: string;
    channelId: string;
    otpCode: string;
    pendingCommandText: string;
};

export type ActionOtpRepository = {
    create: (input: ActionOtpStartInput) => Promise<ActionOtpChallengeResult>;
    consume: (input: { userId: string; otpCode: string }) => Promise<ActionOtpChallengeResult>;
};

export const createActionOtpRepository = (operations: ActionOtpRepository): ActionOtpRepository => operations;
