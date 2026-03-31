/**
 * WebSocket Relay — bridges public clients to the local agent tunnel.
 *
 * Architecture:
 *   1. Local agent opens outbound WebSocket to /api/tunnel (reverse tunnel through NAT)
 *   2. Cloud worker stores tunnel connection in RelayState
 *   3. Public clients connect to /ws
 *   4. RelayState relays messages bidirectionally
 *   5. PublishingFilter strips private.* facts from outbound responses
 *
 * The relay is designed to run inside a Cloudflare Durable Object for
 * persistent state across Worker invocations.
 */

import type { CompiledSoul } from "./soul-compiler.js";

// ─── Types ────────────────────────────────────────────────────────────────────────

export interface RelayMessage {
  type: "chat" | "status" | "error" | "pong" | "heartbeat_ack";
  id?: string;
  payload?: unknown;
  timestamp?: string;
}

export interface TunnelInfo {
  connected: boolean;
  connectedAt?: string;
  instanceId?: string;
  bridgeMode?: string;
}

export interface ClientInfo {
  id: string;
  connectedAt: string;
  messagesReceived: number;
  messagesSent: number;
}

// ─── Publishing Filter ─────────────────────────────────────────────────────────────

/**
 * Strips private.* keys and internal metadata from relay responses.
 * Ensures no private facts leave the cloud worker.
 */
export function publishingFilter(data: unknown): unknown {
  if (data === null || data === undefined) return data;

  if (typeof data === "string") {
    try {
      const parsed = JSON.parse(data);
      const filtered = publishingFilter(parsed);
      return JSON.stringify(filtered);
    } catch {
      return data;
    }
  }

  if (Array.isArray(data)) {
    return data.map(publishingFilter);
  }

  if (typeof data === "object") {
    const obj = data as Record<string, unknown>;
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(obj)) {
      // Strip any key starting with "private."
      if (key.startsWith("private.") || key === "_internal" || key === "secrets") {
        continue;
      }
      filtered[key] = publishingFilter(value);
    }

    return filtered;
  }

  return data;
}

// ─── Relay State ───────────────────────────────────────────────────────────────────

/**
 * Manages a single tunnel connection and multiple client connections.
 * Designed to run inside a Durable Object for persistence.
 */
export class RelayState {
  private tunnel: { send: (data: string) => void; close: () => void } | null = null;
  private tunnelInfo: TunnelInfo = { connected: false };
  private clients: Map<
    string,
    { send: (data: string) => void; close: () => void; info: ClientInfo }
  > = new Map();
  private messageQueue: string[] = [];
  private maxQueueSize: number;
  private compiledSoul: CompiledSoul | null = null;

  constructor(options?: { maxQueueSize?: number }) {
    this.maxQueueSize = options?.maxQueueSize ?? 100;
  }

  // ── Tunnel Management ──────────────────────────────────────────────────────────

  /**
   * Register the local agent's tunnel connection.
   * Only one tunnel is allowed at a time; the previous one is evicted.
   */
  registerTunnel(
    ws: { send: (data: string) => void; close: () => void },
    meta?: { instanceId?: string; bridgeMode?: string }
  ): void {
    if (this.tunnel) {
      // Evict existing tunnel
      try {
        this.tunnel.send(JSON.stringify({ type: "error", payload: "Tunnel replaced by new connection" }));
        this.tunnel.close();
      } catch {
        // Tunnel already dead
      }
    }

    this.tunnel = ws;
    this.tunnelInfo = {
      connected: true,
      connectedAt: new Date().toISOString(),
      instanceId: meta?.instanceId,
      bridgeMode: meta?.bridgeMode,
    };

    // Flush queued messages
    this.flushQueue();
  }

  /**
   * Unregister the tunnel (local agent disconnected).
   */
  unregisterTunnel(): void {
    this.tunnel = null;
    this.tunnelInfo = { connected: false };

    // Notify all clients that the agent went offline
    const offlineMsg = JSON.stringify({
      type: "status",
      payload: { agentOnline: false },
      timestamp: new Date().toISOString(),
    });

    for (const [id, client] of this.clients) {
      try {
        client.send(offlineMsg);
      } catch {
        this.clients.delete(id);
      }
    }
  }

