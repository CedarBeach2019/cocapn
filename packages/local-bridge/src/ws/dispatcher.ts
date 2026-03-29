/**
 * Dispatcher — parses incoming WebSocket frames and routes them.
 *
 * Two protocols coexist on the same WebSocket:
 *
 *   1. JSON-RPC 2.0  — discriminated by { jsonrpc: "2.0" }
 *      Methods: bridge/*, mcp/<agentId>/*, module/*, a2a/*
 *
 *   2. Typed messages — discriminated by { type: "CHAT" | "BASH" | ... }
 *      Routed to individual handler functions.
 *
 * The dispatcher owns the connection-level message listener and
 * the close/error listeners. It delegates all business logic to handlers.
 */

import { WebSocket, type RawData } from "ws";
import type { TypedMessage, JsonRpcRequest } from "./types.js";
import type { HandlerContext, TypedHandler } from "../handlers/types.js";

/** Registry mapping typed message types to handler functions. */
export type HandlerRegistry = Map<string, TypedHandler>;

/**
 * Wire up message/close/error listeners on a connected WebSocket.
 *
 * Called once per connection after authentication succeeds.
 * Sends the initial bridge status frame, then listens for messages.
 */
export function attachDispatcher(
  ws: WebSocket,
  clientId: string,
  handlers: HandlerRegistry,
  ctx: HandlerContext,
): void {
  console.info(`[bridge] Client connected: ${clientId}`);

  ws.on("message", (data: RawData) => {
    const raw = data.toString();
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      ctx.sender.error(ws, null, -32700, "Parse error");
      return;
    }

    // Route by protocol discriminant
    if (typeof msg["type"] === "string") {
      dispatchTyped(ws, clientId, msg as unknown as TypedMessage, handlers, ctx).catch(
        (err: unknown) => {
          const message = err instanceof Error ? err.message : String(err);
          ctx.sender.typed(ws, {
            type: `${(msg as TypedMessage).type}_ERROR`,
            id: (msg as TypedMessage).id,
            error: message,
          });
        }
      );
    } else {
      const rpc = msg as unknown as JsonRpcRequest;
      dispatchRpc(ws, rpc, ctx).catch((err: unknown) => {
        const message = err instanceof Error ? err.message : String(err);
        const code =
          err !== null &&
          typeof err === "object" &&
          "code" in err &&
          typeof (err as { code: unknown }).code === "number"
            ? (err as { code: number }).code
            : -32603;
        ctx.sender.error(ws, rpc.id, code, message);
      });
    }
  });

  ws.on("close", () => {
    // Clean up any agent sessions owned by this client
    ctx.spawner.detachSession(clientId).catch(() => undefined);
    console.info(`[bridge] Client disconnected: ${clientId}`);
  });

  ws.on("error", (err: Error) => {
    console.error(`[bridge] Client ${clientId} error:`, err);
  });
}

/**
 * Dispatch a typed message to its registered handler.
 */
async function dispatchTyped(
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  handlers: HandlerRegistry,
  ctx: HandlerContext,
): Promise<void> {
  const handler = handlers.get(msg.type);
  if (!handler) {
    ctx.sender.typed(ws, {
      type: "ERROR",
      id: msg.id,
      error: `Unknown message type: ${msg.type}`,
    });
    return;
  }

  await handler(ws, clientId, msg, ctx);
}

/**
 * Dispatch a JSON-RPC request to the appropriate bridge/mcp/module/a2a method.
 *
 * Pure routing logic — all state access goes through ctx.
 */
async function dispatchRpc(
  ws: WebSocket,
  req: JsonRpcRequest,
  ctx: HandlerContext,
): Promise<void> {
  const { method, params, id } = req;

  if (method.startsWith("bridge/")) {
    const result = await handleBridgeMethod(method, params, ctx);
    ctx.sender.result(ws, id, result);
    return;
  }

  if (method.startsWith("module/")) {
    const result = await handleModuleMethod(ws, method, params, ctx);
    ctx.sender.result(ws, id, result);
    return;
  }

  if (method.startsWith("mcp/")) {
    const result = await handleMcpMethod(method, params, ctx);
    ctx.sender.result(ws, id, result);
    return;
  }

  if (method.startsWith("a2a/")) {
    const result = await handleA2aMethod(method, params, ctx);
    ctx.sender.result(ws, id, result);
    return;
  }

  ctx.sender.error(ws, id, -32601, `Method not found: ${method}`);
}

