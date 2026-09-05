import { Queue } from 'bullmq';
import { bullmqPrefix } from '../http/env';
import { appLogger } from '../services/logger';

export type LineEventJob = {
  channelId: string;
  conversationId: string;
  replyToken: string;
  webhookEventId?: string;
  text?: string;
  audioMessageId?: string;
  sourceType?: string;
  receivedAt: number;
  requestId?: string;
  baseUrl: string;
  isGroupContext?: boolean;
};

export type OpsJobName = 'daily-report' | 'segmentation' | 'seed-odoo' | 'audit-rotate';

export type OpsJobPayload = {
  name: OpsJobName;
  actor?: string;
};

type RedisConnection = { url: string; maxRetriesPerRequest: null };

let lineQueue: Queue | null = null;
let opsQueue: Queue | null = null;

const redisUrl = (): string => (process.env.REDIS_URL || '').trim();

export const isQueueBackendReady = (): boolean => Boolean(redisUrl());

export const bullmqConnection = (): RedisConnection => {
  const url = redisUrl();
  if (!url) throw new Error('REDIS_URL is required for BullMQ');
  return { url, maxRetriesPerRequest: null };
};

export const getLineEventQueue = (): Queue => {
  if (!lineQueue) {
    lineQueue = new Queue('line-events', {
      connection: bullmqConnection(),
      prefix: bullmqPrefix,
    });
  }
  return lineQueue;
};

export const getOpsJobQueue = (): Queue => {
  if (!opsQueue) {
    opsQueue = new Queue('ops-jobs', {
      connection: bullmqConnection(),
      prefix: bullmqPrefix,
    });
  }
  return opsQueue;
};

export const enqueueLineEvent = async (job: LineEventJob): Promise<string> => {
  const queued = await getLineEventQueue().add('line-event', job, {
    jobId: job.webhookEventId,
    removeOnComplete: 100,
    removeOnFail: 200,
  });
  return String(queued.id);
};

export const enqueueOpsJob = async (name: OpsJobName, actor = 'ops'): Promise<string> => {
  const queued = await getOpsJobQueue().add(name, { name, actor }, {
    removeOnComplete: 50,
    removeOnFail: 100,
  });
  appLogger.info('ops_job_enqueued', { name, jobId: queued.id });
  return String(queued.id);
};

export const closeQueues = async (): Promise<void> => {
  await Promise.all([lineQueue?.close(), opsQueue?.close()]);
  lineQueue = null;
  opsQueue = null;
};
