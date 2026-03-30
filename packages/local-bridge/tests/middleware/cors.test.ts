/**
 * Tests for CORS middleware — preflight, origin matching, headers.
 */

import { describe, it, expect } from "vitest";
import { cors } from "../../src/middleware/cors.js";
import type { MiddlewareContext } from "../../src/middleware/types.js";

function makeCtx(path = "/", method = "GET", headers: Record<string, string> = {}): MiddlewareContext {
  return {
    request: new Request(`http://localhost${path}`, { method, headers }),
    state: new Map(),
    startTime: performance.now(),
    ip: "127.0.0.1",
  };
}

describe("cors middleware", () => {
  it("handles preflight OPTIONS request", async () => {
    const mw = cors({ origins: "*" });
    const ctx = makeCtx("/", "OPTIONS", { origin: "http://example.com" });
    await mw(ctx, async () => {});
    expect(ctx.response).toBeDefined();
    expect(ctx.response!.status).toBe(204);
    expect(ctx.response!.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(ctx.response!.headers.get("Access-Control-Allow-Methods")).toBeDefined();
  });

  it("adds CORS headers to normal responses with wildcard origin", async () => {
    const mw = cors({ origins: "*" });
    const ctx = makeCtx("/api/chat", "POST", { origin: "http://example.com" });
    await mw(ctx, async () => {
      ctx.response = new Response("ok", { status: 200 });
    });
    expect(ctx.response!.headers.get("Access-Control-Allow-Origin")).toBe("*");
  });

  it("mirrors origin when no explicit origins configured", async () => {
    const mw = cors();
    const ctx = makeCtx("/api/chat", "GET", { origin: "http://app.example.com" });
    await mw(ctx, async () => {
      ctx.response = new Response("ok");
    });
    expect(ctx.response!.headers.get("Access-Control-Allow-Origin")).toBe("http://app.example.com");
  });

  it("allows specific origins from the list", async () => {
    const mw = cors({ origins: ["http://a.com", "http://b.com"] });
    const ctx = makeCtx("/", "GET", { origin: "http://a.com" });
    await mw(ctx, async () => {
      ctx.response = new Response("ok");
    });
    expect(ctx.response!.headers.get("Access-Control-Allow-Origin")).toBe("http://a.com");
  });

  it("blocks unknown origins", async () => {
    const mw = cors({ origins: ["http://a.com"] });
    const ctx = makeCtx("/", "GET", { origin: "http://evil.com" });
    await mw(ctx, async () => {
      ctx.response = new Response("ok");
    });
    expect(ctx.response!.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("sets credentials header when configured", async () => {
    const mw = cors({ origins: "*", credentials: true });
    const ctx = makeCtx("/", "OPTIONS", { origin: "http://example.com" });
    await mw(ctx, async () => {});
    expect(ctx.response!.headers.get("Access-Control-Allow-Credentials")).toBe("true");
  });

  it("does not set CORS headers when no origin header present", async () => {
    const mw = cors({ origins: ["http://a.com"] });
    const ctx = makeCtx("/", "GET"); // no origin
    await mw(ctx, async () => {
      ctx.response = new Response("ok");
    });
    expect(ctx.response!.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