  /**
   * Get current tunnel status.
   */
  getTunnelInfo(): TunnelInfo {
    return { ...this.tunnelInfo };
  }

  /**
   * Check if the tunnel is active.
   */
  isTunnelActive(): boolean {
    return this.tunnel !== null && this.tunnelInfo.connected;
  }

  // ── Client Management ──────────────────────────────────────────────────────────

  /**
   * Register a public client connection.
   */
  registerClient(
    id: string,
    ws: { send: (data: string) => void; close: () => void }
  ): void {
    this.clients.set(id, {
      send: ws.send.bind(ws),
      close: ws.close.bind(ws),
      info: {
        id,
        connectedAt: new Date().toISOString(),
        messagesReceived: 0,
        messagesSent: 0,
      },
    });

    // Send initial status
    const statusMsg = JSON.stringify({
      type: "status",
      payload: { agentOnline: this.isTunnelActive() },
      timestamp: new Date().toISOString(),
    });

    try {
      ws.send(statusMsg);
    } catch {
      // Client already closed
    }
  }

  /**
   * Unregister a client connection.
   */
  unregisterClient(id: string): void {
    this.clients.delete(id);
  }

  /**
   * Get info about all connected clients.
   */
  getClientList(): ClientInfo[] {
    return Array.from(this.clients.values()).map((c) => ({ ...c.info }));
  }

  // ── Message Relay ──────────────────────────────────────────────────────────────

  /**
   * Handle a message FROM a public client → relay to local agent tunnel.
   */
  handleClientMessage(clientId: string, data: string): void {
    const client = this.clients.get(clientId);
    if (!client) return;

    client.info.messagesReceived++;

    if (!this.tunnel) {
      // Agent offline — queue the message
      this.enqueueMessage(data);
      // Tell client the message is queued
      try {
        client.send(
          JSON.stringify({
            type: "status",
            payload: { agentOnline: false, messageQueued: true },
            timestamp: new Date().toISOString(),
          })
        );
      } catch {
        // Client closed
      }
      return;
    }

    // Relay to tunnel, tagged with client ID
    const relayMsg = JSON.stringify({
      type: "relay",
      clientId,
      data,
      timestamp: new Date().toISOString(),
    });

    try {
      this.tunnel.send(relayMsg);
    } catch {
      // Tunnel dead
      this.unregisterTunnel();
      this.enqueueMessage(data);
    }
  }

  /**
   * Handle a message FROM the local agent tunnel → relay to specific client or broadcast.
   */
  handleTunnelMessage(data: string): void {
    let parsed: { type?: string; clientId?: string; data?: unknown; payload?: unknown };

    try {
      parsed = JSON.parse(data) as typeof parsed;
    } catch {
      // Non-JSON message from tunnel — broadcast to all clients
      this.broadcastToClients(data);
      return;
    }

    // Apply publishing filter to all outbound data
    const filtered = publishingFilter(parsed.data ?? parsed.payload ?? data);

    if (parsed.clientId) {
      // Targeted message to specific client
      this.sendToClient(parsed.clientId, filtered);
    } else {
      // Broadcast to all clients
      this.broadcastToClients(
        typeof filtered === "string" ? filtered : JSON.stringify(filtered)
      );
    }
  }

  /**
   * Send a message to a specific client.
   */
  sendToClient(clientId: string, data: unknown): boolean {
    const client = this.clients.get(clientId);
    if (!client) return false;

    const msg = typeof data === "string" ? data : JSON.stringify(data);

    try {
      client.send(msg);
      client.info.messagesSent++;
      return true;
    } catch {
      this.clients.delete(clientId);
      return false;
    }
  }

  /**
   * Broadcast a message to all connected clients.
   */
  broadcastToClients(data: string): void {
    const deadClients: string[] = [];

    for (const [id, client] of this.clients) {
      try {
        client.send(data);
        client.info.messagesSent++;
      } catch {
        deadClients.push(id);
      }
    }

    for (const id of deadClients) {
      this.clients.delete(id);
    }
  }

