import { FieldValue, type Firestore } from '@google-cloud/firestore';
import type { FirestoreWriteResult } from './types';

type Dependencies = {
    write: (action: string, operation: (database: Firestore) => Promise<void>) => Promise<FirestoreWriteResult>;
};

export const createReportStore = (dependencies: Dependencies) => ({
    save: async (reportId: string, data: Record<string, unknown>): Promise<FirestoreWriteResult> => {
        return dependencies.write('saveReportLog', async database => {
            await database.collection('reports').doc(reportId).set({
                ...data,
                createdAt: FieldValue.serverTimestamp(),
            });
        });
    },
});
