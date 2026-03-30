/**
 * McpClient — wrapper for connecting cocapn to external MCP servers.
 *
 * This wraps the generic MCPClient from @cocapn/protocols/mcp and provides
 * a simpler API specifically for cocapn's use case: connecting to external
 * MCP servers and using their tools/resources.
 */

import { MCPClient } from "@cocapn/protocols/mcp/client";
import { createMcpTransport, type McpTransportConfig } from "./transport.js";
import type {
  McpTool,
  McpResource,
  McpCallToolParams,
  McpCallToolResult,
  McpInitializeResult,
} from "@cocapn/protocols/mcp/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpServerConfig {
  name: string;
  transport: McpTransportConfig;
}

export interface McpClientConfig extends McpServerConfig {
  enabled?: boolean;
}

// ---------------------------------------------------------------------------
// McpClient wrapper
// ---------------------------------------------------------------------------

export class McpClientWrapper {
  private config: McpClientConfig;
  private client: MCPClient | null = null;
  private serverInfo: McpInitializeResult | null = null;
  private connected = false;

  constructor(config: McpClientConfig) {
    this.config = config;
  }

  /**
   * Connect to the MCP server and perform the handshake.
   */
  async connect(): Promise<McpInitializeResult> {
    if (this.connected) {
      return this.serverInfo!;
    }

    const transport = createMcpTransport(this.config.transport);

    this.client = new MCPClient({
      clientInfo: {
        name: "cocapn",
        version: "0.1.0",
      },
      capabilities: {
        tools: {},
        resources: {},
      },
    });

    try {
      this.serverInfo = await this.client.connect(transport);
      this.connected = true;
      return this.serverInfo;
    } catch (error) {
      this.client = null;
      this.connected = false;
      throw error;
    }
  }

  /**
   * Check if the client is connected.
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Get the server info from the handshake.
   */
  getServerInfo(): McpInitializeResult | null {
    return this.serverInfo;
  }

  /**
   * List all available tools from the MCP server.
   */
  async listTools(): Promise<McpTool[]> {
    if (!this.client || !this.connected) {
      throw new Error(`McpClientWrapper [${this.config.name}]: not connected`);
    }
    return this.client.listTools();
  }

  /**
   * Call a tool on the MCP server.
   */
  async callTool(params: McpCallToolParams): Promise<McpCallToolResult> {
    if (!this.client || !this.connected) {
      throw new Error(`McpClientWrapper [${this.config.name}]: not connected`);
    }
    return this.client.callTool(params);
  }

  /**
   * List all available resources from the MCP server.
   */
  async listResources(): Promise<McpResource[]> {
    if (!this.client || !this.connected) {
      throw new Error(`McpClientWrapper [${this.config.name}]: not connected`);
    }
    return this.client.listResources();
  }

  /**
   * Read a resource from the MCP server.
   */
  async readResource(uri: string): Promise<string> {
    if (!this.client || !this.connected) {
      throw new Error(`McpClientWrapper [${this.config.name}]: not connected`);
    }
    const result = await this.client.readResource(uri);
    // Extract text content from the result
    if (result.contents.length === 0) {
      return "";
    }
    const first = result.contents[0];
    return first.text ?? first.blob ?? "";
  }

  /**
   * Disconnect from the MCP server.
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
    }
    this.connected = false;
    this.serverInfo = null;
  }

  /**
   * Get the client name.
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Check if this client is enabled.
   */
  isEnabled(): boolean {
    return this.config.enabled !== false;
  }
}
