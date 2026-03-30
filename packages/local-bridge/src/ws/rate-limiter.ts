/**
 * WebSocket Rate Limiter — sliding window rate limiting per IP.
 *
 * Prevents abuse by limiting the number of messages a client can send
 * within a time window. Uses a sliding window (not fixed window) for
 * accurate rate limiting.
 *
 * Default: 60 messages per minute per IP.
 *
 * Error code: COCAPN-071 (rate limit exceeded)
 */

// ─── Types ─────────────────────────────────────────────────────────────────────

export interface RateLimitOptions {
  /** Maximum number of requests allowed in the window */
  maxRequests: number;
  /** Window duration in milliseconds */
  windowMs: number;
}

export interface RateLimitResult {
  /** Whether the request is allowed */
  allowed: boolean;
  /** Number of requests remaining in the current window */
  remaining: number;
  /** Time when the window will reset (ms since epoch) */
  resetAt: number;
  /** Error code if not allowed */
  errorCode?: string;
}

interface TimestampedRequest {
  timestamp: number;
}

// ─── Sliding Window Rate Limiter ───────────────────────────────────────────────

/**
 * Sliding window rate limiter.
 *
 * Unlike fixed windows, sliding windows provide accurate rate limiting
 * by tracking exact timestamps of requests and counting only those
 * within the time window.
 */
export class RateLimiter {
  private options: RateLimitOptions;
  /** Map: IP address → array of request timestamps */
  private requests = new Map<string, TimestampedRequest[]>();

  constructor(options: RateLimitOptions = { maxRequests: 60, windowMs: 60_000 }) {
    this.options = options;
  }

  /**
   * Check if a request from the given IP is allowed.
   *
   * Returns a result object with:
   *   - allowed: true if request is within rate limit
   *   - remaining: number of requests remaining in the window
   *   - resetAt: timestamp when the oldest request expires
   *   - errorCode: "COCAPN-071" if rate limit exceeded
   */
  check(ip: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    // Get existing requests for this IP, or create new array
    let timestamps = this.requests.get(ip);

    if (!timestamps) {
      timestamps = [];
      this.requests.set(ip, timestamps);
    }

    // Remove requests outside the time window (sliding window effect)
    const validTimestamps = timestamps.filter((r) => r.timestamp > windowStart);

    // Update the array with only valid requests
    timestamps.length = 0;
    timestamps.push(...validTimestamps);

    // Check if rate limit is exceeded
    if (timestamps.length >= this.options.maxRequests) {
      // Find when the oldest request will expire
      const oldestTimestamp = timestamps[0]!.timestamp;
      const resetAt = oldestTimestamp + this.options.windowMs;

      return {
        allowed: false,
        remaining: 0,
        resetAt,
        errorCode: "COCAPN-071",
      };
    }

    // Add current request
    timestamps.push({ timestamp: now });

    // Calculate remaining requests
    const remaining = this.options.maxRequests - timestamps.length;

    // Calculate reset time (when the oldest request expires)
    const resetAt = timestamps[0]!.timestamp + this.options.windowMs;

    return {
      allowed: true,
      remaining,
      resetAt,
    };
  }

  /**
   * Reset rate limit for a specific IP.
   * Useful for testing or admin operations.
   */
  reset(ip: string): void {
    this.requests.delete(ip);
  }

  /**
   * Get current usage statistics for an IP.
   */
  getStats(ip: string): { count: number; resetAt: number | undefined } {
    const timestamps = this.requests.get(ip);
    if (!timestamps || timestamps.length === 0) {
      return { count: 0, resetAt: undefined };
    }

    const windowStart = Date.now() - this.options.windowMs;
    const validTimestamps = timestamps.filter((r) => r.timestamp > windowStart);

    const resetAt = validTimestamps[0]?.timestamp
      ? validTimestamps[0]!.timestamp + this.options.windowMs
      : undefined;

    return {
      count: validTimestamps.length,
      resetAt,
    };
  }

  /**
   * Clean up stale entries for all IPs.
   * Call this periodically to prevent memory leaks.
   */
  cleanup(): void {
    const now = Date.now();
    const windowStart = now - this.options.windowMs;

    for (const [ip, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter((r) => r.timestamp > windowStart);

      if (validTimestamps.length === 0) {
        // No valid requests, remove the entry
        this.requests.delete(ip);
      } else if (validTimestamps.length < timestamps.length) {
        // Some requests expired, update the array
        timestamps.length = 0;
        timestamps.push(...validTimestamps);
      }
    }
  }

  /**
   * Get the number of IPs currently being tracked.
   */
  size(): number {
    return this.requests.size;
  }
}

// ─── Error Message ─────────────────────────────────────────────────────────────

/**
 * Generate a human-readable error message for rate limit exceeded.
 */
export function rateLimitErrorMessage(result: RateLimitResult): string {
  if (result.allowed) {
    throw new Error("Rate limit not exceeded");
  }

  const resetDate = new Date(result.resetAt);
  const secondsUntilReset = Math.max(0, Math.ceil((result.resetAt - Date.now()) / 1000));

  return `Rate limit exceeded (${result.errorCode}). Too many messages. Please wait ${secondsUntilReset}s or try again at ${resetDate.toISOString()}.`;
}
