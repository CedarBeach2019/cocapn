/**
 * Tests for src/publishing/mode-switcher.ts
 *
 * Covers:
 *   - detectMode: mode detection from request context
 *   - getScope: access scope retrieval
 *   - resolve: combined detect + scope
 *   - isToolAllowed: tool permission checks per mode
 */

import { describe, it, expect } from "vitest";
import { ModeSwitcher } from "../../src/publishing/mode-switcher.js";
import type { RequestContext } from "../../src/publishing/mode-switcher.js";

const switcher = new ModeSwitcher();

// ─── Helpers ──────────────────────────────────────────────────────────────────

function ctx(overrides: Partial<RequestContext> = {}): RequestContext {
  return {
    path: "/api/public/status",
    ...overrides,
  };
}

// ─── detectMode ───────────────────────────────────────────────────────────────

describe("ModeSwitcher.detectMode", () => {
  describe("public mode", () => {
    it("detects public mode for /api/public/ path with no auth", () => {
      expect(switcher.detectMode(ctx({ path: "/api/public/status" }))).toBe("public");
    });

    it("detects public mode for /api/public/profile with external origin", () => {
      expect(switcher.detectMode(ctx({
        path: "/api/public/profile",
        origin: "https://external-site.com",
      }))).toBe("public");
    });

    it("defaults to public for unknown paths with no auth", () => {
      expect(switcher.detectMode(ctx({ path: "/unknown" }))).toBe("public");
    });
  });

  describe("private mode", () => {
    it("detects private mode with Bearer token", () => {
      expect(switcher.detectMode(ctx({
        path: "/ws",
        authorization: "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      }))).toBe("private");
    });

    it("detects private mode with any authorization header", () => {
      expect(switcher.detectMode(ctx({
        path: "/api/chat",
        authorization: "some-token-value",
      }))).toBe("private");
    });
  });

  describe("maintenance mode", () => {
    it("detects maintenance mode on cron trigger", () => {
      expect(switcher.detectMode(ctx({
        path: "/internal/sync",
        isCronTrigger: true,
      }))).toBe("maintenance");
    });

    it("detects maintenance mode on heartbeat", () => {
      expect(switcher.detectMode(ctx({
        path: "/health",
        isHeartbeat: true,
      }))).toBe("maintenance");
    });

    it("detects maintenance mode when maintenanceMode flag is set", () => {
      expect(switcher.detectMode(ctx({
        path: "/api/status",
        maintenanceMode: true,
      }))).toBe("maintenance");
    });

    it("maintenance takes priority over auth token", () => {
      expect(switcher.detectMode(ctx({
        path: "/ws",
        authorization: "Bearer token",
        isCronTrigger: true,
      }))).toBe("maintenance");
    });

    it("maintenance takes priority over fleet JWT", () => {
      expect(switcher.detectMode(ctx({
        path: "/api/a2a/message",
        fleetJwt: "fleet-jwt-value",
        isHeartbeat: true,
      }))).toBe("maintenance");
    });
  });

  describe("a2a mode", () => {
    it("detects a2a mode with Fleet-JWT header", () => {
      expect(switcher.detectMode(ctx({
        path: "/api/a2a/message",
        fleetJwt: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9",
      }))).toBe("a2a");
    });

    it("a2a takes priority over regular auth", () => {
      // Fleet-JWT is checked before Authorization
      expect(switcher.detectMode(ctx({
        path: "/api/a2a/message",
        fleetJwt: "fleet-jwt",
        authorization: "Bearer user-token",
      }))).toBe("a2a");
    });

    it("a2a does not activate with empty fleet JWT", () => {
      expect(switcher.detectMode(ctx({
        path: "/api/a2a/message",
        fleetJwt: "",
        authorization: "Bearer token",
      }))).toBe("private");
    });
  });
});

// ─── getScope ─────────────────────────────────────────────────────────────────

describe("ModeSwitcher.getScope", () => {
  it("public scope denies private access", () => {
    const scope = switcher.getScope("public");
    expect(scope.canSeePrivateFacts).toBe(false);
    expect(scope.canSeeRawWiki).toBe(false);
    expect(scope.canSeeRawTasks).toBe(false);
    expect(scope.canWriteMemory).toBe(false);
    expect(scope.canExecuteShell).toBe(false);
    expect(scope.canAccessNetwork).toBe(false);
  });

  it("private scope allows full access", () => {
    const scope = switcher.getScope("private");
    expect(scope.canSeePrivateFacts).toBe(true);
    expect(scope.canSeeRawWiki).toBe(true);
    expect(scope.canSeeRawTasks).toBe(true);
    expect(scope.canWriteMemory).toBe(true);
    expect(scope.canExecuteShell).toBe(true);
    expect(scope.canAccessNetwork).toBe(true);
  });

  it("maintenance scope allows full access with admin tools", () => {
    const scope = switcher.getScope("maintenance");
    expect(scope.canSeePrivateFacts).toBe(true);
    expect(scope.canWriteMemory).toBe(true);
    expect(scope.canExecuteShell).toBe(true);
    expect(scope.allowedTools).toContain("admin");
    expect(scope.allowedTools).toContain("health");
    expect(scope.allowedTools).toContain("gc");
  });

  it("a2a scope denies private access but allows a2a tools", () => {
    const scope = switcher.getScope("a2a");
    expect(scope.canSeePrivateFacts).toBe(false);
    expect(scope.canWriteMemory).toBe(false);
    expect(scope.canExecuteShell).toBe(false);
    expect(scope.allowedTools).toContain("search");
    expect(scope.allowedTools).toContain("status");
    expect(scope.allowedTools).toContain("a2a:message");
    expect(scope.allowedTools).toContain("a2a:heartbeat");
  });

  it("private mode has wildcard tool access", () => {
    const scope = switcher.getScope("private");
    expect(scope.allowedTools).toEqual(["*"]);
  });
});

// ─── resolve ──────────────────────────────────────────────────────────────────

describe("ModeSwitcher.resolve", () => {
  it("returns correct scope for public request", () => {
    const scope = switcher.resolve(ctx({ path: "/api/public/status" }));
    expect(scope.mode).toBe("public");
    expect(scope.canSeePrivateFacts).toBe(false);
  });

  it("returns correct scope for authenticated WebSocket", () => {
    const scope = switcher.resolve(ctx({
      path: "/ws",
      authorization: "Bearer token",
    }));
    expect(scope.mode).toBe("private");
    expect(scope.canSeePrivateFacts).toBe(true);
  });

  it("returns correct scope for cron trigger", () => {
    const scope = switcher.resolve(ctx({
      path: "/internal/sync",
      isCronTrigger: true,
    }));
    expect(scope.mode).toBe("maintenance");
    expect(scope.allowedTools).toContain("admin");
  });

  it("returns correct scope for A2A request", () => {
    const scope = switcher.resolve(ctx({
      path: "/api/a2a/message",
      fleetJwt: "fleet-jwt-value",
    }));
    expect(scope.mode).toBe("a2a");
    expect(scope.allowedTools).toContain("a2a:message");
  });
});

// ─── isToolAllowed ────────────────────────────────────────────────────────────

describe("ModeSwitcher.isToolAllowed", () => {
  it("private mode allows any tool", () => {
    expect(switcher.isToolAllowed("private", "search")).toBe(true);
    expect(switcher.isToolAllowed("private", "shell")).toBe(true);
    expect(switcher.isToolAllowed("private", "anything")).toBe(true);
  });

  it("public mode allows only listed tools", () => {
    expect(switcher.isToolAllowed("public", "search")).toBe(true);
    expect(switcher.isToolAllowed("public", "status")).toBe(true);
    expect(switcher.isToolAllowed("public", "profile")).toBe(true);
    expect(switcher.isToolAllowed("public", "shell")).toBe(false);
    expect(switcher.isToolAllowed("public", "admin")).toBe(false);
  });

  it("maintenance mode allows admin tools but not general tools", () => {
    expect(switcher.isToolAllowed("maintenance", "admin")).toBe(true);
    expect(switcher.isToolAllowed("maintenance", "health")).toBe(true);
    expect(switcher.isToolAllowed("maintenance", "gc")).toBe(true);
    expect(switcher.isToolAllowed("maintenance", "search")).toBe(false);
    expect(switcher.isToolAllowed("maintenance", "profile")).toBe(false);
  });

  it("a2a mode allows a2a tools but not general tools", () => {
    expect(switcher.isToolAllowed("a2a", "search")).toBe(true);
    expect(switcher.isToolAllowed("a2a", "status")).toBe(true);
    expect(switcher.isToolAllowed("a2a", "a2a:message")).toBe(true);
    expect(switcher.isToolAllowed("a2a", "shell")).toBe(false);
    expect(switcher.isToolAllowed("a2a", "admin")).toBe(false);
  });
});
