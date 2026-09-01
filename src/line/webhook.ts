import { middleware, messagingApi, webhook } from '@line/bot-sdk';
import express from 'express';
import type { Readable } from 'node:stream';
import { classifyIntent, transcribeAudioToText } from '../services/vertexai';
import { resolveCommandReply } from './command-router';
import { getEscalationState, getUserLanguage, getUserProfile, updateUserScore } from '../services/firestore';
import { ChannelConfig, DEFAULT_CHANNEL_ID, getAgentName, resolveChannelConfig, resolveEffectiveChannelContext } from './channels';

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

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
    const channelId = String(req.params.channelId || DEFAULT_CHANNEL_ID).trim();
    const channelConfig = resolveChannelConfig(channelId);

    if (!channelConfig) {
      if (channelId === DEFAULT_CHANNEL_ID) {
        // Preserve current behavior: a fully unconfigured default channel is a
        // graceful no-op (200) so LINE doesn't retry, not a hard failure.
        console.warn('LINE credentials not configured. Webhook disabled.');
        return res.status(200).send('Webhook disabled due to missing config');
      }
      console.warn(`Webhook request for unconfigured LINE channel "${channelId}" rejected.`);
      return res.status(404).json({ error: 'Unknown or unconfigured LINE channel.' });
    }

    res.locals.channelConfig = channelConfig;
    next();
  },
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const channelConfig = res.locals.channelConfig as ChannelConfig;
      middleware({ channelSecret: channelConfig.channelSecret })(req, res, next);
  },
  async (req: express.Request, res: express.Response) => {
    const channelConfig = res.locals.channelConfig as ChannelConfig;
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: channelConfig.channelAccessToken });

    try {
      const events: webhook.Event[] = req.body.events;
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      const channel = await resolveEffectiveChannelContext(channelConfig);

      const results = await Promise.all(
        events.map(async (event) => {
          if (event.type !== 'message' || (event.message.type !== 'text' && event.message.type !== 'audio')) {
            return null;
          }
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

          let inputText: string | null;
          if (event.message.type === 'text') {
            inputText = (event.message as { type: 'text'; text: string }).text;
          } else {
            // Voice message: fetch the audio bytes and transcribe with the
            // same Gemini clients already used for insights/intent, then feed
            // the transcript into the exact same command path as typed text.
            const messageId = (event.message as { id: string }).id;
            try {
              const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken: channelConfig.channelAccessToken });
              const audioBuffer = await streamToBuffer(await blobClient.getMessageContent(messageId));
              inputText = await transcribeAudioToText(audioBuffer, 'audio/m4a');
            } catch (err) {
              console.error('Failed to fetch/transcribe voice message:', err);
              inputText = null;
            }

            if (!inputText) {
              return client!.replyMessage({
                replyToken,
                messages: [{ type: 'text', text: tr(userLanguage, `${agentName} ไม่สามารถแปลงข้อความเสียงได้ กรุณาลองพิมพ์คำสั่งแทน`, `${agentName} could not understand that voice message. Please try typing instead.`) }],
              });
            }
          }

          // Log user ID to help find ADMIN_USER_ID for .env
          console.log(`📩 Message from source=${source?.type || 'unknown'}:${conversationId} | text: "${toSafeLogText(inputText)}"`);
          // Asynchronously score the user based on intent without blocking the reply
          if (!isAiOff()) {
            classifyIntent(inputText).then((classification) => {
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
            text: inputText,
            userId: conversationId,
            userLanguage,
            profile,
            agentName,
            baseUrl,
            channel,
            isGroupContext: source?.type === 'group' || source?.type === 'room',
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
