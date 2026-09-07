"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleWebhook = void 0;
const bot_sdk_1 = require("@line/bot-sdk");
const channels_1 = require("./channels");
const process_message_1 = require("./process-message");
const queue_1 = require("../jobs/queue");
const env_1 = require("../http/env");
const logger_1 = require("../services/logger");
const tracing_1 = require("../observability/tracing");
exports.handleWebhook = [
    (req, res, next) => {
        const channelId = String(req.params.channelId || channels_1.DEFAULT_CHANNEL_ID).trim();
        const channelConfig = (0, channels_1.resolveChannelConfig)(channelId);
        if (!channelConfig) {
            if (channelId === channels_1.DEFAULT_CHANNEL_ID) {
                logger_1.appLogger.warn('webhook_disabled_missing_config', { channelId });
                return res.status(200).send('Webhook disabled due to missing config');
            }
            logger_1.appLogger.warn('webhook_unknown_channel', { channelId });
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
        try {
            await (0, tracing_1.withSpan)('line.webhook', { 'line.channel_id': channelConfig.channelId }, async () => {
                const events = req.body.events || [];
                const baseUrl = `${req.protocol}://${req.get('host')}`;
                const requestId = String(res.getHeader('x-request-id') || '') || undefined;
                const channel = await (0, channels_1.resolveEffectiveChannelContext)(channelConfig);
                const jobs = (0, process_message_1.extractLineMessageJobs)(events);
                const receivedAt = Date.now();
                const useAsync = env_1.isLineWebhookAsync && (0, queue_1.isQueueBackendReady)();
                if (env_1.isLineWebhookAsync && !(0, queue_1.isQueueBackendReady)()) {
                    logger_1.appLogger.error('line_webhook_async_without_redis', { requestId });
                }
                if (useAsync) {
                    await Promise.all(jobs.map((job) => (0, queue_1.enqueueLineEvent)({
                        channelId: channelConfig.channelId,
                        conversationId: job.conversationId,
                        replyToken: job.replyToken,
                        webhookEventId: job.webhookEventId,
                        text: job.text,
                        audioMessageId: job.audioMessageId,
                        sourceType: job.sourceType,
                        receivedAt,
                        requestId,
                        baseUrl,
                        isGroupContext: job.isGroupContext,
                    })));
                    res.status(200).json({ queued: jobs.length });
                    return;
                }
                const results = await Promise.all(jobs.map((job) => (0, process_message_1.processLineMessageJob)({
                    channelConfig,
                    channel,
                    baseUrl,
                    requestId,
                    replyToken: job.replyToken,
                    conversationId: job.conversationId,
                    sourceType: job.sourceType,
                    text: job.text,
                    audioMessageId: job.audioMessageId,
                    receivedAt,
                    isGroupContext: job.isGroupContext,
                })));
                res.json(results);
            });
        }
        catch (err) {
            logger_1.appLogger.error('line_webhook_error', { error: String(err) });
            if (!res.headersSent)
                res.status(500).end();
        }
    },
];
