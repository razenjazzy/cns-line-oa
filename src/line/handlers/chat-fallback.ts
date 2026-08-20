/**
 * AI chat fallback handler.
 *
 * Called by command-router as the very last resort — after all CommandHandlers
 * in the registry fail to match AND keyword guidance finds no suggestion.
 *
 * Provider cascade (clawframework multi-provider pattern):
 *   Tier 1 → Gemini AI Studio + Vertex AI  (via chat.ts / ai-circuit-breaker)
 *   Tier 2 → Odoo heuristic product search (always available, no AI needed)
 *
 * The ClawBridge subprocess (Groq/OpenRouter) is wired into chat.ts directly
 * as a Tier-2.5 fallback before the heuristic — see chat.ts for details.
 */

import { messagingApi } from '@line/bot-sdk';
import { processChatMessage } from '../../services/chat';
import { createBotTextFlexMessage } from '../templates';
import { buildHomeMenuMessage } from '../command-router';
import type { CommandReplyContext } from '../command-router';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (value: string, language: UserLanguage) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: 'info',
  });

/**
 * Materialize raw text messages from chat.ts into styled Flex messages.
 * Non-text messages (product cards, order summaries) are passed through.
 */
const materializeMessages = (
  messages: messagingApi.Message[],
  language: UserLanguage,
): messagingApi.Message[] =>
  messages.map(msg => {
    if (msg.type !== 'text') return msg;
    return botText((msg as messagingApi.TextMessage).text, language);
  });

export const handleChatFallback = async (
  ctx: CommandReplyContext,
): Promise<messagingApi.Message[]> => {
  const { userId, text, userLanguage, agentName, channel, profile } = ctx;

  const chatResult = await processChatMessage(userId, text.trim(), userLanguage);

  if (!chatResult.handled) {
    // AI could not give a confident answer — show menu so user can navigate
    return [
      ...materializeMessages(chatResult.messages, userLanguage),
      buildHomeMenuMessage(userLanguage, agentName, channel, profile.role === 'admin'),
    ];
  }

  return materializeMessages(chatResult.messages, userLanguage);
};
