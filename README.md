# Email Scheduler — BullMQ + Redis + MySQL + React

A production-style email scheduling service with a dashboard. Users sign in with Google, upload a list of leads, and schedule an email campaign. The backend stores every email in MySQL, schedules one **BullMQ delayed job** per email (no cron), sends through **Ethereal SMTP** from a pool of senders, enforces **per-sender and per-campaign hourly limits** with Redis counters, notifies **Slack** when a limit is hit, indexes everything in **Elasticsearch** for search, and survives restarts without losing or duplicating emails.

```
reachinbox-scheduler/
├── docker-compose.yml        MySQL 8, Redis 7 (AOF on), Elasticsearch 8
├── sample-leads.csv          leads file for the demo
├── backend/                  Express + TypeScript API and BullMQ worker
│   └── src/
│       ├── config/env.ts           typed, validated env (zod)
│       ├── db/                     schema.sql, pool + migrations, repositories (all SQL)
│       ├── lib/                    redis, mailer (Ethereal sender pool), elastic, logger
│       ├── queue/emailQueue.ts     queue + deterministic job ids
│       ├── services/               emailService (scheduling), rateLimiter (Lua), slack
│       ├── workers/emailWorker.ts  the send pipeline
│       ├── routes/                 auth (Google), emails, slack
│       ├── app.ts / server.ts      HTTP app + Bull Board; API entry point
│       ├── worker.ts               standalone worker entry point
│       └── scripts/loadTest.ts     schedules 1000+ emails at once
└── frontend/                 React + TypeScript + Tailwind (Vite), built to the provided Figma
    └── src/
        ├── components/ui/          Button/IconButton, StatusBadge, Avatar, Popover, Spinner, EmptyState
        ├── components/layout/      AppLayout, Sidebar, UserMenu
        ├── components/mail/        ListToolbar (search/filter/refresh), EmailList, EmailRow, StarButton
        ├── components/compose/     RecipientInput (chips + Upload List), RichTextEditor, SendLaterPopover
        ├── components/             SlackConnect
        ├── context/                AuthContext, ToastContext, StatsContext
        ├── hooks/                  usePolling, useDebounced, useStarred
        ├── lib/                    typed API client, CSV lead parsing, date formatting
        └── pages/                  LoginPage, MailboxPage (Scheduled/Sent), ComposePage, EmailDetailPage
```

---

## 1. Running it locally

### Prerequisites
- Node.js 18+ (uses the built-in `fetch`)
- Docker (for MySQL, Redis, Elasticsearch)

### 1.1 Infrastructure
```bash
docker compose up -d
```
This starts MySQL on `3306`, Redis on `6379` (with `appendonly yes`) and Elasticsearch on `9200`. Elasticsearch takes ~30 s to become ready. The API still boots without it; search simply returns 503 until it is up.

### 1.2 Backend
```bash
cd backend
cp .env.example .env      # then fill in the values below
npm install
npm run dev               # API on :4000; also runs the worker (RUN_WORKER_IN_API=true)
```
Tables are created automatically on boot (`src/db/schema.sql`).

To run the worker as a separate process (the production setup), set `RUN_WORKER_IN_API=false` and start one or more workers:
```bash
npm run dev:worker        # repeat in more terminals to scale out
```

Production build: `npm run build && npm start` / `npm run start:worker`.
Tests (need Redis running): `npm test`.

### 1.3 Frontend
```bash
cd frontend
npm install
npm run dev               # http://localhost:5173
```
Vite proxies `/api` and `/admin` to `localhost:4000`. The browser therefore talks to a single origin and the httpOnly session cookie is first-party.

### 1.4 Live queue dashboard
Bull Board is at **http://localhost:4000/admin/queues** (also linked from the app header). You can protect it with `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD`.

---

## 2. Configuration

### Ethereal Email
You can configure senders in either of two ways:
- **Zero config:** leave `SMTP_SENDERS` empty. On first boot the backend calls `nodemailer.createTestAccount()` `ETHEREAL_AUTO_SENDERS` times (default 2). It stores the accounts in the `senders` table so restarts reuse the same mailboxes. Their usernames and passwords are printed in the log, and you can log in at https://ethereal.email/login to see the inbox.
- **Your own accounts:** create accounts at https://ethereal.email/create and set `SMTP_SENDERS=user1@ethereal.email:pass1,user2@ethereal.email:pass2`.

