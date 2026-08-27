interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

/**
 * Fine for a single-instance deployment (matches the realtime emitter's approach).
 * If this ever needs to run across multiple instances, swap the Map for Redis.
 */
export function checkRateLimit(
  key: string,
  { capacity = 20, refillPerMinute = 20 }: { capacity?: number; refillPerMinute?: number } = {}
): { allowed: boolean; retryAfterSeconds?: number } {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { tokens: capacity, lastRefill: now };

  const elapsedMinutes = (now - bucket.lastRefill) / 60000;
  bucket.tokens = Math.min(capacity, bucket.tokens + elapsedMinutes * refillPerMinute);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    buckets.set(key, bucket);
    const retryAfterSeconds = Math.ceil(((1 - bucket.tokens) / refillPerMinute) * 60);
    return { allowed: false, retryAfterSeconds };
  }

  bucket.tokens -= 1;
  buckets.set(key, bucket);
  return { allowed: true };
}
