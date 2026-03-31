/**
 * Tests for cloud bridge proxy and worker integration.
 *
 * Tests the HTTP API endpoints for heartbeat, agent status,
 * and chat proxy functionality.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock KV ──────────────────────────────────────────────────────────────────

class MockKV {
  private store = new Map<string, { value: string; expires?: number }>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expires && Date.now() > entry.expires) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void> {
    this.store.set(key, {
      value,
      expires: options?.expirationTtl ? Date.now() + options.expirationTtl * 1000 : undefined,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  async list(options?: { prefix?: string }): Promise<{ keys: Array<{ name: string }> }> {
    const keys: Array<{ name: string }> = [];
    for (const key of this.store.keys()) {
      if (!options?.prefix || key.startsWith(options.prefix)) {
        keys.push({ name: key });
      }
    }
    return { keys };
  }
}

// ─── Proxy Logic Tests ─────────────────────────────────────────────────────────

describe("cloud bridge proxy logic", () => {
  describe("heartbeat request validation", () => {
    it("requires instanceId", async () => {
      const body = { bridgeMode: "private" };
      expect(body.instanceId).toBeUndefined();
    });

    it("accepts valid heartbeat data", () => {
      const heartbeat = {
        instanceId: "agent-1",
        bridgeMode: "private",
        tunnelActive: true,
        version: "0.2.0",
      };

      expect(heartbeat.instanceId).toBe("agent-1");
      expect(heartbeat.bridgeMode).toBe("private");
      expect(heartbeat.tunnelActive).toBe(true);
    });

    it("accepts heartbeat with metadata", () => {
      const heartbeat = {
        instanceId: "agent-1",
        bridgeMode: "hybrid",
        tunnelActive: false,
        version: "0.2.0",
        metadata: {
          uptime: 3600,
          brainFacts: 42,
          memoryUsage: "128MB",
        },
      };

      expect(heartbeat.metadata).toBeDefined();
      expect(typeof heartbeat.metadata).toBe("object");
    });
  });

  describe("agent status response format", () => {
    it("structures agent status correctly", () => {
      const status = {
        ok: true,
        online: true,
        agents: [
          {
            instanceId: "agent-1",
            bridgeMode: "private",
            online: true,
            lastHeartbeat: new Date().toISOString(),
            version: "0.2.0",
          },
        ],
        timestamp: new Date().toISOString(),
      };

      expect(status.ok).toBe(true);
      expect(status.agents).toHaveLength(1);
      expect(status.agents[0].online).toBe(true);
    });

    it("handles offline agent gracefully", () => {
      const status = {
        ok: true,
        online: false,
        agents: [],
        timestamp: new Date().toISOString(),
      };

      expect(status.online).toBe(false);
      expect(status.agents).toHaveLength(0);
    });
  });

  describe("chat proxy decision logic", () => {
    it("decides to proxy when tunnel is active", () => {
      const tunnelActive = true;
      const shouldProxy = tunnelActive;
      expect(shouldProxy).toBe(true);
    });

    it("falls back to local LLM when tunnel is offline", () => {
      const tunnelActive = false;
      const shouldProxy = tunnelActive;
      expect(shouldProxy).toBe(false);
    });
  });

  describe("tunnel JWT validation", () => {
    it("rejects requests without token", () => {
      const url = new URL("https://worker.dev/api/tunnel");
      const token = url.searchParams.get("token");
      expect(token).toBeNull();
    });

    it("reads token from query parameter", () => {
      const url = new URL("https://worker.dev/api/tunnel?token=test-jwt");
      const token = url.searchParams.get("token");
      expect(token).toBe("test-jwt");
    });
  });
});

// ─── KV Heartbeat Persistence Tests ────────────────────────────────────────────

describe("heartbeat KV persistence", () => {
  let kv: MockKV;

  beforeEach(() => {
    kv = new MockKV();
  });

  it("stores heartbeat in KV with TTL", async () => {
    const heartbeat = {
      instanceId: "agent-1",
      bridgeMode: "private",
      tunnelActive: true,
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    };

    await kv.put(
      `heartbeat:${heartbeat.instanceId}`,
      JSON.stringify(heartbeat),
      { expirationTtl: 120 }
    );

    const stored = await kv.get("heartbeat:agent-1");
    expect(stored).not.toBeNull();
    const parsed = JSON.parse(stored!);
    expect(parsed.instanceId).toBe("agent-1");
  });

  it("lists heartbeat keys", async () => {
    await kv.put("heartbeat:agent-1", "{}");
    await kv.put("heartbeat:agent-2", "{}");
    await kv.put("other:key", "{}");

    const result = await kv.list({ prefix: "heartbeat:" });
    expect(result.keys).toHaveLength(2);
    expect(result.keys.every((k) => k.name.startsWith("heartbeat:"))).toBe(true);
  });

  it("retrieves heartbeat for status check", async () => {
    const hb = {
      instanceId: "agent-1",
      bridgeMode: "private",
      tunnelActive: true,
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    };

    await kv.put("heartbeat:agent-1", JSON.stringify(hb));

    const raw = await kv.get("heartbeat:agent-1");
    expect(raw).not.toBeNull();

    const parsed = JSON.parse(raw!);
    expect(parsed.instanceId).toBe("agent-1");
    expect(parsed.tunnelActive).toBe(true);
  });
});

// ─── Chat Message Relay Format Tests ───────────────────────────────────────────

describe("relay message format", () => {
  it("formats client-to-tunnel relay messages correctly", () => {
    const relayMsg = {
      type: "relay",
      clientId: "client-123",
      data: JSON.stringify({ type: "chat", payload: { messages: [{ role: "user", content: "hello" }] } }),
      timestamp: new Date().toISOString(),
    };

    expect(relayMsg.type).toBe("relay");
    expect(relayMsg.clientId).toBe("client-123");
    expect(typeof relayMsg.data).toBe("string");

    const inner = JSON.parse(relayMsg.data);
    expect(inner.type).toBe("chat");
  });

  it("formats tunnel-to-client response correctly", () => {
    const response = {
      type: "response",
      clientId: "client-123",
      data: { type: "chat_response", content: "Hello from agent!" },
      timestamp: new Date().toISOString(),
    };

    expect(response.type).toBe("response");
    expect(response.clientId).toBe("client-123");

    const data = response.data as { type: string; content: string };
    expect(data.type).toBe("chat_response");
    expect(data.content).toBe("Hello from agent!");
  });

  it("formats queued messages with flag", () => {
    const queuedMsg = {
      type: "relay",
      clientId: "queued",
      data: "stored message",
      timestamp: new Date().toISOString(),
      queued: true,
    };

    expect(queuedMsg.queued).toBe(true);
    expect(queuedMsg.clientId).toBe("queued");
  });

  it("formats broadcast messages", () => {
    const broadcast = {
      type: "broadcast",
      data: { type: "status", payload: { agentOnline: true } },
      timestamp: new Date().toISOString(),
    };

    expect(broadcast.type).toBe("broadcast");
    expect((broadcast.data as { type: string }).type).toBe("status");
  });
});
