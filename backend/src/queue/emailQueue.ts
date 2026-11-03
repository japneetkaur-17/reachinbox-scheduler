import { Queue } from 'bullmq';
import { env } from '../config/env';
import { createRedis } from '../lib/redis';
import type { SendEmailJobData } from '../types';

export const EMAIL_QUEUE = 'email-send';

export const emailQueue = new Queue<SendEmailJobData>(EMAIL_QUEUE, {
  connection: createRedis('queue'),
  defaultJobOptions: {
    attempts: env.SEND_MAX_ATTEMPTS,
    backoff: { type: 'exponential', delay: 5_000 },
    // Completed jobs are not needed (the DB row holds the result); keep a few for the dashboard.
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 5000 },
  },
});

/**
 * Deterministic job id per email row. BullMQ ignores `add` calls for an id
 * that already exists, so scheduling / reconciling the same email twice can
 * never create two jobs. (BullMQ forbids purely numeric custom ids, hence the prefix.)
 */
export const jobIdFor = (emailId: number) => `email-${emailId}`;

export function jobFor(emailId: number, scheduledAt: Date) {
  return {
    name: 'send-email',
    data: { emailId },
    opts: { jobId: jobIdFor(emailId), delay: Math.max(0, scheduledAt.getTime() - Date.now()) },
  };
}

/** addBulk in chunks so 1000+ recipients don't create one giant Redis pipeline. */
export async function enqueueEmails(rows: { id: number; scheduled_at: Date }[]): Promise<void> {
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    await emailQueue.addBulk(rows.slice(i, i + CHUNK).map((r) => jobFor(r.id, r.scheduled_at)));
  }
}
