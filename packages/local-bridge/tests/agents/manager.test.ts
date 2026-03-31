import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentManager, type AgentConfig, type AgentInstance } from "../../src/agents/agent-manager.js";

// Mock the adapter constructors so we don't spawn real processes.
vi.mock("../../src/agents/agent-adapters/manus.js", () => ({
  ManusAdapter: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue("mock response"),
    isRunning: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock("../../src/agents/agent-adapters/openclaw.js", () => ({
  OpenClawAdapter: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue("openclaw response"),
    isRunning: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock("../../src/agents/agent-adapters/claude-code.js", () => ({
  ClaudeCodeAdapter: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockResolvedValue("claude-code response"),
    isRunning: vi.fn().mockReturnValue(true),
  })),
}));

function makeConfig(overrides?: Partial<AgentConfig>): AgentConfig {
  return {
    type: "cocapn",
    name: "test-agent",
    ...overrides,
  };
}

describe("AgentManager", () => {
  let manager: AgentManager;

  beforeEach(() => {
    manager = new AgentManager();
  });

  describe("create", () => {
    it("creates an agent instance with correct defaults", async () => {
      const config = makeConfig();
      const instance = await manager.create(config);

      expect(instance.id).toBeTruthy();
      expect(instance.name).toBe("test-agent");
      expect(instance.type).toBe("cocapn");
      expect(instance.status).toBe("stopped");
      expect(instance.createdAt).toBeGreaterThan(0);
      expect(instance.lastActive).toBeGreaterThan(0);
    });

    it("emits 'created' event", async () => {
      const handler = vi.fn();
      manager.on("created", handler);

      await manager.create(makeConfig({ name: "emit-test" }));

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ name: "emit-test" }),
      );
    });

    it("creates different IDs for each agent", async () => {
      const a = await manager.create(makeConfig({ name: "a" }));
      const b = await manager.create(makeConfig({ name: "b" }));

      expect(a.id).not.toBe(b.id);
    });
  });

  describe("start", () => {
    it("transitions from stopped to running", async () => {
      const instance = await manager.create(makeConfig());
      expect(instance.status).toBe("stopped");

      await manager.start(instance.id);

      const agents = await manager.list();
      expect(agents[0].status).toBe("running");
    });

    it("emits 'started' event", async () => {
      const handler = vi.fn();
      manager.on("started", handler);

      const instance = await manager.create(makeConfig());
      await manager.start(instance.id);

      expect(handler).toHaveBeenCalledOnce();
    });

    it("is idempotent — starting a running agent is a no-op", async () => {
      const instance = await manager.create(makeConfig());
      await manager.start(instance.id);
      await manager.start(instance.id); // should not throw

      const agents = await manager.list();
      expect(agents[0].status).toBe("running");
    });

    it("throws for unknown agent id", async () => {
      await expect(manager.start("nonexistent")).rejects.toThrow("Agent not found");
    });
  });

  describe("stop", () => {
    it("transitions from running to stopped", async () => {
      const instance = await manager.create(makeConfig());
      await manager.start(instance.id);
      await manager.stop(instance.id);

      const agents = await manager.list();
      expect(agents[0].status).toBe("stopped");
    });

    it("emits 'stopped' event", async () => {
      const handler = vi.fn();
      manager.on("stopped", handler);

      const instance = await manager.create(makeConfig());
      await manager.start(instance.id);
      await manager.stop(instance.id);

      expect(handler).toHaveBeenCalledOnce();
    });

    it("is idempotent — stopping a stopped agent is a no-op", async () => {
      const instance = await manager.create(makeConfig());
      await manager.stop(instance.id); // already stopped
    });

    it("throws for unknown agent id", async () => {
      await expect(manager.stop("nonexistent")).rejects.toThrow("Agent not found");
    });
  });

  describe("list", () => {
    it("returns empty array when no agents", async () => {
      const agents = await manager.list();
      expect(agents).toEqual([]);
    });

    it("returns all created agents", async () => {
      await manager.create(makeConfig({ name: "a" }));
      await manager.create(makeConfig({ name: "b" }));

      const agents = await manager.list();
      expect(agents).toHaveLength(2);
      expect(agents.map((a) => a.name).sort()).toEqual(["a", "b"]);
    });
  });

  describe("remove", () => {
    it("removes a stopped agent", async () => {
      const instance = await manager.create(makeConfig());
      await manager.remove(instance.id);

      const agents = await manager.list();
      expect(agents).toHaveLength(0);
    });

    it("stops a running agent before removing", async () => {
      const instance = await manager.create(makeConfig());
      await manager.start(instance.id);
      await manager.remove(instance.id);

      const agents = await manager.list();
      expect(agents).toHaveLength(0);
    });

    it("emits 'removed' event", async () => {
      const handler = vi.fn();
      manager.on("removed", handler);

      const instance = await manager.create(makeConfig());
      await manager.remove(instance.id);

      expect(handler).toHaveBeenCalledOnce();
    });

    it("throws for unknown agent id", async () => {
      await expect(manager.remove("nonexistent")).rejects.toThrow("Agent not found");
    });
  });

  describe("send", () => {
    it("sends a message and returns the response", async () => {
      const instance = await manager.create(makeConfig({ type: "manus" }));
      await manager.start(instance.id);

      const response = await manager.send(instance.id, "hello");
      expect(response).toBe("mock response");
    });

    it("throws if agent is not running", async () => {
      const instance = await manager.create(makeConfig({ type: "manus" }));
      // Don't start it.

      await expect(manager.send(instance.id, "hello")).rejects.toThrow("not running");
    });

    it("throws for unknown agent id", async () => {
      await expect(manager.send("nonexistent", "hello")).rejects.toThrow("Agent not found");
    });

    it("updates lastActive and messagesProcessed", async () => {
      const instance = await manager.create(makeConfig({ type: "manus" }));
      await manager.start(instance.id);

      const before = instance.lastActive;
      await manager.send(instance.id, "hello");

      const status = await manager.getStatus(instance.id);
      expect(status.messagesProcessed).toBe(1);
      expect(status.instance.lastActive).toBeGreaterThanOrEqual(before);
    });
  });

  describe("getStatus", () => {
    it("returns detailed status for a running agent", async () => {
      const instance = await manager.create(makeConfig());
      await manager.start(instance.id);

      const status = await manager.getStatus(instance.id);

      expect(status.instance.id).toBe(instance.id);
      expect(status.instance.status).toBe("running");
      expect(status.uptime).toBeGreaterThanOrEqual(0);
      expect(status.messagesProcessed).toBe(0);
    });

    it("returns zero uptime for stopped agent", async () => {
      const instance = await manager.create(makeConfig());

      const status = await manager.getStatus(instance.id);
      expect(status.uptime).toBe(0);
    });

    it("throws for unknown agent id", async () => {
      await expect(manager.getStatus("nonexistent")).rejects.toThrow("Agent not found");
    });
  });

  describe("get", () => {
    it("returns the agent instance", async () => {
      const instance = await manager.create(makeConfig());
      const retrieved = manager.get(instance.id);

      expect(retrieved).toBeTruthy();
      expect(retrieved!.name).toBe("test-agent");
    });

    it("returns undefined for unknown id", () => {
      expect(manager.get("nonexistent")).toBeUndefined();
    });
  });

  describe("multiple agent types", () => {
    it("creates and manages manus agents", async () => {
      const instance = await manager.create(makeConfig({ type: "manus", name: "manus-1" }));
      await manager.start(instance.id);
      const resp = await manager.send(instance.id, "build me an app");

      expect(resp).toBe("mock response");
      expect(instance.type).toBe("manus");
    });

    it("creates and manages openclaw agents", async () => {
      const instance = await manager.create(makeConfig({ type: "openclaw", name: "openclaw-1" }));
      await manager.start(instance.id);
      const resp = await manager.send(instance.id, "analyze repo");

      expect(resp).toBe("openclaw response");
      expect(instance.type).toBe("openclaw");
    });

    it("creates and manages claude-code agents", async () => {
      const instance = await manager.create(makeConfig({ type: "claude-code", name: "claude-1" }));
      await manager.start(instance.id);
      const resp = await manager.send(instance.id, "refactor the auth module");

      expect(resp).toBe("claude-code response");
      expect(instance.type).toBe("claude-code");
    });
  });
});
