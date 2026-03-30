/**
 * Tests for cocapn fleet command — list, status, send, broadcast, inspect
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
import {
  formatUptime,
  formatTimeAgo,
  statusColor,
  roleIcon,
  readLocalFleetConfig,
  fleetList,
  fleetStatus,
  fleetSend,
  fleetBroadcast,
  fleetInspect,
  type FleetMember,
  type FleetOverview,
  type AgentInspect,
  type SendMessageResponse,
  type BroadcastResponse,
} from "../src/commands/fleet.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const testDir = join(process.cwd(), ".test-fleet-tmp");

function setupFleetDir(): void {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  mkdirSync(join(testDir, "cocapn"), { recursive: true });
}

function cleanupFleetDir(): void {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

function writeLocalFleetConfig(agents: Record<string, unknown>[]): void {
  const fleetPath = join(testDir, "cocapn", "fleet.json");
  writeFileSync(fleetPath, JSON.stringify({ agents }, null, 2), "utf-8");
}

// ─── formatUptime ───────────────────────────────────────────────────────────

describe("formatUptime", () => {
  it("returns dash for zero or negative", () => {
    expect(formatUptime(0)).toMatch(/—/);
    expect(formatUptime(-1)).toMatch(/—/);
  });

  it("formats seconds", () => {
    expect(formatUptime(30)).toBe("30s");
  });

  it("formats minutes and seconds", () => {
    expect(formatUptime(90)).toBe("1m 30s");
  });

  it("formats hours and minutes", () => {
    expect(formatUptime(3661)).toBe("1h 1m");
  });
});

// ─── formatTimeAgo ─────────────────────────────────────────────────────────

describe("formatTimeAgo", () => {
  it("returns never for zero timestamp", () => {
    expect(formatTimeAgo(0)).toMatch(/never/);
  });

  it("returns 'just now' for <5s", () => {
    const ts = Date.now() - 3000;
    expect(formatTimeAgo(ts)).toMatch(/just now/);
  });

  it("returns seconds for <60s", () => {
    const ts = Date.now() - 30000;
    expect(formatTimeAgo(ts)).toBe("30s ago");
  });

  it("returns minutes for <3600s", () => {
    const ts = Date.now() - 120000;
    expect(formatTimeAgo(ts)).toBe("2m ago");
  });

  it("returns hours for >=3600s", () => {
    const ts = Date.now() - 7200000;
    expect(formatTimeAgo(ts)).toBe("2h ago");
  });
});

// ─── statusColor ────────────────────────────────────────────────────────────

describe("statusColor", () => {
  it("colors idle green", () => {
    expect(statusColor("idle")).toMatch(/\x1b\[32m/);
  });

  it("colors busy yellow", () => {
    expect(statusColor("busy")).toMatch(/\x1b\[33m/);
  });

  it("colors degraded yellow", () => {
    expect(statusColor("degraded")).toMatch(/\x1b\[33m/);
  });

  it("colors offline red", () => {
    expect(statusColor("offline")).toMatch(/\x1b\[31m/);
  });

  it("returns unknown status as-is", () => {
    expect(statusColor("unknown")).toBe("unknown");
  });
});

// ─── roleIcon ───────────────────────────────────────────────────────────────

describe("roleIcon", () => {
  it("returns star for leader", () => {
    expect(roleIcon("leader")).toBe("\u2605");
  });

  it("returns circle for worker", () => {
    expect(roleIcon("worker")).toBe("\u25CB");
  });

  it("returns diamond for specialist", () => {
    expect(roleIcon("specialist")).toBe("\u2726");
  });

  it("returns circle for unknown role", () => {
    expect(roleIcon("unknown")).toBe("\u25CB");
  });
});

// ─── readLocalFleetConfig ──────────────────────────────────────────────────

describe("readLocalFleetConfig", () => {
  beforeEach(() => setupFleetDir());
  afterEach(() => cleanupFleetDir());

  it("returns null when no fleet.json exists", () => {
    const result = readLocalFleetConfig(join(testDir, "cocapn"));
    expect(result).toBeNull();
  });

  it("reads fleet.json with agents", () => {
    writeLocalFleetConfig([
      { agentId: "agent-1", name: "Alpha", role: "leader", status: "idle", skills: ["chat"] },
      { agentId: "agent-2", name: "Beta", role: "worker", status: "busy", skills: [] },
    ]);

    const result = readLocalFleetConfig(join(testDir, "cocapn"));
    expect(result).not.toBeNull();
    expect(result!.agents).toHaveLength(2);
    expect(result!.agents[0].agentId).toBe("agent-1");
    expect(result!.agents[0].name).toBe("Alpha");
    expect(result!.agents[0].role).toBe("leader");
    expect(result!.agents[0].skills).toEqual(["chat"]);
    expect(result!.agents[1].agentId).toBe("agent-2");
  });

  it("handles empty agents array", () => {
    writeLocalFleetConfig([]);

    const result = readLocalFleetConfig(join(testDir, "cocapn"));
    expect(result).not.toBeNull();
    expect(result!.agents).toHaveLength(0);
  });

  it("returns null for malformed JSON", () => {
    const fleetPath = join(testDir, "cocapn", "fleet.json");
    writeFileSync(fleetPath, "not json", "utf-8");

    const result = readLocalFleetConfig(join(testDir, "cocapn"));
    expect(result).toBeNull();
  });

  it("fills defaults for missing fields", () => {
    writeLocalFleetConfig([{ id: "a1" }]);

    const result = readLocalFleetConfig(join(testDir, "cocapn"));
    expect(result!.agents[0].agentId).toBe("a1");
    expect(result!.agents[0].role).toBe("worker");
    expect(result!.agents[0].status).toBe("offline");
    expect(result!.agents[0].skills).toEqual([]);
  });
});

// ─── fleetList ──────────────────────────────────────────────────────────────

describe("fleetList", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setupFleetDir();
  });

  afterEach(() => {
    cleanupFleetDir();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fetches agents from bridge API", async () => {
    const mockAgents: FleetMember[] = [
      {
        agentId: "agent-1", name: "Alpha", role: "leader", status: "idle",
        lastHeartbeat: Date.now(), uptime: 3600, load: 0.3, successRate: 0.95,
        skills: ["chat", "code"], instanceUrl: "ws://localhost:3102",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents: mockAgents }),
    });

    // Should not throw
    await fleetList(false);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/fleet/agents"),
      expect.any(Object),
    );
  });

  it("outputs JSON with --json flag", async () => {
    const mockAgents: FleetMember[] = [
      {
        agentId: "agent-1", name: "Alpha", role: "leader", status: "idle",
        lastHeartbeat: Date.now(), uptime: 3600, load: 0.3, successRate: 0.95,
        skills: ["chat"], instanceUrl: "ws://localhost:3102",
      },
    ];

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ agents: mockAgents }),
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await fleetList(true);

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].agentId).toBe("agent-1");
  });

  it("falls back to local config when bridge is offline", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    writeLocalFleetConfig([
      { agentId: "local-1", name: "Local", role: "leader", status: "idle", skills: [] },
    ]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });

    // Override cwd for the test
    const originalCwd = process.cwd;
    vi.spyOn(process, "cwd").mockReturnValue(testDir);

    await fleetList(false);

    // Should have printed something (not exited)
    expect(logSpy).toHaveBeenCalled();
    exitSpy.mockRestore();
  });

  it("exits when bridge offline and no local config", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });

    vi.spyOn(process, "cwd").mockReturnValue(testDir);

    try {
      await fleetList(false);
      expect.fail("Should have exited");
    } catch (e) {
      expect((e as Error).message).toBe("EXIT");
      expect(exitSpy).toHaveBeenCalledWith(1);
    }
  });
});

// ─── fleetStatus ────────────────────────────────────────────────────────────

describe("fleetStatus", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    setupFleetDir();
  });

  afterEach(() => {
    cleanupFleetDir();
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fetches overview from bridge API", async () => {
    const mockOverview: FleetOverview = {
      fleetId: "fleet-abc",
      totalAgents: 3,
      connected: 2,
      disconnected: 1,
      messagesLastHour: 42,
      tasksRunning: 5,
      tasksCompleted: 100,
      systemResources: { cpuUsage: "23%", memoryUsage: "512MB / 2GB", uptime: 86400 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOverview),
    });

    await fleetStatus(false);

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/fleet/status"),
      expect.any(Object),
    );
  });

  it("outputs JSON with --json flag", async () => {
    const mockOverview: FleetOverview = {
      fleetId: "fleet-abc",
      totalAgents: 2,
      connected: 2,
      disconnected: 0,
      messagesLastHour: 10,
      tasksRunning: 1,
      tasksCompleted: 50,
      systemResources: { cpuUsage: "10%", memoryUsage: "256MB", uptime: 3600 },
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockOverview),
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    await fleetStatus(true);

    const output = logSpy.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.fleetId).toBe("fleet-abc");
    expect(parsed.totalAgents).toBe(2);
  });

  it("falls back to local config when bridge is offline", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    writeLocalFleetConfig([
      { agentId: "a1", status: "idle" },
      { agentId: "a2", status: "offline" },
    ]);

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });

    vi.spyOn(process, "cwd").mockReturnValue(testDir);

    await fleetStatus(false);

    expect(logSpy).toHaveBeenCalled();
    exitSpy.mockRestore();
  });
});

// ─── fleetSend ──────────────────────────────────────────────────────────────

describe("fleetSend", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends message to agent via POST", async () => {
    const mockResponse: SendMessageResponse = {
      success: true,
      agentId: "agent-1",
      message: "hello",
      response: "Hi there!",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await fleetSend("agent-1", "hello");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/fleet/send"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("agent-1"));
  });

  it("shows error when send fails", async () => {
    const mockResponse: SendMessageResponse = {
      success: false,
      agentId: "agent-1",
      message: "hello",
      error: "Agent not found",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });

    try {
      await fleetSend("agent-1", "hello");
      expect.fail("Should have exited");
    } catch (e) {
      expect((e as Error).message).toBe("EXIT");
      expect(errorSpy).toHaveBeenCalled();
    }
  });

  it("handles connection error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });

    try {
      await fleetSend("agent-1", "hello");
      expect.fail("Should have exited");
    } catch (e) {
      expect((e as Error).message).toBe("EXIT");
      expect(errorSpy).toHaveBeenCalled();
    }
  });
});

// ─── fleetBroadcast ─────────────────────────────────────────────────────────

describe("fleetBroadcast", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("broadcasts message via POST", async () => {
    const mockResponse: BroadcastResponse = {
      success: true,
      message: "hello fleet",
      delivered: 3,
      failed: 0,
      total: 3,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await fleetBroadcast("hello fleet");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/fleet/broadcast"),
      expect.objectContaining({ method: "POST" }),
    );
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("3"));
  });

  it("shows warning when some deliveries fail", async () => {
    const mockResponse: BroadcastResponse = {
      success: true,
      message: "hello",
      delivered: 2,
      failed: 1,
      total: 3,
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await fleetBroadcast("hello");

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("1 delivery failed"));
  });

  it("handles connection error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });

    try {
      await fleetBroadcast("hello");
      expect.fail("Should have exited");
    } catch (e) {
      expect((e as Error).message).toBe("EXIT");
      expect(errorSpy).toHaveBeenCalled();
    }
  });
});

// ─── fleetInspect ───────────────────────────────────────────────────────────

describe("fleetInspect", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("fetches and displays agent details", async () => {
    const mockInspect: AgentInspect = {
      agentId: "agent-1",
      name: "Alpha",
      role: "leader",
      status: "idle",
      mode: "private",
      uptime: 7200,
      load: 0.25,
      successRate: 0.98,
      skills: ["chat", "code"],
      brain: { facts: 42, wiki: 10, memories: 5, procedures: 3 },
      llm: { provider: "anthropic", model: "claude-sonnet-4-20250514" },
      capabilities: ["file-edit", "shell", "git"],
      lastHeartbeat: Date.now(),
      instanceUrl: "ws://localhost:3102",
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockInspect),
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await fleetInspect("agent-1");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/fleet/agents/agent-1"),
      expect.any(Object),
    );
    expect(logSpy).toHaveBeenCalled();
  });

  it("handles agent not found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });

    try {
      await fleetInspect("nonexistent");
      expect.fail("Should have exited");
    } catch (e) {
      expect((e as Error).message).toBe("EXIT");
      expect(errorSpy).toHaveBeenCalled();
    }
  });

  it("handles connection error", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("EXIT");
    });

    try {
      await fleetInspect("agent-1");
      expect.fail("Should have exited");
    } catch (e) {
      expect((e as Error).message).toBe("EXIT");
      expect(errorSpy).toHaveBeenCalled();
    }
  });
});
