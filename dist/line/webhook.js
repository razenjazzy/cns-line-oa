"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = void 0;
const bot_sdk_1 = require("@line/bot-sdk");
const vertexai_1 = require("../services/vertexai");
const command_router_1 = require("./command-router");
const firestore_1 = require("../services/firestore");
const channels_1 = require("./channels");
const streamToBuffer = async (stream) => {
    const chunks = [];
    for await (const chunk of stream) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
};
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
        const channelId = String(req.params.channelId || channels_1.DEFAULT_CHANNEL_ID).trim();
        const channelConfig = (0, channels_1.resolveChannelConfig)(channelId);
        if (!channelConfig) {
            if (channelId === channels_1.DEFAULT_CHANNEL_ID) {
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
    (req, res, next) => {
        const channelConfig = res.locals.channelConfig;
        (0, bot_sdk_1.middleware)({ channelSecret: channelConfig.channelSecret })(req, res, next);
    },
    async (req, res) => {
        const channelConfig = res.locals.channelConfig;
        const client = new bot_sdk_1.messagingApi.MessagingApiClient({ channelAccessToken: channelConfig.channelAccessToken });
        try {
            const events = req.body.events;
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const channel = await (0, channels_1.resolveEffectiveChannelContext)(channelConfig);
            const results = await Promise.all(events.map(async (event) => {
                if (event.type !== 'message' || (event.message.type !== 'text' && event.message.type !== 'audio')) {
                    return null;
                }
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
                const agentName = (0, channels_1.getAgentName)();
                let inputText;
                if (event.message.type === 'text') {
                    inputText = event.message.text;
                }
                else {
                    // Voice message: fetch the audio bytes and transcribe with the
                    // same Gemini clients already used for insights/intent, then feed
                    // the transcript into the exact same command path as typed text.
                    const messageId = event.message.id;
                    try {
                        const blobClient = new bot_sdk_1.messagingApi.MessagingApiBlobClient({ channelAccessToken: channelConfig.channelAccessToken });
                        const audioBuffer = await streamToBuffer(await blobClient.getMessageContent(messageId));
                        inputText = await (0, vertexai_1.transcribeAudioToText)(audioBuffer, 'audio/m4a');
                    }
                    catch (err) {
                        console.error('Failed to fetch/transcribe voice message:', err);
                        inputText = null;
                    }
                    if (!inputText) {
                        return client.replyMessage({
                            replyToken,
                            messages: [{ type: 'text', text: tr(userLanguage, `${agentName} ไม่สามารถแปลงข้อความเสียงได้ กรุณาลองพิมพ์คำสั่งแทน`, `${agentName} could not understand that voice message. Please try typing instead.`) }],
                        });
                    }
                }
                // Log user ID to help find ADMIN_USER_ID for .env
                console.log(`📩 Message from source=${source?.type || 'unknown'}:${conversationId} | text: "${toSafeLogText(inputText)}"`);
                // Asynchronously score the user based on intent without blocking the reply
                if (!isAiOff()) {
                    (0, vertexai_1.classifyIntent)(inputText).then((classification) => {
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
                    text: inputText,
                    userId: conversationId,
                    userLanguage,
                    profile,
                    agentName,
                    baseUrl,
                    requestId: String(res.getHeader('x-request-id') || '') || undefined,
                    channel,
                    isGroupContext: source?.type === 'group' || source?.type === 'room',
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
