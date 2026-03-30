/**
 * Tests for mode-switcher middleware — agent mode detection.
 */

import { describe, it, expect } from "vitest";
import { modeSwitcher } from "../../src/middleware/mode-switcher.js";
import type { MiddlewareContext } from "../../src/middleware/types.js";

function makeCtx(path = "/", headers: Record<string, string> = {}): MiddlewareContext {
  return {
    request: new Request(`http://localhost${path}`, { headers }),
    state: new Map(),
    startTime: performance.now(),
    ip: "127.0.0.1",
  };
}

describe("modeSwitcher middleware", () => {
  it("detects public mode for unauthenticated requests", async () => {
    const mw = modeSwitcher();
    const ctx = makeCtx("/api/public/status");
    await mw(ctx, async () => {});
    expect(ctx.mode).toBe("public");
    const scope = ctx.state.get("accessScope") as { mode: string };
    expect(scope.mode).toBe("public");
  });

  it("detects private mode with authorization header", async () => {
    const mw = modeSwitcher();
    const ctx = makeCtx("/api/chat", { authorization: "Bearer token" });
    await mw(ctx, async () => {});
    expect(ctx.mode).toBe("private");
  });

  it("detects a2a mode with x-fleet-jwt header", async () => {
    const mw = modeSwitcher();
    const ctx = makeCtx("/api/a2a/message", { "x-fleet-jwt": "some-jwt" });
    await mw(ctx, async () => {});
    expect(ctx.mode).toBe("a2a");
  });

  it("detects maintenance mode for health endpoint", async () => {
    const mw = modeSwitcher();
    const ctx = makeCtx("/api/health");
    await mw(ctx, async () => {});
    expect(ctx.mode).toBe("maintenance");
  });

  it("defaults to public for unknown paths", async () => {
    const mw = modeSwitcher();
    const ctx = makeCtx("/unknown");
    await mw(ctx, async () => {});
    expect(ctx.mode).toBe("public");
  });

  it("sets accessScope in state", async () => {
    const mw = modeSwitcher();
    const ctx = makeCtx("/api/chat", { authorization: "Bearer token" });
    await mw(ctx, async () => {});
    const scope = ctx.state.get("accessScope");
    expect(scope).toBeDefined();
    expect(scope).toHaveProperty("mode", "private");
    expect(scope).toHaveProperty("canSeePrivateFacts", true);
    expect(scope).toHaveProperty("allowedTools");
  });
});
