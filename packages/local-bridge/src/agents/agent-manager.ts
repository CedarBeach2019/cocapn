/**
 * AgentManager — manage multiple AI agent instances within a cocapn instance.
 *
 * Supports cocapn-native, Manus, OpenClaw, Claude Code, and custom agents.
 * Each agent type is handled by an adapter that implements AgentAdapter.
 */

import { EventEmitter } from "events";
import { randomUUID } from "crypto";
import type { AgentAdapter, AgentAdapterConfig } from "./agent-adapters/adapter.js";
import { ManusAdapter } from "./agent-adapters/manus.js";
import { OpenClawAdapter } from "./agent-adapters/openclaw.js";
import { ClaudeCodeAdapter } from "./agent-adapters/claude-code.js";

// --- Types ---

export type AgentType = "cocapn" | "manus" | "openclaw" | "claude-code" | "custom";
export type AgentStatus = "running" | "stopped" | "error";

export interface AgentConfig {
  type: AgentType;
  name: string;
  /** Directory the agent works within (defaults to cwd). */
  workingDir?: string;
  /** Environment variables forwarded to the agent. */
  env?: Record<string, string>;
  /** Adapter-specific options (endpoint URL, model name, etc.). */
  options?: Record<string, unknown>;
}

export interface AgentInstance {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  config: AgentConfig;
  createdAt: number;
  lastActive: number;
}

export interface AgentMessage {
  role: "user" | "agent";
  content: string;
  timestamp: number;
}

export interface AgentStatusDetail {
  instance: AgentInstance;
  uptime: number;
  messagesProcessed: number;
  lastError?: string;
}

interface AgentState {
  instance: AgentInstance;
  adapter: AgentAdapter;
  startedAt: number;
  messagesProcessed: number;
  lastError?: string;
}

// --- Event map ---

export interface AgentManagerEvents {
  created: (instance: AgentInstance) => void;
  started: (instance: AgentInstance) => void;
  stopped: (instance: AgentInstance) => void;
  removed: (instance: AgentInstance) => void;
  error: (id: string, error: Error) => void;
}

// --- Adapter factory ---

function createAdapter(type: AgentType, config: AgentConfig): AgentAdapter {
  const adapterConfig: AgentAdapterConfig = {
    workingDir: config.workingDir ?? process.cwd(),
    env: config.env ?? {},
    options: config.options ?? {},
  };

  switch (type) {
    case "manus":
      return new ManusAdapter(adapterConfig);
    case "openclaw":
      return new OpenClawAdapter(adapterConfig);
    case "claude-code":
      return new ClaudeCodeAdapter(adapterConfig);
    case "cocapn":
    case "custom":
      // cocapn-native agents use the existing spawner/registry system.
      // For now, provide a passthrough adapter.
      return new PassthroughAdapter(adapterConfig);
    default:
      throw new Error(`Unknown agent type: ${type}`);
  }
}

// --- Manager ---

export class AgentManager extends EventEmitter {
  private agents = new Map<string, AgentState>();

  /**
   * Create a new agent instance (stopped by default).
   */
  async create(config: AgentConfig): Promise<AgentInstance> {
    const id = randomUUID();
    const now = Date.now();

    const instance: AgentInstance = {
      id,
      name: config.name,
      type: config.type,
      status: "stopped",
      config,
      createdAt: now,
      lastActive: now,
    };

    const adapter = createAdapter(config.type, config);

    this.agents.set(id, {
      instance,
      adapter,
      startedAt: 0,
      messagesProcessed: 0,
    });

    this.emit("created", instance);
    return { ...instance };
  }

  /**
   * Start a stopped agent.
   */
  async start(id: string): Promise<void> {
    const state = this.getOrThrow(id);
    if (state.instance.status === "running") {
      return; // already running — idempotent
    }

    try {
      await state.adapter.start();
      state.instance.status = "running";
      state.instance.lastActive = Date.now();
      state.startedAt = Date.now();
      this.emit("started", state.instance);
    } catch (err) {
      state.instance.status = "error";
      state.lastError = err instanceof Error ? err.message : String(err);
      this.emit("error", id, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Stop a running agent.
   */
  async stop(id: string): Promise<void> {
    const state = this.getOrThrow(id);
    if (state.instance.status === "stopped") {
      return;
    }

    try {
      await state.adapter.stop();
      state.instance.status = "stopped";
      state.instance.lastActive = Date.now();
      this.emit("stopped", state.instance);
    } catch (err) {
      state.instance.status = "error";
      state.lastError = err instanceof Error ? err.message : String(err);
      this.emit("error", id, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * List all agent instances.
   */
  async list(): Promise<AgentInstance[]> {
    return Array.from(this.agents.values()).map((s) => ({ ...s.instance }));
  }

  /**
   * Remove an agent (stops it first if running).
   */
  async remove(id: string): Promise<void> {
    const state = this.agents.get(id);
    if (!state) {
      throw new Error(`Agent not found: ${id}`);
    }

    if (state.instance.status === "running") {
      await this.stop(id);
    }

    this.agents.delete(id);
    this.emit("removed", state.instance);
  }

  /**
   * Send a message to an agent and receive its response.
   */
  async send(id: string, message: string): Promise<string> {
    const state = this.getOrThrow(id);

    if (state.instance.status !== "running") {
      throw new Error(`Agent ${id} is not running (status: ${state.instance.status})`);
    }

    try {
      const response = await state.adapter.send(message);
      state.instance.lastActive = Date.now();
      state.messagesProcessed++;
      return response;
    } catch (err) {
      state.lastError = err instanceof Error ? err.message : String(err);
      this.emit("error", id, err instanceof Error ? err : new Error(String(err)));
      throw err;
    }
  }

  /**
   * Get detailed status for a specific agent.
   */
  async getStatus(id: string): Promise<AgentStatusDetail> {
    const state = this.getOrThrow(id);
    const uptime = state.instance.status === "running"
      ? Date.now() - state.startedAt
      : 0;

    return {
      instance: { ...state.instance },
      uptime,
      messagesProcessed: state.messagesProcessed,
      lastError: state.lastError,
    };
  }

  /**
   * Get an agent instance by id (returns undefined if not found).
   */
  get(id: string): AgentInstance | undefined {
    return this.agents.get(id)?.instance;
  }

  /**
   * Get the adapter for an agent (used by TaskDelegator).
   */
  getAdapter(id: string): AgentAdapter | undefined {
    return this.agents.get(id)?.adapter;
  }

  // --- internals ---

  private getOrThrow(id: string): AgentState {
    const state = this.agents.get(id);
    if (!state) {
      throw new Error(`Agent not found: ${id}`);
    }
    return state;
  }
}

// --- Passthrough adapter for cocapn-native / custom ---

class PassthroughAdapter implements AgentAdapter {
  private config: AgentAdapterConfig;
  private running = false;

  constructor(config: AgentAdapterConfig) {
    this.config = config;
  }

  async start(): Promise<void> {
    this.running = true;
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(message: string): Promise<string> {
    if (!this.running) {
      throw new Error("Agent is not running");
    }
    // cocapn-native agents are routed through the existing AgentRouter.
    // This adapter is a placeholder — real routing goes through bridge.ts.
    return `[cocapn-native] received: ${message}`;
  }

  isRunning(): boolean {
    return this.running;
  }
}
