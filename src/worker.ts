import dotenv from 'dotenv';
dotenv.config();

import { initTracing, shutdownTracing } from './observability/tracing';
import { startQueueWorkers } from './jobs/workers';
import { appLogger } from './services/logger';

initTracing();
const workers = startQueueWorkers();

const shutdown = async (signal: string) => {
  appLogger.info('worker_shutdown', { signal });
  await Promise.all(workers.map((worker) => worker.close()));
  await shutdownTracing();
  process.exit(0);
};

process.on('SIGTERM', () => { void shutdown('SIGTERM'); });
process.on('SIGINT', () => { void shutdown('SIGINT'); });
