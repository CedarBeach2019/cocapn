/**
 * Error handler middleware — catches unhandled errors in the pipeline.
 *
 * Must be registered FIRST (before all other middleware) so its try/catch
 * wraps the entire chain. Returns a structured JSON error response.
 */

import type { Middleware } from "./types.js";
import { createLogger } from "../logger.js";

const log = createLogger("middleware");

export function errorHandler(): Middleware {
  return async (ctx, next) => {
    try {
      await next();
    } catch (err) {
      const status = (err as any)?.status ?? (err as any)?.statusCode ?? 500;
      const message =
        err instanceof Error ? err.message : String(err);
      const code = (err as any)?.code ?? `COCAPN-${status}`;

      log.error("Unhandled request error", err, {
        path: new URL(ctx.request.url).pathname,
        method: ctx.request.method,
        status,
      });

      ctx.response = new Response(
        JSON.stringify({ error: message, code }),
        {
          status,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  };
}
