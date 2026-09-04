import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { OdooVerificationChallenge, OdooVerificationChallengeResult } from './types';
import type { VerificationStartInput } from './verification-contract';

type Dependencies = {
    database: () => Firestore | null;
    inMemoryCreate: (input: VerificationStartInput) => OdooVerificationChallengeResult;
    ttlMinutes: (input: VerificationStartInput) => number;
};

export const createVerificationStore = (dependencies: Dependencies) => ({
    create: async (params: VerificationStartInput): Promise<OdooVerificationChallengeResult> => {
        const database = dependencies.database();
        if (!database) return dependencies.inMemoryCreate(params);

        try {
            const now = new Date();
            const createdAt = now.toISOString();
            const expiresAt = new Date(now.getTime() + dependencies.ttlMinutes(params) * 60 * 1000).toISOString();
            const challengeRef = database.collection('odooVerifications').doc();
            const challenge: OdooVerificationChallenge = {
                id: challengeRef.id,
                userId: params.userId,
                channelId: params.channelId,
                partnerId: params.partnerId,
                phone: params.phone,
                otpCode: params.otpCode,
                linkToken: params.linkToken,
                status: 'pending',
                attemptCount: 0,
                expiresAt,
                createdAt,
                updatedAt: createdAt,
            };
            const tokenRef = database.collection('odooVerificationTokens').doc(params.linkToken);

            await database.runTransaction(async transaction => {
                transaction.set(challengeRef, {
                    ...challenge,
                    createdAtServer: FieldValue.serverTimestamp(),
                    updatedAtServer: FieldValue.serverTimestamp(),
                });
                transaction.set(tokenRef, {
                    challengeId: challenge.id,
                    userId: params.userId,
                    status: 'pending',
                    expiresAt,
                    createdAt,
                    updatedAt: createdAt,
                    createdAtServer: FieldValue.serverTimestamp(),
                    updatedAtServer: FieldValue.serverTimestamp(),
                });
            });
            return { ok: true, data: challenge };
        } catch (error) {
            return { ok: false, error: `Firestore createOdooVerificationChallenge failed: ${String(error)}` };
        }
    },
});
