export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

export interface RateLimiter {
  consume(key: string): RateLimitResult;
  size(): number;
}

interface RateLimiterOptions {
  limit: number;
  windowMs: number;
  maxEntries: number;
  now?: () => number;
}

interface RateLimitEntry {
  count: number;
  resetsAt: number;
}

export function createRateLimiter(options: RateLimiterOptions): RateLimiter {
  if (
    !Number.isSafeInteger(options.limit) ||
    options.limit < 1 ||
    !Number.isSafeInteger(options.windowMs) ||
    options.windowMs < 1 ||
    !Number.isSafeInteger(options.maxEntries) ||
    options.maxEntries < 1
  ) {
    throw new TypeError("Rate-limit bounds must be positive integers.");
  }
  const entries = new Map<string, RateLimitEntry>();
  const now = options.now ?? Date.now;

  return {
    consume(key) {
      const currentTime = now();
      removeExpired(entries, currentTime);
      let entry = entries.get(key);
      if (!entry) {
        while (entries.size >= options.maxEntries) {
          const oldestKey = entries.keys().next().value as string | undefined;
          if (!oldestKey) break;
          entries.delete(oldestKey);
        }
        entry = { count: 0, resetsAt: currentTime + options.windowMs };
        entries.set(key, entry);
      }
      if (entry.count >= options.limit) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(
            1,
            Math.ceil((entry.resetsAt - currentTime) / 1_000),
          ),
        };
      }
      entry.count += 1;
      return { allowed: true };
    },
    size: () => entries.size,
  };
}

function removeExpired(
  entries: Map<string, RateLimitEntry>,
  currentTime: number,
): void {
  for (const [key, entry] of entries) {
    if (entry.resetsAt <= currentTime) entries.delete(key);
  }
}
