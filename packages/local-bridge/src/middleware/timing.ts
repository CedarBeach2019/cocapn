/**
 * Timing middleware — adds X-Response-Time header.
 *
 * Tracks request duration and warns on slow requests (>1s).
 */

import type { Middleware } from "./types.js";
import { createLogger } from "../logger.js";

const log = createLogger("middleware");

/** Threshold (ms) above which a request is considered slow. */
const SLOW_THRESHOLD = 1000;

export interface TimingOptions {
  /** Custom slow-request threshold in ms. Default: 1000. */
  slowThreshold?: number;
}

export function timing(options: TimingOptions = {}): Middleware {
  const threshold = options.slowThreshold ?? SLOW_THRESHOLD;

  return async (ctx, next) => {
    await next();

    const duration = Math.round(performance.now() - ctx.startTime);

    if (ctx.response) {
      const headers = new Headers(ctx.response.headers);
      headers.set("X-Response-Time", `${duration}ms`);
      ctx.response = new Response(ctx.response.body, {
        status: ctx.response.status,
        statusText: ctx.response.statusText,
        headers,
      });
    }

    if (duration > threshold) {
      const url = new URL(ctx.request.url);
      log.warn("slow request", {
        path: url.pathname,
        duration: `${duration}ms`,
        threshold: `${threshold}ms`,
      });
    }
  };
}
