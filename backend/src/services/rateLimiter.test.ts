/**
 * Integration tests against a real Redis (REDIS_URL, default localhost:6379).
 * Run: npm test
 */
import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import IORedis from 'ioredis';
import { Queue, Worker, DelayedError, QueueEvents } from 'bullmq';
import { HourlyRateLimiter, HOUR_MS, hourWindow } from './rateLimiter';

const url = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const client = new IORedis(url, { maxRetriesPerRequest: null });
const limiter = new HourlyRateLimiter(client);
const prefix = Math.floor(Math.random() * 1e6); // isolate ids between runs

before(async () => {
  await client.ping();
});
after(async () => {
  await client.quit();
});

test('sender limit is enforced atomically under parallel calls', async () => {
  const senderId = prefix + 1;
  const now = Date.now();
  // 50 concurrent attempts, limit 10 -> exactly 10 allowed
  const results = await Promise.all(
    Array.from({ length: 50 }, (_, i) =>
      limiter.tryConsume({ senderId, campaignId: prefix * 10 + i, senderLimit: 10, campaignLimit: 1000, now }),
    ),
  );
  assert.equal(results.filter((r) => r.allowed).length, 10);
  const denied = results.find((r) => !r.allowed);
  assert.ok(denied && !denied.allowed);
  assert.equal(denied.reason, 'sender');
  assert.equal(denied.nextWindowStart, (hourWindow(now) + 1) * HOUR_MS);
});

test('campaign limit is enforced independently of the sender limit', async () => {
  const campaignId = prefix + 2;
  const now = Date.now();
  const r: boolean[] = [];
  for (let i = 0; i < 5; i++) {
    const v = await limiter.tryConsume({ senderId: prefix + 100 + i, campaignId, senderLimit: 1000, campaignLimit: 3, now });
    r.push(v.allowed);
  }
  assert.deepEqual(r, [true, true, true, false, false]);
});

test('counters reset in the next hour window', async () => {
  const senderId = prefix + 3;
  const t0 = Date.now();
  await limiter.tryConsume({ senderId, campaignId: prefix + 3, senderLimit: 1, campaignLimit: 10, now: t0 });
  const blocked = await limiter.tryConsume({ senderId, campaignId: prefix + 3, senderLimit: 1, campaignLimit: 10, now: t0 });
  assert.equal(blocked.allowed, false);
  const nextHour = await limiter.tryConsume({ senderId, campaignId: prefix + 3, senderLimit: 1, campaignLimit: 10, now: t0 + HOUR_MS });
  assert.equal(nextHour.allowed, true);
});

test('overflow slots preserve order and spacing in the next window', async () => {
  const w = hourWindow(Date.now()) + 1;
  const slots = [];
  for (let i = 0; i < 3; i++) slots.push(await limiter.nextSlot(prefix + 4, w, 2000));
  assert.deepEqual(slots, [w * HOUR_MS, w * HOUR_MS + 2000, w * HOUR_MS + 4000]);
});

test('send-gap reservation hands out evenly spaced slots to parallel workers', async () => {
  const now = Date.now();
  const waits = await Promise.all(Array.from({ length: 4 }, () => limiter.reserveSendSlot(prefix + 5, 2000, now)));
  assert.deepEqual([...waits].sort((a, b) => a - b), [0, 2000, 4000, 6000]);
});

test('BullMQ: a job moved to delayed via DelayedError runs again later and does not consume an attempt', async () => {
  const name = `test-defer-${prefix}`;
  const queue = new Queue(name, { connection: client });
  const evConn = client.duplicate();
  const wkConn = client.duplicate();
  const events = new QueueEvents(name, { connection: evConn });
  let runs = 0;
  const worker = new Worker(
    name,
    async (job, token) => {
      runs++;
      if (runs === 1) {
        await job.moveToDelayed(Date.now() + 300, token);
        throw new DelayedError();
      }
      return job.attemptsMade;
    },
    { connection: wkConn },
  );
  await events.waitUntilReady();
  const job = await queue.add('x', {}, { jobId: `j-${prefix}`, attempts: 3 });
  // Same deterministic jobId again -> ignored, no duplicate job
  await queue.add('x', {}, { jobId: `j-${prefix}`, attempts: 3 });
  const attemptsAtCompletion = await job.waitUntilFinished(events, 10_000);
  assert.equal(runs, 2);
  assert.equal(attemptsAtCompletion, 0);
  const counts = await queue.getJobCounts('completed', 'waiting', 'delayed');
  assert.equal(counts.completed, 1);
  await worker.close();
  await events.close();
  await queue.obliterate({ force: true });
  await queue.close();
  await evConn.quit();
  await wkConn.quit();
});
