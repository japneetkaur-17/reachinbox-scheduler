import type { ResultSetHeader, RowDataPacket } from 'mysql2';
import { pool } from './pool';
import type { Campaign, EmailForSend, EmailRow, EmailStatus, Sender, User } from '../types';

type Rows<T> = (T & RowDataPacket)[];

/* ------------------------------ users ------------------------------ */

export async function upsertGoogleUser(input: {
  googleId: string;
  email: string;
  name: string;
  avatarUrl: string | null;
}): Promise<User> {
  await pool.execute(
    `INSERT INTO users (google_id, email, name, avatar_url) VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), avatar_url = VALUES(avatar_url)`,
    [input.googleId, input.email, input.name, input.avatarUrl],
  );
  const [rows] = await pool.execute<Rows<User>>('SELECT * FROM users WHERE google_id = ?', [input.googleId]);
  return rows[0];
}

export async function findUserById(id: number): Promise<User | null> {
  const [rows] = await pool.execute<Rows<User>>('SELECT * FROM users WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/* ------------------------------ senders ------------------------------ */

export async function listSenders(): Promise<Sender[]> {
  const [rows] = await pool.query<Rows<Sender>>('SELECT * FROM senders ORDER BY id');
  return rows;
}

export async function insertSender(s: Omit<Sender, 'id'>): Promise<void> {
  await pool.execute(
    `INSERT INTO senders (email, smtp_host, smtp_port, smtp_user, smtp_pass) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE smtp_pass = VALUES(smtp_pass), smtp_user = VALUES(smtp_user)`,
    [s.email, s.smtp_host, s.smtp_port, s.smtp_user, s.smtp_pass],
  );
}

export async function findSenderById(id: number): Promise<Sender | null> {
  const [rows] = await pool.execute<Rows<Sender>>('SELECT * FROM senders WHERE id = ?', [id]);
  return rows[0] ?? null;
}

/* ------------------------------ campaigns + emails ------------------------------ */

export interface NewEmail {
  recipient: string;
  seq: number;
  senderId: number;
  scheduledAt: Date;
}

/**
 * Creates the campaign and all recipient rows in ONE transaction, so a crash
 * mid-insert never leaves a half-scheduled campaign behind.
 */
export async function createCampaignWithEmails(
  campaign: Omit<Campaign, 'id'>,
  emails: NewEmail[],
): Promise<{ campaignId: number; emails: EmailRow[] }> {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.execute<ResultSetHeader>(
      `INSERT INTO campaigns (user_id, subject, body, start_time, delay_between_ms, hourly_limit, total_recipients)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        campaign.user_id,
        campaign.subject,
        campaign.body,
        campaign.start_time,
        campaign.delay_between_ms,
        campaign.hourly_limit,
        campaign.total_recipients,
      ],
    );
    const campaignId = res.insertId;

    // Batched multi-row inserts keep 1000+ recipients fast.
    const CHUNK = 500;
    for (let i = 0; i < emails.length; i += CHUNK) {
      const chunk = emails.slice(i, i + CHUNK);
      const values = chunk.map((e) => [campaignId, campaign.user_id, e.senderId, e.recipient, e.seq, e.scheduledAt]);
      await conn.query(
        'INSERT INTO emails (campaign_id, user_id, sender_id, recipient, seq, scheduled_at) VALUES ?',
        [values],
      );
    }
    await conn.commit();

    const [rows] = await pool.execute<Rows<EmailRow>>(
      'SELECT * FROM emails WHERE campaign_id = ? ORDER BY seq',
      [campaignId],
    );
    return { campaignId, emails: rows };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export async function getEmailForSend(emailId: number): Promise<EmailForSend | null> {
  const [rows] = await pool.execute<Rows<EmailForSend>>(
    `SELECT e.*, c.subject, c.body, c.delay_between_ms, c.hourly_limit, s.email AS sender_email
       FROM emails e
       JOIN campaigns c ON c.id = e.campaign_id
       JOIN senders s ON s.id = e.sender_id
      WHERE e.id = ?`,
    [emailId],
  );
  return rows[0] ?? null;
}

/**
 * Atomic claim — the core idempotency guard. Only ONE worker can flip a row
 * from 'scheduled' to 'processing'; every other attempt sees affectedRows = 0.
 */
export async function claimEmail(emailId: number): Promise<boolean> {
  const [res] = await pool.execute<ResultSetHeader>(
    `UPDATE emails SET status = 'processing', claimed_at = UTC_TIMESTAMP(3), attempts = attempts + 1
      WHERE id = ? AND status = 'scheduled'`,
    [emailId],
  );
  return res.affectedRows === 1;
}

export async function markSent(emailId: number, info: { messageId: string; previewUrl: string | null }) {
  await pool.execute(
    `UPDATE emails SET status = 'sent', sent_at = UTC_TIMESTAMP(3), message_id = ?, preview_url = ?, error = NULL
      WHERE id = ? AND status = 'processing'`,
    [info.messageId, info.previewUrl, emailId],
  );
}

export async function markFailed(emailId: number, error: string) {
  await pool.execute(
    `UPDATE emails SET status = 'failed', sent_at = UTC_TIMESTAMP(3), error = ?
      WHERE id = ? AND status IN ('scheduled', 'processing')`,
    [error.slice(0, 2000), emailId],
  );
}

/** SMTP rejected the message (so nothing was sent) -> safe to let BullMQ retry. */
export async function releaseForRetry(emailId: number, error: string) {
  await pool.execute(
    `UPDATE emails SET status = 'scheduled', claimed_at = NULL, error = ? WHERE id = ? AND status = 'processing'`,
    [error.slice(0, 2000), emailId],
  );
}

export async function rescheduleEmail(emailId: number, scheduledAt: Date) {
  await pool.execute(
    `UPDATE emails SET scheduled_at = ?, reschedule_count = reschedule_count + 1
      WHERE id = ? AND status = 'scheduled'`,
    [scheduledAt, emailId],
  );
}

const TAB_STATUSES: Record<'scheduled' | 'sent', EmailStatus[]> = {
  scheduled: ['scheduled', 'processing'],
  sent: ['sent', 'failed'],
};

export interface EmailListItem {
  id: number;
  recipient: string;
  subject: string;
  body: string;
  status: EmailStatus;
  scheduled_at: Date;
  sent_at: Date | null;
  sender_email: string;
  preview_url: string | null;
  error: string | null;
  reschedule_count: number;
}

export async function listEmailsForUser(
  userId: number,
  tab: 'scheduled' | 'sent',
  page: number,
  pageSize: number,
): Promise<{ items: EmailListItem[]; total: number }> {
  const statuses = TAB_STATUSES[tab];
  const order = tab === 'scheduled' ? 'e.scheduled_at ASC, e.id ASC' : 'e.sent_at DESC, e.id DESC';
  const offset = (page - 1) * pageSize;
  const [rows] = await pool.query<Rows<EmailListItem>>(
    `SELECT e.id, e.recipient, c.subject, SUBSTRING(c.body, 1, 600) AS body, e.status, e.scheduled_at, e.sent_at,
            s.email AS sender_email, e.preview_url, e.error, e.reschedule_count
       FROM emails e
       JOIN campaigns c ON c.id = e.campaign_id
       JOIN senders s ON s.id = e.sender_id
      WHERE e.user_id = ? AND e.status IN (?)
      ORDER BY ${order}
      LIMIT ? OFFSET ?`,
    [userId, statuses, pageSize, offset],
  );
  const [countRows] = await pool.query<Rows<{ total: number }>>(
    'SELECT COUNT(*) AS total FROM emails e WHERE e.user_id = ? AND e.status IN (?)',
    [userId, statuses],
  );
  return { items: rows, total: Number(countRows[0].total) };
}

export interface EmailDetail extends EmailListItem {
  campaign_id: number;
  attempts: number;
}

export async function getEmailDetail(userId: number, emailId: number): Promise<EmailDetail | null> {
  const [rows] = await pool.execute<Rows<EmailDetail>>(
    `SELECT e.id, e.campaign_id, e.recipient, c.subject, c.body, e.status, e.scheduled_at, e.sent_at,
            s.email AS sender_email, e.preview_url, e.error, e.reschedule_count, e.attempts
       FROM emails e
       JOIN campaigns c ON c.id = e.campaign_id
       JOIN senders s ON s.id = e.sender_id
      WHERE e.id = ? AND e.user_id = ?`,
    [emailId, userId],
  );
  return rows[0] ?? null;
}

export async function countsForUser(userId: number): Promise<{ scheduled: number; sent: number }> {
  const [rows] = await pool.query<Rows<{ status: EmailStatus; n: number }>>(
    'SELECT status, COUNT(*) AS n FROM emails WHERE user_id = ? GROUP BY status',
    [userId],
  );
  const by = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)])) as Partial<Record<EmailStatus, number>>;
  return {
    scheduled: (by.scheduled ?? 0) + (by.processing ?? 0),
    sent: (by.sent ?? 0) + (by.failed ?? 0),
  };
}

/** Used by the boot-time reconciler: rows that should have a job in Redis. */
export async function listPendingEmailIds(afterId: number, limit: number): Promise<{ id: number; scheduled_at: Date }[]> {
  const [rows] = await pool.query<Rows<{ id: number; scheduled_at: Date }>>(
    `SELECT id, scheduled_at FROM emails WHERE status = 'scheduled' AND id > ? ORDER BY id LIMIT ?`,
    [afterId, limit],
  );
  return rows;
}

/* ------------------------------ slack ------------------------------ */

export interface SlackConnection {
  user_id: number;
  team_name: string | null;
  channel: string | null;
  webhook_url: string;
  access_token: string | null;
  connected_at: Date;
}

export async function upsertSlackConnection(c: Omit<SlackConnection, 'connected_at'>) {
  await pool.execute(
    `INSERT INTO slack_connections (user_id, team_name, channel, webhook_url, access_token) VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE team_name = VALUES(team_name), channel = VALUES(channel),
       webhook_url = VALUES(webhook_url), access_token = VALUES(access_token), connected_at = CURRENT_TIMESTAMP(3)`,
    [c.user_id, c.team_name, c.channel, c.webhook_url, c.access_token],
  );
}

export async function getSlackConnection(userId: number): Promise<SlackConnection | null> {
  const [rows] = await pool.execute<Rows<SlackConnection>>('SELECT * FROM slack_connections WHERE user_id = ?', [userId]);
  return rows[0] ?? null;
}

export async function deleteSlackConnection(userId: number) {
  await pool.execute('DELETE FROM slack_connections WHERE user_id = ?', [userId]);
}
