/**
 * Tests for AdmiralDO task queue functionality.
 *
 * Tests the task scheduling and execution:
 *   - POST /tasks/schedule
 *   - POST /tasks/execute
 *   - GET /tasks/status/:taskId
 *   - POST /tasks/webhook
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  AdmiralDO,
  type ScheduledTaskConfig,
  type ScheduleTasksRequest,
  type ScheduleTasksResponse,
  type TaskQueueItem,
} from "../src/admiral.js";

// ─── Mock DurableObjectState ─────────────────────────────────────────────────────

class MockStorage {
  private store = new Map<string, unknown>();
  private alarms = new Map<string, Date>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.store.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.store.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async setAlarm(time: Date, id: string): Promise<void> {
    this.alarms.set(id, time);
  }

  // SQL interface - throws to trigger KV fallback
  async sql<T>(strings: TemplateStringsArray, ...values: unknown[]): Promise<T> {
    throw new Error("SQL not available in KV mock");
  }

  // Helper for tests
  clear(): void {
    this.store.clear();
    this.alarms.clear();
  }

  size(): number {
    return this.store.size;
  }

  getAlarm(id: string): Date | undefined {
    return this.alarms.get(id);
  }

  getAlarmCount(): number {
    return this.alarms.size;
  }
}

class MockDurableObjectState implements DurableObjectState {
  storage: MockStorage;

  constructor(storage: MockStorage) {
    this.storage = storage as unknown as DurableObjectStorage;
  }
}

// ─── Test utilities ─────────────────────────────────────────────────────────────

function createMockRequest(
  method: string,
  pathname: string,
  body?: unknown,
  query = ""
): Request {
  const url = `https://admiral.test/${pathname}${query}`;
  const init: RequestInit = {
    method,
    body: body ? JSON.stringify(body) : undefined,
  };

  if (body && method === "POST") {
    (init.headers as Record<string, string>) = {
      "Content-Type": "application/json",
    };
  }

  return new Request(url, init);
}

async function jsonResponse<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

// ─── Test suite ────────────────────────────────────────────────────────────────

describe("AdmiralDO Task Queue", () => {
  let mockStorage: MockStorage;
  let mockState: DurableObjectState;
  let admiral: AdmiralDO;

  beforeEach(() => {
    mockStorage = new MockStorage();
    mockState = new MockDurableObjectState(mockStorage) as unknown as DurableObjectState;
    admiral = new AdmiralDO(mockState);
  });

  describe("POST /tasks/schedule", () => {
    it("should schedule tasks with cron expressions and set alarms", async () => {
      const request = createMockRequest("POST", "tasks/schedule", {
        tasks: [
          {
            schedule: "0 9 * * *",
            target: "agent:daily-summary",
            payload: { repo: "user/cocapn" },
            enabled: true,
          },
        ],
      });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<ScheduleTasksResponse>(response);
      expect(result.ok).toBe(true);
      expect(result.scheduled).toBe(1);
      expect(result.ids).toHaveLength(1);

      // Verify task was stored
      const scheduledTasks = await mockStorage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks");
      expect(scheduledTasks).toBeDefined();
      const taskIds = Object.keys(scheduledTasks ?? {});
      expect(taskIds).toHaveLength(1);

      // Verify alarm was set
      expect(mockStorage.getAlarmCount()).toBe(1);
    });

    it("should schedule tasks with ISO timestamps for one-shot execution", async () => {
      const futureTime = new Date(Date.now() + 60 * 60 * 1000).toISOString();

      const request = createMockRequest("POST", "tasks/schedule", {
        tasks: [
          {
            schedule: futureTime,
            target: "worker:cleanup",
            payload: { dryRun: true },
            enabled: true,
          },
        ],
      });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await jsonResponse<ScheduleTasksResponse>(response);
      expect(result.ok).toBe(true);
      expect(result.scheduled).toBe(1);

      // Verify nextRun is set to the ISO time
      const scheduledTasks = await mockStorage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks");
      const task = Object.values(scheduledTasks ?? {})[0];
      expect(task?.nextRun).toBe(futureTime);
    });

    it("should reject requests with missing tasks array", async () => {
      const request = createMockRequest("POST", "tasks/schedule", {});

      const response = await admiral.fetch(request);

      expect(response.status).toBe(400);
      expect(await response.text()).toContain("Missing tasks array");
    });
  });

  describe("POST /tasks/execute", () => {
    beforeEach(async () => {
      // Schedule a task first
      const scheduleRequest = createMockRequest("POST", "tasks/schedule", {
        tasks: [
          {
            schedule: "0 9 * * *",
            target: "agent:daily-summary",
            payload: { repo: "user/cocapn" },
            enabled: true,
          },
        ],
      });
      await admiral.fetch(scheduleRequest);
    });

    it("should execute task triggered by alarm and record result", async () => {
      // Get the scheduled task ID
      const scheduledTasks = await mockStorage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks");
      const taskId = Object.keys(scheduledTasks ?? {})[0];

      const request = createMockRequest("POST", "tasks/execute", { taskId });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await response.json() as { ok: boolean; taskId: string; status: string };
      expect(result.ok).toBe(true);
      expect(result.status).toBe("completed");

      // Verify queue item was created with result
      const queue = await mockStorage.get<TaskQueueItem[]>("task-queue");
      const queueItem = queue?.find((q) => q.id === taskId);
      expect(queueItem?.status).toBe("completed");
      expect(queueItem?.result).toContain("completed successfully");
      expect(queueItem?.log.length).toBeGreaterThan(0);
    });

    it("should return 404 for non-existent task", async () => {
      const request = createMockRequest("POST", "tasks/execute", { taskId: "non-existent-id" });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(404);
      expect(await response.text()).toContain("Task not found");
    });
  });

  describe("GET /tasks/status/:taskId", () => {
    beforeEach(async () => {
      // Schedule and execute a task
      const scheduleRequest = createMockRequest("POST", "tasks/schedule", {
        tasks: [
          {
            schedule: "0 9 * * *",
            target: "agent:daily-summary",
            payload: { repo: "user/cocapn" },
            enabled: true,
          },
        ],
      });
      await admiral.fetch(scheduleRequest);

      const scheduledTasks = await mockStorage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks");
      const taskId = Object.keys(scheduledTasks ?? {})[0];

      const executeRequest = createMockRequest("POST", "tasks/execute", { taskId });
      await admiral.fetch(executeRequest);
    });

    it("should return task execution status and logs", async () => {
      const scheduledTasks = await mockStorage.get<Record<string, ScheduledTaskConfig>>("scheduled-tasks");
      const taskId = Object.keys(scheduledTasks ?? {})[0];

      const request = createMockRequest("GET", `tasks/status/${taskId}`);
      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await response.json() as { taskId: string; status: string; result?: string; log: string[] };
      expect(result.taskId).toBe(taskId);
      expect(result.status).toBe("completed");
      expect(result.result).toBeDefined();
      expect(result.log).toBeDefined();
      expect(result.log.length).toBeGreaterThan(0);
    });

    it("should return 404 for non-existent task status", async () => {
      const request = createMockRequest("GET", "tasks/status/non-existent-id");
      const response = await admiral.fetch(request);

      expect(response.status).toBe(404);
      expect(await response.text()).toContain("Task not found in queue");
    });
  });

  describe("POST /tasks/webhook", () => {
    it("should handle GitHub push webhook and trigger associated tasks", async () => {
      // First schedule a task associated with a repo
      const scheduleRequest = createMockRequest("POST", "tasks/schedule", {
        tasks: [
          {
            schedule: "0 9 * * *",
            target: "agent:daily-summary",
            payload: { repo: "user/cocapn" },
            enabled: true,
          },
        ],
      });
      await admiral.fetch(scheduleRequest);

      // Simulate GitHub webhook
      const webhookBody = {
        ref: "refs/heads/main",
        repository: {
          full_name: "user/cocapn",
          name: "cocapn",
          owner: { login: "user" },
        },
        pusher: { name: "test-user" },
      };

      const request = new Request("https://admiral.test/tasks/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": "sha256=test123",
          "X-GitHub-Event": "push",
        },
        body: JSON.stringify(webhookBody),
      });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(200);
      const result = await response.json() as { ok: boolean; event: string };
      expect(result.ok).toBe(true);
      expect(result.event).toBe("push");
    });

    it("should reject webhook without signature", async () => {
      const request = new Request("https://admiral.test/tasks/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toContain("Missing signature");
    });

    it("should reject webhook with invalid signature format", async () => {
      const request = new Request("https://admiral.test/tasks/webhook", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Hub-Signature-256": "invalid-format",
        },
        body: JSON.stringify({}),
      });

      const response = await admiral.fetch(request);

      expect(response.status).toBe(401);
      expect(await response.text()).toContain("Invalid signature format");
    });
  });
});
