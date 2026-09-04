export type AuditLogFilters = {
  action?: string;
  outcome?: 'success' | 'failure';
  actorUserId?: string;
  channelId?: string;
  from?: string;
  to?: string;
};

export const encodeAuditCursor = (createdAt: string): string => Buffer.from(createdAt, 'utf8').toString('base64url');

export const decodeAuditCursor = (value: unknown): string | undefined => {
  if (typeof value !== 'string' || value.length > 100) return undefined;
  try {
    const decoded = Buffer.from(value, 'base64url').toString('utf8');
    return Number.isNaN(Date.parse(decoded)) ? undefined : new Date(decoded).toISOString();
  } catch {
    return undefined;
  }
};

const clean = (value: unknown, maxLength = 120): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : undefined;
};

const isoDate = (value: unknown): string | undefined => {
  const normalized = clean(value, 40);
  if (!normalized || Number.isNaN(Date.parse(normalized))) return undefined;
  return new Date(normalized).toISOString();
};

export const parseAuditLogFilters = (query: Record<string, unknown>): AuditLogFilters => {
  const outcome = clean(query.outcome, 10);
  return {
    action: clean(query.action),
    outcome: outcome === 'success' || outcome === 'failure' ? outcome : undefined,
    actorUserId: clean(query.actorUserId),
    channelId: clean(query.channelId),
    from: isoDate(query.from),
    to: isoDate(query.to),
  };
};

export const matchesAuditLogFilters = (entry: {
  action: string;
  outcome: string;
  actorUserId: string;
  channelId: string | null;
  createdAt: string;
}, filters: AuditLogFilters): boolean => {
  if (filters.action && entry.action !== filters.action) return false;
  if (filters.outcome && entry.outcome !== filters.outcome) return false;
  if (filters.actorUserId && entry.actorUserId !== filters.actorUserId) return false;
  if (filters.channelId && entry.channelId !== filters.channelId) return false;
  if (filters.from && entry.createdAt < filters.from) return false;
  if (filters.to && entry.createdAt > filters.to) return false;
  return true;
};