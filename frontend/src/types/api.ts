/** Types mirroring the backend API responses. */

export interface User {
  id: number;
  email: string;
  name: string;
  avatarUrl: string | null;
}

export type EmailStatus = 'scheduled' | 'processing' | 'sent' | 'failed';
export type EmailTab = 'scheduled' | 'sent';

/** Row in the Scheduled / Sent lists (from MySQL or Elasticsearch search). */
export interface EmailItem {
  id: number;
  recipient: string;
  subject: string;
  /** Plain-text preview of the body */
  body: string;
  status: EmailStatus;
  scheduled_at: string;
  sent_at: string | null;
  sender_email?: string;
  sender?: string;
  preview_url?: string | null;
  error?: string | null;
  reschedule_count?: number;
}

export interface EmailListResponse {
  items: EmailItem[];
  total?: number;
}

/** Full email for the detail view; `body` is sanitized HTML. */
export interface EmailDetail extends EmailItem {
  campaign_id: number;
  attempts: number;
  sender_email: string;
}

export interface EmailStats {
  scheduled: number;
  sent: number;
}

export interface Sender {
  id: number;
  email: string;
}

export interface ScheduleRequest {
  subject: string;
  body: string;
  recipients: string[];
  startTime: string; // ISO
  delayBetweenMs: number;
  hourlyLimit: number;
  senderId?: number;
}

export interface ScheduleResponse {
  campaignId: number;
  scheduled: number;
  skippedInvalid: number;
  firstSendAt: string;
  lastSendAt: string;
}

export interface SlackStatus {
  configured: boolean;
  connected: boolean;
  teamName: string | null;
  channel: string | null;
  connectedAt: string | null;
}
