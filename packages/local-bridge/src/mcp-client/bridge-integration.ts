/**
 * MCP Bridge Integration — connects MCP client tools to cocapn agents.
 *
 * This module provides the integration layer that:
 *   - Auto-discovers tools from connected MCP servers
 *   - Exposes them as tools that agents can call
 *   - Manages the lifecycle of MCP client connections
 */

import { McpClientWrapper } from "./client.js";
import { McpServerRegistry, getRegistry } from "./registry.js";
import type { McpTool } from "@cocapn/protocols/mcp/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpToolDefinition {
  name: string;
  description: string;
  serverName: string;
  inputSchema: McpTool["inputSchema"];
}

export interface McpBridgeIntegrationOptions {
  registry?: McpServerRegistry;
  autoConnect?: boolean;
}

// ---------------------------------------------------------------------------
// McpBridgeIntegration
// ---------------------------------------------------------------------------

export class McpBridgeIntegration {
  private registry: McpServerRegistry;
  private clients: Map<string, McpClientWrapper> = new Map();
  private tools: Map<string, McpToolDefinition> = new Map();
  private autoConnect: boolean;

  constructor(options: McpBridgeIntegrationOptions = {}) {
    this.registry = options.registry ?? getRegistry();
    this.autoConnect = options.autoConnect ?? true;
  }

  /**
   * Initialize the integration and connect to all enabled servers.
   */
  async initialize(): Promise<void> {
    if (!this.autoConnect) {
      return;
    }

    const servers = this.registry.listEnabledServers();
    const connectionPromises = servers.map((server) => this.connectServer(server.name));

    await Promise.allSettled(connectionPromises);
  }

  /**
   * Connect to a specific MCP server.
   */
  async connectServer(serverName: string): Promise<McpClientWrapper | null> {
    if (this.clients.has(serverName)) {
      return this.clients.get(serverName)!;
    }

    const entry = this.registry.getServer(serverName);
    if (!entry) {
      console.warn(`[McpBridgeIntegration] Server not found in registry: ${serverName}`);
      return null;
    }

    if (entry.enabled === false) {
      console.debug(`[McpBridgeIntegration] Server disabled: ${serverName}`);
      return null;
    }

    try {
      const client = new McpClientWrapper({
        name: entry.name,
        transport: entry.transport,
        enabled: entry.enabled !== false,
      });

      await client.connect();
      this.clients.set(serverName, client);

      // Auto-discover tools
      await this.discoverTools(client);

      return client;
    } catch (error) {
      console.error(`[McpBridgeIntegration] Failed to connect to ${serverName}:`, error);
      return null;
    }
  }

  /**
   * Disconnect from a specific MCP server.
   */
  async disconnectServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      await client.disconnect();
      this.clients.delete(serverName);

      // Remove tools associated with this server
      for (const [toolName, toolDef] of this.tools.entries()) {
        if (toolDef.serverName === serverName) {
          this.tools.delete(toolName);
        }
      }
    }
  }

  /**
   * Disconnect from all MCP servers.
   */
  async disconnectAll(): Promise<void> {
    const disconnectPromises = Array.from(this.clients.keys()).map((name) =>
      this.disconnectServer(name)
    );
    await Promise.allSettled(disconnectPromises);
  }

  /**
   * Discover tools from a connected MCP client.
   */
  private async discoverTools(client: McpClientWrapper): Promise<void> {
    try {
      const tools = await client.listTools();
      const serverName = client.getName();

      for (const tool of tools) {
        const toolName = `${serverName}:${tool.name}`;
        const toolDef: McpToolDefinition = {
          name: toolName,
          description: tool.description ?? tool.name,
          serverName,
          inputSchema: tool.inputSchema,
        };
        this.tools.set(toolName, toolDef);
      }

      console.debug(
        `[McpBridgeIntegration] Discovered ${tools.length} tools from ${serverName}`
      );
    } catch (error) {
      console.error(`[McpBridgeIntegration] Failed to discover tools:`, error);
    }
  }

  /**
   * Get all discovered tools.
   */
  getAllTools(): McpToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get a tool by name.
   */
  getTool(name: string): McpToolDefinition | null {
    return this.tools.get(name) ?? null;
  }

  /**
   * Call a tool on an MCP server.
   */
  async callTool(toolName: string, args: Record<string, unknown>): Promise<any> {
    const toolDef = this.tools.get(toolName);
    if (!toolDef) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const client = this.clients.get(toolDef.serverName);
    if (!client) {
      throw new Error(`Server not connected: ${toolDef.serverName}`);
    }

    // Strip the server prefix from the tool name
    const actualToolName = toolName.slice(toolDef.serverName.length + 1);

    return client.callTool({
      name: actualToolName,
      arguments: args,
    });
  }

  /**
   * Check if a tool exists.
   */
  hasTool(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all connected server names.
   */
  getConnectedServers(): string[] {
    return Array.from(this.clients.keys());
  }

  /**
   * Get a client by server name.
   */
  getClient(serverName: string): McpClientWrapper | null {
    return this.clients.get(serverName) ?? null;
  }

  /**
   * Refresh tool discovery for a specific server.
   */
  async refreshServer(serverName: string): Promise<void> {
    const client = this.clients.get(serverName);
    if (client) {
      // Remove existing tools from this server
      for (const [toolName, toolDef] of this.tools.entries()) {
        if (toolDef.serverName === serverName) {
          this.tools.delete(toolName);
        }
      }
      // Re-discover tools
      await this.discoverTools(client);
    }
  }

  /**
   * Get statistics about the integration.
   */
  getStats(): {
    connectedServers: number;
    totalTools: number;
    servers: Array<{ name: string; tools: number }>;
  } {
    const serverToolCounts = new Map<string, number>();

    for (const toolDef of this.tools.values()) {
      const count = serverToolCounts.get(toolDef.serverName) ?? 0;
      serverToolCounts.set(toolDef.serverName, count + 1);
    }

    return {
      connectedServers: this.clients.size,
      totalTools: this.tools.size,
      servers: Array.from(serverToolCounts.entries()).map(([name, tools]) => ({
        name,
        tools,
      })),
    };
  }
}

// ---------------------------------------------------------------------------
// Singleton instance for the bridge
// ---------------------------------------------------------------------------

let defaultIntegration: McpBridgeIntegration | null = null;

export function getMcpIntegration(options?: McpBridgeIntegrationOptions): McpBridgeIntegration {
  if (!defaultIntegration) {
    defaultIntegration = new McpBridgeIntegration(options);
  }
  return defaultIntegration;
}

export function resetMcpIntegration(): void {
  defaultIntegration = null;
}