Every sent email also gets an **Open in Ethereal** link on its detail page, from `nodemailer.getTestMessageUrl`.

### Google OAuth
1. Go to Google Cloud Console → APIs & Services → Credentials → *Create OAuth client ID* → *Web application*.
2. Add the authorised redirect URI `http://localhost:5173/api/auth/google/callback`.
3. Put the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

### Slack OAuth
Slack only accepts HTTPS redirect URLs, so expose the backend with ngrok:
```bash
ngrok http 4000          # -> https://abc123.ngrok-free.app
```
1. Create an app at https://api.slack.com/apps → *From scratch*.
2. Under *OAuth & Permissions*:
   - add the redirect URL `https://abc123.ngrok-free.app/api/slack/callback`;
   - add the bot scope `incoming-webhook`.
3. Set `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET` and `SLACK_REDIRECT_URI` (the same https URL).
4. Under *Manage Distribution*, either activate public distribution or install the app to your own workspace.

### All environment variables
See `backend/.env.example`. The important throughput knobs are:

| Variable | Default | Meaning |
|---|---|---|
| `WORKER_CONCURRENCY` | `5` | Jobs processed in parallel per worker process |
| `MIN_DELAY_BETWEEN_SENDS_MS` | `2000` | **Minimum 2 seconds between two sends from the same sender** |
| `MAX_EMAILS_PER_HOUR_PER_SENDER` | `50` | Hard hourly cap per sender mailbox |
| `SEND_MAX_ATTEMPTS` | `3` | Retries (exponential backoff from 5 s) for SMTP errors |

---

## 3. Architecture

```
 React (5173) ──/api──► Express API (4000) ──► MySQL   (source of truth: campaigns, emails, senders, users, slack)
                            │       └────────► Elasticsearch (search index, best-effort)
                            ▼
                     BullMQ queue "email-send" in Redis (delayed jobs, AOF-persisted)
                            ▲
                     Worker process(es) ──► Redis counters (hourly limits, send gaps)
                            ├──► Ethereal SMTP (pool of senders)
                            └──► Slack incoming webhook (on limit hit)
```

### 3.1 How scheduling works (no cron)
`POST /api/emails/schedule` with `{ subject, body, recipients[], startTime, delayBetweenMs, hourlyLimit }`:
1. Recipients are trimmed, lower-cased, validated and de-duplicated.
2. Recipient *i* is scheduled at `startTime + i × delayBetweenMs`. A start time in the past means "now".
3. Senders are assigned round-robin from the pool.
4. The campaign row and all email rows are inserted in **one MySQL transaction**, using batched multi-row inserts.
5. One BullMQ job per email is added with `delay = scheduledAt − now` and **`jobId = email-<rowId>`**. These go in through `addBulk` in chunks of 500.
6. The rows are bulk-indexed into Elasticsearch.

BullMQ keeps delayed jobs in a Redis sorted set and promotes each one when its time comes. There is no polling loop and no cron.

### 3.2 The send pipeline (`workers/emailWorker.ts`)
```
load row ─► already sent/failed? ─► skip  (idempotent re-run)
   │
   ▼
Redis Lua: check + consume hourly slot (sender AND campaign) ─► limit hit ─► defer to next hour + Slack
   │ ok
   ▼
Redis Lua: reserve next send slot for this sender (min gap) ─► wait for it
   │
   ▼
UPDATE emails SET status='processing' WHERE id=? AND status='scheduled'   ◄── atomic claim
   │ affectedRows = 1                     │ 0 → someone else owns it: skip, give the slot back
   ▼
SMTP send ─► ok: status='sent' (+ preview URL)
          └► error: status back to 'scheduled' and BullMQ retries; on the last attempt status='failed'
```

### 3.3 Persistence across restarts
- **Delayed jobs live in Redis, not in Node memory.** Stopping the API or worker loses nothing. When a worker comes back it picks up every job that became due while it was down and sends it immediately; future jobs fire at their original time.
- Redis runs with **AOF persistence** (`--appendonly yes`), so jobs also survive a Redis restart.
- **Boot reconciler** (`reconcilePendingJobs`): on every API start, each MySQL row still marked `scheduled` is re-added to the queue with the same deterministic job id. If the job already exists, BullMQ ignores the add. If Redis was wiped, the job is recreated from MySQL. The database is the source of truth, so nothing restarts "from day 1".
- **Graceful shutdown** on SIGINT/SIGTERM: the HTTP server stops, `worker.close()` waits for in-flight jobs, and then the connections close.

