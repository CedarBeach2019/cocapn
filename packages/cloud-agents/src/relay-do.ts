/**
 * RelayDO — Durable Object that manages the cloud bridge relay.
 *
 * Stores the tunnel connection from the local agent and client
 * WebSocket connections, relaying messages between them.
 *
 * Routes:
 *   - /ws        → client WebSocket (public)
 *   - /api/tunnel → tunnel WebSocket (local agent, authenticated)
 *   - /api/relay-status → relay status info
 */

import { RelayState, publishingFilter } from "./relay.js";
import { SoulCompiler } from "./soul-compiler.js";

// ─── Env for RelayDO ────────────────────────────────────────────────────────────

interface RelayEnv {
  AUTH_KV: KVNamespace;
}

// ─── RelayDO ─────────────────────────────────────────────────────────────────────

export class RelayDO implements DurableObject {
  private state: DurableObjectState;
  private relay: RelayState;
  private soulCompiler = new SoulCompiler();

  constructor(state: DurableObjectState, env: RelayEnv) {
    this.state = state;
    this.relay = new RelayState({ maxQueueSize: 100 });

    // Load soul on startup
    void this.loadSoul(env);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Tunnel connection from local agent
    if (pathname === "/api/tunnel" && request.headers.get("Upgrade") === "websocket") {
      return this.handleTunnel(request);
    }

    // Public client WebSocket
    if (pathname === "/ws" && request.headers.get("Upgrade") === "websocket") {
      return this.handleClient(request);
    }

    // Relay status
    if (pathname === "/api/relay-status" && request.method === "GET") {
      return new Response(
        JSON.stringify({
          ok: true,
          tunnel: this.relay.getTunnelInfo(),
          clients: this.relay.getClientList(),
          queueSize: this.relay.getQueueSize(),
        }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response("Not found", { status: 404 });
  }

  // ── Tunnel Handler ────────────────────────────────────────────────────────────

  private handleTunnel(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    server.accept();

    const tunnelInfo = this.relay.getTunnelInfo();
    if (tunnelInfo.connected) {
      // Evict existing tunnel
      this.relay.unregisterTunnel();
    }

    this.relay.registerTunnel(
      {
        send: (data: string) => server.send(data),
        close: () => server.close(),
      },
      {
        instanceId: "tunnel",
        bridgeMode: "private",
      }
    );

    server.addEventListener("message", (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);
      this.relay.handleTunnelMessage(data);
    });

    server.addEventListener("close", () => {
      this.relay.unregisterTunnel();
    });

    server.addEventListener("error", () => {
      this.relay.unregisterTunnel();
    });

    // Acknowledge tunnel connection
    server.send(
      JSON.stringify({
        type: "status",
        payload: { tunnel: "connected", timestamp: new Date().toISOString() },
      })
    );

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Client Handler ────────────────────────────────────────────────────────────

  private handleClient(request: Request): Response {
    const pair = new WebSocketPair();
    const [client, server] = [pair[0], pair[1]];

    server.accept();

    const clientId = `client-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    this.relay.registerClient(clientId, {
      send: (data: string) => server.send(data),
      close: () => server.close(),
    });

    server.addEventListener("message", (event: MessageEvent) => {
      const data = typeof event.data === "string" ? event.data : String(event.data);

      // Apply publishing filter to client messages before relaying
      const filtered = publishingFilter(data);

      this.relay.handleClientMessage(
        clientId,
        typeof filtered === "string" ? filtered : JSON.stringify(filtered)
      );
    });

    server.addEventListener("close", () => {
      this.relay.unregisterClient(clientId);
    });

    server.addEventListener("error", () => {
      this.relay.unregisterClient(clientId);
    });

    return new Response(null, { status: 101, webSocket: client });
  }

  // ── Soul Loading ──────────────────────────────────────────────────────────────

  private async loadSoul(env: RelayEnv): Promise<void> {
    try {
      const soulMd = await env.AUTH_KV.get("soul.md");
      if (soulMd) {
        const compiled = this.soulCompiler.compile(soulMd);
        this.relay.setSoul(compiled);
      }
    } catch {
      // KV not available — use default
    }
  }
}
