"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTargetedMessage = void 0;
const bot_sdk_1 = require("@line/bot-sdk");
const channels_1 = require("./channels");
// Reuses the same channel resolver as webhook.ts so channel credentials
// have a single source of truth. Defaults to the backward-compatible
// default channel when no channelId is given.
const getClient = (channelId) => {
    const channelConfig = (0, channels_1.resolveChannelConfig)(channelId);
    if (!channelConfig)
        return null;
    return new bot_sdk_1.messagingApi.MessagingApiClient({ channelAccessToken: channelConfig.channelAccessToken });
};
const sendTargetedMessage = async (userIds, text, channelId = channels_1.DEFAULT_CHANNEL_ID) => {
    const client = getClient(channelId);
    if (!client) {
        console.warn(`LINE Client not initialized for channel "${channelId}". Cannot send targeted messages.`);
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
            console.log(`Sent targeted message to ${chunk.length} users on channel "${channelId}".`);
        }
        catch (error) {
            console.error(`Error sending multicast message on channel "${channelId}":`, error);
        }
    }
};
exports.sendTargetedMessage = sendTargetedMessage;
