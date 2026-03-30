/**
 * Rate-limit middleware — sliding window per-IP rate limiting.
 *
 * Reuses the core RateLimiter from ws/rate-limiter.ts but wraps
 * it as an HTTP middleware that returns 429 with Retry-After header.
 */

import type { Middleware } from "./types.js";
import { RateLimiter, type RateLimitOptions } from "../ws/rate-limiter.js";

export interface RateLimitMiddlewareOptions extends RateLimitOptions {}

export function rateLimit(
  options: RateLimitMiddlewareOptions = { maxRequests: 120, windowMs: 60_000 },
): Middleware {
  const limiter = new RateLimiter(options);

  return async (ctx, next) => {
    const result = limiter.check(ctx.ip);

    if (!result.allowed) {
      const retryAfter = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
      ctx.response = new Response(
        JSON.stringify({
          error: "Too many requests",
          code: "COCAPN-071",
          retryAfter,
        }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(retryAfter),
            "X-RateLimit-Remaining": "0",
            "X-RateLimit-Reset": String(Math.ceil(result.resetAt / 1000)),
          },
        },
      );
      return;
    }

    await next();

    // Attach rate-limit headers to the response
    if (ctx.response) {
      const headers = new Headers(ctx.response.headers);
      headers.set("X-RateLimit-Remaining", String(result.remaining));
      headers.set("X-RateLimit-Reset", String(Math.ceil(result.resetAt / 1000)));
      ctx.response = new Response(ctx.response.body, {
        status: ctx.response.status,
        statusText: ctx.response.statusText,
        headers,
      });
    }
  };
}
