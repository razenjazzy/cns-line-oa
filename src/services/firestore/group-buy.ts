import type { GroupBuyRecord, GroupBuyStatus } from './types';

type StringNormalizer = (value: unknown) => string | undefined;
type PositiveIntNormalizer = (value: unknown, fallback: number) => number;

export const parseGroupBuyRecord = (
    id: string,
    raw: Record<string, unknown>,
    toOptionalString: StringNormalizer,
    toPositiveInt: PositiveIntNormalizer,
): GroupBuyRecord => {
    const statusRaw = toOptionalString(raw.status);
    const status: GroupBuyStatus = statusRaw === 'confirmed' || statusRaw === 'cancelled' || statusRaw === 'expired' ? statusRaw : 'open';
    const createdAt = toOptionalString(raw.createdAt) || new Date(0).toISOString();
    const updatedAt = toOptionalString(raw.updatedAt) || createdAt;
    const productIdRaw = toPositiveInt(raw.productId, 0);

    return {
        id,
        creatorUserId: toOptionalString(raw.creatorUserId) || '',
        productQuery: toOptionalString(raw.productQuery) || '',
        productName: toOptionalString(raw.productName),
        productId: productIdRaw > 0 ? productIdRaw : undefined,
        targetQty: toPositiveInt(raw.targetQty, 1),
        joinedQty: toPositiveInt(raw.joinedQty, 0),
        participantCount: toPositiveInt(raw.participantCount, 0),
        status,
        createdAt,
        updatedAt,
        expiresAt: toOptionalString(raw.expiresAt),
        confirmedAt: toOptionalString(raw.confirmedAt),
        cancelledAt: toOptionalString(raw.cancelledAt),
        confirmedBy: toOptionalString(raw.confirmedBy),
        cancelledBy: toOptionalString(raw.cancelledBy),
        odooOrderRef: toOptionalString(raw.odooOrderRef),
        odooOrderTotal: typeof raw.odooOrderTotal === 'number' ? raw.odooOrderTotal : undefined,
    };
};

export const getEffectiveGroupBuyStatus = (record: GroupBuyRecord, nowMs: number): GroupBuyStatus => {
    if (record.status === 'open' && record.expiresAt && new Date(record.expiresAt).getTime() <= nowMs) return 'expired';
    return record.status;
};

export const withEffectiveGroupBuyStatus = (record: GroupBuyRecord, nowMs = Date.now()): GroupBuyRecord => {
    const status = getEffectiveGroupBuyStatus(record, nowMs);
    return status === record.status ? record : { ...record, status };
};
