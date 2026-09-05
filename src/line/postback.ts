const POSTBACK_TTL_SECONDS = 15 * 60;

/**
 * Allowlisted LINE postback → command text.
 * HMAC already validated the webhook. `data` is `kind|userId|exp` so a
 * replay from another user or after TTL is ignored. Mutations like
 * QUOTE CONFIRM are never valid kinds.
 */
export const bindPostbackData = (kind: string, userId: string): string =>
  `${kind}|${userId}|${Math.floor(Date.now() / 1000) + POSTBACK_TTL_SECONDS}`;

export const resolvePostbackToText = (data: string, dateOrDatetime?: string, userId?: string): string | null => {
  const trimmed = data.trim();
  const parts = trimmed.split('|');
  if (parts.length < 2) return null;
  const hasExpiry = parts.length >= 3 && /^\d+$/.test(parts[parts.length - 1] || '');
  const exp = hasExpiry ? Number(parts[parts.length - 1]) : undefined;
  const boundUser = hasExpiry ? parts[parts.length - 2] : parts[parts.length - 1];
  const kind = hasExpiry ? parts.slice(0, -2).join('|') : parts.slice(0, -1).join('|');
  if (!kind || !userId || boundUser !== userId) return null;
  if (exp !== undefined && Math.floor(Date.now() / 1000) > exp) return null;

  const date = (dateOrDatetime || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  if (kind === 'form.date.validityDate' || kind.startsWith('form.date.')) {
    return date;
  }
  if (kind === 'quote.list.from') {
    return `QUOTE LIST FROM ${date}`;
  }
  if (kind === 'quote.list.to') {
    return `QUOTE LIST TO ${date}`;
  }
  return null;
};
