/**
 * Tests for PII filter middleware — sanitization in public mode only.
 */

import { describe, it, expect } from "vitest";
import { piiFilter } from "../../src/middleware/pii-filter.js";
import type { MiddlewareContext } from "../../src/middleware/types.js";

function makeCtx(mode?: string): MiddlewareContext {
  const ctx: MiddlewareContext = {
    request: new Request("http://localhost/api/chat"),
    state: new Map(),
    startTime: performance.now(),
    ip: "127.0.0.1",
  };
  if (mode) ctx.mode = mode;
  return ctx;
}

describe("piiFilter middleware", () => {
  it("sanitizes emails in public mode", async () => {
    const mw = piiFilter();
    const ctx = makeCtx("public");
    await mw(ctx, async () => {
      ctx.response = new Response(
        JSON.stringify({ message: "Contact alice@example.com for info" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const body = await ctx.response!.text();
    expect(body).not.toContain("alice@example.com");
    expect(body).toContain("[REDACTED]");
  });

  it("sanitizes API keys in public mode", async () => {
    const mw = piiFilter();
    const ctx = makeCtx("public");
    await mw(ctx, async () => {
      ctx.response = new Response(
        JSON.stringify({ key: "sk-1234567890abcdef1234567890" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const body = await ctx.response!.text();
    expect(body).not.toContain("sk-1234567890abcdef1234567890");
    expect(body).toContain("[REDACTED]");
  });

  it("does NOT sanitize in private mode", async () => {
    const mw = piiFilter();
    const ctx = makeCtx("private");
    await mw(ctx, async () => {
      ctx.response = new Response(
        JSON.stringify({ email: "user@example.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const body = await ctx.response!.text();
    expect(body).toContain("user@example.com");
  });

  it("does NOT sanitize when mode is not set", async () => {
    const mw = piiFilter();
    const ctx = makeCtx(); // no mode
    await mw(ctx, async () => {
      ctx.response = new Response(
        JSON.stringify({ email: "user@example.com" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    const body = await ctx.response!.text();
    expect(body).toContain("user@example.com");
  });

  it("skips non-text responses", async () => {
    const mw = piiFilter();
    const ctx = makeCtx("public");
    await mw(ctx, async () => {
      ctx.response = new Response(
        new Uint8Array([1, 2, 3]),
        { status: 200, headers: { "Content-Type": "application/octet-stream" } },
      );
    });
    // Should not throw or modify binary responses
    expect(ctx.response!.status).toBe(200);
  });

  it("passes through when no response is set", async () => {
    const mw = piiFilter();
    const ctx = makeCtx("public");
    // Should not throw
    await mw(ctx, async () => {});
  });
});
