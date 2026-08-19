import { describe, expect, it } from 'vitest';
import { parseGroupBuyCommand } from '../src/services/group-buy';

describe('group-buy command parser', () => {
  it('parses START GROUPBUY payload with default expiry', () => {
    const parsed = parseGroupBuyCommand('START GROUPBUY App Premium Plan,25');
    expect(parsed).toEqual({ type: 'start', productQuery: 'App Premium Plan', targetQty: 25, hours: 24 });
  });

  it('parses START GROUPBUY payload with explicit hours', () => {
    const parsed = parseGroupBuyCommand('START GROUPBUY App Premium Plan,25,48');
    expect(parsed).toEqual({ type: 'start', productQuery: 'App Premium Plan', targetQty: 25, hours: 48 });
  });

  it('rejects START GROUPBUY invalid quantity', () => {
    expect(parseGroupBuyCommand('START GROUPBUY App Premium Plan,1')).toBeNull();
  });

  it('rejects START GROUPBUY invalid hours', () => {
    expect(parseGroupBuyCommand('START GROUPBUY App Premium Plan,25,0')).toBeNull();
    expect(parseGroupBuyCommand('START GROUPBUY App Premium Plan,25,abc')).toBeNull();
  });

  it('parses JOIN GROUPBUY default quantity', () => {
    const parsed = parseGroupBuyCommand('JOIN GROUPBUY gb-001');
    expect(parsed).toEqual({ type: 'join', groupBuyId: 'gb-001', qty: 1 });
  });

  it('parses JOIN GROUPBUY with quantity', () => {
    const parsed = parseGroupBuyCommand('JOIN GROUPBUY gb-001,3');
    expect(parsed).toEqual({ type: 'join', groupBuyId: 'gb-001', qty: 3 });
  });

  it('parses STATUS GROUPBUY with and without id', () => {
    expect(parseGroupBuyCommand('STATUS GROUPBUY')).toEqual({ type: 'status' });
    expect(parseGroupBuyCommand('STATUS GROUPBUY gb-001')).toEqual({ type: 'status', groupBuyId: 'gb-001' });
  });

  it('parses CONFIRM and CANCEL GROUPBUY', () => {
    expect(parseGroupBuyCommand('CONFIRM GROUPBUY gb-001')).toEqual({ type: 'confirm', groupBuyId: 'gb-001' });
    expect(parseGroupBuyCommand('CANCEL GROUPBUY gb-001')).toEqual({ type: 'cancel', groupBuyId: 'gb-001' });
  });
});
