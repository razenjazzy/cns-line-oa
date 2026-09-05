import { messagingApi, webhook } from '@line/bot-sdk';
import type { Readable } from 'node:stream';
import { classifyIntent, transcribeAudioToText } from '../services/vertexai';
import { resolveCommandReply } from './command-router';
import { getEscalationState, getUserLanguage, getUserProfile, updateUserScore } from '../services/firestore';
import { ChannelConfig, getAgentName } from './channels';
import type { ChannelContext } from './channels';
import { appLogger } from '../services/logger';
import { withSpan } from '../observability/tracing';

const streamToBuffer = async (stream: Readable): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

const isProduction = process.env.NODE_ENV === 'production';

const toSafeLogText = (text: string): string => {
  if (!isProduction) return text;
  const compact = text.replace(/\s+/g, ' ').trim();
  const clipped = compact.slice(0, 32);
  return `${clipped}${compact.length > 32 ? '...' : ''}`;
};

const isAiOff = (): boolean => /^(1|true|yes|on)$/i.test(process.env.AI_OFF || '');

type UiLanguage = 'th' | 'en';
const tr = (language: UiLanguage, th: string, en: string): string => (language === 'en' ? en : th);

const REPLY_TOKEN_TTL_MS = 25_000;

export type LineMessageJobInput = {
  channelConfig: ChannelConfig;
  channel: ChannelContext;
  baseUrl: string;
  requestId?: string;
  replyToken: string;
  conversationId: string;
  sourceType?: string;
  text?: string;
  audioMessageId?: string;
  receivedAt: number;
  isGroupContext?: boolean;
};

export const extractLineMessageJobs = (events: webhook.Event[]): Array<{
  replyToken: string;
  conversationId: string;
  sourceType?: string;
  text?: string;
  audioMessageId?: string;
  webhookEventId?: string;
  isGroupContext?: boolean;
}> => {
  const jobs: Array<{
    replyToken: string;
    conversationId: string;
    sourceType?: string;
    text?: string;
    audioMessageId?: string;
    webhookEventId?: string;
    isGroupContext?: boolean;
  }> = [];

  for (const event of events) {
    if (event.type !== 'message' || (event.message.type !== 'text' && event.message.type !== 'audio')) {
      continue;
    }
    const replyToken = (event as { replyToken?: string }).replyToken;
    const source = (event as { source?: { userId?: string; groupId?: string; roomId?: string; type?: string } }).source;
    const conversationId = source?.userId || source?.groupId || source?.roomId;
    if (!replyToken || !conversationId) continue;

    jobs.push({
      replyToken,
      conversationId,
      sourceType: source?.type,
      text: event.message.type === 'text' ? event.message.text : undefined,
      audioMessageId: event.message.type === 'audio' ? event.message.id : undefined,
      webhookEventId: (event as { webhookEventId?: string }).webhookEventId,
      isGroupContext: source?.type === 'group' || source?.type === 'room',
    });
  }
  return jobs;
};

const deliverMessages = async (
  client: messagingApi.MessagingApiClient,
  input: LineMessageJobInput,
  messages: messagingApi.Message[],
): Promise<unknown> => {
  const tokenAge = Date.now() - input.receivedAt;
  if (tokenAge < REPLY_TOKEN_TTL_MS) {
    return client.replyMessage({ replyToken: input.replyToken, messages });
  }
  appLogger.warn('line_reply_token_expired_using_push', {
    conversationId: input.conversationId,
    requestId: input.requestId,
    tokenAge,
  });
  return client.pushMessage({ to: input.conversationId, messages });
};

export const processLineMessageJob = async (input: LineMessageJobInput): Promise<unknown> => {
  return withSpan('line.processMessage', { 'line.user_id': input.conversationId, 'http.request_id': input.requestId || '' }, async () => {
    const client = new messagingApi.MessagingApiClient({ channelAccessToken: input.channelConfig.channelAccessToken });
    const userLanguage = await getUserLanguage(input.conversationId);
    const profile = await getUserProfile(input.conversationId);
    const agentName = getAgentName();

    let inputText = input.text?.trim() || '';
    if (!inputText && input.audioMessageId) {
      try {
        const blobClient = new messagingApi.MessagingApiBlobClient({ channelAccessToken: input.channelConfig.channelAccessToken });
        const audioBuffer = await streamToBuffer(await blobClient.getMessageContent(input.audioMessageId));
        inputText = (await transcribeAudioToText(audioBuffer, 'audio/m4a')) || '';
      } catch (err) {
        appLogger.error('voice_transcribe_failed', { error: String(err), requestId: input.requestId });
      }
      if (!inputText) {
        return deliverMessages(client, input, [{
          type: 'text',
          text: tr(userLanguage, `${agentName} ไม่สามารถแปลงข้อความเสียงได้ กรุณาลองพิมพ์คำสั่งแทน`, `${agentName} could not understand that voice message. Please try typing instead.`),
        }]);
      }
    }

    if (!inputText) return null;

    appLogger.info('line_message', {
      source: input.sourceType || 'unknown',
      conversationId: input.conversationId,
      text: toSafeLogText(inputText),
      requestId: input.requestId,
    });

    if (!isAiOff()) {
      classifyIntent(inputText).then((classification) => {
        updateUserScore(input.conversationId, classification.intent).catch(err => {
          appLogger.error('user_score_failed', { error: String(err) });
        });
      }).catch(err => appLogger.error('intent_classification_failed', { error: String(err) }));
    }

    const isEscalated = await getEscalationState(input.conversationId);
    if (isEscalated) {
      return deliverMessages(client, input, [{
        type: 'text',
        text: tr(userLanguage, `ตอนนี้คุณกำลังคุยกับแอดมินแล้วค่ะ - ${agentName}`, `You are currently connected with a human agent - ${agentName}`),
      }]);
    }

    const messages = await resolveCommandReply({
      text: inputText,
      userId: input.conversationId,
      userLanguage,
      profile,
      agentName,
      baseUrl: input.baseUrl,
      requestId: input.requestId,
      channel: input.channel,
      isGroupContext: input.isGroupContext,
    });

    return deliverMessages(client, input, messages);
  });
};
