import IORedis from 'ioredis';
import { env } from '../config/env';
import { logger } from './logger';

/**
 * BullMQ requires maxRetriesPerRequest=null for blocking connections (workers).
 * We share one connection for queue + app commands and let BullMQ duplicate
 * what it needs internally.
 */
export function createRedis(name: string): IORedis {
  const client = new IORedis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  client.on('error', (err) => logger.error(`[redis:${name}] ${err.message}`));
  return client;
}

export const redis = createRedis('app');
