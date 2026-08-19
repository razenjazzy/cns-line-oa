"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = void 0;
const bot_sdk_1 = require("@line/bot-sdk");
const vertexai_1 = require("../services/vertexai");
const command_router_1 = require("./command-router");
const firestore_1 = require("../services/firestore");
// Lazy config: read env vars at request time (after dotenv.config() has run)
const getConfig = () => ({
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
    channelSecret: process.env.LINE_CHANNEL_SECRET || '',
});
const getClient = () => {
    const config = getConfig();
    if (!config.channelAccessToken)
        return null;
    return new bot_sdk_1.messagingApi.MessagingApiClient({ channelAccessToken: config.channelAccessToken });
};
const getAgentName = () => process.env.LINE_AGENT_NAME?.trim() || 'น้องโซระ';
const isAiOff = () => /^(1|true|yes|on)$/i.test(process.env.AI_OFF || '');
const isProduction = process.env.NODE_ENV === 'production';
const toSafeLogText = (text) => {
    if (!isProduction)
        return text;
    const compact = text.replace(/\s+/g, ' ').trim();
    const clipped = compact.slice(0, 32);
    return `${clipped}${compact.length > 32 ? '...' : ''}`;
};
const tr = (language, th, en) => language === 'en' ? en : th;
exports.handleWebhook = [
    (req, res, next) => {
        const config = getConfig();
        if (!config.channelAccessToken || !config.channelSecret) {
            console.warn('LINE credentials not configured. Webhook disabled.');
            return res.status(200).send('Webhook disabled due to missing config');
        }
        next();
    },
    (req, res, next) => {
        (0, bot_sdk_1.middleware)(getConfig())(req, res, next);
    },
    async (req, res) => {
        const client = getClient();
        if (!client)
            return res.status(500).end();
        try {
            const events = req.body.events;
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const results = await Promise.all(events.map(async (event) => {
                if (event.type !== 'message' || event.message.type !== 'text') {
                    return null;
                }
                const textMessage = event.message;
                const replyToken = event.replyToken;
                const source = event.source;
                if (!replyToken)
                    return null;
                const conversationId = source?.userId || source?.groupId || source?.roomId;
                if (!conversationId) {
                    console.warn('Webhook event missing source identity; skipping event.');
                    return null;
                }
                const userLanguage = await (0, firestore_1.getUserLanguage)(conversationId);
                const profile = await (0, firestore_1.getUserProfile)(conversationId);
                const agentName = getAgentName();
                // Log user ID to help find ADMIN_USER_ID for .env
                console.log(`📩 Message from source=${source?.type || 'unknown'}:${conversationId} | text: "${toSafeLogText(textMessage.text)}"`);
                // Asynchronously score the user based on intent without blocking the reply
                if (!isAiOff()) {
                    (0, vertexai_1.classifyIntent)(textMessage.text).then((classification) => {
                        (0, firestore_1.updateUserScore)(conversationId, classification.intent).catch(err => {
                            console.error('Failed to update user score:', err);
                        });
                    }).catch(err => console.error('Intent classification failed:', err));
                }
                // Check escalation state
                const isEscalated = await (0, firestore_1.getEscalationState)(conversationId);
                if (isEscalated) {
                    return client.replyMessage({
                        replyToken,
                        messages: [{ type: 'text', text: tr(userLanguage, `ตอนนี้คุณกำลังคุยกับแอดมินแล้วค่ะ - ${agentName}`, `You are currently connected with a human agent - ${agentName}`) }]
                    });
                }
                const messages = await (0, command_router_1.resolveCommandReply)({
                    text: textMessage.text,
                    userId: conversationId,
                    userLanguage,
                    profile,
                    agentName,
                    baseUrl,
                });
                return client.replyMessage({
                    replyToken,
                    messages,
                });
            }));
            res.json(results);
        }
        catch (err) {
            console.error('Error in LINE webhook:', err);
            res.status(500).end();
        }
    },
];
