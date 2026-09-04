import { type Firestore } from '@google-cloud/firestore';
import { isApprovalRecord, transitionApproval, type ApprovalRecord, type ApprovalResult, type ApprovalTransition } from '../approval-policy';
import type { FirestoreWriteResult } from './types';

type Dependencies = {
    database: () => Firestore | null;
    write: (action: string, operation: (database: Firestore) => Promise<void>) => Promise<FirestoreWriteResult>;
    read: <T>(action: string, fallback: T, operation: (database: Firestore) => Promise<T>) => Promise<T>;
    localRecords: Map<string, ApprovalRecord>;
    audit: (params: { action: 'approval_requested' | 'approval_approved' | 'approval_rejected' | 'approval_expired' | 'approval_completed'; actorUserId: string; channelId?: string; requestId?: string; targetId?: string; detail?: string }) => Promise<void>;
};

const collectionName = 'approvals';

export const createApprovalStore = (dependencies: Dependencies) => {
    const auditTransition = (record: ApprovalRecord, transition: ApprovalTransition, requestId?: string): Promise<void> => {
        const action = transition.type === 'approve'
            ? 'approval_approved'
            : transition.type === 'reject'
                ? 'approval_rejected'
                : transition.type === 'expire'
                    ? 'approval_expired'
                    : 'approval_completed';
        const actorUserId = transition.type === 'approve' || transition.type === 'reject'
            ? transition.approverUserId
            : record.actorUserId;
        return dependencies.audit({
            action,
            actorUserId,
            channelId: record.channelId,
            requestId,
            targetId: record.targetId,
            detail: `approvalId=${record.id};command=${record.commandId}`,
        });
    };

    return {
        save: async (record: ApprovalRecord, requestId?: string): Promise<FirestoreWriteResult> => {
            const previous = dependencies.localRecords.get(record.id);
            dependencies.localRecords.set(record.id, { ...record });
            const result = await dependencies.write('saveApprovalRecord', async database => {
                await database.collection(collectionName).doc(record.id).set(record, { merge: false });
            });
            if (!result.ok) {
                if (previous) dependencies.localRecords.set(record.id, previous);
                else dependencies.localRecords.delete(record.id);
            } else {
                void dependencies.audit({ action: 'approval_requested', actorUserId: record.actorUserId, channelId: record.channelId, requestId, targetId: record.targetId, detail: `command=${record.commandId}` });
            }
            return result;
        },

        get: async (approvalId: string): Promise<ApprovalRecord | null> => {
            const normalizedId = approvalId.trim();
            if (!normalizedId) return null;
            return dependencies.read('getApprovalRecord', dependencies.localRecords.get(normalizedId) || null, async database => {
                const snapshot = await database.collection(collectionName).doc(normalizedId).get();
                if (!snapshot.exists) return null;
                const raw = snapshot.data();
                if (!isApprovalRecord(raw)) return null;
                dependencies.localRecords.set(normalizedId, raw);
                return raw;
            });
        },

        transition: async (approvalId: string, transition: ApprovalTransition, now = new Date(), requestId?: string): Promise<ApprovalResult> => {
            const normalizedId = approvalId.trim();
            if (!normalizedId) return { ok: false, reason: 'not_found' };
            const database = dependencies.database();
            if (!database) {
                const current = dependencies.localRecords.get(normalizedId);
                if (!current) return { ok: false, reason: 'not_found' };
                const result = transitionApproval(current, transition, now);
                if (result.ok) {
                    dependencies.localRecords.set(normalizedId, result.record);
                    void auditTransition(result.record, transition, requestId);
                }
                return result;
            }

            const reference = database.collection(collectionName).doc(normalizedId);
            let transitionedRecord: ApprovalRecord | undefined;
            let failure: ApprovalResult | undefined;
            await database.runTransaction(async transaction => {
                const snapshot = await transaction.get(reference);
                if (!snapshot.exists) { failure = { ok: false, reason: 'not_found' }; return; }
                const raw = snapshot.data();
                if (!isApprovalRecord(raw)) { failure = { ok: false, reason: 'invalid_transition' }; return; }
                const result = transitionApproval(raw, transition, now);
                if (result.ok) {
                    transitionedRecord = result.record;
                    transaction.set(reference, result.record, { merge: false });
                } else failure = result;
            });
            if (transitionedRecord) {
                dependencies.localRecords.set(normalizedId, transitionedRecord);
                void auditTransition(transitionedRecord, transition, requestId);
                return { ok: true, record: transitionedRecord };
            }
            return failure || { ok: false, reason: 'not_found' };
        },
    };
};
