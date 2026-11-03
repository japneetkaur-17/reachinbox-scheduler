import type {
  EmailDetail,
  EmailListResponse,
  EmailStats,
  EmailTab,
  ScheduleRequest,
  ScheduleResponse,
  Sender,
  SlackStatus,
  User,
} from '../types/api';

export class ApiError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(path, {
    credentials: 'include',
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let data: { error?: string; details?: unknown } | null = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`, data?.details);
  return data as T;
}

/** Full-page navigations (OAuth redirects, Bull Board) - not fetch calls. */
export const links = {
  googleLogin: '/api/auth/google',
  slackConnect: '/api/slack/connect',
  bullBoard: '/admin/queues',
};

export const api = {
  me: () => request<{ user: User }>('/api/auth/me'),
  logout: () => request<{ ok: true }>('/api/auth/logout', { method: 'POST' }),

  listEmails: (tab: EmailTab, page = 1, pageSize = 100) =>
    request<EmailListResponse>(`/api/emails?tab=${tab}&page=${page}&pageSize=${pageSize}`),
  searchEmails: (q: string, tab: EmailTab) =>
    request<EmailListResponse>(`/api/emails/search?q=${encodeURIComponent(q)}&tab=${tab}`),
  getEmail: (id: number) => request<{ item: EmailDetail }>(`/api/emails/${id}`),
  stats: () => request<EmailStats>('/api/emails/stats'),
  senders: () => request<{ items: Sender[] }>('/api/emails/senders'),
  schedule: (body: ScheduleRequest) =>
    request<ScheduleResponse>('/api/emails/schedule', { method: 'POST', body: JSON.stringify(body) }),

  slackStatus: () => request<SlackStatus>('/api/slack/status'),
  slackDisconnect: () => request<{ ok: true }>('/api/slack', { method: 'DELETE' }),
};
