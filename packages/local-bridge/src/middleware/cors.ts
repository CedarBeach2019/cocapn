/**
 * CORS middleware — adds Cross-Origin Resource Sharing headers.
 *
 * Configurable origins, methods, and headers. In development mode,
 * allows all origins by default.
 */

import type { Middleware } from "./types.js";

export interface CorsOptions {
  /** Allowed origins. "*" for wildcard, or array of specific origins. */
  origins?: string[] | "*";
  /** Allowed HTTP methods. */
  methods?: string[];
  /** Allowed request headers. */
  allowedHeaders?: string[];
  /** Whether to expose specific response headers to the client. */
  exposeHeaders?: string[];
  /** Whether credentials (cookies, auth) are allowed. */
  credentials?: boolean;
  /** Max age for preflight cache (seconds). Default: 86400 (24h). */
  maxAge?: number;
}

const DEFAULT_METHODS = ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"];
const DEFAULT_HEADERS = ["Content-Type", "Authorization", "X-Fleet-JWT", "X-Request-Id"];

export function cors(options: CorsOptions = {}): Middleware {
  const methods = (options.methods ?? DEFAULT_METHODS).join(", ");
  const allowedHeaders = (options.allowedHeaders ?? DEFAULT_HEADERS).join(", ");
  const exposeHeaders = options.exposeHeaders?.join(", ");
  const credentials = options.credentials ?? false;
  const maxAge = String(options.maxAge ?? 86400);

  return async (ctx, next) => {
    const origin = ctx.request.headers.get("origin");

    // Determine allowed origin
    let allowOrigin: string | null = null;
    if (options.origins === "*") {
      allowOrigin = "*";
    } else if (origin && options.origins) {
      if (options.origins.includes(origin)) {
        allowOrigin = origin;
      }
    } else if (!options.origins && origin) {
      // Default: mirror the origin (development-friendly)
      allowOrigin = origin;
    }

    // Handle preflight
    if (ctx.request.method === "OPTIONS") {
      const headers = new Headers();
      if (allowOrigin) headers.set("Access-Control-Allow-Origin", allowOrigin);
      headers.set("Access-Control-Allow-Methods", methods);
      headers.set("Access-Control-Allow-Headers", allowedHeaders);
      if (exposeHeaders) headers.set("Access-Control-Expose-Headers", exposeHeaders);
      if (credentials) headers.set("Access-Control-Allow-Credentials", "true");
      headers.set("Access-Control-Max-Age", maxAge);

      ctx.response = new Response(null, { status: 204, headers });
      return;
    }

    await next();

    // Add CORS headers to the response
    if (ctx.response && allowOrigin) {
      const headers = new Headers(ctx.response.headers);
      headers.set("Access-Control-Allow-Origin", allowOrigin);
      if (credentials) headers.set("Access-Control-Allow-Credentials", "true");
      if (exposeHeaders) headers.set("Access-Control-Expose-Headers", exposeHeaders);
      ctx.response = new Response(ctx.response.body, {
        status: ctx.response.status,
        statusText: ctx.response.statusText,
        headers,
      });
    }
  };
}
