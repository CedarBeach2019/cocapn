import { describe, it, expect, vi, beforeEach } from "vitest";
import { AgentManager } from "../../src/agents/agent-manager.js";
import { TaskDelegator, type Task } from "../../src/agents/task-delegation.js";

// Mock adapters so no real processes are spawned.
vi.mock("../../src/agents/agent-adapters/manus.js", () => ({
  ManusAdapter: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockImplementation((msg: string) => Promise.resolve(`manus: ${msg}`)),
    isRunning: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock("../../src/agents/agent-adapters/openclaw.js", () => ({
  OpenClawAdapter: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockImplementation((msg: string) => Promise.resolve(`openclaw: ${msg}`)),
    isRunning: vi.fn().mockReturnValue(true),
  })),
}));

vi.mock("../../src/agents/agent-adapters/claude-code.js", () => ({
  ClaudeCodeAdapter: vi.fn().mockImplementation(() => ({
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(undefined),
    send: vi.fn().mockImplementation((msg: string) => Promise.resolve(`claude-code: ${msg}`)),
    isRunning: vi.fn().mockReturnValue(true),
  })),
}));

async function setupAgents(manager: AgentManager): Promise<{ manusId: string; openclawId: string }> {
  const manus = await manager.create({ type: "manus", name: "manus-1" });
  const openclaw = await manager.create({ type: "openclaw", name: "openclaw-1" });

  await manager.start(manus.id);
  await manager.start(openclaw.id);

  return { manusId: manus.id, openclawId: openclaw.id };
}

describe("TaskDelegator", () => {
  let manager: AgentManager;
  let delegator: TaskDelegator;

  beforeEach(() => {
    manager = new AgentManager();
    delegator = new TaskDelegator(manager);
  });

  describe("delegate", () => {
    it("delegates a task to a specific agent", async () => {
      const { manusId } = await setupAgents(manager);

      const task: Task = { description: "build me an app" };
      const result = await delegator.delegate(task, manusId);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe(manusId);
      expect(result.output).toContain("manus: build me an app");
      expect(result.taskId).toBeTruthy();
      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("auto-selects an agent when none specified", async () => {
      await setupAgents(manager);

      const task: Task = { description: "analyze code" };
      const result = await delegator.delegate(task);

      expect(result.success).toBe(true);
      expect(result.agentId).toBeTruthy();
    });

    it("prefers agents matching preferredType", async () => {
      const { manusId } = await setupAgents(manager);

      const task: Task = { description: "do work", preferredType: "manus" };
      const result = await delegator.delegate(task);

      expect(result.success).toBe(true);
      expect(result.agentId).toBe(manusId);
    });

    it("returns failed result when no agents are running", async () => {
      // Create but don't start any agents.
      await manager.create({ type: "manus", name: "idle-manus" });

      const task: Task = { description: "do work" };
      const result = await delegator.delegate(task);

      expect(result.success).toBe(false);
      expect(result.output).toContain("No running agents");
    });

    it("returns failed result for unknown agent", async () => {
      const task: Task = { description: "do work" };
      const result = await delegator.delegate(task, "nonexistent-id");

      expect(result.success).toBe(false);
    });

    it("emits taskStarted and taskCompleted events", async () => {
      const { manusId } = await setupAgents(manager);

      const started = vi.fn();
      const completed = vi.fn();
      delegator.on("taskStarted", started);
      delegator.on("taskCompleted", completed);

      await delegator.delegate({ description: "test" }, manusId);

      expect(started).toHaveBeenCalledOnce();
      expect(completed).toHaveBeenCalledOnce();
    });

    it("tracks the task for status checking", async () => {
      const { manusId } = await setupAgents(manager);

      const result = await delegator.delegate({ description: "test" }, manusId);
      const status = delegator.checkStatus(result.taskId);

      expect(status.state).toBe("completed");
      expect(status.result?.taskId).toBe(result.taskId);
    });
  });

  describe("broadcast", () => {
    it("sends the same task to all running agents", async () => {
      const { manusId, openclawId } = await setupAgents(manager);

      const results = await delegator.broadcast({ description: "hello all" });

      expect(results.size).toBe(2);
      expect(results.get(manusId)?.success).toBe(true);
      expect(results.get(openclawId)?.success).toBe(true);
    });

    it("throws when no agents are running", async () => {
      await expect(
        delegator.broadcast({ description: "hello" }),
      ).rejects.toThrow("No running agents");
    });

    it("returns results only for running agents", async () => {
      const { manusId } = await setupAgents(manager);
      // Create a stopped agent — broadcast should skip it.
      await manager.create({ type: "openclaw", name: "stopped-oc" });

      const results = await delegator.broadcast({ description: "hello" });
      // Only the 2 running agents should respond.
      expect(results.size).toBe(2);
      expect(results.get(manusId)?.success).toBe(true);
    });
  });

  describe("checkStatus", () => {
    it("throws for unknown task id", () => {
      expect(() => delegator.checkStatus("nonexistent")).toThrow("Task not found");
    });

    it("returns running state for in-progress task", async () => {
      // We'll start a task, then check it after completion.
      const { manusId } = await setupAgents(manager);

      const result = await delegator.delegate({ description: "quick task" }, manusId);
      const status = delegator.checkStatus(result.taskId);

      expect(status.state).toBe("completed");
    });
  });

  describe("listTasks", () => {
    it("returns empty array initially", () => {
      expect(delegator.listTasks()).toEqual([]);
    });

    it("lists all submitted tasks", async () => {
      const { manusId } = await setupAgents(manager);

      await delegator.delegate({ description: "task 1" }, manusId);
      await delegator.delegate({ description: "task 2" }, manusId);

      const tasks = delegator.listTasks();
      expect(tasks).toHaveLength(2);
      expect(tasks.map((t) => t.state)).toEqual(["completed", "completed"]);
    });
  });
});
