/**
 * Middleware types — request/response pipeline for the bridge.
 *
 * Follows the Koa-style async middleware pattern:
 * Each middleware receives (ctx, next) and MUST call next()
 * to continue the chain. Throwing aborts the pipeline.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * Shared state bag that persists across the full middleware chain.
 * Middleware can read/write arbitrary values here.
 */
export interface MiddlewareContext {
  /** The incoming HTTP request. */
  request: Request;
  /** The outgoing HTTP response — set by the final handler or middleware. */
  response?: Response;
  /** Shared state bag for middleware to communicate. */
  state: Map<string, unknown>;
  /** High-res timestamp when execution started (ms). */
  startTime: number;
  /** Client IP address (set by upstream). */
  ip: string;
  /** Detected agent mode (set by modeSwitcher middleware). */
  mode?: string;
}

/**
 * A middleware function.
 *
 * Receives the context and a `next` callback. MUST await next()
 * to pass control to the next middleware. Throwing short-circuits
 * the pipeline (caught by errorHandler).
 */
export type Middleware = (
  ctx: MiddlewareContext,
  next: () => Promise<void>,
) => Promise<void>;
