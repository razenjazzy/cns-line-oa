import { messagingApi } from '@line/bot-sdk';

// Lazy: read env vars at call time so dotenv.config() has already run
const getClient = (): messagingApi.MessagingApiClient | null => {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) return null;
  return new messagingApi.MessagingApiClient({ channelAccessToken: token });
};

export const sendTargetedMessage = async (userIds: string[], text: string) => {
  const client = getClient();
  if (!client) {
    console.warn('LINE Client not initialized. Cannot send targeted messages.');
    console.log(`[DRY RUN] Would send to ${userIds.length} users: ${text}`);
    return;
  }

  // LINE multicast API accepts up to 500 user IDs at a time
  const chunks = [];
  for (let i = 0; i < userIds.length; i += 500) {
      chunks.push(userIds.slice(i, i + 500));
  }

  for (const chunk of chunks) {
      try {
          await client.multicast({
              to: chunk,
              messages: [{ type: 'text', text }]
          });
          console.log(`Sent targeted message to ${chunk.length} users.`);
      } catch (error) {
          console.error('Error sending multicast message:', error);
      }
  }
};