  // ── Message Queue (offline buffering) ──────────────────────────────────────────

  /**
   * Enqueue a message for delivery when tunnel reconnects.
   */
  private enqueueMessage(data: string): void {
    if (this.messageQueue.length >= this.maxQueueSize) {
      this.messageQueue.shift(); // Drop oldest
    }
    this.messageQueue.push(data);
  }

  /**
   * Flush queued messages to the tunnel.
   */
  private flushQueue(): void {
    if (!this.tunnel || this.messageQueue.length === 0) return;

    for (const msg of this.messageQueue) {
      try {
        this.tunnel.send(
          JSON.stringify({
            type: "relay",
            clientId: "queued",
            data: msg,
            timestamp: new Date().toISOString(),
            queued: true,
          })
        );
      } catch {
        this.unregisterTunnel();
        return;
      }
    }

    this.messageQueue = [];
  }

  /**
   * Get the current queue size.
   */
  getQueueSize(): number {
    return this.messageQueue.length;
  }

  // ── Soul Management ────────────────────────────────────────────────────────────

  /**
   * Set the compiled soul for this relay (used for public mode system prompt).
   */
  setSoul(soul: CompiledSoul): void {
    this.compiledSoul = soul;
  }

  /**
   * Get the current compiled soul.
   */
  getSoul(): CompiledSoul | null {
    return this.compiledSoul;
  }

  // ── Cleanup ────────────────────────────────────────────────────────────────────

  /**
   * Close all connections and clean up.
   */
  destroy(): void {
    if (this.tunnel) {
      try {
        this.tunnel.close();
      } catch {
        // Already closed
      }
      this.tunnel = null;
    }

    for (const [, client] of this.clients) {
      try {
        client.close();
      } catch {
        // Already closed
      }
    }
    this.clients.clear();
    this.tunnelInfo = { connected: false };
    this.messageQueue = [];
  }
}

// ─── Heartbeat Tracking ────────────────────────────────────────────────────────────

export interface AgentHeartbeat {
  instanceId: string;
  bridgeMode: string;
  tunnelActive: boolean;
  timestamp: string;
  version: string;
  metadata?: Record<string, unknown>;
}

/**
 * Manages agent online/offline status via heartbeat tracking.
 */
export class HeartbeatTracker {
  private agents: Map<string, AgentHeartbeat> = new Map();
  private staleTimeoutMs: number;

  constructor(options?: { staleTimeoutMs?: number }) {
    this.staleTimeoutMs = options?.staleTimeoutMs ?? 90000; // 90s default
  }

  /**
   * Record a heartbeat from a local agent.
   */
  recordHeartbeat(heartbeat: AgentHeartbeat): void {
    this.agents.set(heartbeat.instanceId, {
      ...heartbeat,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if an agent is considered online (heartbeat within timeout).
   */
  isOnline(instanceId: string): boolean {
    const hb = this.agents.get(instanceId);
    if (!hb) return false;

    const age = Date.now() - new Date(hb.timestamp).getTime();
    return age < this.staleTimeoutMs;
  }

  /**
   * Get heartbeat info for an agent.
   */
  getHeartbeat(instanceId: string): AgentHeartbeat | undefined {
    const hb = this.agents.get(instanceId);
    if (!hb) return undefined;

    // Update online status based on staleness
    return {
      ...hb,
      tunnelActive: this.isOnline(instanceId),
    };
  }

  /**
   * Remove stale heartbeats.
   */
  prune(): number {
    let pruned = 0;
    for (const [id] of this.agents) {
      if (!this.isOnline(id)) {
        this.agents.delete(id);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Get all agent statuses.
   */
  getAll(): AgentHeartbeat[] {
    return Array.from(this.agents.values()).map((hb) => ({
      ...hb,
      tunnelActive: this.isOnline(hb.instanceId),
    }));
  }
}
