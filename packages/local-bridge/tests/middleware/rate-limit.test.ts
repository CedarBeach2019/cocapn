/**
 * Tests for rate-limit middleware — 429 responses, headers, sliding window.
 */

import { describe, it, expect } from "vitest";
import { rateLimit } from "../../src/middleware/rate-limit.js";
import type { MiddlewareContext } from "../../src/middleware/types.js";

function makeCtx(ip = "127.0.0.1"): MiddlewareContext {
  return {
    request: new Request("http://localhost/api/chat"),
    state: new Map(),
    startTime: performance.now(),
    ip,
  };
}

describe("rate-limit middleware", () => {
  it("allows requests within the limit", async () => {
    const mw = rateLimit({ maxRequests: 5, windowMs: 60_000 });
    const ctx = makeCtx();
    await mw(ctx, async () => {
      ctx.response = new Response("ok", { status: 200 });
    });
    expect(ctx.response!.status).toBe(200);
  });

  it("adds rate-limit headers to responses", async () => {
    const mw = rateLimit({ maxRequests: 10, windowMs: 60_000 });
    const ctx = makeCtx();
    await mw(ctx, async () => {
      ctx.response = new Response("ok", { status: 200 });
    });
    expect(ctx.response!.headers.get("X-RateLimit-Remaining")).toBeDefined();
    expect(ctx.response!.headers.get("X-RateLimit-Reset")).toBeDefined();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const mw = rateLimit({ maxRequests: 2, windowMs: 60_000 });

    // Use up the limit
    for (let i = 0; i < 2; i++) {
      const ctx = makeCtx("10.0.0.1");
      await mw(ctx, async () => {
        ctx.response = new Response("ok");
      });
    }

    // Third request should be blocked
    const ctx = makeCtx("10.0.0.1");
    await mw(ctx, async () => {
      ctx.response = new Response("ok");
    });
    expect(ctx.response!.status).toBe(429);
    const body = await ctx.response!.json();
    expect(body.code).toBe("COCAPN-071");
    expect(body.retryAfter).toBeGreaterThan(0);
  });

  it("includes Retry-After header on 429", async () => {
    const mw = rateLimit({ maxRequests: 1, windowMs: 60_000 });

    // Use the single allowed request
    const ctx1 = makeCtx("10.0.0.2");
    await mw(ctx1, async () => { ctx1.response = new Response("ok"); });

    // Second request should have Retry-After
    const ctx2 = makeCtx("10.0.0.2");
    await mw(ctx2, async () => { ctx2.response = new Response("ok"); });
    expect(ctx2.response!.headers.get("Retry-After")).toBeDefined();
  });

  it("tracks limits per-IP independently", async () => {
    const mw = rateLimit({ maxRequests: 1, windowMs: 60_000 });

    // IP 1 uses its request
    const ctx1 = makeCtx("10.0.0.10");
    await mw(ctx1, async () => { ctx1.response = new Response("ok"); });

    // IP 2 should still be allowed
    const ctx2 = makeCtx("10.0.0.20");
    await mw(ctx2, async () => { ctx2.response = new Response("ok"); });
    expect(ctx2.response!.status).toBe(200);

    // IP 1 should be blocked
    const ctx3 = makeCtx("10.0.0.10");
    await mw(ctx3, async () => { ctx3.response = new Response("ok"); });
    expect(ctx3.response!.status).toBe(429);
  });
});
