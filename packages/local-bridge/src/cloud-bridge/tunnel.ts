/**
 * Cloud Tunnel — outbound WebSocket from local agent to cloud worker.
 *
 * The local agent opens a reverse tunnel to the Cloudflare Worker.
 * This allows the cloud worker to relay public client messages to the
 * local agent, even when the agent is behind NAT.
 *
 * Flow:
 *   1. Local bridge starts → opens WebSocket to wss://worker/api/tunnel?token=JWT
 *   2. Cloud RelayDO accepts and stores the tunnel connection
 *   3. Public clients connect to wss://worker/ws → RelayDO relays to tunnel
 *   4. Local agent processes messages and sends responses back through tunnel
 *   5. RelayDO forwards responses to the originating client
 *
 * Authentication: Fleet JWT passed as query parameter on tunnel connect.
 * Reconnection: Automatic with exponential backoff.
 */

import { signJwt } from "../security/jwt.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudTunnelConfig {
  /** Full HTTPS URL of the cloud worker */
  workerUrl: string;
  /** Fleet JWT secret for authentication */
  fleetJwtSecret: string;
  /** Bridge instance ID */
  instanceId: string;
  /** Reconnect interval base in ms (default: 1000) */
  reconnectBaseMs?: number;
  /** Maximum reconnect backoff in ms (default: 30000) */
  reconnectMaxMs?: number;
  /** Ping interval in ms (default: 30000) */
  pingIntervalMs?: number;
}

export interface TunnelStatus {
  connected: boolean;
  url: string;
  connectedAt: string | null;
  reconnectAttempts: number;
  messagesSent: number;
  messagesReceived: number;
  lastError: string | null;
}

export type TunnelMessageHandler = (
  message: { type: string; clientId: string; data?: unknown; payload?: unknown; timestamp?: string }
) => Promise<unknown>;

// ─── CloudTunnel ───────────────────────────────────────────────────────────────

export class CloudTunnel {
  private config: Required<CloudTunnelConfig>;
  private ws: WebSocket | null = null;
  private status: TunnelStatus;
  private messageHandler: TunnelMessageHandler | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private statusListeners: Set<(status: TunnelStatus) => void> = new Set();

  constructor(config: CloudTunnelConfig) {
    this.config = {
      workerUrl: config.workerUrl,
      fleetJwtSecret: config.fleetJwtSecret,
      instanceId: config.instanceId,
      reconnectBaseMs: config.reconnectBaseMs ?? 1000,
      reconnectMaxMs: config.reconnectMaxMs ?? 30000,
      pingIntervalMs: config.pingIntervalMs ?? 30000,
    };

    this.status = {
      connected: false,
      url: this.config.workerUrl,
      connectedAt: null,
      reconnectAttempts: 0,
      messagesSent: 0,
      messagesReceived: 0,
      lastError: null,
    };
  }

  // ── Connection ────────────────────────────────────────────────────────────────

  /**
   * Open the tunnel connection to the cloud worker.
   */
  connect(): void {
    this.intentionalClose = false;
    this.establishConnection();
  }

  /**
   * Close the tunnel connection intentionally.
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.cleanup();

    if (this.ws) {
      try {
        this.ws.close(1000, "Intentional disconnect");
      } catch {
        // Already closed
      }
      this.ws = null;
    }

    this.status = {
      ...this.status,
      connected: false,
      connectedAt: null,
    };

    this.notifyStatusChange();
  }

  /**
   * Register a handler for incoming relay messages from the cloud.
   */
  onMessage(handler: TunnelMessageHandler): void {
    this.messageHandler = handler;
  }

  // ── Send ──────────────────────────────────────────────────────────────────────

  /**
   * Send a message through the tunnel to a specific client via the cloud relay.
   */
  send(clientId: string, data: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = JSON.stringify({
      type: "response",
      clientId,
      data,
      timestamp: new Date().toISOString(),
    });

    try {
      this.ws.send(message);
      this.status.messagesSent++;
      return true;
    } catch {
      this.handleDisconnection("Send failed");
      return false;
    }
  }

  /**
   * Broadcast a message to all connected clients through the cloud relay.
   */
  broadcast(data: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    const message = JSON.stringify({
      type: "broadcast",
      data,
      timestamp: new Date().toISOString(),
    });

    try {
      this.ws.send(message);
      this.status.messagesSent++;
      return true;
    } catch {
      this.handleDisconnection("Broadcast failed");
      return false;
    }
  }

