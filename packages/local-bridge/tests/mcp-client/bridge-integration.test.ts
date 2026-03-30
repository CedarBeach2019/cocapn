/**
 * MCP Bridge Integration Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  McpBridgeIntegration,
  getMcpIntegration,
  resetMcpIntegration,
} from "../src/mcp-client/bridge-integration.js";
import { McpServerRegistry } from "../src/mcp-client/registry.js";
import { tmpdir } from "os";
import { join } from "path";
import { unlinkSync, existsSync } from "fs";

describe("McpBridgeIntegration", () => {
  let testConfigPath: string;
  let registry: McpServerRegistry;

  beforeEach(() => {
    // Use a temporary config file for testing
    const tempDir = tmpdir();
    testConfigPath = join(tempDir, `test-mcp-integration-${Date.now()}.json`);
    registry = new McpServerRegistry(testConfigPath);

    // Reset the singleton
    resetMcpIntegration();
  });

  afterEach(() => {
    // Clean up test config file
    if (existsSync(testConfigPath)) {
      try {
        unlinkSync(testConfigPath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });

  it("should create integration with registry", () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    expect(integration).toBeDefined();
  });

  it("should initialize without auto-connect", async () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    await integration.initialize();

    expect(integration.getConnectedServers().length).toBe(0);
  });

  it("should register and list servers", () => {
    registry.registerServer({
      name: "test-server",
      transport: {
        type: "stdio",
        command: "node",
        args: ["-e", "process.stdin.on('data', () => {})"],
      },
    });

    const servers = registry.listServers();

    expect(servers.length).toBe(1);
    expect(servers[0].name).toBe("test-server");
  });

  it("should get connected servers", async () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    registry.registerServer({
      name: "test-server",
      transport: {
        type: "stdio",
        command: "node",
        args: ["-e", "process.stdin.on('data', () => {})"],
      },
    });

    // Connection will fail but we're testing the API
    try {
      await integration.connectServer("test-server");
    } catch (error) {
      // Expected to fail
    }

    const connected = integration.getConnectedServers();

    // Should be empty since connection failed
    expect(connected.length).toBe(0);
  });

  it("should get all tools", () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    const tools = integration.getAllTools();

    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBe(0);
  });

  it("should check if tool exists", () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    expect(integration.hasTool("test:tool")).toBe(false);
  });

  it("should get stats", () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    const stats = integration.getStats();

    expect(stats.connectedServers).toBe(0);
    expect(stats.totalTools).toBe(0);
    expect(stats.servers).toEqual([]);
  });

  it("should handle disabled server", async () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    registry.registerServer({
      name: "disabled-server",
      transport: {
        type: "stdio",
        command: "node",
        args: [],
      },
      enabled: false,
    });

    const client = await integration.connectServer("disabled-server");

    // Should return null for disabled server
    expect(client).toBeNull();
  });

  it("should disconnect all servers", async () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    registry.registerServer({
      name: "test-server",
      transport: {
        type: "stdio",
        command: "node",
        args: [],
      },
    });

    await integration.disconnectAll();

    expect(integration.getConnectedServers().length).toBe(0);
  });

  it("should get client by server name", () => {
    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    const client = integration.getClient("non-existent");

    expect(client).toBeNull();
  });

  it("should use singleton pattern", () => {
    const integration1 = getMcpIntegration({ autoConnect: false });
    const integration2 = getMcpIntegration();

    expect(integration1).toBe(integration2);
  });

  it("should reset singleton", () => {
    const integration1 = getMcpIntegration();
    resetMcpIntegration();
    const integration2 = getMcpIntegration();

    expect(integration1).not.toBe(integration2);
  });

  it("should update server in registry", () => {
    registry.registerServer({
      name: "test-server",
      transport: {
        type: "stdio",
        command: "node",
        args: [],
      },
      description: "Original",
    });

    const result = registry.updateServer("test-server", {
      description: "Updated",
    });

    expect(result).toBe(true);

    const server = registry.getServer("test-server");
    expect(server?.description).toBe("Updated");
  });

  it("should handle multiple servers", () => {
    registry.registerServer({
      name: "server1",
      transport: { type: "stdio", command: "node", args: [] },
    });

    registry.registerServer({
      name: "server2",
      transport: { type: "sse", url: "http://localhost:3000/sse" },
    });

    registry.registerServer({
      name: "server3",
      transport: { type: "stdio", command: "python", args: ["-m", "server"] },
    });

    expect(registry.getServerCount()).toBe(3);

    const integration = new McpBridgeIntegration({
      registry,
      autoConnect: false,
    });

    const stats = integration.getStats();
    expect(stats.connectedServers).toBe(0);
  });

  it("should filter enabled servers", () => {
    registry.registerServer({
      name: "enabled-server",
      transport: { type: "stdio", command: "node", args: [] },
      enabled: true,
    });

    registry.registerServer({
      name: "disabled-server",
      transport: { type: "stdio", command: "node", args: [] },
      enabled: false,
    });

    const enabledServers = registry.listEnabledServers();

    expect(enabledServers.length).toBe(1);
    expect(enabledServers[0].name).toBe("enabled-server");
  });
});
