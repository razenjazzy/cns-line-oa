import { Worker } from 'bullmq';
import { resolveChannelConfig, resolveEffectiveChannelContext } from '../line/channels';
import { processLineMessageJob } from '../line/process-message';
import { runDailyReport } from './daily-report';
import { runAuditRotationJob } from './audit-rotation';
import { seedOdooSampleSalesData } from '../services/odoo';
import { bullmqPrefix } from '../http/env';
import { appLogger } from '../services/logger';
import { bullmqConnection, isQueueBackendReady, type LineEventJob, type OpsJobPayload } from './queue';

export const startQueueWorkers = (): Worker[] => {
  if (!isQueueBackendReady()) {
    appLogger.warn('bullmq_worker_skipped', { reason: 'REDIS_URL missing' });
    return [];
  }

  const connection = bullmqConnection();
  const workers: Worker[] = [];

  workers.push(new Worker<LineEventJob>('line-events', async (job) => {
    const data = job.data;
    const channelConfig = resolveChannelConfig(data.channelId);
    if (!channelConfig) {
      throw new Error(`Unknown LINE channel for queued event: ${data.channelId}`);
    }
    const channel = await resolveEffectiveChannelContext(channelConfig);
    await processLineMessageJob({
      channelConfig,
      channel,
      baseUrl: data.baseUrl,
      requestId: data.requestId,
      replyToken: data.replyToken,
      conversationId: data.conversationId,
      sourceType: data.sourceType,
      text: data.text,
      audioMessageId: data.audioMessageId,
      receivedAt: data.receivedAt,
      isGroupContext: data.isGroupContext,
    });
  }, { connection, prefix: bullmqPrefix }));

  workers.push(new Worker<OpsJobPayload>('ops-jobs', async (job) => {
    const { name, actor } = job.data;
    appLogger.info('ops_job_started', { name, jobId: job.id });
    if (name === 'daily-report') {
      await runDailyReport();
      return;
    }
    if (name === 'segmentation') {
      const { runSegmentationJob } = await import('./segmentation');
      await runSegmentationJob();
      return;
    }
    if (name === 'seed-odoo') {
      await seedOdooSampleSalesData();
      return;
    }
    if (name === 'audit-rotate') {
      await runAuditRotationJob(actor || 'queue');
    }
  }, { connection, prefix: bullmqPrefix }));

  for (const worker of workers) {
    worker.on('failed', (job, error) => {
      appLogger.error('bullmq_job_failed', { queue: worker.name, jobId: job?.id, error: String(error) });
    });
  }

  appLogger.info('bullmq_workers_started');
  return workers;
};
