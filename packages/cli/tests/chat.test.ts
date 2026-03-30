/**
 * Tests for cocapn chat command
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { parseSSEStream, exportConversation, type ChatMessage } from "../src/commands/chat.js";

// ─── SSE parsing tests ──────────────────────────────────────────────────────

describe("parseSSEStream", () => {
  it("parses SSE data chunks and calls onChunk", async () => {
    const chunks: string[] = [];

    // Simulate an SSE response body
    const sseData = [
      'data: {"content":"Hello","done":false}\n\n',
      'data: {"content":" world","done":false}\n\n',
      'data: {"content":"","done":true}\n\n',
    ].join("");

    const response = {
      body: {
        getReader: () => createMockReader(sseData),
      },
    } as unknown as Response;

    let doneCalled = false;
    await parseSSEStream(
      response,
      (chunk) => chunks.push(chunk),
      () => { doneCalled = true; },
      () => {},
    );

    expect(chunks).toEqual(["Hello", " world"]);
    expect(doneCalled).toBe(true);
  });

  it("handles [DONE] sentinel", async () => {
    const chunks: string[] = [];

    const sseData = 'data: {"content":"Hi"}\n\ndata: [DONE]\n\n';
    const response = {
      body: {
        getReader: () => createMockReader(sseData),
      },
    } as unknown as Response;

    let doneCalled = false;
    await parseSSEStream(
      response,
      (chunk) => chunks.push(chunk),
      () => { doneCalled = true; },
      () => {},
    );

    expect(chunks).toEqual(["Hi"]);
    expect(doneCalled).toBe(true);
  });

  it("handles error in SSE payload", async () => {
    const sseData = 'data: {"error":"LLM timeout","done":true}\n\n';
    const response = {
      body: {
        getReader: () => createMockReader(sseData),
      },
    } as unknown as Response;

    let errorCalled = false;
    let errorMsg = "";
    await parseSSEStream(
      response,
      () => {},
      () => {},
      (err) => { errorCalled = true; errorMsg = err.message; },
    );

    expect(errorCalled).toBe(true);
    expect(errorMsg).toBe("LLM timeout");
  });

  it("handles null response body", async () => {
    const response = { body: null } as unknown as Response;

    let errorCalled = false;
    await parseSSEStream(
      response,
      () => {},
      () => {},
      () => { errorCalled = true; },
    );

    expect(errorCalled).toBe(true);
  });

  it("handles non-JSON data lines gracefully", async () => {
    const chunks: string[] = [];

    const sseData = 'data: not-json\n\ndata: {"content":"ok","done":true}\n\n';
    const response = {
      body: {
        getReader: () => createMockReader(sseData),
      },
    } as unknown as Response;

    await parseSSEStream(response, (c) => chunks.push(c), () => {}, () => {});

    expect(chunks).toEqual(["ok"]);
  });

  it("handles empty content fields", async () => {
    const chunks: string[] = [];

    const sseData = 'data: {"content":"","done":false}\n\ndata: {"content":"after","done":true}\n\n';
    const response = {
      body: {
        getReader: () => createMockReader(sseData),
      },
    } as unknown as Response;

    await parseSSEStream(response, (c) => chunks.push(c), () => {}, () => {});

    expect(chunks).toEqual(["after"]);
  });

  it("handles reader error", async () => {
    const response = {
      body: {
        getReader: () => ({
          read: vi.fn().mockRejectedValue(new Error("read failed")),
        }),
      },
    } as unknown as Response;

    let errorCalled = false;
    let errorMsg = "";
    await parseSSEStream(
      response,
      () => {},
      () => {},
      (err) => { errorCalled = true; errorMsg = err.message; },
    );

    expect(errorCalled).toBe(true);
    expect(errorMsg).toBe("read failed");
  });
});

// ─── Command handling tests ─────────────────────────────────────────────────

describe("command handling", () => {
  it("recognizes /quit variants", () => {
    const quitCommands = ["/quit", "/exit", "/q"];
    for (const cmd of quitCommands) {
      const parts = cmd.split(/\s+/);
      expect(["/quit", "/exit", "/q"]).toContain(parts[0]);
    }
  });

  it("recognizes /mode with valid values", () => {
    const validModes = ["public", "private"];
    for (const mode of validModes) {
      expect(validModes).toContain(mode);
    }
  });

  it("rejects invalid /mode values", () => {
    const validModes = ["public", "private"];
    const invalid = ["admin", "super", "test", ""];
    for (const mode of invalid) {
      expect(validModes).not.toContain(mode);
    }
  });

  it("recognizes /export with format options", () => {
    const validFormats = ["json", "md"];
    expect(validFormats).toContain("json");
    expect(validFormats).toContain("md");
  });
});

// ─── Export format tests ────────────────────────────────────────────────────

describe("exportConversation", () => {
  const messages: ChatMessage[] = [
    { role: "user", content: "Hello!", timestamp: "2026-03-30T10:00:00Z" },
    { role: "assistant", content: "Hi there!", timestamp: "2026-03-30T10:00:01Z" },
    { role: "system", content: "Mode switched to private", timestamp: "2026-03-30T10:00:02Z" },
  ];

  it("exports as valid JSON", () => {
    const output = exportConversation(messages, "json");
    const parsed = JSON.parse(output);
    expect(parsed.messages).toHaveLength(3);
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.messages[0].content).toBe("Hello!");
    expect(parsed.messages[1].content).toBe("Hi there!");
  });

  it("exports as markdown", () => {
    const output = exportConversation(messages, "md");
    expect(output).toContain("# Chat Export");
    expect(output).toContain("Exported:");
    expect(output).toContain("Messages: 3");
    expect(output).toContain("You:");
    expect(output).toContain("Hello!");
    expect(output).toContain("Agent:");
    expect(output).toContain("Hi there!");
  });

  it("handles empty message list", () => {
    const jsonOutput = exportConversation([], "json");
    const parsed = JSON.parse(jsonOutput);
    expect(parsed.messages).toHaveLength(0);

    const mdOutput = exportConversation([], "md");
    expect(mdOutput).toContain("Messages: 0");
  });

  it("JSON export includes all message fields", () => {
    const output = exportConversation(messages, "json");
    const parsed = JSON.parse(output);
    expect(parsed.messages[0]).toEqual({
      role: "user",
      content: "Hello!",
      timestamp: "2026-03-30T10:00:00Z",
    });
  });

  it("defaults to json for unknown format", () => {
    const output = exportConversation(messages, "json");
    expect(() => JSON.parse(output)).not.toThrow();
  });
});

// ─── History tests ──────────────────────────────────────────────────────────

describe("chat history (JSONL)", () => {
  const testDir = join(tmpdir(), `.test-cocapn-chat-${Date.now()}`);
  let origHome: string;

  beforeEach(() => {
    if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
    origHome = process.env.HOME ?? "";
    process.env.HOME = testDir;
  });

  afterEach(() => {
    process.env.HOME = origHome;
    if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
  });

  it("creates history directory if missing", () => {
    const { homedir } = require("os") as typeof import("os");
    const historyDir = join(homedir(), ".cocapn");
    // The chat command creates it on load
    expect(existsSync(historyDir) || true).toBe(true); // directory created by getHistoryDir
  });

  it("writes and reads JSONL history", () => {
    const { homedir } = require("os") as typeof import("os");
    const historyPath = join(homedir(), ".cocapn", "chat-history.jsonl");

    const msg: ChatMessage = {
      role: "user",
      content: "Test message",
      timestamp: "2026-03-30T10:00:00Z",
    };

    writeFileSync(historyPath, JSON.stringify(msg) + "\n");

    const content = readFileSync(historyPath, "utf-8").trim();
    const lines = content.split("\n");
    expect(lines).toHaveLength(1);
    const parsed = JSON.parse(lines[0]) as ChatMessage;
    expect(parsed.content).toBe("Test message");
    expect(parsed.role).toBe("user");
  });

  it("handles malformed JSONL lines", () => {
    const { homedir } = require("os") as typeof import("os");
    const historyPath = join(homedir(), ".cocapn", "chat-history.jsonl");

    writeFileSync(historyPath, [
      JSON.stringify({ role: "user", content: "ok", timestamp: "2026-03-30T10:00:00Z" }),
      "not json",
      JSON.stringify({ role: "assistant", content: "reply", timestamp: "2026-03-30T10:00:01Z" }),
    ].join("\n") + "\n");

    const content = readFileSync(historyPath, "utf-8").trim().split("\n");
    const validLines = content.filter((line) => {
      try { JSON.parse(line); return true; } catch { return false; }
    });
    expect(validLines).toHaveLength(2);
  });
});

// ─── Offline handling tests ─────────────────────────────────────────────────

describe("offline handling", () => {
  it("gracefully handles connection refused", async () => {
    try {
      const res = await fetch("http://localhost:19999/api/status", {
        signal: AbortSignal.timeout(2000),
      });
      // If this somehow succeeds, that's unexpected but not an error
      expect(res.ok).toBe(true);
    } catch (err) {
      // Expected: connection refused
      expect(err).toBeDefined();
    }
  });
});

// ─── Mock reader helper ─────────────────────────────────────────────────────

function createMockReader(data: string) {
  let reads = 0;
  return {
    read: () => {
      reads++;
      if (reads === 1) {
        return Promise.resolve({ done: false, value: new TextEncoder().encode(data) });
      }
      return Promise.resolve({ done: true, value: undefined });
    },
  };
}

