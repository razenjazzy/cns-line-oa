import type { Express } from 'express';
import { handleWebhook } from '../line/webhook';
import { resolveChannelConfig, resolveEffectiveChannelContext } from '../line/channels';
import { getAgentName } from '../line/channels';
import { resolveCommandReply } from '../line/command-router';
import { getUserLanguage, getUserProfile } from '../services/firestore';
import { safeTokenMatch } from '../services/demo-session';
import { jsonParser, webhookLimiter, webhookTestLimiter, isReadOnlyWebhookTestCommand, toSafeLogText } from './middleware';
import { isProduction, isWebhookTestEnabled, webhookTestToken } from './env';

export const registerWebhookRoutes = (app: Express): void => {
    // LINE Webhook endpoint (default channel, backward compatible)
    app.post('/webhook', webhookLimiter, handleWebhook);

    // LINE Webhook endpoint for additional configured channels
    app.post('/webhook/:channelId', webhookLimiter, handleWebhook);

    // Local test endpoint — bypasses LINE signature validation
    // Remove this before deploying to production
    app.post('/webhook-test', jsonParser, webhookTestLimiter, async (req, res) => {
        try {
            if (!isWebhookTestEnabled) {
                return res.status(404).json({
                    error: 'webhook-test is disabled in production. Set ENABLE_WEBHOOK_TEST=true to enable it.',
                });
            }

            if (webhookTestToken) {
                const incomingToken = req.get('x-webhook-test-token') || '';
                if (!safeTokenMatch(incomingToken, webhookTestToken)) {
                    return res.status(401).json({ error: 'Invalid webhook test token' });
                }
            }

            const userId: string = req.body.userId || 'test_user';
            const text: string = req.body.text || 'hello';

            if (isProduction && !isReadOnlyWebhookTestCommand(text)) {
                return res.status(403).json({
                    error: 'Mutating webhook-test commands are disabled in production.',
                });
            }

            // Optional: exercise multi-channel/service-gating behavior in tests.
            // Omitting channelId preserves prior behavior (unrestricted, no channel context).
            const rawChannelId = typeof req.body.channelId === 'string' ? req.body.channelId.trim() : '';
            let channel: { channelId: string; enabledServices: string[] | null } | undefined;
            if (rawChannelId) {
                const channelConfig = resolveChannelConfig(rawChannelId);
                if (!channelConfig) {
                    return res.status(400).json({ error: `Unknown or unconfigured LINE channel: ${rawChannelId}` });
                }
                channel = await resolveEffectiveChannelContext(channelConfig);
            }

            console.log(`[TEST] userId=${userId} channelId=${rawChannelId || 'default'} text="${toSafeLogText(text)}"`);

            const agentName = getAgentName();
            const userLanguage = await getUserLanguage(userId);
            const profile = await getUserProfile(userId);
            const baseUrl = `${req.protocol}://${req.get('host')}`;

            const botMessages = await resolveCommandReply({
                text,
                userId,
                userLanguage,
                profile,
                agentName,
                baseUrl,
                requestId: String(res.getHeader('x-request-id') || '') || undefined,
                channel,
            });
            return res.json(botMessages);
        } catch (error) {
            console.error('Error in webhook-test:', error);
            res.status(500).json({ error: String(error) });
        }
    });
};
