import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { ActionOtpChallenge, ActionOtpChallengeResult } from './types';
import type { ActionOtpStartInput } from './action-otp-contract';

type Dependencies = {
    database: () => Firestore | null;
    inMemoryCreate: (input: ActionOtpStartInput) => ActionOtpChallengeResult;
    inMemoryConsume: (input: { userId: string; otpCode: string }) => ActionOtpChallengeResult;
    parse: (id: string, raw: Record<string, unknown>) => ActionOtpChallenge;
    ttlMinutes: number;
    maxAttempts: number;
};

export const createActionOtpStore = (dependencies: Dependencies) => ({
    create: async (params: ActionOtpStartInput): Promise<ActionOtpChallengeResult> => {
        const database = dependencies.database();
        if (!database) return dependencies.inMemoryCreate(params);
        try {
            const now = new Date();
            const createdAt = now.toISOString();
            const expiresAt = new Date(now.getTime() + dependencies.ttlMinutes * 60 * 1000).toISOString();
            const reference = database.collection('actionOtpChallenges').doc();
            const challenge: ActionOtpChallenge = {
                id: reference.id,
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
            await reference.set({ ...challenge, createdAtServer: FieldValue.serverTimestamp(), updatedAtServer: FieldValue.serverTimestamp() });
            return { ok: true, data: challenge };
        } catch (error) {
            return { ok: false, error: `Firestore createActionOtpChallenge failed: ${String(error)}` };
        }
    },

    consume: async (params: { userId: string; otpCode: string }): Promise<ActionOtpChallengeResult> => {
        const database = dependencies.database();
        if (!database) return dependencies.inMemoryConsume(params);
        try {
            const result = await database.runTransaction(async transaction => {
                const query = database.collection('actionOtpChallenges')
                    .where('userId', '==', params.userId)
                    .where('status', '==', 'pending')
                    .orderBy('createdAt', 'desc')
                    .limit(1);
                const pending = await transaction.get(query);
                if (pending.empty) throw new Error('action_otp_not_found');
                const document = pending.docs[0];
                const challenge = dependencies.parse(document.id, (document.data() || {}) as Record<string, unknown>);
                if (challenge.attemptCount >= dependencies.maxAttempts) {
                    transaction.update(document.ref, { status: 'expired', updatedAt: new Date().toISOString(), updatedAtServer: FieldValue.serverTimestamp() });
                    throw new Error('action_otp_locked');
                }
                if (challenge.otpCode !== params.otpCode) {
                    transaction.update(document.ref, { attemptCount: FieldValue.increment(1), updatedAt: new Date().toISOString(), updatedAtServer: FieldValue.serverTimestamp() });
                    throw new Error('action_otp_invalid');
                }
                if (new Date(challenge.expiresAt).getTime() <= Date.now()) {
                    transaction.update(document.ref, { status: 'expired', updatedAt: new Date().toISOString(), updatedAtServer: FieldValue.serverTimestamp() });
                    throw new Error('action_otp_expired');
                }
                const now = new Date().toISOString();
                transaction.update(document.ref, { status: 'verified', updatedAt: now, updatedAtServer: FieldValue.serverTimestamp() });
                return { ...challenge, status: 'verified' as const, updatedAt: now };
            });
            return { ok: true, data: result };
        } catch (error) {
            return { ok: false, error: `Firestore consumeActionOtpChallenge failed: ${error instanceof Error ? error.message : String(error)}` };
        }
    },
});
