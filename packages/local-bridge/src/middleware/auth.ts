/**
 * Auth middleware — JWT Bearer token validation.
 *
 * Extracts the Bearer token from the Authorization header, validates
 * it as a fleet JWT, and sets ctx.state.user with the decoded payload.
 *
 * Skips authentication for public endpoints:
 *   - /api/health
 *   - /
 *   - /api/public/*
 */

import type { Middleware } from "./types.js";
import { verifyJwt, decodeJwtPayload, type JwtPayload } from "../security/jwt.js";

// ─── Public paths that never require auth ─────────────────────────────────────

const PUBLIC_PATHS = ["/api/health", "/", "/favicon.ico"];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/api/public/")) return true;
  return false;
}

// ─── Auth middleware factory ──────────────────────────────────────────────────

export interface AuthOptions {
  /** JWT secret for verification. If unset, auth is skipped. */
  secret?: string;
  /** Whether to skip auth entirely (e.g. local-only mode). */
  skip?: boolean;
}

export function auth(options: AuthOptions = {}): Middleware {
  return async (ctx, next) => {
    // Skip if auth is disabled globally
    if (options.skip) {
      await next();
      return;
    }

    // Skip for public paths
    const url = new URL(ctx.request.url);
    if (isPublicPath(url.pathname)) {
      await next();
      return;
    }

    // Extract Bearer token
    const header = ctx.request.headers.get("authorization");
    if (!header || !header.startsWith("Bearer ")) {
      ctx.response = new Response(
        JSON.stringify({ error: "Missing Authorization header", code: "COCAPN-010" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return;
    }

    const token = header.slice(7);

    // If no secret is configured, accept any token (dev mode)
    if (!options.secret) {
      const payload = decodeJwtPayload(token);
      if (payload) {
        ctx.state.set("user", payload);
      }
      await next();
      return;
    }

    // Verify JWT
    try {
      const payload = verifyJwt(token, options.secret);
      ctx.state.set("user", payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Invalid token";
      ctx.response = new Response(
        JSON.stringify({ error: message, code: "COCAPN-011" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
      return;
    }

    await next();
  };
}
