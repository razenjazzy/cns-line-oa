import type { AuditLogEntry } from './types';

type StringNormalizer = (value: unknown) => string | undefined;

type DocumentLike = {
    id: string;
    data: () => Record<string, unknown> | undefined;
};

export const parseAuditLogEntry = (document: DocumentLike, toOptionalString: StringNormalizer): AuditLogEntry => {
    const raw = document.data() || {};
    return {
        id: document.id,
        action: toOptionalString(raw.action) || 'unknown',
        outcome: toOptionalString(raw.outcome) || 'unknown',
        actorUserId: toOptionalString(raw.actorUserId) || '',
        channelId: toOptionalString(raw.channelId) || null,
        requestId: toOptionalString(raw.requestId) || null,
        targetId: toOptionalString(raw.targetId) || null,
        detail: toOptionalString(raw.detail) || null,
        createdAt: toOptionalString(raw.createdAt) || new Date(0).toISOString(),
    };
};
