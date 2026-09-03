import { describe, expect, it } from 'vitest';
import { parseOrderId, parseOrderIdAndProductQty } from '../src/line/handlers/quotation';

describe('parseOrderId', () => {
  it('parses a valid numeric order id after the prefix', () => {
    expect(parseOrderId('QUOTE CONFIRM 17', 'QUOTE CONFIRM')).toBe(17);
    expect(parseOrderId('QUOTE CANCEL 1', 'QUOTE CANCEL')).toBe(1);
  });

  it('is case-insensitive on the prefix', () => {
    expect(parseOrderId('quote confirm 17', 'QUOTE CONFIRM')).toBe(17);
  });

  it('rejects a missing, zero, negative, or non-numeric id', () => {
    expect(parseOrderId('QUOTE CONFIRM', 'QUOTE CONFIRM')).toBeNull();
    expect(parseOrderId('QUOTE CONFIRM 0', 'QUOTE CONFIRM')).toBeNull();
    expect(parseOrderId('QUOTE CONFIRM -5', 'QUOTE CONFIRM')).toBeNull();
    expect(parseOrderId('QUOTE CONFIRM abc', 'QUOTE CONFIRM')).toBeNull();
  });
});

describe('parseOrderIdAndProductQty', () => {
  it('parses "<prefix> <orderId> <product>,<qty>"', () => {
    expect(parseOrderIdAndProductQty('QUOTE ADD 17 Widget,2', 'QUOTE ADD')).toEqual({
      orderId: 17,
      productName: 'Widget',
      qty: 2,
    });
  });

  it('trims whitespace around the product name and quantity', () => {
    expect(parseOrderIdAndProductQty('QUOTE ADD 17   Widget , 2  ', 'QUOTE ADD')).toEqual({
      orderId: 17,
      productName: 'Widget',
      qty: 2,
    });
  });

  it('handles a multi-word product name (only the last comma-split segment is quantity)', () => {
    expect(parseOrderIdAndProductQty('QUOTE EDIT 17 App Premium Plan,3', 'QUOTE EDIT')).toEqual({
      orderId: 17,
      productName: 'App Premium Plan',
      qty: 3,
    });
  });

  it('rejects a missing order id, missing product/qty payload, or malformed order id', () => {
    expect(parseOrderIdAndProductQty('QUOTE ADD', 'QUOTE ADD')).toBeNull();
    expect(parseOrderIdAndProductQty('QUOTE ADD 17', 'QUOTE ADD')).toBeNull();
    expect(parseOrderIdAndProductQty('QUOTE ADD abc Widget,2', 'QUOTE ADD')).toBeNull();
    expect(parseOrderIdAndProductQty('QUOTE ADD 0 Widget,2', 'QUOTE ADD')).toBeNull();
  });

  it('rejects an invalid or out-of-range quantity', () => {
    expect(parseOrderIdAndProductQty('QUOTE ADD 17 Widget,0', 'QUOTE ADD')).toBeNull();
    expect(parseOrderIdAndProductQty('QUOTE ADD 17 Widget,10001', 'QUOTE ADD')).toBeNull();
    expect(parseOrderIdAndProductQty('QUOTE ADD 17 Widget,abc', 'QUOTE ADD')).toBeNull();
  });

  it('rejects a missing product name', () => {
    expect(parseOrderIdAndProductQty('QUOTE ADD 17 ,2', 'QUOTE ADD')).toBeNull();
  });
});
