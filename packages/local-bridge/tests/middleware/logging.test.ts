/**
 * Tests for logging middleware — structured request logging.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logging } from "../../src/middleware/logging.js";
import type { MiddlewareContext } from "../../src/middleware/types.js";

function makeCtx(path = "/"): MiddlewareContext {
  return {
    request: new Request(`http://localhost${path}`),
    state: new Map(),
    startTime: performance.now(),
    ip: "127.0.0.1",
  };
}

describe("logging middleware", () => {
  let stdoutSpy: ReturnType<typeof vi.spyOn>;
  let stderrSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
    stderrSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
  });

  it("logs successful requests", async () => {
    const mw = logging();
    const ctx = makeCtx("/api/chat");
    await mw(ctx, async () => {
      ctx.response = new Response("ok", { status: 200 });
    });
    expect(stdoutSpy).toHaveBeenCalled();
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("request");
    expect(output).toContain("/api/chat");
    expect(output).toContain("200");
  });

  it("logs 4xx as warnings", async () => {
    const mw = logging();
    const ctx = makeCtx("/api/missing");
    await mw(ctx, async () => {
      ctx.response = new Response("not found", { status: 404 });
    });
    expect(stderrSpy).toHaveBeenCalled();
    const output = stderrSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("404");
  });

  it("skips health check logging at info level (debug only)", async () => {
    const mw = logging();
    const ctx = makeCtx("/api/health");
    await mw(ctx, async () => {
      ctx.response = new Response("ok", { status: 200 });
    });
    // Health checks go to stdout at debug level
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("debug");
  });

  it("respects custom skip paths", async () => {
    const mw = logging({ skipPaths: ["/api/metrics"] });
    const ctx = makeCtx("/api/metrics");
    await mw(ctx, async () => {
      ctx.response = new Response("ok", { status: 200 });
    });
    const output = stdoutSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(output).toContain("debug");
  });
});
