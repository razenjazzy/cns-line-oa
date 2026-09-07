"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendTargetedFlexMessage = exports.sendTargetedMessage = void 0;
const bot_sdk_1 = require("@line/bot-sdk");
const channels_1 = require("./channels");
const logger_1 = require("../services/logger");
// Reuses the same channel resolver as webhook.ts so channel credentials
// have a single source of truth. Defaults to the backward-compatible
// default channel when no channelId is given.
const getClient = (channelId) => {
    const channelConfig = (0, channels_1.resolveChannelConfig)(channelId);
    if (!channelConfig)
        return null;
    return new bot_sdk_1.messagingApi.MessagingApiClient({ channelAccessToken: channelConfig.channelAccessToken });
};
const sendTargetedMessages = async (userIds, messages, channelId = channels_1.DEFAULT_CHANNEL_ID) => {
    const client = getClient(channelId);
    if (!client) {
        logger_1.appLogger.warn('line_client_missing_for_targeted_send', { channelId, userCount: userIds.length });
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
            logger_1.appLogger.info('line_multicast_sent', { channelId, userCount: chunk.length });
        }
        catch (error) {
            logger_1.appLogger.error('line_multicast_failed', { channelId, error: String(error) });
        }
    }
};
const sendTargetedMessage = async (userIds, text, channelId = channels_1.DEFAULT_CHANNEL_ID) => {
    return sendTargetedMessages(userIds, [{ type: 'text', text }], channelId);
};
exports.sendTargetedMessage = sendTargetedMessage;
/** Same delivery path as sendTargetedMessage, for a Flex card instead of plain text (e.g. the quotation journey card pushed to a customer for approval). */
const sendTargetedFlexMessage = async (userIds, message, channelId = channels_1.DEFAULT_CHANNEL_ID) => {
    return sendTargetedMessages(userIds, [message], channelId);
};
exports.sendTargetedFlexMessage = sendTargetedFlexMessage;
