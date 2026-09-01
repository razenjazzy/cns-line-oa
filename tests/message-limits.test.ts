import { describe, expect, it } from 'vitest';
import {
  createBotTextFlexMessage,
  createDailyReportFlexMessage,
  createFormPromptFlexMessage,
  createOrderSummaryFlexMessage,
  createProductCardFlexMessage,
  createServiceActionFlexMessage,
  createServiceHomeFlexMessage,
} from '../src/line/templates';
import { checkMessageAgainstLineLimits, checkMessagesAgainstLineLimits, LINE_LIMITS } from '../src/line/message-limits';

const LONG_NAME = 'A'.repeat(500); // longer than LINE's 400-char altText cap on its own

describe('checkMessageAgainstLineLimits', () => {
  it('flags an altText over the 400-char cap', () => {
    const violations = checkMessageAgainstLineLimits({
      type: 'flex',
      altText: 'x'.repeat(401),
      contents: { type: 'bubble' } as never,
    } as never);
    expect(violations).toEqual([{ field: 'flex.altText', limit: 400, actual: 401 }]);
  });

  it('flags a text message over the 5000-char cap', () => {
    const violations = checkMessageAgainstLineLimits({ type: 'text', text: 'x'.repeat(5001) } as never);
    expect(violations).toEqual([{ field: 'text.text', limit: 5000, actual: 5001 }]);
  });

  it('flags more than 13 quick-reply items', () => {
    const items = Array.from({ length: 14 }, (_, i) => ({ type: 'action' as const, action: { type: 'message' as const, label: `${i}`, text: `${i}` } }));
    const violations = checkMessageAgainstLineLimits({ type: 'text', text: 'ok', quickReply: { items } } as never);
    expect(violations).toEqual([{ field: 'quickReply.items', limit: 13, actual: 14 }]);
  });

  it('passes a well-formed message with no violations', () => {
    expect(checkMessageAgainstLineLimits({ type: 'text', text: 'ok' } as never)).toEqual([]);
  });
});

describe('checkMessagesAgainstLineLimits', () => {
  it('flags more than 5 messages in one reply', () => {
    const messages = Array.from({ length: 6 }, () => ({ type: 'text' as const, text: 'ok' }));
    const violations = checkMessagesAgainstLineLimits(messages);
    expect(violations).toContainEqual({ field: 'messages.length', limit: LINE_LIMITS.MAX_MESSAGES_PER_REPLY, actual: 6 });
  });
});

/**
 * Every Flex builder in templates.ts, exercised with both ordinary and
 * pathologically long dynamic input, must stay within LINE's limits. This is
 * the regression test for the altText-truncation fix — without truncate(),
 * the long-productName case below would fail.
 */
describe('templates.ts builders stay within LINE limits', () => {
  it('createBotTextFlexMessage — with and without quick replies', () => {
    expect(checkMessageAgainstLineLimits(createBotTextFlexMessage({ title: 'Title', body: LONG_NAME, language: 'en' }))).toEqual([]);
    expect(checkMessageAgainstLineLimits(createBotTextFlexMessage({
      title: 'Title', body: 'Confirm?', language: 'en',
      quickReplyActions: [{ label: 'Yes', text: 'YES' }, { label: 'No', text: 'NO' }],
    }))).toEqual([]);
  });

  it('createProductCardFlexMessage — long product name', () => {
    expect(checkMessageAgainstLineLimits(createProductCardFlexMessage(LONG_NAME, 999, 1))).toEqual([]);
  });

  it('createServiceActionFlexMessage — long service label', () => {
    expect(checkMessageAgainstLineLimits(createServiceActionFlexMessage(LONG_NAME, [{ text: 'X', label: 'X' }], 'en'))).toEqual([]);
  });

  it('createFormPromptFlexMessage — long prompt, with Skip+Cancel quick replies', () => {
    const message = createFormPromptFlexMessage({
      title: 'Form', prompt: LONG_NAME, stepIndex: 0, totalSteps: 3, language: 'en', optional: true,
    });
    expect(checkMessageAgainstLineLimits(message)).toEqual([]);
  });

  it('createServiceHomeFlexMessage', () => {
    const services = [{ key: 'commerce', label: LONG_NAME }];
    expect(checkMessageAgainstLineLimits(createServiceHomeFlexMessage(services, 'en', 'Agent'))).toEqual([]);
  });

  it('createOrderSummaryFlexMessage', () => {
    expect(checkMessageAgainstLineLimits(createOrderSummaryFlexMessage(1234.5))).toEqual([]);
  });

  it('createDailyReportFlexMessage', () => {
    const reportData = JSON.stringify([{ product: LONG_NAME, salesYesterday: 1, revenueYesterday: 1, stock: 1 }]);
    expect(checkMessageAgainstLineLimits(createDailyReportFlexMessage(reportData, 'insights', 'en'))).toEqual([]);
  });
});
