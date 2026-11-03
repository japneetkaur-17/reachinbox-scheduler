import type { Worker } from 'bullmq';
import { env } from './config/env';
import { runMigrations, pool } from './db/pool';
import { ensureSenders, closeTransporters } from './lib/mailer';
import { ensureIndex } from './lib/elastic';
import { emailQueue } from './queue/emailQueue';
import { reconcilePendingJobs } from './services/emailService';
import { startEmailWorker } from './workers/emailWorker';
import { createApp } from './app';
import { logger } from './lib/logger';
import { redis } from './lib/redis';

async function main() {
  await runMigrations();
  await ensureSenders();
  await ensureIndex();
  await reconcilePendingJobs();

  let worker: Worker | null = null;
  if (env.RUN_WORKER_IN_API) worker = startEmailWorker();

  const server = createApp().listen(env.PORT, () => {
    logger.info(`API listening on http://localhost:${env.PORT}`);
    logger.info(`Bull Board:      http://localhost:${env.PORT}/admin/queues`);
  });

  // Graceful shutdown: stop taking HTTP traffic, let in-flight jobs finish,
  // then close connections. Delayed jobs stay in Redis untouched.
  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully...`);
    server.close();
    if (worker) await worker.close();
    await emailQueue.close();
    await closeTransporters();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal startup error', err);
  process.exit(1);
});
