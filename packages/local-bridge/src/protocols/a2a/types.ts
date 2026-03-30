/**
 * A2A (Agent-to-Agent) protocol types.
 *
 * For robotics integration (Deckboss.ai) and fleet coordination.
 * Agents communicate with each other and with hardware devices
 * using typed messages with priority, TTL, and reply-to semantics.
 */

// ─── Message ─────────────────────────────────────────────────────────────────

export type A2AMessageType =
  | 'task'
  | 'query'
  | 'event'
  | 'handoff'
  | 'heartbeat'
  | 'telemetry';

export type A2APriority = 'low' | 'normal' | 'high' | 'critical';

export interface A2AMessage {
  id: string;
  from: string;
  to: string;
  type: A2AMessageType;
  payload: unknown;
  timestamp: number;
  ttl?: number;
  priority?: A2APriority;
  replyTo?: string;
}

// ─── Config ──────────────────────────────────────────────────────────────────

export interface A2AConfig {
  agentId: string;
  fleetUrl?: string;
  peers: Record<string, string>;
  heartbeatInterval: number;
  maxMessageSize: number;
}

export const DEFAULT_A2A_CONFIG: Omit<A2AConfig, 'agentId'> = {
  peers: {},
  heartbeatInterval: 30_000,
  maxMessageSize: 1_000_000,
};

// ─── Transport interface ─────────────────────────────────────────────────────

export interface A2ATransport {
  send(message: A2AMessage): Promise<void>;
  onMessage(handler: (message: A2AMessage) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export type A2AMessageHandler = (message: A2AMessage) => void | Promise<void>;

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isExpired(message: A2AMessage): boolean {
  if (message.ttl === undefined) return false;
  return Date.now() - message.timestamp > message.ttl;
}

export function priorityValue(priority?: A2APriority): number {
  switch (priority) {
    case 'critical': return 4;
    case 'high': return 3;
    case 'normal': return 2;
    case 'low': return 1;
    default: return 2;
  }
}
