/**
 * Telemetry Tests
 *
 * Tests opt-in, privacy-first telemetry:
 * - track/flush enable/disable
 * - DO_NOT_TRACK respect
 * - PII sanitization
 * - Queue persistence
 * - Batch flush behavior
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { existsSync, unlinkSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { Telemetry, getSystemProperties } from "../src/telemetry/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_DIR = "/tmp/cocapn-test-telemetry";

function makeQueuePath(id: string): string {
  return join(TEST_DIR, `queue-${id}.jsonl`);
}

let nextId = 0;
function uniqueQueuePath(): string {
  return makeQueuePath(String(nextId++));
}

// Reset env before each test to avoid cross-contamination
const originalDnt = process.env.DO_NOT_TRACK;

function makeTelemetry(overrides?: { enabled?: boolean; endpoint?: string; sessionId?: string; queuePath?: string }): Telemetry {
  return new Telemetry(overrides);
}

function cleanGlobalTelemetrySetting(): void {
  const settingsPath = join(homedir(), ".cocapn", "settings.json");
  if (existsSync(settingsPath)) {
    try {
      const raw = readFileSync(settingsPath, "utf-8");
      const settings = JSON.parse(raw) as Record<string, unknown>;
      if ("telemetryEnabled" in settings) {
        delete settings.telemetryEnabled;
        writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
      }
    } catch {
      // Non-fatal
    }
  }
}

describe("Telemetry", () => {
  beforeEach(() => {
    delete process.env.DO_NOT_TRACK;
    cleanGlobalTelemetrySetting();
    if (!existsSync(TEST_DIR)) {
      mkdirSync(TEST_DIR, { recursive: true });
    }
    nextId = 0;
  });

  afterEach(() => {
    process.env.DO_NOT_TRACK = originalDnt;
    vi.restoreAllMocks();
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    // Clean up telemetryEnabled from global settings to avoid cross-test pollution
    const settingsPath = join(homedir(), ".cocapn", "settings.json");
    if (existsSync(settingsPath)) {
      try {
        const raw = readFileSync(settingsPath, "utf-8");
        const settings = JSON.parse(raw) as Record<string, unknown>;
        if ("telemetryEnabled" in settings) {
          delete settings.telemetryEnabled;
          writeFileSync(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
        }
      } catch {
        // Non-fatal
      }
    }
  });

  describe("defaults", () => {
    it("should be disabled by default", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ queuePath: qp });
      expect(t.isEnabled()).toBe(false);
    });

    it("should be enabled when explicitly configured", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, queuePath: qp });
      expect(t.isEnabled()).toBe(true);
      // Clean up timer
      void t.shutdown();
    });
  });

  describe("DO_NOT_TRACK", () => {
    it("should be disabled when DO_NOT_TRACK=1", () => {
      process.env.DO_NOT_TRACK = "1";
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, queuePath: qp });
      expect(t.isEnabled()).toBe(false);
    });

    it("should be disabled when DO_NOT_TRACK=true", () => {
      process.env.DO_NOT_TRACK = "true";
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, queuePath: qp });
      expect(t.isEnabled()).toBe(false);
    });

    it("should be enabled when DO_NOT_TRACK=0", () => {
      process.env.DO_NOT_TRACK = "0";
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, queuePath: qp });
      expect(t.isEnabled()).toBe(true);
      void t.shutdown();
    });
  });

  describe("enable / disable", () => {
    it("should enable telemetry", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ queuePath: qp });
      t.enable();
      expect(t.isEnabled()).toBe(true);
      void t.shutdown();
    });

    it("should be idempotent when enabling already-enabled telemetry", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, queuePath: qp });
      t.enable();
      expect(t.isEnabled()).toBe(true);
      void t.shutdown();
    });

    it("should disable telemetry", async () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });
      await t.disable();
      expect(t.isEnabled()).toBe(false);
      expect(t.getQueueLength()).toBe(0);
    });

    it("should be idempotent when disabling already-disabled telemetry", async () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ queuePath: qp });
      await t.disable();
      expect(t.isEnabled()).toBe(false);
    });
  });

  describe("track", () => {
    it("should not queue events when disabled", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });
      expect(t.getQueueLength()).toBe(0);
    });

    it("should queue events when enabled", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, sessionId: "test-session", queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });
      expect(t.getQueueLength()).toBe(1);
      void t.shutdown();
    });

    it("should sanitize properties — only allow known safe keys", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, sessionId: "test-session", queuePath: qp });
      t.track("chat", {
        model: "deepseek-chat",
        tokenCount: 100,
        message: "Hello world",            // PII — should be stripped
        code: "console.log('hi')",         // PII — should be stripped
        filePath: "/home/user/secret.js",  // PII — should be stripped
      });

      expect(t.getQueueLength()).toBe(1);
      // Verify the persisted event has sanitized properties
      const raw = readFileSync(qp, "utf-8");
      const event = JSON.parse(raw.split("\n")[0]);
      expect(event.properties).toEqual({ model: "deepseek-chat", tokenCount: 100 });
      expect(event.properties).not.toHaveProperty("message");
      expect(event.properties).not.toHaveProperty("code");
      expect(event.properties).not.toHaveProperty("filePath");

      void t.shutdown();
    });
  });

  describe("session ID", () => {
    it("should use provided sessionId", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ sessionId: "my-session", queuePath: qp });
      t.enable();
      t.track("bridge_start", { version: "0.1.0" });

      const raw = readFileSync(qp, "utf-8");
      const event = JSON.parse(raw.split("\n")[0]);
      expect(event.sessionId).toBe("my-session");

      void t.shutdown();
    });

    it("should generate a UUID sessionId if none provided", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });

      const raw = readFileSync(qp, "utf-8");
      const event = JSON.parse(raw.split("\n")[0]);
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(event.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

      void t.shutdown();
    });
  });

  describe("flush", () => {
    it("should be a no-op when disabled", async () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ queuePath: qp });
      await t.flush();
      expect(t.getQueueLength()).toBe(0);
    });

    it("should be a no-op when queue is empty", async () => {
      const qp = uniqueQueuePath();
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const t = makeTelemetry({ enabled: true, queuePath: qp });
      await t.flush();
      expect(t.getQueueLength()).toBe(0);

      void t.shutdown();
      vi.restoreAllMocks();
    });

    it("should clear queue on successful flush", async () => {
      const qp = uniqueQueuePath();
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const t = makeTelemetry({ enabled: true, sessionId: "test-session", queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });
      t.track("chat", { model: "test" });
      expect(t.getQueueLength()).toBe(2);

      await t.flush();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(t.getQueueLength()).toBe(0);

      // Verify the payload
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.events).toHaveLength(2);
      expect(callBody.events[0].event).toBe("bridge_start");
      expect(callBody.events[0].sessionId).toBe("test-session");
      expect(callBody.events[1].event).toBe("chat");

      void t.shutdown();
    });

    it("should re-queue events on network failure", async () => {
      const qp = uniqueQueuePath();
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      vi.stubGlobal("fetch", mockFetch);

      const t = makeTelemetry({ enabled: true, sessionId: "test-session", queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });
      expect(t.getQueueLength()).toBe(1);

      await t.flush();

      expect(mockFetch).toHaveBeenCalledOnce();
      // Events should be re-queued
      expect(t.getQueueLength()).toBe(1);

      void t.shutdown();
    });

    it("should re-queue events on non-OK response", async () => {
      const qp = uniqueQueuePath();
      const mockFetch = vi.fn().mockResolvedValue({ ok: false, status: 500 });
      vi.stubGlobal("fetch", mockFetch);

      const t = makeTelemetry({ enabled: true, sessionId: "test-session", queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });
      expect(t.getQueueLength()).toBe(1);

      await t.flush();

      expect(t.getQueueLength()).toBe(1);

      void t.shutdown();
    });
  });

  describe("batch size", () => {
    it("should auto-flush when queue reaches 50 events", async () => {
      const qp = uniqueQueuePath();
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const t = makeTelemetry({ enabled: true, sessionId: "test-session", queuePath: qp });

      // Track 49 events — should not flush yet
      for (let i = 0; i < 49; i++) {
        t.track("chat", { model: "test" });
      }
      expect(mockFetch).not.toHaveBeenCalled();
      expect(t.getQueueLength()).toBe(49);

      // Track 1 more — should trigger auto-flush
      t.track("chat", { model: "test" });

      // The flush is async (void this.flush()), so we need to wait a tick
      await new Promise((resolve) => setTimeout(resolve, 10));
      expect(mockFetch).toHaveBeenCalledOnce();

      void t.shutdown();
    });
  });

  describe("queue persistence", () => {
    it("should persist queue to disk", () => {
      const qp = uniqueQueuePath();
      const t = makeTelemetry({ enabled: true, sessionId: "test-session", queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });

      expect(existsSync(qp)).toBe(true);

      void t.shutdown();
    });

    it("should load queued events from disk on construction", () => {
      const qp = uniqueQueuePath();

      // Create a queue file manually
      const event = JSON.stringify({
        event: "bridge_start",
        properties: { version: "0.1.0" },
        timestamp: "2026-01-01T00:00:00.000Z",
        sessionId: "persisted-session",
        version: "0.1.0",
      });

      mkdirSync(dirname(qp), { recursive: true });
      writeFileSync(qp, event + "\n", "utf-8");

      // Now create a Telemetry instance — it should load the persisted event
      const t = makeTelemetry({ enabled: true, sessionId: "new-session", queuePath: qp });
      expect(t.getQueueLength()).toBe(1);

      void t.shutdown();
    });
  });

  describe("shutdown", () => {
    it("should flush remaining events on shutdown", async () => {
      const qp = uniqueQueuePath();
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const t = makeTelemetry({ enabled: true, sessionId: "test-session", queuePath: qp });
      t.track("bridge_start", { version: "0.1.0" });

      await t.shutdown();

      expect(mockFetch).toHaveBeenCalledOnce();
      expect(t.getQueueLength()).toBe(0);
    });

    it("should not flush when disabled on shutdown", async () => {
      const qp = uniqueQueuePath();
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const t = makeTelemetry({ queuePath: qp }); // disabled by default
      await t.shutdown();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});

describe("getSystemProperties", () => {
  it("should return system info", () => {
    const props = getSystemProperties();
    expect(props).toHaveProperty("version");
    expect(props).toHaveProperty("nodeVersion");
    expect(props).toHaveProperty("platform");
    expect(props).toHaveProperty("arch");
    expect(props.nodeVersion).toBe(process.version);
  });
});
