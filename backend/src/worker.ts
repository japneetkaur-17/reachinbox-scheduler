/**
 * Standalone worker process. Run as many of these as you like (on one or many
 * machines): hourly limits, send gaps and row ownership are all coordinated
 * through Redis / MySQL, never in memory.
 */
import { runMigrations, pool } from './db/pool';
import { closeTransporters, ensureSenders } from './lib/mailer';
import { ensureIndex } from './lib/elastic';
import { startEmailWorker } from './workers/emailWorker';
import { logger } from './lib/logger';
import { redis } from './lib/redis';

async function main() {
  await runMigrations();
  await ensureSenders();
  await ensureIndex();
  const worker = startEmailWorker();

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, waiting for in-flight jobs...`);
    await worker.close();
    await closeTransporters();
    await redis.quit();
    await pool.end();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error('Fatal worker error', err);
  process.exit(1);
});
