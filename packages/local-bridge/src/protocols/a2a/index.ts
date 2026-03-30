/**
 * A2A (Agent-to-Agent) client.
 *
 * High-level API for agent communication:
 *   send(to, type, payload)     — fire-and-forget
 *   broadcast(type, payload)    — send to all peers
 *   request(to, type, payload)  — send + wait for reply
 *   on(type, handler)           — register typed handler
 *   start() / stop()            — lifecycle
 *
 * Designed for robotics (Deckboss.ai) and fleet coordination.
 */

import { randomUUID } from 'crypto';
import type {
  A2AMessage,
  A2AConfig,
  A2ATransport,
  A2AMessageType,
  A2APriority,
} from './types.js';
import { DEFAULT_A2A_CONFIG, isExpired } from './types.js';
import { A2AHandler } from './handler.js';
import { LocalTransport } from './transport.js';

export { A2AMessage, A2AConfig, A2ATransport, A2AMessageType, A2APriority };
export { A2AHandler } from './handler.js';
export { HTTPTransport, LocalTransport, MessageBus } from './transport.js';
export { isExpired, priorityValue } from './types.js';

export interface A2AStatus {
  peers: number;
  messagesSent: number;
  messagesReceived: number;
  pendingReplies: number;
}

export class A2AClient {
  private config: A2AConfig;
  private transport: A2ATransport;
  private handler: A2AHandler;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private messagesSent = 0;
  private messagesReceived = 0;
  private running = false;

  constructor(config: A2AConfig, transport?: A2ATransport) {
    this.config = { ...DEFAULT_A2A_CONFIG, ...config };
    this.handler = new A2AHandler();
    this.transport = transport ?? new LocalTransport(this.config.agentId);
  }

  // ── Messaging ─────────────────────────────────────────────────────────────

  /** Send a fire-and-forget message. */
  async send(
    to: string,
    type: A2AMessageType,
    payload: unknown,
    options?: { priority?: A2APriority; ttl?: number },
  ): Promise<A2AMessage> {
    const message = this.createMessage(to, type, payload, options);
    await this.transport.send(message);
    this.messagesSent++;
    return message;
  }

  /** Broadcast a message to all peers. */
  async broadcast(
    type: A2AMessageType,
    payload: unknown,
    options?: { priority?: A2APriority; ttl?: number },
  ): Promise<A2AMessage> {
    return this.send('broadcast', type, payload, options);
  }

  /** Send a message and wait for a reply. Returns the reply payload. */
  async request(
    to: string,
    type: A2AMessageType,
    payload: unknown,
    timeout?: number,
  ): Promise<unknown> {
    const message = this.createMessage(to, type, payload);
    const replyPromise = this.handler.expectReply(message.id, timeout);
    await this.transport.send(message);
    this.messagesSent++;

    return replyPromise;
  }

  // ── Handlers ──────────────────────────────────────────────────────────────

  /** Register a handler for a specific message type. */
  on(type: A2AMessageType, handler: (message: A2AMessage) => void | Promise<void>): void {
    this.handler.on(type, handler);
  }

  /** Remove handler for a specific message type. */
  off(type: A2AMessageType): void {
    this.handler.off(type);
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Start the A2A client — begins transport and heartbeat. */
  async start(): Promise<void> {
    if (this.running) return;
    await this.transport.start();

    // Wire transport → handler
    this.transport.onMessage((msg) => {
      this.messagesReceived++;
      this.handler.handle(msg).catch((err) => {
        console.warn(`[a2a] Handler error for ${msg.type}:`, err);
      });
    });

    // Start heartbeat
    if (this.config.heartbeatInterval > 0) {
      this.heartbeatTimer = setInterval(() => {
        this.sendHeartbeat().catch(() => {
          // Heartbeat failure is non-critical
        });
      }, this.config.heartbeatInterval);
    }

    this.running = true;
  }

  /** Stop the A2A client — stops transport, heartbeat, and pending replies. */
  async stop(): Promise<void> {
    if (!this.running) return;

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    this.handler.rejectAllPending('A2A client stopped');
    await this.transport.stop();
    this.running = false;
  }

  /** Get current status. */
  getStatus(): A2AStatus {
    return {
      peers: Object.keys(this.config.peers).length,
      messagesSent: this.messagesSent,
      messagesReceived: this.messagesReceived,
      pendingReplies: this.handler.getPendingReplyCount(),
    };
  }

  /** Update peer list at runtime. */
  updatePeers(peers: Record<string, string>): void {
    this.config.peers = { ...this.config.peers, ...peers };
  }

  /** Remove a peer. */
  removePeer(peerId: string): void {
    delete this.config.peers[peerId];
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private createMessage(
    to: string,
    type: A2AMessageType,
    payload: unknown,
    options?: { priority?: A2APriority; ttl?: number },
  ): A2AMessage {
    const msg: A2AMessage = {
      id: randomUUID(),
      from: this.config.agentId,
      to,
      type,
      payload,
      timestamp: Date.now(),
    };
    if (options?.priority !== undefined) msg.priority = options.priority;
    if (options?.ttl !== undefined) msg.ttl = options.ttl;
    return msg;
  }

  private async sendHeartbeat(): Promise<void> {
    const message = this.createMessage('broadcast', 'heartbeat', {
      agentId: this.config.agentId,
      status: 'alive',
    });
    await this.transport.send(message);
  }
}
