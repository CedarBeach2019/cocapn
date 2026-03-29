/**
 * BridgeServer — authenticated WebSocket server for the local bridge.
 *
 * Authentication:
 *   Connections must include a GitHub PAT as a query parameter:
 *     ws://localhost:8787?token=ghp_...
 *   The token is validated against the GitHub API (/user endpoint).
 *   Invalid tokens receive a 401 close frame.
 *
 * Two parallel message protocols are supported:
 *   1. JSON-RPC 2.0  { "jsonrpc": "2.0", "method": "bridge/status", ... }
 *      → bridge/*, mcp/<agentId>/*, a2a/*
 *
 *   2. Typed messages { "type": "CHAT" | "BASH" | "FILE_EDIT" | "A2A_REQUEST", ... }
 *      → handled by dedicated streaming handlers that push multiple responses
 */

import { WebSocketServer, WebSocket } from "ws";
import { createServer as createHttpServer, type IncomingMessage, type ServerResponse } from "http";
import { EventEmitter } from "events";
import type { AgentRouter } from "../agents/router.js";
import type { AgentSpawner } from "../agents/spawner.js";
import type { GitSync } from "../git/sync.js";
import type { BridgeConfig } from "../config/types.js";
import type { CloudAdapterRegistry } from "../CloudAdapter.js";
import type { Brain } from "../brain/index.js";
import { ModuleManager } from "../modules/manager.js";
import { AuditLogger } from "../security/audit.js";
import { authenticateConnection } from "../security/auth-handler.js";
import { ChatRouter } from "./chat-router.js";
import { ChatHandler } from "../handlers/chat-handler.js";
import { createSender, type Sender } from "./send.js";
import { attachDispatcher, type HandlerRegistry } from "./dispatcher.js";
import type {
  BridgeServerOptions,
  BridgeServerEventMap,
  JsonRpcRequest,
  TypedMessage,
  SessionState,
} from "./types.js";
import type { HandlerContext } from "../handlers/types.js";
import { handleBash } from "../handlers/bash.js";
import { handleFileEdit } from "../handlers/file.js";
import { handleA2aRequest } from "../handlers/a2a.js";
import { handleModuleInstall } from "../handlers/module.js";
import { handleChangeSkin } from "../handlers/skin.js";
import { handleHttpPeerRequest } from "../handlers/peer.js";

// Re-export types for backward compatibility
export type { BridgeServerOptions, BridgeServerEventMap, TypedMessage, JsonRpcRequest, SessionState };

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

let clientCounter = 0;

// ---------------------------------------------------------------------------
// BridgeServer
// ---------------------------------------------------------------------------

export class BridgeServer extends EventEmitter<BridgeServerEventMap> {
  private wss:           WebSocketServer | null = null;
  private httpSrv:       ReturnType<typeof createHttpServer> | null = null;
  private options:       BridgeServerOptions;
  private sessions =     new Map<string, SessionState>();
  private audit:         AuditLogger;
  private chatRouter:    ChatRouter;
  private chatHandler:   ChatHandler;
  private sender:        Sender;
  private handlerCtx:    HandlerContext;
  private handlerRegistry: HandlerRegistry;

  constructor(options: BridgeServerOptions) {
    super();
    this.options    = options;
    this.audit      = new AuditLogger(options.repoRoot);
    this.chatRouter = new ChatRouter();
    this.sender     = createSender();

    // Build HandlerContext with all services
    this.handlerCtx = this.buildHandlerContext();

    // Build HandlerRegistry with all typed message handlers
    this.handlerRegistry = new Map([
      ["CHAT", async (ws, clientId, msg, ctx) => this.chatHandler.handle(ws, clientId, msg)],
      ["BASH", handleBash],
      ["FILE_EDIT", handleFileEdit],
      ["A2A_REQUEST", handleA2aRequest],
      ["MODULE_INSTALL", handleModuleInstall],
      ["INSTALL_MODULE", handleModuleInstall],
      ["CHANGE_SKIN", handleChangeSkin],
    ]);

    // ChatHandler needs broadcast and moduleManager
    this.chatHandler = new ChatHandler({
      router:        options.router,
      spawner:       options.spawner,
      config:        options.config,
      moduleManager: this.handlerCtx.getModuleManager(),
      chatRouter:    this.chatRouter,
      broadcast:     (payload) => this.broadcastToAll(payload),
      ...(options.cloudAdapters !== undefined ? { cloudAdapters: options.cloudAdapters } : {}),
      ...(options.brain        !== undefined ? { brain:        options.brain        } : {}),
      ...(options.fleetKey     !== undefined ? { fleetKey:     options.fleetKey     } : {}),
    });
  }

