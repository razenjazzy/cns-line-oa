import { messagingApi } from '@line/bot-sdk';
import { DEFAULT_CHANNEL_ID, resolveChannelConfig } from './channels';

// Reuses the same channel resolver as webhook.ts so channel credentials
// have a single source of truth. Defaults to the backward-compatible
// default channel when no channelId is given.
const getClient = (channelId: string): messagingApi.MessagingApiClient | null => {
  const channelConfig = resolveChannelConfig(channelId);
  if (!channelConfig) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: channelConfig.channelAccessToken });
};

const sendTargetedMessages = async (userIds: string[], messages: messagingApi.Message[], channelId: string = DEFAULT_CHANNEL_ID) => {
  const client = getClient(channelId);
  if (!client) {
    console.warn(`LINE Client not initialized for channel "${channelId}". Cannot send targeted messages.`);
    console.log(`[DRY RUN] Would send to ${userIds.length} users: ${JSON.stringify(messages)}`);
    return;
  }

  // LINE multicast API accepts up to 500 user IDs at a time
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 500) {
      chunks.push(userIds.slice(i, i + 500));
  }

  for (const chunk of chunks) {
      try {
          await client.multicast({ to: chunk, messages });
          console.log(`Sent targeted message to ${chunk.length} users on channel "${channelId}".`);
      } catch (error) {
          console.error(`Error sending multicast message on channel "${channelId}":`, error);
      }
  }
};

export const sendTargetedMessage = async (userIds: string[], text: string, channelId: string = DEFAULT_CHANNEL_ID) => {
  return sendTargetedMessages(userIds, [{ type: 'text', text }], channelId);
};

/** Same delivery path as sendTargetedMessage, for a Flex card instead of plain text (e.g. the quotation journey card pushed to a customer for approval). */
export const sendTargetedFlexMessage = async (userIds: string[], message: messagingApi.FlexMessage, channelId: string = DEFAULT_CHANNEL_ID) => {
  return sendTargetedMessages(userIds, [message], channelId);
};
