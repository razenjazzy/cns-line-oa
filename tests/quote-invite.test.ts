import { describe, expect, it } from 'vitest';
import { saveQuoteInvite, takeQuoteInvitesForPhone } from '../src/line/quote-notify';

describe('quote invites', () => {
  it('stores an invite by phone variants and consumes it once', () => {
    saveQuoteInvite('01717557802', 51, 'default');
    const first = takeQuoteInvitesForPhone('+661717557802');
    expect(first).toEqual([{ orderId: 51, channelId: 'default' }]);
    expect(takeQuoteInvitesForPhone('01717557802')).toEqual([]);
  });
});
