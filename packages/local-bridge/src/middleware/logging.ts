/**
 * Logging middleware — structured request/response logging.
 *
 * Logs method, path, status, and duration for every request.
 * Skips repetitive health-check logs to reduce noise.
 */

import type { Middleware } from "./types.js";
import { createLogger } from "../logger.js";

const log = createLogger("middleware");

/** Paths that are logged at debug level only (reduce spam). */
const QUIET_PATHS = ["/api/health", "/favicon.ico"];

export interface LoggingOptions {
  /** Paths to skip logging (added to the default quiet list). */
  skipPaths?: string[];
}

export function logging(options: LoggingOptions = {}): Middleware {
  const skipPaths = new Set([...QUIET_PATHS, ...(options.skipPaths ?? [])]);

  return async (ctx, next) => {
    const url = new URL(ctx.request.url);
    const method = ctx.request.method;
    const path = url.pathname;
    const quiet = skipPaths.has(path);

    await next();

    const duration = Math.round(performance.now() - ctx.startTime);
    const status = ctx.response?.status ?? 0;

    const data = { method, path, status, duration: `${duration}ms` };

    if (quiet) {
      log.debug("request", data);
    } else if (status >= 500) {
      log.error("request", undefined, data);
    } else if (status >= 400) {
      log.warn("request", data);
    } else {
      log.info("request", data);
    }
  };
}
