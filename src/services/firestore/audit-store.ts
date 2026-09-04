import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { encodeAuditCursor, matchesAuditLogFilters, type AuditLogFilters } from '../audit-query';
import { parseAuditLogEntry } from './audit';
import type { AuditAction, AuditLogEntry, AuditLogPage, AuditOutcome, FirestoreWriteResult } from './types';

type Dependencies = {
    database: () => Firestore | null;
    read: <T>(action: string, fallback: T, operation: (database: Firestore) => Promise<T>) => Promise<T>;
    write: (action: string, operation: (database: Firestore) => Promise<void>) => Promise<FirestoreWriteResult>;
    normalize: (value: unknown) => string | undefined;
    logRecorded: (params: { action: AuditAction; outcome: AuditOutcome; actorUserId: string; channelId?: string; hasTarget: boolean }) => void;
};

const collectionName = 'auditLog';

export const createAuditStore = (dependencies: Dependencies) => ({
    record: async (params: { action: AuditAction; outcome: AuditOutcome; actorUserId: string; channelId?: string; requestId?: string; targetId?: string; detail?: string }): Promise<void> => {
        const database = dependencies.database();
        if (!database) return;
        try {
            await database.collection(collectionName).add({
                action: params.action,
                outcome: params.outcome,
                actorUserId: params.actorUserId,
                channelId: params.channelId || null,
                requestId: params.requestId || null,
                targetId: params.targetId || null,
                detail: params.detail || null,
                createdAt: new Date().toISOString(),
                createdAtServer: FieldValue.serverTimestamp(),
            });
            dependencies.logRecorded({ action: params.action, outcome: params.outcome, actorUserId: params.actorUserId, channelId: params.channelId, hasTarget: Boolean(params.targetId) });
        } catch {
            return;
        }
    },

    listPage: async (limit = 50, filters: AuditLogFilters = {}, cursor?: string): Promise<AuditLogPage> => dependencies.read('listRecentAuditEvents', { events: [], nextCursor: undefined }, async database => {
        const boundedLimit = Math.min(Math.max(limit, 1), 200);
        let query = database.collection(collectionName).orderBy('createdAt', 'desc');
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.limit(boundedLimit).get();
        const events = snapshot.docs.map(document => parseAuditLogEntry(document, dependencies.normalize)).filter(entry => matchesAuditLogFilters(entry, filters));
        const lastCreatedAt = snapshot.docs.at(-1)?.data()?.createdAt;
        return {
            events,
            nextCursor: typeof lastCreatedAt === 'string' && snapshot.docs.length === boundedLimit ? encodeAuditCursor(lastCreatedAt) : undefined,
        };
    }),

    listOlderThan: async (cutoffIso: string, limit: number): Promise<AuditLogEntry[]> => dependencies.read('listAuditEventsOlderThan', [], async database => {
        const snapshot = await database.collection(collectionName).where('createdAt', '<', cutoffIso).orderBy('createdAt', 'asc').limit(Math.min(Math.max(limit, 1), 500)).get();
        return snapshot.docs.map(document => parseAuditLogEntry(document, dependencies.normalize));
    }),

    deleteByIds: async (ids: string[]): Promise<FirestoreWriteResult> => {
        if (!ids.length) return { ok: true };
        return dependencies.write('deleteAuditEventsByIds', async database => {
            const batch = database.batch();
            for (const id of ids) batch.delete(database.collection(collectionName).doc(id));
            await batch.commit();
        });
    },
});
