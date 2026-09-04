import { FieldValue, type Firestore } from '@google-cloud/firestore';
import { getEffectiveGroupBuyStatus, parseGroupBuyRecord, withEffectiveGroupBuyStatus } from './group-buy';
import type { FirestoreWriteResult, GroupBuyRecord } from './types';

type Dependencies = {
    database: () => Firestore | null;
    read: <T>(action: string, fallback: T, operation: (database: Firestore) => Promise<T>) => Promise<T>;
    write: (action: string, operation: (database: Firestore) => Promise<void>) => Promise<FirestoreWriteResult>;
    toOptionalString: (value: unknown) => string | undefined;
    toPositiveInt: (value: unknown, fallback: number) => number;
    toErrorMessage: (error: unknown) => string;
};

const collectionName = 'groupBuys';

export const createGroupBuyStore = (dependencies: Dependencies) => ({
    create: async (params: { creatorUserId: string; productQuery: string; targetQty: number; productName?: string; productId?: number; expiresInHours?: number }): Promise<{ ok: boolean; data?: GroupBuyRecord; error?: string }> => {
        const database = dependencies.database();
        if (!database) return { ok: false, error: 'Firestore createGroupBuy failed: Firestore not initialized' };
        try {
            const now = new Date().toISOString();
            const expiresAt = params.expiresInHours && params.expiresInHours > 0
                ? new Date(Date.now() + params.expiresInHours * 60 * 60 * 1000).toISOString()
                : undefined;
            const document = database.collection(collectionName).doc();
            const record: GroupBuyRecord = {
                id: document.id,
                creatorUserId: params.creatorUserId,
                productQuery: params.productQuery,
                ...(params.productName ? { productName: params.productName } : {}),
                ...(params.productId ? { productId: params.productId } : {}),
                targetQty: params.targetQty,
                joinedQty: 0,
                participantCount: 0,
                status: 'open',
                createdAt: now,
                updatedAt: now,
                ...(expiresAt ? { expiresAt } : {}),
            };
            await document.set({ ...record, createdAtServer: FieldValue.serverTimestamp(), updatedAtServer: FieldValue.serverTimestamp() });
            return { ok: true, data: record };
        } catch (error) {
            return { ok: false, error: `Firestore createGroupBuy failed: ${dependencies.toErrorMessage(error)}` };
        }
    },

    getById: async (groupBuyId: string): Promise<GroupBuyRecord | null> => {
        const normalizedId = groupBuyId.trim();
        if (!normalizedId) return null;
        return dependencies.read('getGroupBuyById', null, async database => {
            const snapshot = await database.collection(collectionName).doc(normalizedId).get();
            if (!snapshot.exists) return null;
            return withEffectiveGroupBuyStatus(parseGroupBuyRecord(
                snapshot.id,
                (snapshot.data() || {}) as Record<string, unknown>,
                dependencies.toOptionalString,
                dependencies.toPositiveInt,
            ));
        });
    },

    listByCreator: async (creatorUserId: string, limit = 5): Promise<GroupBuyRecord[]> => dependencies.read('listGroupBuysByCreator', [], async database => {
        const snapshot = await database.collection(collectionName)
            .where('creatorUserId', '==', creatorUserId)
            .orderBy('createdAt', 'desc')
            .limit(Math.min(Math.max(limit, 1), 50))
            .get();
        return snapshot.docs.map(document => withEffectiveGroupBuyStatus(parseGroupBuyRecord(
            document.id,
            (document.data() || {}) as Record<string, unknown>,
            dependencies.toOptionalString,
            dependencies.toPositiveInt,
        )));
    }),

    attachOdooOrder: async (groupBuyId: string, params: { odooOrderRef: string; odooOrderTotal?: number }): Promise<FirestoreWriteResult> => dependencies.write('attachGroupBuyOdooOrder', async database => {
        await database.collection(collectionName).doc(groupBuyId).set({
            odooOrderRef: params.odooOrderRef,
            ...(typeof params.odooOrderTotal === 'number' ? { odooOrderTotal: params.odooOrderTotal } : {}),
            updatedAt: new Date().toISOString(),
            updatedAtServer: FieldValue.serverTimestamp(),
        }, { merge: true });
    }),

    join: async (params: { groupBuyId: string; userId: string; qty: number }): Promise<{ ok: boolean; data?: GroupBuyRecord; joinedQtyByUser?: number; error?: string }> => {
        const database = dependencies.database();
        if (!database) return { ok: false, error: 'Firestore joinGroupBuy failed: Firestore not initialized' };

        try {
            const result = await database.runTransaction(async transaction => {
                const groupRef = database.collection(collectionName).doc(params.groupBuyId);
                const groupSnapshot = await transaction.get(groupRef);
                if (!groupSnapshot.exists) throw new Error('groupbuy_not_found');

                const current = parseGroupBuyRecord(groupSnapshot.id, (groupSnapshot.data() || {}) as Record<string, unknown>, dependencies.toOptionalString, dependencies.toPositiveInt);
                const nowMs = Date.now();
                const effectiveStatus = getEffectiveGroupBuyStatus(current, nowMs);
                if (effectiveStatus !== 'open') {
                    if (effectiveStatus === 'expired' && current.status === 'open') {
                        transaction.update(groupRef, { status: 'expired', updatedAt: new Date(nowMs).toISOString(), updatedAtServer: FieldValue.serverTimestamp() });
                    }
                    throw new Error(`groupbuy_not_open:${effectiveStatus}`);
                }

                const participantRef = groupRef.collection('participants').doc(params.userId);
                const participantSnapshot = await transaction.get(participantRef);
                const participantData = participantSnapshot.data() as Record<string, unknown> | undefined;
                const previousQty = dependencies.toPositiveInt(participantData?.totalQty, 0);
                const nextQtyByUser = previousQty + params.qty;
                const now = new Date().toISOString();

                transaction.set(participantRef, {
                    userId: params.userId,
                    totalQty: nextQtyByUser,
                    updatedAt: now,
                    updatedAtServer: FieldValue.serverTimestamp(),
                    ...(participantSnapshot.exists ? {} : { createdAt: now, createdAtServer: FieldValue.serverTimestamp() }),
                }, { merge: true });
                transaction.update(groupRef, {
                    joinedQty: FieldValue.increment(params.qty),
                    participantCount: FieldValue.increment(participantSnapshot.exists ? 0 : 1),
                    updatedAt: now,
                    updatedAtServer: FieldValue.serverTimestamp(),
                });

                return {
                    data: { ...current, joinedQty: current.joinedQty + params.qty, participantCount: current.participantCount + (participantSnapshot.exists ? 0 : 1), updatedAt: now },
                    joinedQtyByUser: nextQtyByUser,
                };
            });
            return { ok: true, data: result.data, joinedQtyByUser: result.joinedQtyByUser };
        } catch (error) {
            return { ok: false, error: `Firestore joinGroupBuy failed: ${dependencies.toErrorMessage(error)}` };
        }
    },

    updateStatus: async (params: { groupBuyId: string; actorUserId: string; actorIsAdmin: boolean; nextStatus: 'confirmed' | 'cancelled' }): Promise<{ ok: boolean; data?: GroupBuyRecord; error?: string }> => {
        const database = dependencies.database();
        if (!database) return { ok: false, error: 'Firestore updateGroupBuyStatus failed: Firestore not initialized' };

        try {
            const updated = await database.runTransaction(async transaction => {
                const groupRef = database.collection(collectionName).doc(params.groupBuyId);
                const groupSnapshot = await transaction.get(groupRef);
                if (!groupSnapshot.exists) throw new Error('groupbuy_not_found');

                const current = parseGroupBuyRecord(groupSnapshot.id, (groupSnapshot.data() || {}) as Record<string, unknown>, dependencies.toOptionalString, dependencies.toPositiveInt);
                const nowMs = Date.now();
                const effectiveStatus = getEffectiveGroupBuyStatus(current, nowMs);
                const allowed = params.nextStatus === 'confirmed'
                    ? effectiveStatus === 'open'
                    : effectiveStatus === 'open' || effectiveStatus === 'expired';

                if (effectiveStatus === 'expired' && current.status === 'open' && params.nextStatus === 'confirmed') {
                    transaction.update(groupRef, { status: 'expired', updatedAt: new Date(nowMs).toISOString(), updatedAtServer: FieldValue.serverTimestamp() });
                }
                if (!allowed) throw new Error(`groupbuy_not_open:${effectiveStatus}`);
                if (!params.actorIsAdmin && current.creatorUserId !== params.actorUserId) throw new Error('groupbuy_forbidden');

                const now = new Date().toISOString();
                const patch = params.nextStatus === 'confirmed'
                    ? { status: 'confirmed' as const, confirmedAt: now, confirmedBy: params.actorUserId }
                    : { status: 'cancelled' as const, cancelledAt: now, cancelledBy: params.actorUserId };
                transaction.update(groupRef, { ...patch, updatedAt: now, updatedAtServer: FieldValue.serverTimestamp() });
                return { ...current, ...patch, updatedAt: now };
            });
            return { ok: true, data: updated };
        } catch (error) {
            return { ok: false, error: `Firestore updateGroupBuyStatus failed: ${dependencies.toErrorMessage(error)}` };
        }
    },
});
