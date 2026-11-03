import nodemailer, { Transporter } from 'nodemailer';
import { env } from '../config/env';
import { logger } from './logger';
import { insertSender, listSenders } from '../db/repositories';
import type { Sender } from '../types';
import { htmlToText } from './html';

/**
 * Sender pool.
 * - SMTP_SENDERS="user1:pass1,user2:pass2" are upserted into the `senders` table.
 * - If the table is still empty, Ethereal test accounts are created once and stored,
 *   so the same mailboxes are reused after every restart.
 */
export async function ensureSenders(): Promise<Sender[]> {
  const configured = env.SMTP_SENDERS.split(',')
    .map((p) => p.trim())
    .filter(Boolean)
    .map((pair) => {
      const idx = pair.indexOf(':');
      return { user: pair.slice(0, idx), pass: pair.slice(idx + 1) };
    });

  for (const c of configured) {
    await insertSender({
      email: c.user,
      smtp_host: 'smtp.ethereal.email',
      smtp_port: 587,
      smtp_user: c.user,
      smtp_pass: c.pass,
    });
  }

  let senders = await listSenders();
  if (senders.length === 0) {
    logger.info(`No senders configured - creating ${env.ETHEREAL_AUTO_SENDERS} Ethereal test account(s)`);
    for (let i = 0; i < env.ETHEREAL_AUTO_SENDERS; i++) {
      const acc = await nodemailer.createTestAccount();
      await insertSender({
        email: acc.user,
        smtp_host: acc.smtp.host,
        smtp_port: acc.smtp.port,
        smtp_user: acc.user,
        smtp_pass: acc.pass,
      });
      logger.info(`Created Ethereal sender ${acc.user} (login at https://ethereal.email with pass ${acc.pass})`);
    }
    senders = await listSenders();
  }
  logger.info(`Sender pool ready: ${senders.map((s) => s.email).join(', ')}`);
  return senders;
}

// One pooled SMTP transporter per sender, reused across jobs in this process.
const transporters = new Map<number, Transporter>();

function transporterFor(sender: Sender): Transporter {
  let t = transporters.get(sender.id);
  if (!t) {
    t = nodemailer.createTransport({
      host: sender.smtp_host,
      port: sender.smtp_port,
      secure: sender.smtp_port === 465,
      pool: true,
      maxConnections: 2,
      auth: { user: sender.smtp_user, pass: sender.smtp_pass },
    });
    transporters.set(sender.id, t);
  }
  return t;
}

export interface SendResult {
  messageId: string;
  previewUrl: string | null;
}

export async function sendMail(
  sender: Sender,
  msg: { to: string; subject: string; body: string; idempotencyKey: string },
): Promise<SendResult> {
  const info = await transporterFor(sender).sendMail({
    from: sender.email,
    to: msg.to,
    subject: msg.subject,
    // Body is stored as sanitized HTML; send both MIME parts.
    html: msg.body,
    text: htmlToText(msg.body),
    // Stable Message-ID derived from the email row => downstream dedupe is possible too.
    messageId: `<${msg.idempotencyKey}@email-scheduler.local>`,
  });
  const preview = nodemailer.getTestMessageUrl(info);
  return { messageId: info.messageId, previewUrl: preview || null };
}

export async function closeTransporters() {
  for (const t of transporters.values()) t.close();
  transporters.clear();
}
