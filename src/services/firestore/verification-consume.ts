import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { OdooVerificationChallenge, OdooVerificationChallengeResult } from './types';

type Dependencies = {
    database: () => Firestore | null;
    inMemoryConsumeOtp: (input: { userId: string; otpCode: string }) => OdooVerificationChallengeResult;
    parse: (id: string, raw: Record<string, unknown>) => OdooVerificationChallenge;
    maxAttempts: number;
};

export const createVerificationConsumer = (dependencies: Dependencies) => ({
    consumeOtp: async (params: { userId: string; otpCode: string }): Promise<OdooVerificationChallengeResult> => {
        const database = dependencies.database();
        if (!database) return dependencies.inMemoryConsumeOtp(params);

        try {
            const result = await database.runTransaction(async transaction => {
                const query = database.collection('odooVerifications')
                    .where('userId', '==', params.userId)
                    .where('status', '==', 'pending')
                    .orderBy('createdAt', 'desc')
                    .limit(5);
                const pending = await transaction.get(query);
                if (pending.empty) throw new Error('verification_not_found');

                const newest = pending.docs[0];
                const newestChallenge = dependencies.parse(newest.id, (newest.data() || {}) as Record<string, unknown>);
                if (newestChallenge.attemptCount >= dependencies.maxAttempts) {
                    transaction.update(newest.ref, { status: 'expired', updatedAt: new Date().toISOString(), updatedAtServer: FieldValue.serverTimestamp() });
                    throw new Error('verification_locked');
                }

                let selectedRef: typeof newest | null = null;
                let selected: OdooVerificationChallenge | null = null;
                for (const document of pending.docs) {
                    const challenge = dependencies.parse(document.id, (document.data() || {}) as Record<string, unknown>);
                    if (challenge.otpCode === params.otpCode) {
                        selectedRef = document;
                        selected = challenge;
                        break;
                    }
                }

                if (!selectedRef || !selected) {
                    transaction.update(newest.ref, { attemptCount: FieldValue.increment(1), updatedAt: new Date().toISOString(), updatedAtServer: FieldValue.serverTimestamp() });
                    throw new Error('verification_invalid_otp');
                }
                if (new Date(selected.expiresAt).getTime() <= Date.now()) {
                    transaction.update(selectedRef.ref, { status: 'expired', updatedAt: new Date().toISOString(), updatedAtServer: FieldValue.serverTimestamp() });
                    throw new Error('verification_expired');
                }

                const now = new Date().toISOString();
                transaction.update(selectedRef.ref, { status: 'verified', verifiedAt: now, updatedAt: now, updatedAtServer: FieldValue.serverTimestamp() });
                transaction.set(database.collection('odooVerificationTokens').doc(selected.linkToken), { status: 'verified', updatedAt: now, updatedAtServer: FieldValue.serverTimestamp() }, { merge: true });
                return { ...selected, status: 'verified' as const, verifiedAt: now, updatedAt: now };
            });
            return { ok: true, data: result };
        } catch (error) {
            return { ok: false, error: `Firestore consumeOdooVerificationByOtp failed: ${String(error)}` };
        }
    },
});

export type VerificationConsumeDependencies = Dependencies;
