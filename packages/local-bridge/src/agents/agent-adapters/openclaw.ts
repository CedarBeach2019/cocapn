/**
 * OpenClawAdapter — interface with OpenClaw instances.
 *
 * OpenClaw agents expose an HTTP API for task submission and workspace
 * management. This adapter bridges cocapn messages to OpenClaw protocol.
 */

import { join } from "path";
import type { AgentAdapter, AgentAdapterConfig } from "./adapter.js";

interface OpenClawTask {
  id: string;
  description: string;
  status: "pending" | "running" | "completed" | "failed";
  result?: string;
}

export class OpenClawAdapter implements AgentAdapter {
  private config: AgentAdapterConfig;
  private baseUrl: string;
  private apiKey: string | undefined;
  private running = false;
  private taskCache = new Map<string, OpenClawTask>();

  constructor(config: AgentAdapterConfig) {
    this.config = config;
    this.baseUrl = (config.options["baseUrl"] as string) ?? "http://localhost:8765";
    this.apiKey = config.options["apiKey"] as string | undefined;
  }

  async start(): Promise<void> {
    // Verify the OpenClaw instance is reachable.
    const resp = await this.fetch("/health");
    if (!resp.ok) {
      throw new Error(`OpenClaw instance not reachable at ${this.baseUrl}`);
    }
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
    this.taskCache.clear();
  }

  async send(message: string): Promise<string> {
    if (!this.running) {
      throw new Error("OpenClaw adapter is not running");
    }

    // Submit task to OpenClaw.
    const submitResp = await this.fetch("/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description: message, workingDir: this.config.workingDir }),
    });

    if (!submitResp.ok) {
      const body = await submitResp.text();
      throw new Error(`OpenClaw task submission failed (${submitResp.status}): ${body}`);
    }

    const task = (await submitResp.json()) as OpenClawTask;

    // Poll until complete.
    const result = await this.pollTask(task.id);
    return result ?? "";
  }

  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get the shared workspace path used by this OpenClaw instance.
   */
  getWorkspacePath(): string {
    return (this.config.options["workspaceDir"] as string) ?? join(this.config.workingDir, ".openclaw-workspace");
  }

  // --- internals ---

  private async pollTask(taskId: string, maxAttempts = 120): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
      const resp = await this.fetch(`/tasks/${taskId}`);
      if (!resp.ok) {
        throw new Error(`OpenClaw task status check failed (${resp.status})`);
      }

      const task = (await resp.json()) as OpenClawTask;

      if (task.status === "completed") {
        this.taskCache.delete(taskId);
        return task.result ?? "";
      }

      if (task.status === "failed") {
        this.taskCache.delete(taskId);
        throw new Error(`OpenClaw task failed: ${task.result ?? "unknown error"}`);
      }

      // Wait before polling again (total poll time up to ~2 minutes).
      await new Promise((r) => setTimeout(r, 1000));
    }

    throw new Error(`OpenClaw task timed out: ${taskId}`);
  }

  private async fetch(path: string, init?: RequestInit): Promise<Response> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      ...(init?.headers as Record<string, string> ?? {}),
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return globalThis.fetch(url, { ...init, headers });
  }
}
