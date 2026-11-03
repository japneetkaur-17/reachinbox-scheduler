import { z } from 'zod';
import { createCampaignWithEmails, listPendingEmailIds, listSenders } from '../db/repositories';
import { enqueueEmails } from '../queue/emailQueue';
import { indexEmails, type EmailDoc } from '../lib/elastic';
import { logger } from '../lib/logger';
import { htmlToText, normalizeBody } from '../lib/html';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const scheduleSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(998),
  body: z.string().trim().min(1, 'Body is required').max(100_000),
  recipients: z.array(z.string()).min(1, 'At least one recipient is required').max(50_000),
  startTime: z.coerce.date(),
  delayBetweenMs: z.coerce.number().int().min(0).max(24 * 3600 * 1000),
  hourlyLimit: z.coerce.number().int().min(1).max(100_000),
  /** Optional: send every email from this sender. Omitted = rotate across the pool. */
  senderId: z.coerce.number().int().positive().optional(),
});
export type ScheduleInput = z.infer<typeof scheduleSchema>;

export function normalizeRecipients(raw: string[]): { valid: string[]; invalid: string[] } {
  const seen = new Set<string>();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const r of raw) {
    const e = r.trim().toLowerCase();
    if (!e) continue;
    if (!EMAIL_RE.test(e)) {
      invalid.push(r);
      continue;
    }
    if (!seen.has(e)) {
      seen.add(e);
      valid.push(e);
    }
  }
  return { valid, invalid };
}

/**
 * Schedules a campaign:
 *  1. recipient i gets scheduledAt = startTime + i * delayBetweenMs
 *  2. senders are assigned round-robin across the pool (or the one picked in "From")
 *  3. rows are written to MySQL in one transaction (source of truth)
 *  4. one BullMQ *delayed* job per row (jobId = email-<rowId>)
 *  5. rows are indexed in Elasticsearch for search
 *
 * The hourly limit is NOT pre-computed here; it is enforced at send time by the
 * worker with Redis counters, so it stays correct even when several campaigns
 * share the same sender.
 */
export async function scheduleCampaign(userId: number, input: ScheduleInput) {
  const { valid, invalid } = normalizeRecipients(input.recipients);
  if (valid.length === 0) throw new HttpError(400, 'No valid email addresses found');

  const body = normalizeBody(input.body);
  if (!htmlToText(body)) throw new HttpError(400, 'Body is required');

  const pool = await listSenders();
  if (pool.length === 0) throw new HttpError(503, 'No SMTP senders configured');
  const senders = input.senderId ? pool.filter((s) => s.id === input.senderId) : pool;
  if (senders.length === 0) throw new HttpError(400, 'Unknown sender');

  // Never schedule in the past: a start time in the past means "start now".
  const start = Math.max(input.startTime.getTime(), Date.now());

  const { campaignId, emails } = await createCampaignWithEmails(
    {
      user_id: userId,
      subject: input.subject,
      body,
      start_time: new Date(start),
      delay_between_ms: input.delayBetweenMs,
      hourly_limit: input.hourlyLimit,
      total_recipients: valid.length,
    },
    valid.map((recipient, i) => ({
      recipient,
      seq: i,
      senderId: senders[i % senders.length].id,
      scheduledAt: new Date(start + i * input.delayBetweenMs),
    })),
  );

  await enqueueEmails(emails);

  const senderById = new Map(senders.map((s) => [s.id, s.email]));
  const plainBody = htmlToText(body);
  const docs: EmailDoc[] = emails.map((e) => ({
    id: e.id,
    user_id: userId,
    campaign_id: campaignId,
    recipient: e.recipient,
    sender: senderById.get(e.sender_id) ?? '',
    subject: input.subject,
    body: plainBody,
    status: 'scheduled',
    scheduled_at: new Date(e.scheduled_at).toISOString(),
    sent_at: null,
  }));
  void indexEmails(docs);

  logger.info(`Campaign ${campaignId}: scheduled ${emails.length} emails (user ${userId})`);
  return {
    campaignId,
    scheduled: emails.length,
    skippedInvalid: invalid.length,
    firstSendAt: new Date(start).toISOString(),
    lastSendAt: new Date(start + (valid.length - 1) * input.delayBetweenMs).toISOString(),
  };
}

/**
 * Boot-time safety net. In the normal restart case every job is still in Redis
 * (BullMQ delayed jobs are persisted, and Redis runs with AOF). If Redis lost
 * data, rows still marked 'scheduled' in MySQL get their job re-created.
 * Because jobIds are deterministic, re-adding an existing job is a no-op, so
 * this can never duplicate a send. Past-due rows get delay 0 and go out now.
 */
export async function reconcilePendingJobs(): Promise<number> {
  let afterId = 0;
  let total = 0;
  for (;;) {
    const batch = await listPendingEmailIds(afterId, 1000);
    if (batch.length === 0) break;
    await enqueueEmails(batch);
    total += batch.length;
    afterId = batch[batch.length - 1].id;
  }
  logger.info(`Reconciler: verified ${total} pending email job(s) exist in the queue`);
  return total;
}

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