async function handleBridgeMethod(method: string, params: unknown, ctx: HandlerContext): Promise<unknown> {
  const p = (params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "bridge/status":
      return getBridgeStatus(ctx);

    case "bridge/agents":
      return ctx.spawner.getAll().map((a) => ({
        id: a.definition.id,
        capabilities: a.definition.capabilities,
        startedAt: a.startedAt.toISOString(),
      }));

    case "bridge/sessions":
      // Sessions are managed by BridgeServer, not accessible via HandlerContext
      // Return empty array for now — this would need to be added to HandlerContext
      return [];

    case "bridge/sync":
      await ctx.sync.commit("[cocapn] manual sync");
      return { ok: true };

    case "bridge/tokenStats": {
      if (!ctx.tokenTracker) {
        return { error: "Token tracker not available" };
      }
      const since = p.since ? new Date(p.since as string) : undefined;
      const until = p.until ? new Date(p.until as string) : undefined;
      return ctx.tokenTracker.getStats(since, until);
    }

    case "bridge/tokenEfficiency": {
      if (!ctx.tokenTracker) {
        return { error: "Token tracker not available" };
      }
      const buckets = typeof p.buckets === "number" ? p.buckets : 24;
      return ctx.tokenTracker.getEfficiencyTrend(buckets);
    }

    case "bridge/tokenWaste": {
      if (!ctx.tokenTracker) {
        return { error: "Token tracker not available" };
      }
      return ctx.tokenTracker.findWaste();
    }

    case "skill/list": {
      if (!ctx.skillLoader) {
        return { error: "Skill loader not available" };
      }
      const skills = ctx.skillLoader.getAll();
      const stats = ctx.skillLoader.stats();
      return {
        skills: skills.map(s => ({
          name: s.name,
          version: s.version,
          description: s.description,
          triggers: s.triggers,
          category: s.category,
          hot: s.hot || false,
          tokenBudget: s.tokenBudget || 500,
        })),
        stats: {
          total: stats.total,
          loaded: stats.loaded,
          hot: stats.hot,
          cold: stats.cold,
          memoryBytes: stats.memoryBytes,
        },
      };
    }

    case "skill/load": {
      if (!ctx.skillLoader) {
        return { error: "Skill loader not available" };
      }
      const name = p.name as string | undefined;
      if (!name) {
        return { error: "Missing skill name" };
      }
      const cartridge = ctx.skillLoader.load(name);
      if (!cartridge) {
        return { error: `Skill not found: ${name}` };
      }
      return {
        loaded: true,
        skill: {
          name: cartridge.name,
          version: cartridge.version,
          description: cartridge.description,
          triggers: cartridge.triggers,
          category: cartridge.category,
        },
      };
    }

    case "skill/unload": {
      if (!ctx.skillLoader) {
        return { error: "Skill loader not available" };
      }
      const name = p.name as string | undefined;
      if (!name) {
        return { error: "Missing skill name" };
      }
      const unloaded = ctx.skillLoader.unload(name);
      return { unloaded, skill: name };
    }

    case "skill/match": {
      if (!ctx.skillLoader || !ctx.decisionTree) {
        return { error: "Skill system not available" };
      }
      const keywords = p.keywords as string[] | undefined;
      if (!keywords) {
        return { error: "Missing keywords" };
      }
      const treeMatches = ctx.decisionTree.resolve(keywords);
      const intentMatches = ctx.skillLoader.loadByIntent(keywords);
      return {
        matches: [...treeMatches, ...intentMatches.map(s => s.name)],
        skills: intentMatches,
      };
    }

    case "skill/context": {
      if (!ctx.skillLoader) {
        return { error: "Skill loader not available" };
      }
      const maxTokens = typeof p.maxTokens === "number" ? p.maxTokens : undefined;
      const context = ctx.skillLoader.buildSkillContext(maxTokens);
      return context;
    }

    case "skill/stats": {
      if (!ctx.skillLoader) {
        return { error: "Skill loader not available" };
      }
      const stats = ctx.skillLoader.stats();
      const loaded = ctx.skillLoader.getLoaded();
      return {
        stats: {
          ...stats,
          loaded: loaded.map(s => ({
            name: s.name,
            useCount: s.useCount,
            lastUsedAt: s.lastUsedAt,
            tokenBudget: s.cartridge.tokenBudget || 500,
          })),
        },
      };
    }

    case "bridge/assembly": {
      const { handleAssemblyStatus } = await import("../handlers/assembly.js");
      return handleAssemblyStatus(params, ctx);
    }

    case "graph/query": {
      if (!ctx.brain || !ctx.brain.hasGraph()) {
        return { error: "Repo graph not available" };
      }
      const graph = ctx.brain.getGraph()!;
      const query = p.query as string | undefined;
      const params = p.params as Record<string, unknown> | undefined;

      if (!query) {
        return { error: "Missing query type" };
      }

      switch (query) {
        case "dependencies": {
          const file = params?.file as string;
          if (!file) return { error: "Missing file parameter" };
          const deps = await graph.getDependencies(file);
          return { dependencies: deps };
        }

        case "dependents": {
          const file = params?.file as string;
          if (!file) return { error: "Missing file parameter" };
          const dependents = await graph.getDependents(file);
          return { dependents };
        }

        case "callGraph": {
          const functionId = params?.functionId as string;
          if (!functionId) return { error: "Missing functionId parameter" };
          const calls = await graph.getCallGraph(functionId);
          return { calls };
        }

        case "reverseCallGraph": {
          const functionId = params?.functionId as string;
          if (!functionId) return { error: "Missing functionId parameter" };
          const callers = await graph.getReverseCallGraph(functionId);
          return { callers };
        }

        case "findByName": {
          const pattern = params?.pattern as string;
          if (!pattern) return { error: "Missing pattern parameter" };
          const nodes = await graph.findByName(pattern);
          return { nodes };
        }

        case "findByFile": {
          const file = params?.file as string;
          if (!file) return { error: "Missing file parameter" };
          const nodes = await graph.findByFile(file);
          return { nodes };
        }

        case "findExported": {
          const nodes = await graph.findExported();
          return { nodes };
        }

        case "impactRadius": {
          const nodeId = params?.nodeId as string;
          const depth = params?.depth as number | undefined;
          if (!nodeId) return { error: "Missing nodeId parameter" };
          const impact = await graph.getImpactRadius(nodeId, depth);
          return { impact };
        }

        case "stats": {
          const stats = await graph.stats();
          return { stats };
        }

        default:
          return { error: `Unknown graph query: ${query}` };
      }
    }

    case "tree/search": {
      const task = p.task as string | undefined;
      if (!task) {
        return { error: "Missing task parameter" };
      }
      // Return mock result for now - real implementation would run tree search
      return {
        success: true,
        message: "Tree search is available. Use the tree-search handler for complex tasks.",
        suggestion: "For complex tasks, consider using tree search to explore multiple approaches.",
        task,
      };
    }

    case "tree/status": {
      return {
        available: true,
        active: false,
        message: "Tree search is available for complex tasks",
      };
    }

    case "bridge/repoMap": {
      if (!ctx.repoGraph) {
        return { error: "Repo graph not available" };
      }
      const maxTokens = typeof p.maxTokens === "number" ? p.maxTokens : 1024;
      const focusFiles = p.focusFiles as string[] | undefined;
      const excludePatterns = p.excludePatterns as string[] | undefined;

      // Build exclude regex patterns if provided
      const patterns = excludePatterns?.map(pat => new RegExp(pat));

      const { RepoMapGenerator } = await import("../graph/repo-map.js");
      const generator = new RepoMapGenerator(ctx.repoGraph.getDB());

      const map = await generator.generate({
        maxTokens,
        focusFiles,
        excludePatterns: patterns,
      });

      return {
        map,
        estimatedTokens: generator.estimateTokens(map),
      };
    }

    case "memory/recall": {
      if (!ctx.brain || !ctx.brain.memoryManager) {
        return { error: "Memory manager not available" };
      }
      const query = p.query as string | undefined;
      if (!query) {
        return { error: "Missing query parameter" };
      }
      const limit = typeof p.limit === "number" ? p.limit : undefined;
      const minConfidence = typeof p.minConfidence === "number" ? p.minConfidence : undefined;
      const memories = await ctx.brain.memoryManager.recall(query, { limit, minConfidence });
      return {
        success: true,
        memories: memories.map(mem => ({
          id: mem.id,
          key: mem.key,
          value: mem.value,
          type: mem.type,
          confidence: mem.confidence,
          accessCount: mem.accessCount,
          lastAccessed: mem.lastAccessed,
          createdAt: mem.createdAt,
          expiresAt: mem.expiresAt,
          source: mem.source,
          tags: mem.tags,
          autoGenerated: mem.autoGenerated,
        })),
        count: memories.length,
      };
    }

    case "memory/remember": {
      if (!ctx.brain || !ctx.brain.memoryManager) {
        return { error: "Memory manager not available" };
      }
      const key = p.key as string | undefined;
      const value = p.value as string | undefined;
      const type = p.type as 'explicit' | 'implicit' | 'error_pattern' | 'preference' | 'task_summary' | undefined;
      if (!key || !value || !type) {
        return { error: "Missing required parameters: key, value, type" };
      }
      const confidence = typeof p.confidence === "number" ? p.confidence : undefined;
      const tags = p.tags as string[] | undefined;
      const expiresAt = p.expiresAt as string | undefined;
      const written = await ctx.brain.memoryManager.remember(key, value, {
        type,
        confidence,
        tags,
        expiresAt,
      });
      return {
        success: true,
        written,
        budgetRemaining: ctx.brain.memoryManager.getWriteCount(),
      };
    }

    case "memory/forget": {
      if (!ctx.brain || !ctx.brain.memoryManager) {
        return { error: "Memory manager not available" };
      }
      const key = p.key as string | undefined;
      if (!key) {
        return { error: "Missing key parameter" };
      }
      const forgotten = await ctx.brain.memoryManager.forget(key);
      return { success: true, forgotten };
    }

    case "memory/list": {
      if (!ctx.brain || !ctx.brain.memoryManager) {
        return { error: "Memory manager not available" };
      }
      const type = p.type as 'explicit' | 'implicit' | 'error_pattern' | 'preference' | 'task_summary' | undefined;
      const minConfidence = typeof p.minConfidence === "number" ? p.minConfidence : undefined;
      const autoOnly = p.autoOnly as boolean | undefined;
      const memories = ctx.brain.memoryManager.list({ type, minConfidence, autoOnly });
      return {
        success: true,
        memories: memories.map(mem => ({
          id: mem.id,
          key: mem.key,
          value: mem.value,
          type: mem.type,
          confidence: mem.confidence,
          accessCount: mem.accessCount,
          lastAccessed: mem.lastAccessed,
          createdAt: mem.createdAt,
          expiresAt: mem.expiresAt,
          source: mem.source,
          tags: mem.tags,
          autoGenerated: mem.autoGenerated,
        })),
        count: memories.length,
      };
    }

    case "memory/stats": {
      if (!ctx.brain || !ctx.brain.memoryManager) {
        return { error: "Memory manager not available" };
      }
      const stats = ctx.brain.memoryManager.stats();
      return { success: true, stats };
    }

    case "memory/prune": {
      if (!ctx.brain || !ctx.brain.memoryManager) {
        return { error: "Memory manager not available" };
      }
      const result = await ctx.brain.memoryManager.prune();
      return { success: true, pruneResult: result };
    }

    case "knowledge/export": {
      if (!ctx.brain) {
        return { error: "Brain not available" };
      }
      const { KnowledgePackExporter } = await import("../brain/knowledge-pack.js");
      const exporter = new KnowledgePackExporter(ctx.brain, ctx.brain.memoryManager || undefined);
      const minConfidence = typeof p.minConfidence === "number" ? p.minConfidence : undefined;
      const tags = p.tags as string[] | undefined;
      const types = p.types as string[] | undefined;
      const includeAuto = p.includeAuto as boolean | undefined;
      const pack = await exporter.export({ minConfidence, tags, types, includeAuto });
      return { success: true, pack };
    }

    case "knowledge/import": {
      if (!ctx.brain) {
        return { error: "Brain not available" };
      }
      const { KnowledgePackImporter } = await import("../brain/knowledge-pack.js");
      const importer = new KnowledgePackImporter(ctx.brain, ctx.brain.memoryManager || undefined);
      const pack = p.pack as any;
      const options = p.options as any;
      const result = await importer.import(pack, options);
      return { success: true, importResult: result };
    }

    case "knowledge/preview": {
      if (!ctx.brain) {
        return { error: "Brain not available" };
      }
      const { KnowledgePackImporter } = await import("../brain/knowledge-pack.js");
      const importer = new KnowledgePackImporter(ctx.brain, ctx.brain.memoryManager || undefined);
      const pack = p.pack as any;
      const preview = await importer.preview(pack);
      return { success: true, preview };
    }

    case "settings/get": {
      if (!ctx.settingsManager) {
        return { error: "Settings manager not available" };
      }
      const { handleGetSettings } = await import("../handlers/settings.js");
      // The handler sends the response directly, but for RPC we need to return
      const settings = ctx.settingsManager.getAll();
      const safeString = ctx.settingsManager.toSafeString();
      return { success: true, settings: JSON.parse(safeString) };
    }

    case "settings/update": {
      if (!ctx.settingsManager) {
        return { error: "Settings manager not available" };
      }
      const { handleUpdateSettings } = await import("../handlers/settings.js");
      const settings = p.settings as Record<string, unknown> | undefined;
      const validate = p.validate as boolean | undefined;
      if (!settings) {
        return { error: "No settings provided" };
      }
      ctx.settingsManager.merge(settings);
      return { success: true, updated: true };
    }

    case "settings/validate": {
      if (!ctx.settingsManager) {
        return { error: "Settings manager not available" };
      }
      const { handleSettingsValidate } = await import("../handlers/settings.js");
      const settings = p.settings as Record<string, unknown> | undefined;
      if (!settings) {
        return { error: "No settings provided" };
      }
      // Validation happens inline
      const validation = ctx.settingsManager.validate();
      return { success: true, validation };
    }

    default:
      throw Object.assign(new Error(`Unknown bridge method: ${method}`), { code: -32601 });
  }
}