### 3.4 Idempotency — an email is never sent twice
Three independent guards protect against duplicates:
1. **Deterministic job id** (`email-<rowId>`). Adding the same email twice (double submit, reconciler, restart) never creates a second job.
2. **Atomic DB claim.** `UPDATE … WHERE status='scheduled'` lets exactly one worker own a row, even with many workers and high concurrency.
3. **Final-state check.** A job that runs again for a row already `sent` or `failed` is a no-op.

**Crash during SMTP (trade-off).** If a worker dies *after* claiming a row but *before* recording the result, we cannot know whether SMTP accepted the message. BullMQ's stalled-job check re-runs the job, sees the row still in `processing`, and marks it **failed with a clear reason** instead of resending. I chose *at-most-once* because the brief says an email must never go out twice. The window for this is only the duration of one SMTP call.

Ordinary SMTP errors are different: an exception means the server did not accept the message, so the row returns to `scheduled` and is retried safely.

### 3.5 Rate limiting & concurrency

**Hourly limits (Redis, safe across workers and instances).**
- Counters are keyed by fixed clock-hour window:
  - `rl:sender:{senderId}:{hourWindow}`, limit `MAX_EMAILS_PER_HOUR_PER_SENDER` (env);
  - `rl:campaign:{campaignId}:{hourWindow}`, limit = the "Hourly limit" entered in the Compose form.
- One **Lua script** checks both counters and increments both only if both are under their limit. This is a single atomic operation inside Redis, so N workers with concurrency M can never overshoot. No in-memory counts are used.
- **When a limit is hit, the job is never dropped or failed:**
  - The worker calls `job.moveToDelayed(...)` and throws BullMQ's `DelayedError`. The job goes back to the delayed set and its retry attempts are not consumed.
  - **Order is preserved:** each overflowing job takes a sequential slot in the next window from a Redis counter `rl:overflow:{campaignId}:{window}`. It runs at `nextHourStart + rank × campaignDelay`, which keeps both its order and the requested spacing instead of releasing everything at hh:00:00.
  - The row's `scheduled_at` and `reschedule_count` are updated, so the dashboard shows the new time ("deferred 1× (rate limit)").
  - If the next hour is also full, the same logic defers again.

**Minimum delay between sends.** I chose **2 seconds per sender** (`MIN_DELAY_BETWEEN_SENDS_MS=2000`).
- A second Lua script keeps `gap:sender:{id}` = the earliest time that sender may send next.
- Each job atomically reserves the next free slot and sleeps until it arrives, so parallel jobs get evenly spaced slots (0 s, 2 s, 4 s, …) instead of racing.
- If a reservation is more than 20 s away, the job is pushed back to the delayed set rather than holding a worker slot.
- Why per sender rather than BullMQ's queue-wide `limiter`:
  - real providers throttle per mailbox, and different senders can safely send in parallel;
  - the global limiter would also throttle jobs that are only being deferred.

**Concurrency.** `WORKER_CONCURRENCY` (env) sets jobs in parallel per process, and you can run any number of worker processes. This is safe because every shared decision lives in Redis or MySQL and is atomic:
- hourly counters;
- send-gap slots;
- row claim;
- job uniqueness.

### 3.6 Behaviour under load (1000+ emails at the same time)
`npm run load-test -- 1000 100` schedules 1000 emails, all due now, with a campaign limit of 100 per hour.
- **Scheduling:** one transaction with batched inserts and chunked `addBulk`. The command prints the timing.
- **Sending, current hour:** jobs become due together. With 2 senders and a 2 s gap, the senders send in parallel at about one email every 2 s each, until the campaign (100) or sender (`MAX_EMAILS_PER_HOUR_PER_SENDER` each) limit is reached.
- **Deferral:** the remaining jobs are each deferred once into the next hour, in order and spaced. One Slack message is sent per user, sender and window; it is deduplicated with `SET NX`, so 900 deferred jobs do not produce 900 messages.
- **Following hours:** the same happens every hour until the queue drains. Nothing is dropped.
- **More throughput:** add more senders, raise the limits, or run more workers.

### 3.7 Slack notifications
- **Connecting:** "Connect Slack" in the header starts a real OAuth v2 flow with the `incoming-webhook` scope.
  - Slack shows a channel picker and returns a webhook URL, which is stored per user in `slack_connections`.
  - A confirmation message is posted to the channel immediately.
  - The OAuth `state` is a short-lived signed JWT carrying the user id, which also protects against CSRF.
