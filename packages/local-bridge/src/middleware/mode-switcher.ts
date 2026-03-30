/**
 * Mode-switcher middleware — detects agent mode from request context.
 *
 * Sets ctx.mode and ctx.state.accessScope based on the request's
 * path, headers, and origin. Delegates to the ModeSwitcher class
 * from the publishing layer.
 */

import type { Middleware } from "./types.js";
import { ModeSwitcher, type AgentMode, type AccessScope, type RequestContext } from "../publishing/mode-switcher.js";

export { type AgentMode, type AccessScope };

export interface ModeSwitcherOptions {
  /** The ModeSwitcher instance to use. Created if not provided. */
  switcher?: ModeSwitcher;
}

export function modeSwitcher(options: ModeSwitcherOptions = {}): Middleware {
  const switcher = options.switcher ?? new ModeSwitcher();

  return async (ctx, next) => {
    const url = new URL(ctx.request.url);

    const requestContext = buildRequestContext(url, ctx.request.headers);

    const scope = switcher.resolve(requestContext);

    ctx.mode = scope.mode;
    ctx.state.set("accessScope", scope);

    await next();
  };
}

/**
 * Build a RequestContext from a URL and headers, only including
 * defined values to satisfy exactOptionalPropertyTypes.
 */
function buildRequestContext(url: URL, headers: Headers): RequestContext {
  const ctx: Partial<Record<string, unknown>> = {
    path: url.pathname,
    isHeartbeat: url.pathname === "/api/health",
  };
  const origin = headers.get("origin");
  if (origin) ctx.origin = origin;
  const authorization = headers.get("authorization");
  if (authorization) ctx.authorization = authorization;
  const fleetJwt = headers.get("x-fleet-jwt");
  if (fleetJwt) ctx.fleetJwt = fleetJwt;
  return ctx as unknown as RequestContext;
}
