import { describe, expect, it } from 'vitest';
import { decodeQuoteListCursor, encodeQuoteListCursor } from '../src/line/quote-list-cursor';

describe('quote list cursor', () => {
  it('round-trips date_order and id', () => {
    const token = encodeQuoteListCursor({ id: 17, date_order: '2026-09-05 10:00:00' });
    expect(decodeQuoteListCursor(token)).toEqual({ dateOrder: '2026-09-05 10:00:00', id: 17 });
  });

  it('rejects junk', () => {
    expect(decodeQuoteListCursor('not-a-cursor')).toBeNull();
  });
});
