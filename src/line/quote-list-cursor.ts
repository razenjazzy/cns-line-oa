/** Opaque `date_order,id` cursor for QUOTE LIST (newest first). */
export const encodeQuoteListCursor = (order: { id: number; date_order?: string }): string =>
  Buffer.from(`${order.date_order || ''}|${order.id}`, 'utf8').toString('base64url');

export const decodeQuoteListCursor = (token: string): { dateOrder: string; id: number } | null => {
  try {
    const raw = Buffer.from(token.trim(), 'base64url').toString('utf8');
    const sep = raw.lastIndexOf('|');
    if (sep <= 0) return null;
    const dateOrder = raw.slice(0, sep).trim();
    const id = Number(raw.slice(sep + 1));
    if (!dateOrder || !Number.isFinite(id) || id <= 0) return null;
    return { dateOrder, id };
  } catch {
    return null;
  }
};
