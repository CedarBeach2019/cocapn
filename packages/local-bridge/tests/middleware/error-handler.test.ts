/**
 * Tests for error-handler middleware — catches pipeline errors, structured responses.
 */

import { describe, it, expect } from "vitest";
import { errorHandler } from "../../src/middleware/error-handler.js";
import type { MiddlewareContext } from "../../src/middleware/types.js";

function makeCtx(): MiddlewareContext {
  return {
    request: new Request("http://localhost/api/chat"),
    state: new Map(),
    startTime: performance.now(),
    ip: "127.0.0.1",
  };
}

describe("errorHandler middleware", () => {
  it("catches thrown errors and returns 500", async () => {
    const mw = errorHandler();
    const ctx = makeCtx();
    await mw(ctx, async () => {
      throw new Error("something broke");
    });
    expect(ctx.response).toBeDefined();
    expect(ctx.response!.status).toBe(500);
    const body = await ctx.response!.json();
    expect(body.error).toBe("something broke");
    expect(body.code).toBeDefined();
  });

  it("respects error.status property", async () => {
    const mw = errorHandler();
    const ctx = makeCtx();
    const err = new Error("not found") as Error & { status: number };
    err.status = 404;
    await mw(ctx, async () => { throw err; });
    expect(ctx.response!.status).toBe(404);
  });

  it("respects error.code property", async () => {
    const mw = errorHandler();
    const ctx = makeCtx();
    const err = new Error("bad") as Error & { code: string };
    err.code = "COCAPN-099";
    await mw(ctx, async () => { throw err; });
    const body = await ctx.response!.json();
    expect(body.code).toBe("COCAPN-099");
  });

  it("passes through when no error is thrown", async () => {
    const mw = errorHandler();
    const ctx = makeCtx();
    await mw(ctx, async () => {
      ctx.response = new Response("ok", { status: 200 });
    });
    expect(ctx.response!.status).toBe(200);
    expect(await ctx.response!.text()).toBe("ok");
  });

  it("handles non-Error thrown values", async () => {
    const mw = errorHandler();
    const ctx = makeCtx();
    await mw(ctx, async () => {
      throw "string error";
    });
    expect(ctx.response!.status).toBe(500);
    const body = await ctx.response!.json();
    expect(body.error).toBe("string error");
  });
});
