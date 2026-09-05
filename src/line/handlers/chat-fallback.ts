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
import { getEscalationState } from '../../services/firestore';
import type { UserLanguage } from '../../services/firestore';

const tr = (language: UserLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const botText = (value: string, language: UserLanguage, quickReplyActions?: { label: string; text: string }[]) =>
  createBotTextFlexMessage({
    title: tr(language, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
    body: value,
    language,
    tone: 'info',
    quickReplyActions,
  });

const feedbackQuickReplyActions = (language: UserLanguage) => [
  { label: tr(language, '👍 มีประโยชน์', '👍 Helpful'), text: 'FEEDBACK GOOD' },
  { label: tr(language, '👎 ไม่ตรงที่ถาม', '👎 Not helpful'), text: 'FEEDBACK BAD' },
];

/**
 * Materialize raw text messages from chat.ts into styled Flex messages.
 * Non-text messages (product cards, order summaries) are passed through
 * as-is, which means a reply ending in one of those doesn't get a feedback
 * prompt attached — an acceptable v1 gap, not a correctness bug.
 */
const materializeMessages = (
  messages: messagingApi.Message[],
  language: UserLanguage,
  lastMessageQuickReplyActions?: { label: string; text: string }[],
): messagingApi.Message[] =>
  messages.map((msg, index) => {
    if (msg.type !== 'text') return msg;
    const isLast = index === messages.length - 1;
    return botText((msg as messagingApi.TextMessage).text, language, isLast ? lastMessageQuickReplyActions : undefined);
  });

export const handleChatFallback = async (
  ctx: CommandReplyContext,
): Promise<messagingApi.Message[]> => {
  const { userId, text, userLanguage, agentName, channel, profile } = ctx;

  // While escalated (HUMAN command, or the AI's own judgment call), step
  // aside instead of auto-replying — a real person is expected to be
  // reading this conversation, and the bot talking over them (or giving a
  // conflicting answer) would be worse than a short "still connected"
  // notice. Every other command (typed or guided-form) still works
  // normally; only this last-resort AI-chat path is gated.
  if (await getEscalationState(userId)) {
    return [createBotTextFlexMessage({
      title: tr(userLanguage, 'ผู้ช่วย Cloudnex', 'Cloudnex assistant'),
      body: tr(userLanguage,
        `${agentName} โอนเคสนี้ให้แอดมินแล้ว เจ้าหน้าที่จะดูแลต่อจากนี้ค่ะ`,
        `${agentName} has connected you with a human agent, who'll take it from here.`,
      ),
      language: userLanguage,
      tone: 'info',
      secondaryAction: { label: tr(userLanguage, 'กลับไปคุยกับบอท', 'Resume with bot'), text: 'HUMAN OFF' },
    })];
  }

  const chatResult = await processChatMessage(userId, text.trim(), userLanguage);

  if (!chatResult.handled) {
    // AI could not give a confident answer — show menu so user can navigate.
    // No feedback prompt: there's nothing meaningful to rate yet.
    return [
      ...materializeMessages(chatResult.messages, userLanguage),
      buildHomeMenuMessage(userLanguage, agentName, channel, profile.role === 'admin'),
    ];
  }

  // A confident AI answer — invite a quality signal (src/line/handlers/feedback.ts).
  return materializeMessages(chatResult.messages, userLanguage, feedbackQuickReplyActions(userLanguage));
};
