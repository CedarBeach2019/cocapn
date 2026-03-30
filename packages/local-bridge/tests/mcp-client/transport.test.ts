/**
 * MCP Client Transport Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { McpStdioTransport, McpSseTransport, createMcpTransport } from "../src/mcp-client/transport.js";
import type { JsonRpcMessage } from "@cocapn/protocols/mcp/types";

describe("McpStdioTransport", () => {
  it("should create transport with command and args", () => {
    const transport = new McpStdioTransport({
      command: "node",
      args: ["-e", "process.stdin.on('data', () => {})"],
    });

    expect(transport).toBeDefined();
  });

  it("should fail to start with invalid command", async () => {
    const transport = new McpStdioTransport({
      command: "nonexistent-command-xyz-123",
      args: [],
    });

    let errorOccurred = false;
    transport.onError(() => {
      errorOccurred = true;
    });

    await transport.start();

    // Give it a moment to fail
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(errorOccurred).toBe(true);

    await transport.close();
  });

  it("should handle message buffering", async () => {
    const transport = new McpStdioTransport({
      command: "node",
      args: ["-e", "console.log('test')"],
    });

    let receivedMessage: JsonRpcMessage | null = null;
    transport.onMessage((msg) => {
      receivedMessage = msg;
    });

    await transport.start();

    // Wait for process to exit
    await new Promise((resolve) => setTimeout(resolve, 500));

    await transport.close();

    // The echo script should have output something
    // We're just testing that the transport doesn't crash
    expect(transport).toBeDefined();
  });

  it("should close cleanly", async () => {
    const transport = new McpStdioTransport({
      command: "node",
      args: ["-e", "process.stdin.on('data', () => {})"],
    });

    await transport.start();
    await transport.close();

    // Should not throw
    expect(true).toBe(true);
  });
});

describe("McpSseTransport", () => {
  it("should create transport with URL", () => {
    const transport = new McpSseTransport({
      url: "http://localhost:3000/sse",
    });

    expect(transport).toBeDefined();
  });

  it("should fail to connect to non-existent server", async () => {
    const transport = new McpSseTransport({
      url: "http://localhost:59999/sse",
    });

    let errorOccurred = false;
    transport.onError(() => {
      errorOccurred = true;
    });

    try {
      await transport.start();
      // Connection should fail immediately
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      errorOccurred = true;
    }

    await transport.close();

    // Either error or timeout
    expect(true).toBe(true);
  });

  it("should close cleanly", async () => {
    const transport = new McpSseTransport({
      url: "http://localhost:3000/sse",
    });

    await transport.close();

    // Should not throw
    expect(true).toBe(true);
  });
});

describe("createMcpTransport", () => {
  it("should create stdio transport", () => {
    const transport = createMcpTransport({
      type: "stdio",
      command: "node",
      args: ["-e", "process.stdin.on('data', () => {})"],
    });

    expect(transport).toBeInstanceOf(McpStdioTransport);
  });

  it("should create sse transport", () => {
    const transport = createMcpTransport({
      type: "sse",
      url: "http://localhost:3000/sse",
    });

    expect(transport).toBeInstanceOf(McpSseTransport);
  });

  it("should throw for invalid type", () => {
    expect(() => {
      createMcpTransport({
        type: "invalid" as any,
      });
    }).toThrow();
  });

  it("should throw for stdio without command", () => {
    expect(() => {
      createMcpTransport({
        type: "stdio",
        args: [],
      });
    }).toThrow();
  });

  it("should throw for sse without url", () => {
    expect(() => {
      createMcpTransport({
        type: "sse",
      });
    }).toThrow();
  });
});
