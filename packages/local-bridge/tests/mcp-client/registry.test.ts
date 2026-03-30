/**
 * MCP Server Registry Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpServerRegistry } from "../src/mcp-client/registry.js";
import { unlinkSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("McpServerRegistry", () => {
  let testConfigPath: string;

  beforeEach(() => {
    // Use a temporary config file for testing
    const tempDir = tmpdir();
    testConfigPath = join(tempDir, `test-mcp-servers-${Date.now()}.json`);
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

  it("should create registry with default config", () => {
    const registry = new McpServerRegistry(testConfigPath);

    expect(registry.getServerCount()).toBe(0);
    expect(registry.listServerNames()).toEqual([]);
  });

  it("should register a server", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "test-server",
      transport: {
        type: "stdio",
        command: "node",
        args: ["-e", "process.stdin.on('data', () => {})"],
      },
    });

    expect(registry.getServerCount()).toBe(1);
    expect(registry.hasServer("test-server")).toBe(true);
  });

  it("should throw when registering without name", () => {
    const registry = new McpServerRegistry(testConfigPath);

    expect(() => {
      registry.registerServer({
        name: "",
        transport: {
          type: "stdio",
          command: "node",
          args: [],
        },
      });
    }).toThrow();
  });

  it("should throw when registering without transport", () => {
    const registry = new McpServerRegistry(testConfigPath);

    expect(() => {
      registry.registerServer({
        name: "test-server",
        transport: undefined as any,
      });
    }).toThrow();
  });

  it("should unregister a server", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "test-server",
      transport: {
        type: "stdio",
        command: "node",
        args: [],
      },
    });

    const result = registry.unregisterServer("test-server");

    expect(result).toBe(true);
    expect(registry.hasServer("test-server")).toBe(false);
    expect(registry.getServerCount()).toBe(0);
  });

  it("should return false when unregistering non-existent server", () => {
    const registry = new McpServerRegistry(testConfigPath);

    const result = registry.unregisterServer("non-existent");

    expect(result).toBe(false);
  });

  it("should get a server by name", () => {
    const registry = new McpServerRegistry(testConfigPath);

    const entry = {
      name: "test-server",
      transport: {
        type: "stdio",
        command: "node",
        args: [],
      },
    };

    registry.registerServer(entry);

    const retrieved = registry.getServer("test-server");

    expect(retrieved).toEqual(entry);
  });

  it("should return null for non-existent server", () => {
    const registry = new McpServerRegistry(testConfigPath);

    const result = registry.getServer("non-existent");

    expect(result).toBeNull();
  });

  it("should list server names", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "server1",
      transport: { type: "stdio", command: "node", args: [] },
    });

    registry.registerServer({
      name: "server2",
      transport: { type: "sse", url: "http://localhost:3000/sse" },
    });

    const names = registry.listServerNames();

    expect(names).toEqual(expect.arrayContaining(["server1", "server2"]));
    expect(names.length).toBe(2);
  });

  it("should list all servers", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "server1",
      transport: { type: "stdio", command: "node", args: [] },
    });

    registry.registerServer({
      name: "server2",
      transport: { type: "sse", url: "http://localhost:3000/sse" },
    });

    const servers = registry.listServers();

    expect(servers.length).toBe(2);
    expect(servers[0].name).toBe("server1");
    expect(servers[1].name).toBe("server2");
  });

  it("should list only enabled servers", () => {
    const registry = new McpServerRegistry(testConfigPath);

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

  it("should update a server", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "test-server",
      transport: { type: "stdio", command: "node", args: [] },
      description: "Original description",
    });

    const result = registry.updateServer("test-server", {
      description: "Updated description",
    });

    expect(result).toBe(true);

    const server = registry.getServer("test-server");
    expect(server?.description).toBe("Updated description");
  });

  it("should return false when updating non-existent server", () => {
    const registry = new McpServerRegistry(testConfigPath);

    const result = registry.updateServer("non-existent", {
      description: "New description",
    });

    expect(result).toBe(false);
  });

  it("should enable and disable a server", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "test-server",
      transport: { type: "stdio", command: "node", args: [] },
      enabled: true,
    });

    registry.setServerEnabled("test-server", false);

    let server = registry.getServer("test-server");
    expect(server?.enabled).toBe(false);

    registry.setServerEnabled("test-server", true);

    server = registry.getServer("test-server");
    expect(server?.enabled).toBe(true);
  });

  it("should clear all servers", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "server1",
      transport: { type: "stdio", command: "node", args: [] },
    });

    registry.registerServer({
      name: "server2",
      transport: { type: "sse", url: "http://localhost:3000/sse" },
    });

    expect(registry.getServerCount()).toBe(2);

    registry.clear();

    expect(registry.getServerCount()).toBe(0);
  });

  it("should reload config from disk", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "test-server",
      transport: { type: "stdio", command: "node", args: [] },
    });

    expect(registry.getServerCount()).toBe(1);

    registry.reload();

    // Should still have the server after reload
    expect(registry.getServerCount()).toBe(1);
  });

  it("should persist config across instances", () => {
    // First instance
    const registry1 = new McpServerRegistry(testConfigPath);

    registry1.registerServer({
      name: "test-server",
      transport: { type: "stdio", command: "node", args: [] },
    });

    // Second instance should load the persisted config
    const registry2 = new McpServerRegistry(testConfigPath);

    expect(registry2.getServerCount()).toBe(1);
    expect(registry2.hasServer("test-server")).toBe(true);
  });

  it("should handle SSE transport config", () => {
    const registry = new McpServerRegistry(testConfigPath);

    registry.registerServer({
      name: "sse-server",
      transport: {
        type: "sse",
        url: "http://localhost:3000/sse",
        headers: {
          Authorization: "Bearer token123",
        },
      },
    });

    const server = registry.getServer("sse-server");

    expect(server?.transport.type).toBe("sse");
    expect(server?.transport.url).toBe("http://localhost:3000/sse");
    expect(server?.transport.headers?.Authorization).toBe("Bearer token123");
  });
});
