export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';

export interface User {
  id: number;
  google_id: string;
  email: string;
  name: string;
  avatar_url: string | null;
}

export interface Sender {
  id: number;
  email: string;
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_pass: string;
}

export interface Campaign {
  id: number;
  user_id: number;
  subject: string;
  body: string;
  start_time: Date;
  delay_between_ms: number;
  hourly_limit: number;
  total_recipients: number;
}

export interface EmailRow {
  id: number;
  campaign_id: number;
  user_id: number;
  sender_id: number;
  recipient: string;
  seq: number;
  scheduled_at: Date;
  status: EmailStatus;
  attempts: number;
  reschedule_count: number;
  claimed_at: Date | null;
  sent_at: Date | null;
  message_id: string | null;
  preview_url: string | null;
  error: string | null;
}

/** Email row joined with campaign + sender, used by the worker. */
export interface EmailForSend extends EmailRow {
  subject: string;
  body: string;
  delay_between_ms: number;
  hourly_limit: number;
  sender_email: string;
}

/** Payload stored inside every BullMQ job. Kept tiny: the DB is the source of truth. */
export interface SendEmailJobData {
  emailId: number;
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
}
