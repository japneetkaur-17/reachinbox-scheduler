/**
 * Load demo: schedules N emails (default 1000) for "now" for a demo user,
 * bypassing the HTTP layer. Watch the effect in Bull Board and the dashboard:
 *   - sends are spaced by MIN_DELAY_BETWEEN_SENDS_MS per sender
 *   - once a sender hits MAX_EMAILS_PER_HOUR_PER_SENDER (or the campaign limit)
 *     the rest are deferred to the next hour, in order, never dropped.
 *
 * Usage: npm run load-test -- [count] [hourlyLimit] [userEmail]
 */
import { runMigrations, pool } from '../db/pool';
import { ensureSenders } from '../lib/mailer';
import { ensureIndex } from '../lib/elastic';
import { emailQueue } from '../queue/emailQueue';
import { upsertGoogleUser } from '../db/repositories';
import { scheduleCampaign } from '../services/emailService';
import { redis } from '../lib/redis';
import type { RowDataPacket } from 'mysql2';

async function main() {
  const count = Number(process.argv[2] ?? 1000);
  const hourlyLimit = Number(process.argv[3] ?? 100);
  const userEmail = process.argv[4];

  await runMigrations();
  await ensureSenders();
  await ensureIndex();

  let userId: number;
  if (userEmail) {
    const [rows] = await pool.query<RowDataPacket[]>('SELECT id FROM users WHERE email = ?', [userEmail]);
    if (!rows[0]) throw new Error(`No user ${userEmail} - log in once through the UI first`);
    userId = rows[0].id;
  } else {
    userId = (await upsertGoogleUser({ googleId: 'load-test', email: 'load@test.local', name: 'Load Test', avatarUrl: null })).id;
  }

  const recipients = Array.from({ length: count }, (_, i) => `lead${i + 1}@example.com`);
  const started = Date.now();
  const res = await scheduleCampaign(userId, {
    subject: `Load test ${new Date().toISOString()}`,
    body: '<p>Hello from the load test.</p><p>This email was scheduled together with many others.</p>',
    recipients,
    startTime: new Date(),
    delayBetweenMs: 0, // everything due at the same time -> worst case
    hourlyLimit,
  });
  console.log(`Scheduled ${res.scheduled} emails in ${Date.now() - started}ms (campaign ${res.campaignId})`);
  console.log(`Queue counts:`, await emailQueue.getJobCounts('delayed', 'waiting', 'active', 'completed', 'failed'));

  await emailQueue.close();
  await redis.quit();
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