- **Notifying:** the worker reads the connection from MySQL **on every limit hit**.
  - Connecting or disconnecting takes effect immediately, with no restart or redeploy.
  - If the user has no connection, nothing is sent and nothing breaks.
  - A Slack outage never affects email processing; it is caught and logged.
- **Disconnecting:** revokes the token through `auth.revoke` (best effort) and deletes the row.

### 3.8 Elasticsearch search
- Index `emails`, document id = email row id.
- Fields: `recipient` (text + keyword), `subject`, `body`, `sender`, `status`, `scheduled_at`, `sent_at`, `user_id`.
- Documents are bulk-indexed on schedule and partially updated on every status or time change.
- `GET /api/emails/search?q=&tab=` runs a fuzzy `multi_match`, boosting recipient over subject over body, filtered by user and tab. The dashboard search box uses it.
- ES is a secondary index. If it is down, scheduling and sending continue and only search returns 503.

---

## 4. API reference

| Method | Path | Description |
|---|---|---|
| GET | `/api/auth/google` | Start Google OAuth |
| GET | `/api/auth/google/callback` | OAuth callback, sets the httpOnly session cookie |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Clear session |
| POST | `/api/emails/schedule` | Schedule a campaign |
| GET | `/api/emails?tab=scheduled\|sent&page=&pageSize=` | Paginated list |
| GET | `/api/emails/stats` | Counts per tab |
| GET | `/api/emails/senders` | Sender pool for the "From" picker |
| GET | `/api/emails/:id` | One email (detail view) |
| GET | `/api/emails/search?q=&tab=` | Elasticsearch full-text search |
| GET | `/api/slack/status` | Connection status |
| GET | `/api/slack/connect` | Start Slack OAuth |
| GET | `/api/slack/callback` | Slack OAuth callback |
| DELETE | `/api/slack` | Disconnect |
| GET | `/admin/queues` | Bull Board |

Example (with a session cookie from the browser):
```bash
curl -X POST http://localhost:4000/api/emails/schedule \
  -H 'Content-Type: application/json' -b 'es_session=<cookie>' \
  -d '{"subject":"Hi","body":"Hello!","recipients":["a@example.com","b@example.com"],
       "startTime":"2026-11-05T10:00:00Z","delayBetweenMs":5000,"hourlyLimit":50}'
```

---

## 5. Features implemented

**Backend**
| Requirement | Where |
|---|---|
| Scheduling API stored in MySQL | `routes/emails.ts`, `services/emailService.ts`, `db/repositories.ts` |
| BullMQ delayed jobs, no cron | `queue/emailQueue.ts` |
| Multiple Ethereal senders | `lib/mailer.ts` (pool in `senders` table, round-robin assignment) |
| Persistence across restarts | Redis AOF + boot reconciler + graceful shutdown (`server.ts`) |
| Idempotency | deterministic job ids + atomic claim + final-state check |
| Configurable worker concurrency | `WORKER_CONCURRENCY`, `workers/emailWorker.ts` |
| Minimum delay between sends | `MIN_DELAY_BETWEEN_SENDS_MS`, Lua slot reservation |
| Hourly rate limit (per sender + per campaign), multi-worker safe | `services/rateLimiter.ts` (Redis Lua) |
| Deferral to next window, preserving order | `rateLimiter.nextSlot` + `job.moveToDelayed` |
| Slack OAuth + live notification on limit hit | `routes/slack.ts`, `services/slack.ts` |
| Elasticsearch indexing + search | `lib/elastic.ts`, `/api/emails/search` |
| Live BullMQ dashboard | Bull Board at `/admin/queues` |
| Load behaviour | `scripts/loadTest.ts`, section 3.6 |
| Tests | `services/rateLimiter.test.ts` (atomic limits under parallel calls, window reset, ordered overflow slots, send-gap spacing, BullMQ deferral not consuming attempts, deterministic job ids) |