  /**
   * Build the HandlerContext that all handlers need.
   * This provides access to all services without passing 8+ parameters.
   */
  private buildHandlerContext(): HandlerContext {
    const moduleManagerRef = { current: this.options.moduleManager };

    return {
      config: this.options.config,
      router: this.options.router,
      spawner: this.options.spawner,
      sync: this.options.sync,
      repoRoot: this.options.repoRoot,
      audit: this.audit,
      chatRouter: this.chatRouter,
      sender: this.sender,
      brain: this.options.brain,
      cloudAdapters: this.options.cloudAdapters,
      fleetKey: this.options.fleetKey,
      getModuleManager: () => {
        if (!moduleManagerRef.current) {
          moduleManagerRef.current = new ModuleManager(this.options.repoRoot);
        }
        return moduleManagerRef.current;
      },
      broadcast: (payload) => this.broadcastToAll(payload),
    };
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  start(): void {
    const port = this.options.config.config.port;

    // ── HTTP server for A2A peer API endpoints (opt-in) ──────────────────────
    if (this.options.enablePeerApi) {
      this.httpSrv = createHttpServer((req, res) => {
        this.handleHttpRequest(req, res).catch((err) => {
          const msg = err instanceof Error ? err.message : String(err);
          res.writeHead(500).end(JSON.stringify({ error: msg }));
        });
      });
      this.httpSrv.listen(port + 1, () => {
        console.info(`[bridge] HTTP peer API listening on http://localhost:${port + 1}`);
      });
    }

    // ── WebSocket server (shares same port base) ──────────────────────────────
    this.wss = new WebSocketServer({ server: undefined, port });

    this.wss.on("listening", () => {
      this.emit("listening", port);
      console.info(`[bridge] WebSocket server listening on ws://localhost:${port}`);
    });

    this.wss.on(
      "connection",
      (ws: WebSocket, req: IncomingMessage) => {
        const clientId = `client-${++clientCounter}`;
        this.authenticateAndConnect(ws, req, clientId).catch((err) => {
          console.error(`[bridge] Auth error for ${clientId}:`, err);
          ws.close(1011, "Internal error");
        });
      }
    );

    this.wss.on("error", (err: Error) => {
      this.emit("error", err);
      console.error("[bridge] WebSocket server error:", err);
    });
  }

  async stop(): Promise<void> {
    if (!this.wss) return;
    for (const client of this.wss.clients) {
      client.terminate();
    }
    await new Promise<void>((resolve, reject) => {
      this.wss!.close((err) => (err ? reject(err) : resolve()));
    });
    this.wss = null;
    this.httpSrv?.close();
    this.httpSrv = null;
    this.sessions.clear();
  }

  // ---------------------------------------------------------------------------
  // A2A Peer HTTP API (2.5)
  // ---------------------------------------------------------------------------

  /**
   * HTTP request handler for A2A peer discovery and fact query endpoints.
   * Delegates to the peer handler.
   *
   *   GET /.well-known/cocapn/peer   → peer card (domain, capabilities, publicKey)
   *   GET /api/peer/fact?key=<k>     → { key, value } from Brain facts
   *   GET /api/peer/facts            → all facts (requires fleet JWT)
   */
  private async handleHttpRequest(
    req: IncomingMessage,
    res: ServerResponse
  ): Promise<void> {
    await handleHttpPeerRequest(req, res, this.handlerCtx);
  }

  // ---------------------------------------------------------------------------
  // Authentication
  // ---------------------------------------------------------------------------

  private async authenticateAndConnect(
    ws: WebSocket,
    req: IncomingMessage,
    clientId: string
  ): Promise<void> {
    const authResult = await authenticateConnection(ws, req, {
      skipAuth: this.options.skipAuth,
      fleetKey: this.options.fleetKey,
      audit: this.audit,
      onGithubToken: (token) => this.options.cloudAdapters?.setGitHubToken(token),
    });

    if (!authResult) {
      // WebSocket already closed by authenticateConnection
      return;
    }

    const { githubLogin, githubToken } = authResult;

    this.sessions.set(clientId, {
      clientId,
      githubLogin,
      githubToken,
      connectedAt: new Date(),
    });

    this.emit("connection", clientId);
    this.handleConnection(ws, clientId);
  }

  // ---------------------------------------------------------------------------
  // Connection handler
  // ---------------------------------------------------------------------------

  private handleConnection(ws: WebSocket, clientId: string): void {
    // Send initial bridge status
    this.sender.result(ws, null, this.getBridgeStatus());

    // Attach the dispatcher to handle all subsequent messages
    attachDispatcher(ws, clientId, this.handlerRegistry, this.handlerCtx);

    // Emit connection event for listeners
    this.emit("connection", clientId);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Broadcast a payload to all connected WebSocket clients.
   * Used by handlers via ctx.broadcast().
   */
  private broadcastToAll(payload: Record<string, unknown>): void {
    if (!this.wss) return;
    this.sender.broadcast(this.wss, payload);
  }

  private getBridgeStatus(): Record<string, unknown> {
    return {
      version: "0.1.0",
      mode: this.options.config.config.mode,
      port: this.options.config.config.port,
      agentCount: this.options.spawner.getAll().length,
      sessionCount: this.sessions.size,
      uptime: process.uptime(),
    };
  }
}
