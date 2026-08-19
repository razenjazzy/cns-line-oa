const normalizeUserId = (value: string): string => value.trim();

const parseRolloutPercent = (value: string | undefined): number => {
  const parsed = Number(value || '0');
  if (Number.isNaN(parsed)) return 0;
  if (parsed < 0) return 0;
  if (parsed > 100) return 100;
  return parsed;
};

const parseAllowList = (value: string | undefined): Set<string> => {
  const raw = value || '';
  const ids = raw
    .split(',')
    .map(v => normalizeUserId(v))
    .filter(Boolean);
  return new Set(ids);
};

const stablePercentBucket = (userId: string): number => {
  let hash = 0;
  for (let i = 0; i < userId.length; i += 1) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return hash % 100;
};

export type FeatureGateResult = {
  enabled: boolean;
  reason: string;
};

export const isGroupBuyEnabledForUser = (userId: string): FeatureGateResult => {
  const globallyEnabled = /^(1|true|yes|on)$/i.test(process.env.GROUPBUY_ENABLED || 'false');
  if (!globallyEnabled) {
    return { enabled: false, reason: 'disabled_globally' };
  }

  const normalizedUserId = normalizeUserId(userId);
  const allowList = parseAllowList(process.env.GROUPBUY_ALLOWED_USER_IDS);
  if (allowList.size > 0 && allowList.has(normalizedUserId)) {
    return { enabled: true, reason: 'allow_list' };
  }

  const rolloutPercent = parseRolloutPercent(process.env.GROUPBUY_ROLLOUT_PERCENT);
  if (rolloutPercent <= 0) {
    return { enabled: false, reason: 'rollout_zero' };
  }

  const bucket = stablePercentBucket(normalizedUserId);
  if (bucket < rolloutPercent) {
    return { enabled: true, reason: `rollout_${rolloutPercent}` };
  }

  return { enabled: false, reason: `rollout_${rolloutPercent}` };
};

export const isGroupBuyCommand = (text: string): boolean => {
  const upper = text.trim().toUpperCase();
  return upper.startsWith('START GROUPBUY')
    || upper.startsWith('JOIN GROUPBUY')
    || upper.startsWith('STATUS GROUPBUY')
    || upper.startsWith('CONFIRM GROUPBUY')
    || upper.startsWith('CANCEL GROUPBUY');
};