  // ── Status ────────────────────────────────────────────────────────────────────

  getStatus(): TunnelStatus {
    return { ...this.status };
  }

  onStatusChange(callback: (status: TunnelStatus) => void): void {
    this.statusListeners.add(callback);
  }

  offStatusChange(callback: (status: TunnelStatus) => void): void {
    this.statusListeners.delete(callback);
  }

  // ── Internal ──────────────────────────────────────────────────────────────────

  private establishConnection(): void {
    if (this.intentionalClose) return;

    const token = this.generateToken();
    const wsUrl = this.config.workerUrl
      .replace(/^http/, "ws")
      .replace(/\/$/, "");
    const tunnelUrl = `${wsUrl}/api/tunnel?token=${encodeURIComponent(token)}`;

    try {
      this.ws = new WebSocket(tunnelUrl);

      this.ws.addEventListener("open", () => {
        this.status = {
          ...this.status,
          connected: true,
          connectedAt: new Date().toISOString(),
          reconnectAttempts: 0,
          lastError: null,
        };

        this.startPing();
        this.notifyStatusChange();
      });

      this.ws.addEventListener("message", async (event) => {
        this.status.messagesReceived++;

        const raw = typeof event.data === "string" ? event.data : String(event.data);

        // Handle ping/pong
        if (raw === "ping") {
          this.ws?.send("pong");
          return;
        }

        // Parse and dispatch to handler
        if (this.messageHandler) {
          try {
            const parsed = JSON.parse(raw) as {
              type: string;
              clientId: string;
              data?: unknown;
              payload?: unknown;
              timestamp?: string;
            };

            const response = await this.messageHandler(parsed);

            // If handler returns a response, send it back
            if (response !== undefined && parsed.clientId) {
              this.send(parsed.clientId, response);
            }
          } catch {
            // Non-JSON or handler error — ignore
          }
        }
      });

      this.ws.addEventListener("close", (event) => {
        this.status.connected = false;
        this.stopPing();

        if (!this.intentionalClose) {
          this.scheduleReconnect(`Connection closed: ${event.code}`);
        }

        this.notifyStatusChange();
      });

      this.ws.addEventListener("error", () => {
        this.status.lastError = "WebSocket error";
        this.status.connected = false;
        this.stopPing();

        if (!this.intentionalClose) {
          this.scheduleReconnect("WebSocket error");
        }

        this.notifyStatusChange();
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.status.lastError = msg;
      this.scheduleReconnect(msg);
    }
  }

  private handleDisconnection(reason: string): void {
    this.status.lastError = reason;
    this.status.connected = false;
    this.stopPing();

    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Already closed
      }
      this.ws = null;
    }

    if (!this.intentionalClose) {
      this.scheduleReconnect(reason);
    }

    this.notifyStatusChange();
  }

  private scheduleReconnect(reason: string): void {
    this.status.reconnectAttempts++;
    this.status.lastError = reason;

    const delay = Math.min(
      this.config.reconnectBaseMs * Math.pow(2, this.status.reconnectAttempts - 1),
      this.config.reconnectMaxMs
    );

    // Add jitter (±25%)
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const actualDelay = Math.max(100, delay + jitter);

    this.cleanup();

    this.reconnectTimer = setTimeout(() => {
      this.establishConnection();
    }, actualDelay);
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          this.ws.send("ping");
        } catch {
          this.handleDisconnection("Ping failed");
        }
      }
    }, this.config.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private cleanup(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.stopPing();
  }

  private generateToken(): string {
    return signJwt(
      {
        sub: this.config.instanceId,
        iss: "cocapn",
        dom: "tunnel",
      },
      this.config.fleetJwtSecret,
      { ttlSeconds: 300 } // Short-lived for tunnel auth
    );
  }

  private notifyStatusChange(): void {
    const statusCopy = { ...this.status };
    for (const listener of Array.from(this.statusListeners)) {
      try {
        listener(statusCopy);
      } catch {
        // Listener error — skip
      }
    }
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────────

  /**
   * Clean up all resources.
   */
  destroy(): void {
    this.disconnect();
    this.statusListeners.clear();
  }
}
