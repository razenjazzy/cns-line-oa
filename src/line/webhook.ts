import { middleware, messagingApi, webhook } from '@line/bot-sdk';
import express from 'express';
import { classifyIntent } from '../services/vertexai';
import { resolveCommandReply } from './command-router';
import { getEscalationState, getUserLanguage, getUserProfile, updateUserScore } from '../services/firestore';

// Lazy config: read env vars at request time (after dotenv.config() has run)
const getConfig = () => ({
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  channelSecret: process.env.LINE_CHANNEL_SECRET || '',
});

const getClient = () => {
  const config = getConfig();
  if (!config.channelAccessToken) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: config.channelAccessToken });
};

const getAgentName = (): string => process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
const isAiOff = (): boolean => /^(1|true|yes|on)$/i.test(process.env.AI_OFF || '');
const isProduction = process.env.NODE_ENV === 'production';

const toSafeLogText = (text: string): string => {
  if (!isProduction) return text;
  const compact = text.replace(/\s+/g, ' ').trim();
  const clipped = compact.slice(0, 32);
  return `${clipped}${compact.length > 32 ? '...' : ''}`;
};

type UiLanguage = 'th' | 'en';

const tr = (language: UiLanguage, th: string, en: string): string => language === 'en' ? en : th;

export const handleWebhook = [
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const config = getConfig();
    if (!config.channelAccessToken || !config.channelSecret) {
      console.warn('LINE credentials not configured. Webhook disabled.');
      return res.status(200).send('Webhook disabled due to missing config');
    }
    next();
  },
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
      middleware(getConfig())(req, res, next);
  },
  async (req: express.Request, res: express.Response) => {
    const client = getClient();
    if (!client) return res.status(500).end();

    try {
      const events: webhook.Event[] = req.body.events;
      const baseUrl = `${req.protocol}://${req.get('host')}`;

      const results = await Promise.all(
        events.map(async (event) => {
          if (event.type !== 'message' || event.message.type !== 'text') {
            return null;
          }
          const textMessage = event.message as { type: 'text', text: string };
          const replyToken = (event as any).replyToken as string;
          const source = (event as any).source as { userId?: string; groupId?: string; roomId?: string; type?: string };

          if (!replyToken) return null;

          const conversationId = source?.userId || source?.groupId || source?.roomId;
          if (!conversationId) {
            console.warn('Webhook event missing source identity; skipping event.');
            return null;
          }

          const userLanguage = await getUserLanguage(conversationId);
          const profile = await getUserProfile(conversationId);
          const agentName = getAgentName();

          // Log user ID to help find ADMIN_USER_ID for .env
          console.log(`📩 Message from source=${source?.type || 'unknown'}:${conversationId} | text: "${toSafeLogText(textMessage.text)}"`);
          // Asynchronously score the user based on intent without blocking the reply
          if (!isAiOff()) {
            classifyIntent(textMessage.text).then((classification) => {
              updateUserScore(conversationId, classification.intent).catch(err => {
                console.error('Failed to update user score:', err);
              });
            }).catch(err => console.error('Intent classification failed:', err));
          }

          // Check escalation state
          const isEscalated = await getEscalationState(conversationId);
          if (isEscalated) {
            return client!.replyMessage({
              replyToken,
              messages: [{ type: 'text', text: tr(userLanguage, `ตอนนี้คุณกำลังคุยกับแอดมินแล้วค่ะ - ${agentName}`, `You are currently connected with a human agent - ${agentName}`) }]
            });
          }

          const messages = await resolveCommandReply({
            text: textMessage.text,
            userId: conversationId,
            userLanguage,
            profile,
            agentName,
            baseUrl,
          });

          return client!.replyMessage({
            replyToken,
            messages,
          });
        })
      );
      res.json(results);
    } catch (err) {
      console.error('Error in LINE webhook:', err);
      res.status(500).end();
    }
  },
];
