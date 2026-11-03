import { DelayedError, Job, Worker } from 'bullmq';
import { env } from '../config/env';
import { createRedis, redis } from '../lib/redis';
import { logger } from '../lib/logger';
import { sendMail } from '../lib/mailer';
import { updateEmailDoc } from '../lib/elastic';
import { EMAIL_QUEUE } from '../queue/emailQueue';
import { HourlyRateLimiter } from '../services/rateLimiter';
import { notifyRateLimitHit } from '../services/slack';
import {
  claimEmail,
  findSenderById,
  getEmailForSend,
  markFailed,
  markSent,
  releaseForRetry,
  rescheduleEmail,
} from '../db/repositories';
import type { SendEmailJobData } from '../types';

const rateLimiter = new HourlyRateLimiter(redis);
const MAX_INLINE_WAIT_MS = 20_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Outcome =
  | { result: 'sent'; messageId: string }
  | { result: 'skipped'; reason: string };

/**
 * Processing pipeline for one email:
 *
 *   load row ──► already final? ──yes──► skip (idempotent)
 *        │
 *        ▼
 *   Redis hourly limit (sender + campaign) ──hit──► move job to next hour window, notify Slack
 *        │ ok
 *        ▼
 *   reserve per-sender send slot (min gap) ──► wait for it
 *        │
 *        ▼
 *   atomic DB claim (scheduled -> processing) ──lost──► skip, give the slot back
 *        │ won
 *        ▼
 *   SMTP send ──ok──► mark sent
 *             └─err─► retry (row back to scheduled) or mark failed on last attempt
 */
export async function processEmailJob(job: Job<SendEmailJobData>, token?: string): Promise<Outcome> {
  const { emailId } = job.data;
  const email = await getEmailForSend(emailId);
  if (!email) return { result: 'skipped', reason: 'email row not found' };

  if (email.status === 'sent' || email.status === 'failed') {
    return { result: 'skipped', reason: `already ${email.status}` };
  }

  if (email.status === 'processing') {
    // A previous run claimed this row and then the process died mid-send
    // (BullMQ re-ran the stalled job). We cannot know if SMTP accepted it, so
    // to guarantee "never sent twice" we choose at-most-once and fail it.
    await markFailed(emailId, 'Interrupted while sending (worker crashed); not retried to avoid a duplicate send');
    await updateEmailDoc(emailId, { status: 'failed', sent_at: new Date().toISOString() });
    return { result: 'skipped', reason: 'interrupted mid-send' };
  }

  // ---- hourly rate limiting (Redis, shared across all workers) ----
  const senderLimit = env.MAX_EMAILS_PER_HOUR_PER_SENDER;
  const campaignLimit = email.hourly_limit;
  const verdict = await rateLimiter.tryConsume({
    senderId: email.sender_id,
    campaignId: email.campaign_id,
    senderLimit,
    campaignLimit,
  });

  if (!verdict.allowed) {
    const nextWindow = verdict.window + 1;
    const runAt = await rateLimiter.nextSlot(email.campaign_id, nextWindow, email.delay_between_ms);
    await rescheduleEmail(emailId, new Date(runAt));
    void updateEmailDoc(emailId, { scheduled_at: new Date(runAt).toISOString() });
    void notifyRateLimitHit({
      userId: email.user_id,
      senderId: email.sender_id,
      senderEmail: email.sender_email,
      reason: verdict.reason,
      limit: verdict.reason === 'sender' ? senderLimit : campaignLimit,
      window: verdict.window,
      nextWindowStart: verdict.nextWindowStart,
    });
    logger.info(
      `Email ${emailId}: ${verdict.reason} hourly limit reached -> deferred to ${new Date(runAt).toISOString()}`,
    );
    // Not a failure: the job goes back to the delayed set and keeps its attempts.
    await job.moveToDelayed(runAt, token);
    throw new DelayedError();
  }

  // ---- minimum gap between sends of the same sender (Redis slot reservation) ----
  const waitMs = await rateLimiter.reserveSendSlot(email.sender_id, env.MIN_DELAY_BETWEEN_SENDS_MS);
  if (waitMs > MAX_INLINE_WAIT_MS) {
    // Too long to hold a worker slot: hand the job back to the delayed set instead.
    await rateLimiter.release(email.sender_id, email.campaign_id, verdict.window);
    await job.moveToDelayed(Date.now() + waitMs, token);
    throw new DelayedError();
  }
  if (waitMs > 0) await sleep(waitMs);

  // ---- idempotency: only one worker may own this row ----
  const claimed = await claimEmail(emailId);
  if (!claimed) {
    await rateLimiter.release(email.sender_id, email.campaign_id, verdict.window);
    return { result: 'skipped', reason: 'claimed by another worker' };
  }

  const sender = await findSenderById(email.sender_id);
  if (!sender) {
    await markFailed(emailId, `Sender ${email.sender_id} no longer exists`);
    return { result: 'skipped', reason: 'sender missing' };
  }

  try {
    const res = await sendMail(sender, {
      to: email.recipient,
      subject: email.subject,
      body: email.body,
      idempotencyKey: `email-${emailId}`,
    });
    await markSent(emailId, res);
    void updateEmailDoc(emailId, { status: 'sent', sent_at: new Date().toISOString() });
    logger.info(`Email ${emailId} sent to ${email.recipient} via ${sender.email}${res.previewUrl ? ` (${res.previewUrl})` : ''}`);
    return { result: 'sent', messageId: res.messageId };
  } catch (err) {
    const message = (err as Error).message;
    const attempts = job.opts.attempts ?? 1;
    const isLastAttempt = job.attemptsMade + 1 >= attempts;
    if (isLastAttempt) {
      await markFailed(emailId, message);
      void updateEmailDoc(emailId, { status: 'failed', sent_at: new Date().toISOString() });
    } else {
      // SMTP threw => the message was not accepted, safe to hand back for a retry.
      await releaseForRetry(emailId, message);
    }
    logger.warn(`Email ${emailId} send failed (attempt ${job.attemptsMade + 1}/${attempts}): ${message}`);
    throw err; // let BullMQ apply backoff / mark failed
  }
}

export function startEmailWorker(): Worker<SendEmailJobData> {
  const worker = new Worker<SendEmailJobData>(EMAIL_QUEUE, processEmailJob, {
    connection: createRedis('worker'),
    // N jobs in parallel per process. Safe because every shared decision
    // (hourly counters, send-gap slots, row ownership) is atomic in Redis/MySQL.
    concurrency: env.WORKER_CONCURRENCY,
    // A crashed worker's job is picked up again after this lock expires.
    lockDuration: 60_000,
    maxStalledCount: 1,
  });

  worker.on('failed', (job, err) => {
    if (err instanceof DelayedError || err?.name === 'DelayedError') return;
    logger.warn(`Job ${job?.id} failed: ${err.message}`);
  });
  worker.on('error', (err) => logger.error(`Worker error: ${err.message}`));
  worker.on('ready', () =>
    logger.info(
      `Email worker ready (concurrency=${env.WORKER_CONCURRENCY}, min gap=${env.MIN_DELAY_BETWEEN_SENDS_MS}ms, ` +
        `max/hour/sender=${env.MAX_EMAILS_PER_HOUR_PER_SENDER})`,
    ),
  );
  return worker;
}
