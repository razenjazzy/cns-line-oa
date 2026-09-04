import type { FirestoreWriteResult, GroupBuyRecord, GroupBuyWriteResult } from './types';

type GroupBuyCreateInput = {
    creatorUserId: string;
    productQuery: string;
    targetQty: number;
    productName?: string;
    productId?: number;
    expiresInHours?: number;
};

type GroupBuyJoinInput = {
    groupBuyId: string;
    userId: string;
    qty: number;
};

type GroupBuyRepository = {
    create: (input: GroupBuyCreateInput) => Promise<GroupBuyWriteResult>;
    getById: (groupBuyId: string) => Promise<GroupBuyRecord | null>;
    listByCreator: (creatorUserId: string, limit?: number) => Promise<GroupBuyRecord[]>;
    attachOdooOrder: (groupBuyId: string, params: { odooOrderRef: string; odooOrderTotal?: number }) => Promise<FirestoreWriteResult>;
    join: (input: GroupBuyJoinInput) => Promise<GroupBuyWriteResult & { joinedQtyByUser?: number }>;
    confirm: (groupBuyId: string, actorUserId: string, actorIsAdmin: boolean) => Promise<GroupBuyWriteResult>;
    cancel: (groupBuyId: string, actorUserId: string, actorIsAdmin: boolean) => Promise<GroupBuyWriteResult>;
};

export const createGroupBuyRepository = (operations: GroupBuyRepository): GroupBuyRepository => operations;
export type { GroupBuyCreateInput, GroupBuyJoinInput, GroupBuyRepository };
