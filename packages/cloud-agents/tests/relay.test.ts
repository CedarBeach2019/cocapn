/**
 * Tests for WebSocket relay (RelayState, HeartbeatTracker, publishingFilter).
 *
 * Tests the core relay logic without requiring real WebSocket connections.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  RelayState,
  HeartbeatTracker,
  publishingFilter,
  type TunnelInfo,
  type ClientInfo,
} from "../src/relay.js";

// ─── Mock WebSocket ────────────────────────────────────────────────────────────

class MockWebSocket {
  sentMessages: string[] = [];
  closed = false;

  send(data: string): void {
    this.sentMessages.push(data);
  }

  close(): void {
    this.closed = true;
  }

  lastMessage(): unknown {
    if (this.sentMessages.length === 0) return null;
    try {
      return JSON.parse(this.sentMessages[this.sentMessages.length - 1]);
    } catch {
      return this.sentMessages[this.sentMessages.length - 1];
    }
  }
}

// ─── RelayState Tests ──────────────────────────────────────────────────────────

describe("RelayState", () => {
  let relay: RelayState;

  beforeEach(() => {
    relay = new RelayState({ maxQueueSize: 5 });
  });

  // ── Tunnel Management ─────────────────────────────────────────────────────

  describe("tunnel management", () => {
    it("registers a tunnel and reports it active", () => {
      const ws = new MockWebSocket();
      relay.registerTunnel(ws, { instanceId: "test-1", bridgeMode: "private" });

      expect(relay.isTunnelActive()).toBe(true);

      const info = relay.getTunnelInfo();
      expect(info.connected).toBe(true);
      expect(info.instanceId).toBe("test-1");
      expect(info.bridgeMode).toBe("private");
    });

    it("evicts previous tunnel when registering a new one", () => {
      const ws1 = new MockWebSocket();
      const ws2 = new MockWebSocket();

      relay.registerTunnel(ws1);
      relay.registerTunnel(ws2);

      expect(relay.isTunnelActive()).toBe(true);
      expect(ws1.closed).toBe(true);
      expect(ws2.closed).toBe(false);
    });

    it("unregisters tunnel and notifies clients", () => {
      const tunnel = new MockWebSocket();
      const client = new MockWebSocket();

      relay.registerTunnel(tunnel);
      relay.registerClient("c1", client);
      relay.unregisterTunnel();

      expect(relay.isTunnelActive()).toBe(false);

      // Client should receive offline notification
      const lastMsg = client.lastMessage() as { type: string; payload: { agentOnline: boolean } };
      expect(lastMsg.type).toBe("status");
      expect(lastMsg.payload.agentOnline).toBe(false);
    });
  });

  // ── Client Management ─────────────────────────────────────────────────────

  describe("client management", () => {
    it("registers a client and sends initial status", () => {
      const ws = new MockWebSocket();
      relay.registerClient("c1", ws);

      const clients = relay.getClientList();
      expect(clients).toHaveLength(1);
      expect(clients[0].id).toBe("c1");

      // Initial status message
      const msg = ws.lastMessage() as { type: string; payload: { agentOnline: boolean } };
      expect(msg.type).toBe("status");
      expect(msg.payload.agentOnline).toBe(false);
    });

    it("sends agentOnline: true when tunnel is active", () => {
      const tunnel = new MockWebSocket();
      const client = new MockWebSocket();

      relay.registerTunnel(tunnel);
      relay.registerClient("c1", client);

      const msg = client.lastMessage() as { type: string; payload: { agentOnline: boolean } };
      expect(msg.payload.agentOnline).toBe(true);
    });

    it("unregisters a client", () => {
      const ws = new MockWebSocket();
      relay.registerClient("c1", ws);
      relay.unregisterClient("c1");

      expect(relay.getClientList()).toHaveLength(0);
    });
  });

  // ── Message Relay ─────────────────────────────────────────────────────────

  describe("message relay", () => {
    it("relays client message to tunnel", () => {
      const tunnel = new MockWebSocket();
      const client = new MockWebSocket();

      relay.registerTunnel(tunnel);
      relay.registerClient("c1", client);

      relay.handleClientMessage("c1", JSON.stringify({ type: "chat", payload: "hello" }));

      const tunnelMsg = tunnel.lastMessage() as { type: string; clientId: string; data: string };
      expect(tunnelMsg.type).toBe("relay");
      expect(tunnelMsg.clientId).toBe("c1");
    });

    it("queues message when tunnel is offline", () => {
      const client = new MockWebSocket();
      relay.registerClient("c1", client);

      relay.handleClientMessage("c1", "test message");

      expect(relay.getQueueSize()).toBe(1);

      // Client gets queued status
      const msg = client.lastMessage() as { payload: { messageQueued: boolean } };
      expect(msg.payload.messageQueued).toBe(true);
    });

    it("flushes queued messages when tunnel connects", () => {
      const client = new MockWebSocket();
      relay.registerClient("c1", client);

      // Queue messages while offline
      relay.handleClientMessage("c1", "msg1");
      relay.handleClientMessage("c1", "msg2");
      expect(relay.getQueueSize()).toBe(2);

      // Connect tunnel — should flush
      const tunnel = new MockWebSocket();
      relay.registerTunnel(tunnel);

      expect(relay.getQueueSize()).toBe(0);

      // Tunnel should have received the queued messages
      const relayMessages = tunnel.sentMessages.filter((m) => {
        try {
          const parsed = JSON.parse(m) as { type: string; queued?: boolean };
          return parsed.type === "relay" && parsed.queued === true;
        } catch {
          return false;
        }
      });
      expect(relayMessages.length).toBe(2);
    });

    it("relays tunnel message to specific client", () => {
      const tunnel = new MockWebSocket();
      const client = new MockWebSocket();

      relay.registerTunnel(tunnel);
      relay.registerClient("c1", client);

      relay.handleTunnelMessage(
        JSON.stringify({
          clientId: "c1",
          type: "response",
          data: { content: "Hello from agent!" },
        })
      );

      const msg = client.lastMessage() as { content: string };
      expect(msg.content).toBe("Hello from agent!");
    });

    it("broadcasts tunnel message to all clients", () => {
      const tunnel = new MockWebSocket();
      const client1 = new MockWebSocket();
      const client2 = new MockWebSocket();

      relay.registerTunnel(tunnel);
      relay.registerClient("c1", client1);
      relay.registerClient("c2", client2);

      relay.handleTunnelMessage(
        JSON.stringify({ type: "broadcast", data: "announcement" })
      );

      const msg1 = client1.lastMessage();
      const msg2 = client2.lastMessage();
      expect(msg1).toEqual(msg2);
    });
  });

  // ── Queue ─────────────────────────────────────────────────────────────────

  describe("message queue", () => {
    it("enforces max queue size", () => {
      const client = new MockWebSocket();
      relay.registerClient("c1", client);

      // Queue more than max (5)
      for (let i = 0; i < 8; i++) {
        relay.handleClientMessage("c1", `msg-${i}`);
      }

      expect(relay.getQueueSize()).toBe(5);
    });
  });

  // ── Cleanup ───────────────────────────────────────────────────────────────

  describe("destroy", () => {
    it("closes all connections", () => {
      const tunnel = new MockWebSocket();
      const client = new MockWebSocket();

      relay.registerTunnel(tunnel);
      relay.registerClient("c1", client);
      relay.destroy();

      expect(tunnel.closed).toBe(true);
      expect(client.closed).toBe(true);
      expect(relay.isTunnelActive()).toBe(false);
      expect(relay.getClientList()).toHaveLength(0);
    });
  });
});

// ─── Publishing Filter Tests ───────────────────────────────────────────────────

describe("publishingFilter", () => {
  it("strips private.* keys from objects", () => {
    const input = {
      name: "Alice",
      "private.email": "alice@example.com",
      "private.ssn": "123-45-6789",
      public_fact: "hello",
    };

    const result = publishingFilter(input) as Record<string, unknown>;
    expect(result.name).toBe("Alice");
    expect(result.public_fact).toBe("hello");
    expect(result["private.email"]).toBeUndefined();
    expect(result["private.ssn"]).toBeUndefined();
  });

  it("strips _internal and secrets keys", () => {
    const input = {
      data: "ok",
      _internal: { debug: true },
      secrets: { apiKey: "abc" },
    };

    const result = publishingFilter(input) as Record<string, unknown>;
    expect(result.data).toBe("ok");
    expect(result._internal).toBeUndefined();
    expect(result.secrets).toBeUndefined();
  });

  it("filters nested objects recursively", () => {
    const input = {
      user: {
        name: "Alice",
        "private.phone": "555-1234",
      },
      "private.address": "123 Main St",
    };

    const result = publishingFilter(input) as Record<string, unknown>;
    const user = result.user as Record<string, unknown>;
    expect(user.name).toBe("Alice");
    expect(user["private.phone"]).toBeUndefined();
    expect(result["private.address"]).toBeUndefined();
  });

  it("passes through non-object values unchanged", () => {
    expect(publishingFilter("hello")).toBe("hello");
    expect(publishingFilter(42)).toBe(42);
    expect(publishingFilter(true)).toBe(true);
    expect(publishingFilter(null)).toBe(null);
  });

  it("filters arrays of objects", () => {
    const input = [
      { name: "a", "private.key": "x" },
      { name: "b", secrets: "y" },
    ];

    const result = publishingFilter(input) as Record<string, unknown>[];
    expect(result).toHaveLength(2);
    expect(result[0].name).toBe("a");
    expect(result[0]["private.key"]).toBeUndefined();
    expect(result[1].secrets).toBeUndefined();
  });

  it("filters JSON strings by parsing and re-serializing", () => {
    const input = JSON.stringify({ name: "ok", "private.key": "secret" });
    const result = publishingFilter(input) as string;
    const parsed = JSON.parse(result) as Record<string, unknown>;
    expect(parsed.name).toBe("ok");
    expect(parsed["private.key"]).toBeUndefined();
  });

  it("passes through non-JSON strings unchanged", () => {
    expect(publishingFilter("plain text")).toBe("plain text");
  });
});

// ─── HeartbeatTracker Tests ────────────────────────────────────────────────────

describe("HeartbeatTracker", () => {
  let tracker: HeartbeatTracker;

  beforeEach(() => {
    tracker = new HeartbeatTracker({ staleTimeoutMs: 1000 });
  });

  it("records and retrieves a heartbeat", () => {
    tracker.recordHeartbeat({
      instanceId: "agent-1",
      bridgeMode: "private",
      tunnelActive: true,
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    });

    const hb = tracker.getHeartbeat("agent-1");
    expect(hb).toBeDefined();
    expect(hb!.instanceId).toBe("agent-1");
    expect(hb!.bridgeMode).toBe("private");
  });

  it("reports agent online when heartbeat is fresh", () => {
    tracker.recordHeartbeat({
      instanceId: "agent-1",
      bridgeMode: "private",
      tunnelActive: true,
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    });

    expect(tracker.isOnline("agent-1")).toBe(true);
  });

  it("reports agent offline when heartbeat is stale", async () => {
    tracker = new HeartbeatTracker({ staleTimeoutMs: 50 });

    tracker.recordHeartbeat({
      instanceId: "agent-1",
      bridgeMode: "private",
      tunnelActive: true,
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    });

    expect(tracker.isOnline("agent-1")).toBe(true);

    // Wait for staleness
    await new Promise((resolve) => setTimeout(resolve, 100));

    expect(tracker.isOnline("agent-1")).toBe(false);
  });

  it("prunes stale heartbeats", async () => {
    tracker = new HeartbeatTracker({ staleTimeoutMs: 50 });

    tracker.recordHeartbeat({
      instanceId: "agent-1",
      bridgeMode: "private",
      tunnelActive: true,
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    });

    tracker.recordHeartbeat({
      instanceId: "agent-2",
      bridgeMode: "cloud",
      tunnelActive: true,
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    });

    expect(tracker.getAll()).toHaveLength(2);

    // Wait for staleness
    await new Promise((resolve) => setTimeout(resolve, 100));

    const pruned = tracker.prune();
    expect(pruned).toBe(2);
    expect(tracker.getAll()).toHaveLength(0);
  });

  it("lists all agents with online status", () => {
    tracker.recordHeartbeat({
      instanceId: "agent-1",
      bridgeMode: "private",
      tunnelActive: true,
      timestamp: new Date().toISOString(),
      version: "0.2.0",
    });

    tracker.recordHeartbeat({
      instanceId: "agent-2",
      bridgeMode: "cloud",
      tunnelActive: false,
      timestamp: new Date().toISOString(),
      version: "0.1.0",
    });

    const all = tracker.getAll();
    expect(all).toHaveLength(2);

    const agent1 = all.find((a) => a.instanceId === "agent-1");
    expect(agent1!.tunnelActive).toBe(true);

    const agent2 = all.find((a) => a.instanceId === "agent-2");
    expect(agent2!.tunnelActive).toBe(true); // Fresh heartbeat → online
  });
});
