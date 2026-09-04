import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { OdooVerificationChallenge, OdooVerificationChallengeResult } from './types';

type Dependencies = {
    database: () => Firestore | null;
    inMemoryConsume: (token: string) => OdooVerificationChallengeResult;
    parse: (id: string, raw: Record<string, unknown>) => OdooVerificationChallenge;
};

export const createVerificationTokenConsumer = (dependencies: Dependencies) => ({
    consume: async (token: string): Promise<OdooVerificationChallengeResult> => {
        const database = dependencies.database();
        if (!database) return dependencies.inMemoryConsume(token);

        try {
            const result = await database.runTransaction(async transaction => {
                const tokenRef = database.collection('odooVerificationTokens').doc(token);
                const tokenSnapshot = await transaction.get(tokenRef);
                if (!tokenSnapshot.exists) throw new Error('verification_token_not_found');
                const tokenData = (tokenSnapshot.data() || {}) as Record<string, unknown>;
                const challengeId = typeof tokenData.challengeId === 'string' ? tokenData.challengeId.trim() : '';
                const status = typeof tokenData.status === 'string' ? tokenData.status : 'pending';
                const expiresAt = typeof tokenData.expiresAt === 'string' ? tokenData.expiresAt : '';
                if (!challengeId) throw new Error('verification_token_invalid');
                if (status !== 'pending') throw new Error('verification_token_already_used');
                if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) throw new Error('verification_expired');

                const challengeRef = database.collection('odooVerifications').doc(challengeId);
                const challengeSnapshot = await transaction.get(challengeRef);
                if (!challengeSnapshot.exists) throw new Error('verification_not_found');
                const challenge = dependencies.parse(challengeSnapshot.id, (challengeSnapshot.data() || {}) as Record<string, unknown>);
                if (challenge.status !== 'pending') throw new Error('verification_already_used');
                if (new Date(challenge.expiresAt).getTime() <= Date.now()) throw new Error('verification_expired');

                const now = new Date().toISOString();
                transaction.update(challengeRef, { status: 'verified', verifiedAt: now, updatedAt: now, updatedAtServer: FieldValue.serverTimestamp() });
                transaction.update(tokenRef, { status: 'verified', updatedAt: now, updatedAtServer: FieldValue.serverTimestamp() });
                return { ...challenge, status: 'verified' as const, verifiedAt: now, updatedAt: now };
            });
            return { ok: true, data: result };
        } catch (error) {
            return { ok: false, error: `Firestore consumeOdooVerificationByToken failed: ${String(error)}` };
        }
    },
});
