import { messagingApi } from '@line/bot-sdk';

/**
 * LINE Messaging API's documented hard limits. Exceeding any of these fails
 * the send outright — the customer gets nothing, with no local signal unless
 * something checks for it before the message ever reaches LINE's API.
 * Used by tests/message-limits.test.ts to guard every template in
 * src/line/templates.ts, and available to call at runtime around any new
 * dynamic-content message.
 */
export const LINE_LIMITS = {
  ALT_TEXT_MAX_CHARS: 400,
  QUICK_REPLY_MAX_ITEMS: 13,
  TEXT_MESSAGE_MAX_CHARS: 5000,
  MAX_MESSAGES_PER_REPLY: 5,
} as const;

export type LineLimitViolation = {
  field: string;
  limit: number;
  actual: number;
};

const charLen = (value: string | undefined): number => Array.from(value || '').length;

export const checkMessageAgainstLineLimits = (message: messagingApi.Message): LineLimitViolation[] => {
  const violations: LineLimitViolation[] = [];

  if (message.type === 'flex') {
    const altTextLen = charLen(message.altText);
    if (altTextLen > LINE_LIMITS.ALT_TEXT_MAX_CHARS) {
      violations.push({ field: 'flex.altText', limit: LINE_LIMITS.ALT_TEXT_MAX_CHARS, actual: altTextLen });
    }
  }

  if (message.type === 'text') {
    const textLen = charLen(message.text);
    if (textLen > LINE_LIMITS.TEXT_MESSAGE_MAX_CHARS) {
      violations.push({ field: 'text.text', limit: LINE_LIMITS.TEXT_MESSAGE_MAX_CHARS, actual: textLen });
    }
  }

  const quickReplyItems = (message as { quickReply?: { items?: unknown[] } }).quickReply?.items?.length || 0;
  if (quickReplyItems > LINE_LIMITS.QUICK_REPLY_MAX_ITEMS) {
    violations.push({ field: 'quickReply.items', limit: LINE_LIMITS.QUICK_REPLY_MAX_ITEMS, actual: quickReplyItems });
  }

  return violations;
};

export const checkMessagesAgainstLineLimits = (messages: messagingApi.Message[]): LineLimitViolation[] => {
  const violations: LineLimitViolation[] = [];
  if (messages.length > LINE_LIMITS.MAX_MESSAGES_PER_REPLY) {
    violations.push({ field: 'messages.length', limit: LINE_LIMITS.MAX_MESSAGES_PER_REPLY, actual: messages.length });
  }
  for (const message of messages) {
    violations.push(...checkMessageAgainstLineLimits(message));
  }
  return violations;
};
