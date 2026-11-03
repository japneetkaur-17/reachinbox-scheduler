import type IORedis from 'ioredis';

export const HOUR_MS = 60 * 60 * 1000;

/** Fixed hourly windows aligned to the clock hour: window = hours since the Unix epoch. */
export function hourWindow(ts: number): number {
  return Math.floor(ts / HOUR_MS);
}
export function windowStart(window: number): number {
  return window * HOUR_MS;
}

/**
 * Checks BOTH limits and consumes one slot from each, atomically, inside Redis.
 * Because the check-and-increment happens in a single Lua script it is safe
 * across any number of worker processes / machines (no in-memory counters).
 *
 * KEYS[1] = sender counter   rl:sender:{senderId}:{window}
 * KEYS[2] = campaign counter rl:campaign:{campaignId}:{window}
 * ARGV    = senderLimit, campaignLimit, ttlSeconds
 * returns 0 = allowed, 1 = sender limit hit, 2 = campaign limit hit
 */
const CONSUME_LUA = `
local s = tonumber(redis.call('GET', KEYS[1]) or '0')
local c = tonumber(redis.call('GET', KEYS[2]) or '0')
if s >= tonumber(ARGV[1]) then return 1 end
if c >= tonumber(ARGV[2]) then return 2 end
redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[3])
redis.call('INCR', KEYS[2])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 0
`;

const RELEASE_LUA = `
for i = 1, #KEYS do
  local v = tonumber(redis.call('GET', KEYS[i]) or '0')
  if v > 0 then redis.call('DECR', KEYS[i]) end
end
return 1
`;

/**
 * Minimum gap between two sends from the same sender.
 * KEYS[1] = gap:sender:{id} holding the earliest time (ms) the next send may start.
 * Reserves the next free slot atomically and returns how long the caller must wait.
 * Parallel workers therefore get distinct, evenly spaced slots instead of racing.
 */
const RESERVE_GAP_LUA = `
local now = tonumber(ARGV[1])
local gap = tonumber(ARGV[2])
local nextAllowed = tonumber(redis.call('GET', KEYS[1]) or '0')
local slot = now
if nextAllowed > now then slot = nextAllowed end
redis.call('SET', KEYS[1], slot + gap, 'PX', gap + 60000)
return slot - now
`;

export type LimitVerdict =
  | { allowed: true; window: number }
  | { allowed: false; window: number; reason: 'sender' | 'campaign'; nextWindowStart: number };

export class HourlyRateLimiter {
  constructor(private readonly client: IORedis) {}

  private keys(senderId: number, campaignId: number, window: number): [string, string] {
    return [`rl:sender:${senderId}:${window}`, `rl:campaign:${campaignId}:${window}`];
  }

  async tryConsume(p: {
    senderId: number;
    campaignId: number;
    senderLimit: number;
    campaignLimit: number;
    now?: number;
  }): Promise<LimitVerdict> {
    const now = p.now ?? Date.now();
    const window = hourWindow(now);
    const ttl = Math.ceil((2 * HOUR_MS) / 1000); // keep a little past the window for debugging
    const result = (await this.client.eval(
      CONSUME_LUA,
      2,
      ...this.keys(p.senderId, p.campaignId, window),
      p.senderLimit,
      p.campaignLimit,
      ttl,
    )) as number;

    if (result === 0) return { allowed: true, window };
    return {
      allowed: false,
      window,
      reason: result === 1 ? 'sender' : 'campaign',
      nextWindowStart: windowStart(window + 1),
    };
  }

  /** Reserve the next send slot for a sender; resolves to the wait in ms (0 = send now). */
  async reserveSendSlot(senderId: number, gapMs: number, now = Date.now()): Promise<number> {
    if (gapMs <= 0) return 0;
    const wait = (await this.client.eval(RESERVE_GAP_LUA, 1, `gap:sender:${senderId}`, now, gapMs)) as number;
    return Math.max(0, Number(wait));
  }

  /** Give a slot back (e.g. the row turned out to be already claimed). */
  async release(senderId: number, campaignId: number, window: number): Promise<void> {
    await this.client.eval(RELEASE_LUA, 2, ...this.keys(senderId, campaignId, window));
  }

  async usage(senderId: number, now = Date.now()): Promise<number> {
    const v = await this.client.get(`rl:sender:${senderId}:${hourWindow(now)}`);
    return Number(v ?? 0);
  }

  /**
   * Where should a deferred job go? Overflowing jobs of one campaign are laid
   * out one-by-one in the next window, spaced by the campaign's delay, using a
   * Redis counter for the slot index. This keeps their relative order and the
   * requested spacing instead of stampeding at hh:00:00.
   */
  async nextSlot(campaignId: number, targetWindow: number, delayBetweenMs: number): Promise<number> {
    const key = `rl:overflow:${campaignId}:${targetWindow}`;
    const rank = await this.client.incr(key);
    await this.client.expire(key, Math.ceil((3 * HOUR_MS) / 1000));
    return windowStart(targetWindow) + (rank - 1) * Math.max(delayBetweenMs, 0);
  }
}
