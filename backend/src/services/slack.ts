import { env } from '../config/env';
import { logger } from '../lib/logger';
import { redis } from '../lib/redis';
import { deleteSlackConnection, getSlackConnection, upsertSlackConnection } from '../db/repositories';

const SLACK_AUTHORIZE = 'https://slack.com/oauth/v2/authorize';
const SLACK_ACCESS = 'https://slack.com/api/oauth.v2.access';
const SLACK_REVOKE = 'https://slack.com/api/auth.revoke';

export function slackConfigured(): boolean {
  return Boolean(env.SLACK_CLIENT_ID && env.SLACK_CLIENT_SECRET && env.SLACK_REDIRECT_URI);
}

/** `incoming-webhook` scope makes Slack show a channel picker and return a webhook URL. */
export function buildSlackAuthorizeUrl(state: string): string {
  const url = new URL(SLACK_AUTHORIZE);
  url.searchParams.set('client_id', env.SLACK_CLIENT_ID);
  url.searchParams.set('scope', 'incoming-webhook');
  url.searchParams.set('redirect_uri', env.SLACK_REDIRECT_URI);
  url.searchParams.set('state', state);
  return url.toString();
}

interface SlackOAuthResponse {
  ok: boolean;
  error?: string;
  access_token?: string;
  team?: { name?: string };
  incoming_webhook?: { url: string; channel: string };
}

export async function exchangeSlackCode(userId: number, code: string): Promise<void> {
  const body = new URLSearchParams({
    code,
    client_id: env.SLACK_CLIENT_ID,
    client_secret: env.SLACK_CLIENT_SECRET,
    redirect_uri: env.SLACK_REDIRECT_URI,
  });
  const res = await fetch(SLACK_ACCESS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = (await res.json()) as SlackOAuthResponse;
  if (!data.ok || !data.incoming_webhook?.url) {
    throw new Error(`Slack OAuth failed: ${data.error ?? 'no incoming webhook returned'}`);
  }
  await upsertSlackConnection({
    user_id: userId,
    team_name: data.team?.name ?? null,
    channel: data.incoming_webhook.channel,
    webhook_url: data.incoming_webhook.url,
    access_token: data.access_token ?? null,
  });
  await postToWebhook(data.incoming_webhook.url, {
    text: ':white_check_mark: Email Scheduler connected. You will be notified here when a sender hits its hourly limit.',
  });
}

export async function disconnectSlack(userId: number): Promise<void> {
  const conn = await getSlackConnection(userId);
  if (!conn) return;
  if (conn.access_token) {
    // Best effort: revoke the token so the webhook stops working on Slack's side too.
    try {
      await fetch(SLACK_REVOKE, { method: 'POST', headers: { Authorization: `Bearer ${conn.access_token}` } });
    } catch (err) {
      logger.warn(`Slack revoke failed: ${(err as Error).message}`);
    }
  }
  await deleteSlackConnection(userId);
}

async function postToWebhook(url: string, payload: unknown): Promise<void> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Slack webhook responded ${res.status}: ${await res.text()}`);
}

/**
 * Called by the worker the moment a limit is hit. The connection is read from
 * the DB on every call, so connecting / disconnecting takes effect immediately
 * (no redeploy). One message per user+sender+hour window (Redis SET NX dedupe),
 * otherwise 1000 deferred jobs would mean 1000 Slack messages.
 * Never throws: a Slack failure must not affect email processing.
 */
export async function notifyRateLimitHit(p: {
  userId: number;
  senderEmail: string;
  senderId: number;
  reason: 'sender' | 'campaign';
  limit: number;
  window: number;
  nextWindowStart: number;
}): Promise<void> {
  try {
    const conn = await getSlackConnection(p.userId);
    if (!conn) return; // not connected -> silently skip

    const dedupeKey = `slack:notified:${p.userId}:${p.reason}:${p.senderId}:${p.window}`;
    const first = await redis.set(dedupeKey, '1', 'EX', 2 * 3600, 'NX');
    if (first !== 'OK') return;

    const resumes = new Date(p.nextWindowStart).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
    const what =
      p.reason === 'sender'
        ? `Sender *${p.senderEmail}* reached its hourly limit of *${p.limit}* emails.`
        : `Your campaign reached its hourly limit of *${p.limit}* emails (sender ${p.senderEmail}).`;

    await postToWebhook(conn.webhook_url, {
      text: `Hourly rate limit reached for ${p.senderEmail}`,
      blocks: [
        { type: 'section', text: { type: 'mrkdwn', text: `:warning: *Hourly rate limit reached*\n${what}` } },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `Remaining emails were deferred, not dropped. Sending resumes at ${resumes}.` }],
        },
      ],
    });
    logger.info(`Slack rate-limit notification sent to user ${p.userId} (${conn.channel})`);
  } catch (err) {
    logger.warn(`Slack notification failed: ${(err as Error).message}`);
  }
}
