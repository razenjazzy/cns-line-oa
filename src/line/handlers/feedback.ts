import type { CommandHandler } from './index';
import { createBotTextFlexMessage } from '../templates';
import { getConversationHistory, recordChatFeedback } from '../../services/firestore';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (value: string, language: UserLanguage, tone: 'info' | 'success' = 'success') =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone,
  });

/**
 * Pulls the most recent user/model exchange from the conversation history
 * (already saved by chat.ts for every AI turn) so a rating in Firestore
 * carries enough context to be useful to whoever reviews it later, without
 * needing to thread a reply-id through the quick-reply round trip.
 */
const getLastExchange = async (userId: string): Promise<{ question?: string; answer?: string }> => {
  const history = await getConversationHistory(userId);
  const last = history[history.length - 1];
  const secondLast = history[history.length - 2];
  const answer = last?.role === 'model' ? last.text : undefined;
  const question = (last?.role === 'user' ? last.text : undefined) || (secondLast?.role === 'user' ? secondLast.text : undefined);
  return { question, answer };
};

const buildFeedbackHandler = (rating: 'good' | 'bad', matchText: string): CommandHandler => ({
  name: `feedback-${rating}`,
  match: (u) => u === matchText,
  handle: async (ctx) => {
    const { userId, userLanguage } = ctx;
    const { question, answer } = await getLastExchange(userId);
    await recordChatFeedback({ userId, rating, question, answer });
    return [botText(tr(userLanguage, 'ขอบคุณสำหรับความคิดเห็นค่ะ 🙏', 'Thanks for the feedback! 🙏'), userLanguage)];
  },
});

export const feedbackHandlers: CommandHandler[] = [
  buildFeedbackHandler('good', 'FEEDBACK GOOD'),
  buildFeedbackHandler('bad', 'FEEDBACK BAD'),
];
