import { middleware } from '@line/bot-sdk';
import express from 'express';
import { ChannelConfig, DEFAULT_CHANNEL_ID, resolveChannelConfig, resolveEffectiveChannelContext } from './channels';
import { extractLineMessageJobs, processLineMessageJob } from './process-message';
import { enqueueLineEvent, isQueueBackendReady } from '../jobs/queue';
import { isLineWebhookAsync } from '../http/env';
import { appLogger } from '../services/logger';
import { withSpan } from '../observability/tracing';

export const handleWebhook = [
  (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const channelId = String(req.params.channelId || DEFAULT_CHANNEL_ID).trim();
    const channelConfig = resolveChannelConfig(channelId);

    if (!channelConfig) {
      if (channelId === DEFAULT_CHANNEL_ID) {
        appLogger.warn('webhook_disabled_missing_config', { channelId });
        return res.status(200).send('Webhook disabled due to missing config');
      }
      appLogger.warn('webhook_unknown_channel', { channelId });
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

    try {
      await withSpan('line.webhook', { 'line.channel_id': channelConfig.channelId }, async () => {
        const events = req.body.events || [];
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const requestId = String(res.getHeader('x-request-id') || '') || undefined;
        const channel = await resolveEffectiveChannelContext(channelConfig);
        const jobs = extractLineMessageJobs(events);
        const receivedAt = Date.now();

        const useAsync = isLineWebhookAsync && isQueueBackendReady();
        if (isLineWebhookAsync && !isQueueBackendReady()) {
          appLogger.error('line_webhook_async_without_redis', { requestId });
        }

        if (useAsync) {
          await Promise.all(jobs.map((job) => enqueueLineEvent({
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

        const results = await Promise.all(jobs.map((job) => processLineMessageJob({
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
    } catch (err) {
      appLogger.error('line_webhook_error', { error: String(err) });
      if (!res.headersSent) res.status(500).end();
    }
  },
];
