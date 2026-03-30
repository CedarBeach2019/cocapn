/**
 * A2A message handler — routes incoming messages by type.
 *
 * Each message type has a semantic purpose:
 *   task       — delegate work to another agent
 *   query      — ask another agent for information
 *   event      — broadcast events (catch logged, species detected, etc.)
 *   handoff    — transfer context between agents
 *   telemetry  — share sensor/device data
 *   heartbeat  — liveness check
 */

import type { A2AMessage, A2AMessageHandler, A2AMessageType } from './types.js';
import { isExpired } from './types.js';

type TypedHandlers = Partial<Record<A2AMessageType, A2AMessageHandler>>;

export class A2AHandler {
  private typedHandlers: TypedHandlers = {};
  private catchAll: A2AMessageHandler | null = null;
  private replyHandlers: Map<string, {
    resolve: (payload: unknown) => void;
    reject: (err: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = new Map();
  private defaultTimeout: number;
  private droppedExpired = 0;

  constructor(defaultTimeout = 30_000) {
    this.defaultTimeout = defaultTimeout;
  }

  /** Register a handler for a specific message type. */
  on(type: A2AMessageType, handler: A2AMessageHandler): void {
    this.typedHandlers[type] = handler;
  }

  /** Remove handler for a specific message type. */
  off(type: A2AMessageType): void {
    delete this.typedHandlers[type];
  }

  /** Register a catch-all handler for unmatched message types. */
  onAny(handler: A2AMessageHandler): void {
    this.catchAll = handler;
  }

  /**
   * Register a reply handler — resolves when a message with matching replyTo arrives.
   * Returns a promise that resolves with the reply payload or rejects on timeout.
   */
  expectReply(messageId: string, timeout?: number): Promise<unknown> {
    const ms = timeout ?? this.defaultTimeout;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.replyHandlers.delete(messageId);
        reject(new Error(`Reply to "${messageId}" timed out after ${ms}ms`));
      }, ms);

      this.replyHandlers.set(messageId, { resolve, reject, timer });
    });
  }

  /**
   * Handle an incoming message.
   * Returns true if the message was handled, false if dropped.
   */
  async handle(message: A2AMessage): Promise<boolean> {
    // Drop expired messages
    if (isExpired(message)) {
      this.droppedExpired++;
      return false;
    }

    // Check if this is a reply to a pending request
    if (message.replyTo && this.replyHandlers.has(message.replyTo)) {
      const pending = this.replyHandlers.get(message.replyTo)!;
      clearTimeout(pending.timer);
      this.replyHandlers.delete(message.replyTo);
      pending.resolve(message.payload);
      return true;
    }

    // Route by type
    const handler = this.typedHandlers[message.type];
    if (handler) {
      await handler(message);
      return true;
    }

    // Catch-all
    if (this.catchAll) {
      await this.catchAll(message);
      return true;
    }

    return false;
  }

  /** Reject all pending reply handlers (e.g. on shutdown). */
  rejectAllPending(reason = 'Handler shut down'): void {
    for (const [id, pending] of this.replyHandlers) {
      clearTimeout(pending.timer);
      pending.reject(new Error(reason));
    }
    this.replyHandlers.clear();
  }

  /** Number of messages dropped due to TTL expiration. */
  getDroppedExpired(): number {
    return this.droppedExpired;
  }

  /** Number of pending reply handlers awaiting response. */
  getPendingReplyCount(): number {
    return this.replyHandlers.size;
  }
}
