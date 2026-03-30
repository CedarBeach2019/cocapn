/**
 * PII filter middleware — strips personally identifiable information
 * from responses in public mode.
 *
 * Only applies sanitization when ctx.mode === "public".
 * Uses PublishingFilter from the publishing layer.
 */

import type { Middleware } from "./types.js";
import { PublishingFilter } from "../publishing/filter.js";

export function piiFilter(): Middleware {
  const filter = new PublishingFilter();

  return async (ctx, next) => {
    await next();

    // Only sanitize in public mode
    if (ctx.mode !== "public") return;
    if (!ctx.response) return;

    const contentType = ctx.response.headers.get("content-type") ?? "";
    if (!contentType.includes("text") && !contentType.includes("json")) return;

    // Read and sanitize the response body
    const body = await ctx.response.text();
    const sanitized = filter.sanitizeResponse(body);

    if (sanitized === body) return; // No changes needed

    ctx.response = new Response(sanitized, {
      status: ctx.response.status,
      statusText: ctx.response.statusText,
      headers: ctx.response.headers,
    });
  };
}
