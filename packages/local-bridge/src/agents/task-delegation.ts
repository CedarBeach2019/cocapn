/**
 * TaskDelegator — delegate work between agents.
 *
 * Supports targeted delegation (specific agent), broadcast (all running
 * agents), and status tracking for submitted tasks.
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import type { AgentManager } from "./agent-manager.js";

// --- Types ---

export type TaskPriority = "low" | "medium" | "high";
export type TaskState = "pending" | "running" | "completed" | "failed";

export interface Task {
  description: string;
  priority?: TaskPriority;
  /** Preferred agent type (hint for router). */
  preferredType?: string;
  /** Max time in ms before the task is considered timed out. */
  timeout?: number;
}

export interface TaskResult {
  taskId: string;
  agentId: string;
  success: boolean;
  output: string;
  duration: number;
}

interface TrackedTask {
  id: string;
  task: Task;
  state: TaskState;
  result?: TaskResult;
  submittedAt: number;
}

// --- Delegator ---

export class TaskDelegator extends EventEmitter {
  private manager: AgentManager;
  private tasks = new Map<string, TrackedTask>();

  constructor(manager: AgentManager) {
    super();
    this.manager = manager;
  }

  /**
   * Delegate a task to a specific agent, or let the delegator pick
   * the best available agent based on type hint.
   */
  async delegate(task: Task, agentId?: string): Promise<TaskResult> {
    const id = randomUUID();
    const tracked: TrackedTask = {
      id,
      task,
      state: "pending",
      submittedAt: Date.now(),
    };
    this.tasks.set(id, tracked);

    try {
      const resolvedId = agentId ?? await this.resolveAgent(task);

      tracked.state = "running";
      this.emit("taskStarted", id, resolvedId);

      // Ensure the agent is started.
      const instance = this.manager.get(resolvedId);
      if (!instance) {
        throw new Error(`Agent not found: ${resolvedId}`);
      }
      if (instance.status !== "running") {
        await this.manager.start(resolvedId);
      }

      const timeout = task.timeout ?? 300_000;
      const start = Date.now();

      const output = await Promise.race([
        this.manager.send(resolvedId, task.description),
        this.createTimeout(timeout, id),
      ]);

      const duration = Date.now() - start;
      const result: TaskResult = {
        taskId: id,
        agentId: resolvedId,
        success: true,
        output,
        duration,
      };

      tracked.state = "completed";
      tracked.result = result;
      this.emit("taskCompleted", result);
      return result;
    } catch (err) {
      const result: TaskResult = {
        taskId: id,
        agentId: agentId ?? "none",
        success: false,
        output: err instanceof Error ? err.message : String(err),
        duration: Date.now() - tracked.submittedAt,
      };

      tracked.state = "failed";
      tracked.result = result;
      this.emit("taskFailed", id, err instanceof Error ? err : new Error(String(err)));
      return result;
    }
  }

  /**
   * Broadcast a task to all running agents and collect their responses.
   */
  async broadcast(task: Task): Promise<Map<string, TaskResult>> {
    const instances = await this.manager.list();
    const running = instances.filter((a) => a.status === "running");

    if (running.length === 0) {
      throw new Error("No running agents to broadcast to");
    }

    const results = new Map<string, TaskResult>();

    // Run in parallel — each agent gets the same task.
    const promises = running.map(async (instance) => {
      const result = await this.delegate(task, instance.id);
      results.set(instance.id, result);
    });

    await Promise.allSettled(promises);
    return results;
  }

  /**
   * Check the status of a previously submitted task.
   */
  checkStatus(taskId: string): { state: TaskState; result?: TaskResult } {
    const tracked = this.tasks.get(taskId);
    if (!tracked) {
      throw new Error(`Task not found: ${taskId}`);
    }
    return { state: tracked.state, result: tracked.result };
  }

  /**
   * List all tracked tasks.
   */
  listTasks(): Array<{ id: string; state: TaskState; task: Task }> {
    return Array.from(this.tasks.values()).map((t) => ({
      id: t.id,
      state: t.state,
      task: t.task,
    }));
  }

  // --- internals ---

  private async resolveAgent(task: Task): Promise<string> {
    const instances = await this.manager.list();

    // Prefer agents matching the preferred type.
    if (task.preferredType) {
      const match = instances.find((a) => a.type === task.preferredType && a.status === "running");
      if (match) return match.id;
    }

    // Fall back to any running agent.
    const running = instances.filter((a) => a.status === "running");
    if (running.length === 0) {
      throw new Error("No running agents available");
    }

    // Simple round-robin: pick the one that was least recently active.
    running.sort((a, b) => a.lastActive - b.lastActive);
    return running[0].id;
  }

  private createTimeout(ms: number, taskId: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Task ${taskId} timed out after ${ms}ms`));
      }, ms);
    });
  }
}