**Frontend** (matches the Figma: login screen, sidebar layout, Scheduled/Sent lists, full-page compose with a "Send Later" picker, email detail view)
| Requirement | Where |
|---|---|
| Real Google login ("Login with Google"); user avatar, name and email at the top of the sidebar; Logout in its menu | `pages/LoginPage.tsx`, `components/layout/UserMenu.tsx`, `context/AuthContext.tsx` |
| Dashboard: Scheduled / Sent sections with live counts, Compose button | `components/layout/Sidebar.tsx`, `pages/MailboxPage.tsx` |
| Compose: From (sender picker), To (chips, paste, **Upload List** CSV/TXT with detected count), Subject, Delay between 2 emails, Hourly Limit, rich-text body | `pages/ComposePage.tsx`, `components/compose/*`, `lib/leads.ts` |
| Start time via **Send Later** (date-time picker + presets) → backend schedule API | `components/compose/SendLaterPopover.tsx` |
| Scheduled list: email, subject, scheduled time pill, status (incl. "rate-limited" when deferred) | `components/mail/EmailRow.tsx`, `components/ui/StatusBadge.tsx` |
| Sent list: email, subject, sent/failed status; detail view shows sent time, attempts, error and Ethereal link | `pages/EmailDetailPage.tsx` |
| Loading skeletons, empty states, error toasts | `components/mail/EmailList.tsx`, `components/ui/EmptyState.tsx`, `context/ToastContext.tsx` |
| Search (Elasticsearch), status filter, refresh, star | `components/mail/ListToolbar.tsx`, `hooks/useStarred.ts` |
| Slack connect / disconnect, link to the queue dashboard | `components/SlackConnect.tsx`, sidebar "Integrations" |
| Reusable typed components, typed API client | `components/ui/*`, `types/api.ts`, `lib/api.ts` |
| Live updates | `hooks/usePolling.ts` (5 s, paused when the tab is hidden) |

---

## 6. Assumptions & trade-offs
- **Fixed hourly windows** aligned to the clock hour, rather than a sliding window. They are simpler and cheaper, and they make "next available hour window" well defined. The downside is that a burst can straddle two windows, up to 2× the limit within 60 minutes across the boundary.
- **At-most-once on crash mid-send** (see 3.4). The alternative, at-least-once, could produce duplicates, which the brief rules out.
- **Two hourly limits.** The global per-sender limit is set in env. The per-campaign limit comes from the Compose form. Both apply, and the stricter one wins.
- **Round-robin sender assignment** happens at schedule time. Choosing the least-loaded sender at send time would spread load better, but makes ordering harder to reason about.
- **Polling vs websockets.** The dashboard polls every 5 s. That is enough for this use case and keeps the backend stateless.
- **Elasticsearch is best-effort.** MySQL is authoritative and ES updates are fire-and-forget. A reindex job would be the next step for production.
- **Session.** A JWT in an httpOnly, SameSite=Lax cookie, with Google tokens not stored. In development, Vite's proxy keeps everything same-origin.
- **Bull Board** is open by default for the demo; basic auth is optional through env.
- **Design deviations from the Figma:**
  - The login screen keeps the design's email/password form, but only Google sign-in is implemented, as the brief requires. The form tells users to continue with Google.
  - Attachments (the paperclip icon) are out of scope and shown disabled.
  - Stars are kept per browser (localStorage).
  - A small "Integrations" section was added to the sidebar for Slack and the queue dashboard, since the design has no place for them.
- **Rich-text bodies.** The editor emits HTML. The backend sanitizes it against an allowlist (`lib/html.ts`) before storing, then sends both HTML and plain-text MIME parts. Plain text sent through the API is also accepted and converted.

---

## 7. Demo script (≤ 5 min)
1. `docker compose up -d`, start the backend and frontend, and sign in with Google. Show the sidebar card with name, email and avatar, and the Logout menu.
2. Click **Connect Slack** (sidebar, Integrations), pick a channel, and show the confirmation message in Slack.
3. **Compose:** enter a subject and body, click **Upload List**, and pick `sample-leads.csv` ("8 email addresses detected"). Set delay = 5, hourly limit = 3. Click **Send Later**, pick now + 1 min, then **Done**. The Scheduled list fills up, and Bull Board shows 8 delayed jobs.
4. **Restart scenario:** stop the backend (Ctrl+C) before the start time, wait until the start time passes, then start it again. The emails still go out and none is sent twice. Show the Sent list, open an email, and click **Open in Ethereal**.
5. **Rate limit:** after 3 sends the campaign limit is hit. The remaining 5 emails show "deferred … (rate limit)" with next-hour times, Bull Board shows them delayed, and **Slack receives the alert**.
6. *(Bonus)* Run `npm run load-test -- 1000 100` and watch Bull Board and the logs: emails go out 2 s apart per sender and the overflow is deferred, never dropped.
7. Type in the search box to show Elasticsearch search.
