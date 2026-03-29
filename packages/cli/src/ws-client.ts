/**
 * WebSocket client for communicating with a running cocapn bridge.
 *
 * Provides a simple interface for sending JSON-RPC requests to the bridge
 * and receiving responses.
 */

import { WebSocket } from "ws";
import { EventEmitter } from "events";

export interface BridgeResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

export interface BridgeStatus {
  running: boolean;
  uptime?: number;
  agents?: number;
  connections?: number;
  port?: number;
}

export interface SkillInfo {
  name: string;
  version: string;
  description: string;
  loaded: boolean;
}

export interface TemplateInfo {
  name: string;
  displayName: string;
  description: string;
  emoji: string;
  domains: string[];
}

export interface GraphStats {
  nodes: number;
  edges: number;
  languages: Record<string, number>;
  lastUpdated: string;
}

export interface TokenStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requests: number;
  avgTokensPerRequest: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded" | "unhealthy";
  checks: {
    git?: { status: string; message?: string };
    brain?: { status: string; message?: string };
    disk?: { status: string; message?: string };
    websocket?: { status: string; message?: string };
  };
}

export class BridgeClient extends EventEmitter {
  private ws: WebSocket | null = null;
  private url: string;
  private token: string | undefined;
  private connected = false;
  private messageId = 0;
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void;
    reject: (err: Error) => void;
    timeout: NodeJS.Timeout;
  }>();
  private requestTimeout = 30000; // 30 seconds

  constructor(url: string, token?: string) {
    super();
    this.url = url;
    this.token = token;
  }

  /**
   * Connect to the bridge
   */
  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const wsUrl = this.token ? `${this.url}?token=${this.token}` : this.url;
      this.ws = new WebSocket(wsUrl);

      let resolved = false;

      // Connection timeout (5 seconds)
      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          this.ws?.terminate();
          reject(new Error("Connection timeout"));
        }
      }, 5000);

      this.ws.on("open", () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.connected = true;
          this.emit("connected");
          resolve();
        }
      });

      this.ws.on("message", (data: Buffer) => {
        this.handleMessage(data);
      });

      this.ws.on("error", (err) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.emit("error", err);
          reject(err);
        }
      });

      this.ws.on("close", () => {
        this.connected = false;
        this.emit("disconnected");
        // Reject all pending requests
        for (const pending of this.pendingRequests.values()) {
          clearTimeout(pending.timeout);
          pending.reject(new Error("Connection closed"));
        }
        this.pendingRequests.clear();
      });
    });
  }

  /**
   * Disconnect from the bridge
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
      this.connected = false;
    }
  }

  /**
   * Send a JSON-RPC request to the bridge
   */
  async sendRequest(method: string, params?: unknown): Promise<unknown> {
    if (!this.connected || !this.ws) {
      throw new Error("Not connected to bridge");
    }

    const id = ++this.messageId;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request timeout: ${method}`));
      }, this.requestTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      const request = {
        jsonrpc: "2.0" as const,
        id,
        method,
        params,
      };

      this.ws!.send(JSON.stringify(request), (err) => {
        if (err) {
          clearTimeout(timeout);
          this.pendingRequests.delete(id);
          reject(err);
        }
      });
    });
  }

  /**
   * Get bridge status
   */
  async getStatus(): Promise<BridgeStatus> {
    const result = await this.sendRequest("bridge/status") as BridgeStatus;
    return result;
  }

  /**
   * List available skills
   */
  async listSkills(): Promise<SkillInfo[]> {
    const result = await this.sendRequest("skill/list") as { skills: SkillInfo[] };
    return result.skills || [];
  }

  /**
   * Load a skill
   */
  async loadSkill(name: string): Promise<void> {
    await this.sendRequest("skill/load", { name });
  }

  /**
   * Unload a skill
   */
  async unloadSkill(name: string): Promise<void> {
    await this.sendRequest("skill/unload", { name });
  }

  /**
   * Search templates
   */
  async searchTemplates(query: string): Promise<TemplateInfo[]> {
    const result = await this.sendRequest("template/search", { query }) as { templates: TemplateInfo[] };
    return result.templates || [];
  }

  /**
   * Install a template
   */
  async installTemplate(name: string, options?: { fork?: string }): Promise<void> {
    await this.sendRequest("template/install", { name, ...options });
  }

  /**
   * Start a tree search
   */
  async startTreeSearch(task: string): Promise<string> {
    const result = await this.sendRequest("tree/start", { task }) as { searchId: string };
    return result.searchId;
  }

  /**
   * Get tree search status
   */
  async getTreeSearchStatus(searchId: string): Promise<unknown> {
    return this.sendRequest("tree/status", { searchId });
  }

  /**
   * Get graph statistics
   */
  async getGraphStats(): Promise<GraphStats> {
    const result = await this.sendRequest("graph/stats") as GraphStats;
    return result;
  }

  /**
   * Get token usage statistics
   */
  async getTokenStats(): Promise<TokenStats> {
    const result = await this.sendRequest("metrics/tokens") as TokenStats;
    return result;
  }

  /**
   * Get health status
   */
  async getHealth(): Promise<HealthStatus> {
    const result = await this.sendRequest("health/check") as HealthStatus;
    return result;
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleMessage(data: Buffer): void {
    try {
      const message = JSON.parse(data.toString()) as BridgeResponse;

      if (message.id !== undefined && this.pendingRequests.has(message.id as number)) {
        const pending = this.pendingRequests.get(message.id as number)!;
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id as number);

        if (message.error) {
          pending.reject(new Error(`${message.error.message} (${message.error.code})`));
        } else {
          pending.resolve(message.result);
        }
      } else {
        // Emit unhandled messages
        this.emit("message", message);
      }
    } catch (err) {
      this.emit("error", new Error(`Failed to parse message: ${err}`));
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }
}

/**
 * Create a bridge client and connect
 */
export async function createBridgeClient(
  host = "localhost",
  port = 3100,
  token?: string
): Promise<BridgeClient> {
  const url = `ws://${host}:${port}`;
  const client = new BridgeClient(url, token);
  await client.connect();
  return client;
}
