import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { FirestoreWriteResult } from './types';

type PlatformConfigDependencies = {
    read: <T>(action: string, fallback: T, operation: (database: Firestore) => Promise<T>) => Promise<T>;
    write: (action: string, operation: (database: Firestore) => Promise<void>) => Promise<FirestoreWriteResult>;
};

const collectionName = 'platformConfig';

export const createPlatformConfigRepository = (dependencies: PlatformConfigDependencies) => ({
    get: async <T = Record<string, unknown>>(key: string): Promise<T | null> => {
        const normalizedKey = key.trim();
        if (!normalizedKey) return null;

        return dependencies.read('getPlatformConfig', null, async (database) => {
            const snapshot = await database.collection(collectionName).doc(normalizedKey).get();
            if (!snapshot.exists) return null;

            const raw = (snapshot.data() || {}) as Record<string, unknown>;
            if (!raw.value || typeof raw.value !== 'object') return null;
            return raw.value as T;
        });
    },

    set: async (key: string, value: Record<string, unknown>): Promise<FirestoreWriteResult> => {
        const normalizedKey = key.trim();
        if (!normalizedKey) {
            return { ok: false, error: 'Firestore setPlatformConfig failed: key is required' };
        }

        return dependencies.write('setPlatformConfig', async (database) => {
            await database.collection(collectionName).doc(normalizedKey).set({
                key: normalizedKey,
                value,
                updatedAt: new Date().toISOString(),
                updatedAtServer: FieldValue.serverTimestamp(),
            }, { merge: true });
        });
    },
});
