/**
 * AgentAdapter — common interface for all agent-type adapters.
 *
 * Each adapter wraps the specifics of communicating with a particular
 * agent runtime (Manus, OpenClaw, Claude Code, etc.).
 */

export interface AgentAdapterConfig {
  workingDir: string;
  env: Record<string, string>;
  options: Record<string, unknown>;
}

export interface AgentAdapter {
  /** Start the agent runtime / connection. */
  start(): Promise<void>;
  /** Gracefully stop the agent. */
  stop(): Promise<void>;
  /** Send a message and return the agent's response. */
  send(message: string): Promise<string>;
  /** Check whether the adapter's underlying connection is alive. */
  isRunning(): boolean;
}
