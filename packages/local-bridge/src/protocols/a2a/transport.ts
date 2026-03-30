/**
 * A2A transport implementations.
 *
 * HTTPTransport — POST to peer URLs (web-based agents, cloud workers).
 * LocalTransport — in-memory (co-located agents, processes on same machine).
 */

import type { A2AMessage, A2ATransport, A2AConfig } from './types.js';

// ─── HTTP Transport ──────────────────────────────────────────────────────────

export class HTTPTransport implements A2ATransport {
  private config: A2AConfig;
  private handlers: Set<(message: A2AMessage) => void> = new Set();
  private controller: AbortController | null = null;

  constructor(config: A2AConfig) {
    this.config = config;
  }

  async send(message: A2AMessage): Promise<void> {
    const targetUrl = message.to === 'broadcast'
      ? this.config.fleetUrl
      : this.config.peers[message.to];

    if (!targetUrl) {
      throw new Error(`No URL for peer "${message.to}". Known peers: ${Object.keys(this.config.peers).join(', ')}`);
    }

    const body = JSON.stringify(message);
    if (body.length > this.config.maxMessageSize) {
      throw new Error(`Message size ${body.length} exceeds limit ${this.config.maxMessageSize}`);
    }

    const opts: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    };
    if (this.controller) {
      opts.signal = this.controller.signal;
    }

    const res = await fetch(`${targetUrl}/a2a`, opts);

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }
  }

  onMessage(handler: (message: A2AMessage) => void): void {
    this.handlers.add(handler);
  }

  removeMessageHandler(handler: (message: A2AMessage) => void): void {
    this.handlers.delete(handler);
  }

  /** Called when an incoming HTTP request arrives — dispatches to registered handlers. */
  handleIncoming(message: A2AMessage): void {
    for (const handler of this.handlers) {
      handler(message);
    }
  }

  async start(): Promise<void> {
    this.controller = new AbortController();
  }

  async stop(): Promise<void> {
    this.controller?.abort();
    this.controller = null;
    this.handlers.clear();
  }
}

// ─── Local Transport ─────────────────────────────────────────────────────────

/**
 * In-memory transport for co-located agents.
 *
 * Multiple LocalTransport instances share a single MessageBus so they can
 * exchange messages without network I/O.
 */
export class LocalTransport implements A2ATransport {
  private agentId: string;
  private handlers: Set<(message: A2AMessage) => void> = new Set();
  private bus: MessageBus;

  constructor(agentId: string, bus?: MessageBus) {
    this.agentId = agentId;
    this.bus = bus ?? new MessageBus();
  }

  /** Get the shared bus — pass to other LocalTransport instances. */
  getBus(): MessageBus {
    return this.bus;
  }

  async send(message: A2AMessage): Promise<void> {
    this.bus.deliver(message);
  }

  onMessage(handler: (message: A2AMessage) => void): void {
    this.handlers.add(handler);
  }

  removeMessageHandler(handler: (message: A2AMessage) => void): void {
    this.handlers.delete(handler);
  }

  async start(): Promise<void> {
    this.bus.subscribe(this.agentId, (msg) => {
      for (const handler of this.handlers) {
        handler(msg);
      }
    });
  }

  async stop(): Promise<void> {
    this.bus.unsubscribe(this.agentId);
    this.handlers.clear();
  }
}

// ─── Message Bus ─────────────────────────────────────────────────────────────

/**
 * Simple in-memory pub/sub for local agent communication.
 * Messages are routed by `to` field: either a specific agent ID or 'broadcast'.
 */
export class MessageBus {
  private subscribers: Map<string, Set<(message: A2AMessage) => void>> = new Map();
  private messageCount = 0;

  subscribe(agentId: string, handler: (message: A2AMessage) => void): void {
    if (!this.subscribers.has(agentId)) {
      this.subscribers.set(agentId, new Set());
    }
    this.subscribers.get(agentId)!.add(handler);
  }

  unsubscribe(agentId: string): void {
    this.subscribers.delete(agentId);
  }

  deliver(message: A2AMessage): void {
    this.messageCount++;

    if (message.to === 'broadcast') {
      // Deliver to all subscribers except the sender
      for (const [id, handlers] of this.subscribers) {
        if (id === message.from) continue;
        for (const handler of handlers) {
          handler(message);
        }
      }
    } else {
      // Deliver to specific agent
      const handlers = this.subscribers.get(message.to);
      if (handlers) {
        for (const handler of handlers) {
          handler(message);
        }
      }
    }
  }

  getMessageCount(): number {
    return this.messageCount;
  }

  reset(): void {
    this.subscribers.clear();
    this.messageCount = 0;
  }
}
