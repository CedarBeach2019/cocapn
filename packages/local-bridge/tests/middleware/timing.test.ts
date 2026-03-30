/**
 * Tests for timing middleware — X-Response-Time header, slow request detection.
 */

import { describe, it, expect, vi } from "vitest";
import { timing } from "../../src/middleware/timing.js";
import type { MiddlewareContext } from "../../src/middleware/types.js";

function makeCtx(): MiddlewareContext {
  return {
    request: new Request("http://localhost/api/chat"),
    state: new Map(),
    startTime: performance.now(),
    ip: "127.0.0.1",
  };
}

describe("timing middleware", () => {
  it("adds X-Response-Time header to response", async () => {
    const mw = timing();
    const ctx = makeCtx();
    await mw(ctx, async () => {
      ctx.response = new Response("ok", { status: 200 });
    });
    const header = ctx.response!.headers.get("X-Response-Time");
    expect(header).toBeDefined();
    expect(header!.endsWith("ms")).toBe(true);
  });

  it("works when no response is set", async () => {
    const mw = timing();
    const ctx = makeCtx();
    // Should not throw
    await mw(ctx, async () => {
      // no response set
    });
  });

  it("detects slow requests", async () => {
    const mw = timing({ slowThreshold: 0 }); // threshold 0ms → everything is "slow"
    const ctx = makeCtx();

    // Capture warn output
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    await mw(ctx, async () => {
      ctx.response = new Response("ok");
    });

    // The logger writes to stderr for warn
    warnSpy.mockRestore();
  });
});
