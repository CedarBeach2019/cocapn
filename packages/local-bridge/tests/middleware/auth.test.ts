/**
 * Tests for auth middleware — JWT validation, public path bypass, skip mode.
 */

import { describe, it, expect } from "vitest";
import { auth } from "../../src/middleware/auth.js";
import { signJwt, generateJwtSecret } from "../../src/security/jwt.js";
import type { MiddlewareContext } from "../../src/middleware/types.js";

function makeRequest(path = "/", headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, { headers });
}

function makeCtx(request: Request): MiddlewareContext {
  return {
    request,
    state: new Map(),
    startTime: performance.now(),
    ip: "127.0.0.1",
  };
}

async function runMw(mw: ReturnType<typeof auth>, request: Request): Promise<{ ctx: MiddlewareContext }> {
  const ctx = makeCtx(request);
  let nextCalled = false;
  await mw(ctx, async () => { nextCalled = true; });
  return { ctx };
}

describe("auth middleware", () => {
  const secret = generateJwtSecret();

  it("skips auth for /api/health", async () => {
    const mw = auth({ secret });
    const { ctx } = await runMw(mw, makeRequest("/api/health"));
    expect(ctx.response).toBeUndefined();
  });

  it("skips auth for /", async () => {
    const mw = auth({ secret });
    const { ctx } = await runMw(mw, makeRequest("/"));
    expect(ctx.response).toBeUndefined();
  });

  it("skips auth for /api/public/* paths", async () => {
    const mw = auth({ secret });
    const { ctx } = await runMw(mw, makeRequest("/api/public/status"));
    expect(ctx.response).toBeUndefined();
  });

  it("returns 401 when no Authorization header", async () => {
    const mw = auth({ secret });
    const { ctx } = await runMw(mw, makeRequest("/api/chat"));
    expect(ctx.response).toBeDefined();
    expect(ctx.response!.status).toBe(401);
    const body = await ctx.response!.json();
    expect(body.code).toBe("COCAPN-010");
  });

  it("returns 401 for invalid token", async () => {
    const mw = auth({ secret });
    const { ctx } = await runMw(
      mw,
      makeRequest("/api/chat", { authorization: "Bearer invalid-token" }),
    );
    expect(ctx.response!.status).toBe(401);
  });

  it("sets ctx.state.user for valid JWT", async () => {
    const mw = auth({ secret });
    const token = signJwt({ sub: "test-user" }, secret);
    const { ctx } = await runMw(
      mw,
      makeRequest("/api/chat", { authorization: `Bearer ${token}` }),
    );
    expect(ctx.response).toBeUndefined();
    const user = ctx.state.get("user") as { sub: string };
    expect(user.sub).toBe("test-user");
  });

  it("returns 401 for expired token", async () => {
    const mw = auth({ secret });
    const token = signJwt({ sub: "user" }, secret, { ttlSeconds: -1 });
    const { ctx } = await runMw(
      mw,
      makeRequest("/api/chat", { authorization: `Bearer ${token}` }),
    );
    expect(ctx.response!.status).toBe(401);
    const body = await ctx.response!.json();
    expect(body.error).toContain("expired");
  });

  it("skips all auth when options.skip is true", async () => {
    const mw = auth({ skip: true });
    const { ctx } = await runMw(mw, makeRequest("/api/chat"));
    expect(ctx.response).toBeUndefined();
  });

  it("accepts any token when secret is not configured", async () => {
    const mw = auth({}); // no secret
    const { ctx } = await runMw(
      mw,
      makeRequest("/api/chat", { authorization: "Bearer eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ0ZXN0IiwiaXNzIjoiY29jYXBuIiwiaWF0IjoxNzAwMDAwMDAwLCJleHAiOjk5OTk5OTk5OTl9.fake" }),
    );
    // With no secret, it tries to decode but doesn't verify — should pass through
    expect(ctx.response).toBeUndefined();
  });
});