async function handleMcpMethod(method: string, params: unknown, ctx: HandlerContext): Promise<unknown> {
  const parts = method.split("/");
  const agentId = parts[1];
  const mcpMethod = parts.slice(2).join("/");

  if (!agentId || !mcpMethod) {
    throw new Error(`COCAPN-040: Invalid MCP method path: ${method} - MCP methods must be formatted as 'mcp/{agentId}/{method}'. Check the method name`);
  }

  const agent = ctx.spawner.get(agentId);
  if (!agent) {
    throw new Error(`COCAPN-013: Agent not running: ${agentId} - Start the agent first with: cocapn-bridge agent start ${agentId}`);
  }

  switch (mcpMethod) {
    case "tools/list":
      return agent.client.listTools();
    case "tools/call":
      return agent.client.callTool(params as Parameters<typeof agent.client.callTool>[0]);
    case "resources/list":
      return agent.client.listResources();
    case "resources/read":
      return agent.client.readResource((params as { uri: string }).uri);
    default:
      throw new Error(`COCAPN-041: Unsupported MCP method: ${mcpMethod} - The agent doesn't support this MCP method. Check the agent's capabilities`);
  }
}

async function handleModuleMethod(
  ws: WebSocket,
  method: string,
  params: unknown,
  ctx: HandlerContext,
): Promise<unknown> {
  const manager = ctx.getModuleManager();
  const p = (params ?? {}) as Record<string, unknown>;

  switch (method) {
    case "module/list":
      return manager.list();

    case "module/install": {
      const gitUrl = p["gitUrl"] as string | undefined;
      if (!gitUrl) throw new Error("Missing gitUrl");
      const mod = await manager.add(gitUrl, (line, stream) => {
        ctx.sender.typed(ws, { type: "MODULE_PROGRESS", id: "rpc", line, stream });
      });
      // Broadcast updated module list
      ctx.broadcast({ type: "MODULE_LIST_UPDATE", modules: manager.list() });
      return mod;
    }

    case "module/remove": {
      const name = p["name"] as string | undefined;
      if (!name) throw new Error("Missing name");
      await manager.remove(name);
      ctx.broadcast({ type: "MODULE_LIST_UPDATE", modules: manager.list() });
      return { ok: true };
    }

    case "module/update": {
      const name = p["name"] as string | undefined;
      if (!name) throw new Error("Missing name");
      const updated = await manager.update(name);
      ctx.broadcast({ type: "MODULE_LIST_UPDATE", modules: manager.list() });
      return updated;
    }

    case "module/enable": {
      const name = p["name"] as string | undefined;
      if (!name) throw new Error("Missing name");
      await manager.enable(name);
      return { ok: true };
    }

    case "module/disable": {
      const name = p["name"] as string | undefined;
      if (!name) throw new Error("Missing name");
      await manager.disable(name);
      return { ok: true };
    }

    default:
      throw Object.assign(new Error(`Unknown module method: ${method}`), { code: -32601 });
  }
}

async function handleA2aMethod(method: string, params: unknown, ctx: HandlerContext): Promise<unknown> {
  const agentDef = await ctx.router.resolveAndEnsureRunning(JSON.stringify(params));
  if (!agentDef) throw new Error("COCAPN-014: No agent available for this task - Ensure at least one agent is running. Start with: cocapn-bridge agent start <id>");
  return { routed: true, agent: agentDef.definition.id, source: agentDef.source, method };
}

function getBridgeStatus(ctx: HandlerContext): Record<string, unknown> {
  return {
    version: "0.1.0",
    mode: ctx.config.config.mode,
    port: ctx.config.config.port,
    agentCount: ctx.spawner.getAll().length,
    // sessionCount would need to be added to HandlerContext if needed
    sessionCount: 0,
    uptime: process.uptime(),
  };
}
