/**
 * Brain MCP Tools v0.2.0 — Mode-aware tools for brain access.
 *
 * Tools:
 *   - brain_read:      Read brain data (facts, memories, wiki, knowledge)
 *   - brain_write:     Write to brain (facts, memories, knowledge)
 *   - brain_search:    Search across brain stores
 *   - brain_status:    Brain overview (counts, mode, last sync)
 *   - brain_wiki:      Wiki CRUD operations
 *   - brain_knowledge: Knowledge pipeline (ingest, query, validate, export)
 *   - brain_repo:      RepoLearner queries (architecture, file-history, patterns, modules)
 *
 * All tools respect the mode parameter for public/private filtering.
 * Returns MCP-compatible CallToolResult (content, isError).
 */

import type { Brain } from "../brain/index.js";
import type { AgentMode } from "../publishing/mode-switcher.js";
import type { McpCallToolResult } from "../../../protocols/src/mcp/types.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BrainToolContext {
  brain: Brain;
}

// ─── MCP result helpers ──────────────────────────────────────────────────────

function ok(text: string): McpCallToolResult {
  return { content: [{ type: "text", text }], isError: false };
}

function err(text: string): McpCallToolResult {
  return { content: [{ type: "text", text }], isError: true };
}

// ─── brain_read ───────────────────────────────────────────────────────────────

export async function brainRead(
  ctx: BrainToolContext,
  args: Record<string, unknown>
): Promise<McpCallToolResult> {
  const { type, key, mode } = args;
  if (typeof type !== "string" || !["fact", "memory", "wiki", "knowledge"].includes(type)) {
    return err("Error: type must be one of: fact, memory, wiki, knowledge");
  }

  const effectiveMode = (typeof mode === "string" && ["public", "private"].includes(mode) ? mode : undefined) as AgentMode | undefined;

  switch (type) {
    case "fact": {
      if (typeof key !== "string") {
        const all = ctx.brain.getAllFacts(effectiveMode);
        return ok(JSON.stringify(all));
      }
      const value = ctx.brain.getFact(key, effectiveMode);
      if (value === undefined) return ok(`Fact not found: ${key}`);
      return ok(JSON.stringify({ key, value }));
    }

    case "memory": {
      const memories = ctx.brain.getMemories({ mode: effectiveMode });
      if (typeof key === "string") {
        const match = memories.find((m) => m.key === key);
        if (!match) return ok(`Memory not found: ${key}`);
        return ok(JSON.stringify(match));
      }
      return ok(JSON.stringify(memories));
    }

    case "wiki": {
      if (typeof key !== "string") {
        const pages = ctx.brain.listWikiPages();
        return ok(JSON.stringify(pages));
      }
      const content = ctx.brain.readWikiPage(key, effectiveMode);
      if (content === null) return ok(`Wiki page not found: ${key}`);
      return ok(content);
    }

    case "knowledge": {
      const memories = ctx.brain.getMemories({ mode: effectiveMode });
      return ok(JSON.stringify(memories.map((m) => ({
        key: m.key,
        value: m.value,
        type: m.type,
        confidence: m.confidence,
        tags: m.tags,
      }))));
    }

    default:
      return err(`Unknown type: ${type}`);
  }
}

// ─── brain_write ──────────────────────────────────────────────────────────────

export async function brainWrite(
  ctx: BrainToolContext,
  args: Record<string, unknown>
): Promise<McpCallToolResult> {
  const { type, key, value } = args;
  if (typeof type !== "string" || !["fact", "memory", "knowledge"].includes(type)) {
    return err("Error: type must be one of: fact, memory, knowledge");
  }
  if (typeof key !== "string") {
    return err("Error: key is required");
  }

  switch (type) {
    case "fact": {
      if (typeof value !== "string") return err("Error: value must be a string for fact writes");
      await ctx.brain.setFact(key, value);
      return ok(`Fact set: ${key}`);
    }

    case "memory":
    case "knowledge": {
      if (typeof value !== "string") return err("Error: value must be a string");
      if (ctx.brain.memoryManager) {
        const written = await ctx.brain.memoryManager.remember(key, value, {
          type: type === "knowledge" ? "explicit" : "preference",
        });
        if (!written) return ok(`Memory already exists or budget exceeded: ${key}`);
        return ok(`${type === "knowledge" ? "Knowledge" : "Memory"} stored: ${key}`);
      }
      // Fallback: store as fact
      await ctx.brain.setFact(`memory:${key}`, value);
      return ok(`${type} stored as fact: memory:${key}`);
    }

    default:
      return err(`Unknown type: ${type}`);
  }
}

// ─── brain_search ─────────────────────────────────────────────────────────────

export async function brainSearch(
  ctx: BrainToolContext,
  args: Record<string, unknown>
): Promise<McpCallToolResult> {
  const { query, types, limit } = args;
  if (typeof query !== "string") {
    return err("Error: query is required");
  }

  const maxResults = typeof limit === "number" ? limit : 10;
  const typesFilter = Array.isArray(types) && types.every((t) => typeof t === "string")
    ? types as string[]
    : undefined;

  const results: Record<string, unknown[]> = {};

  // Search facts
  if (!typesFilter || typesFilter.includes("fact")) {
    const facts = ctx.brain.getAllFacts();
    const lower = query.toLowerCase();
    const matches = Object.entries(facts)
      .filter(([k, v]) => k.toLowerCase().includes(lower) || v.toLowerCase().includes(lower))
      .slice(0, maxResults)
      .map(([key, value]) => ({ key, value }));
    if (matches.length > 0) results.facts = matches;
  }

  // Search memories
  if (!typesFilter || typesFilter.includes("memory")) {
    const memories = ctx.brain.getMemories();
    const lower = query.toLowerCase();
    const matches = memories
      .filter((m) => m.key.toLowerCase().includes(lower) || m.value.toLowerCase().includes(lower))
      .slice(0, maxResults)
      .map((m) => ({ key: m.key, value: m.value, type: m.type, confidence: m.confidence }));
    if (matches.length > 0) results.memories = matches;
  }

  // Search wiki
  if (!typesFilter || typesFilter.includes("wiki")) {
    const wikiResults = await ctx.brain.searchWiki(query);
    if (wikiResults.length > 0) {
      results.wiki = wikiResults.slice(0, maxResults).map((w) => ({
        file: w.file,
        title: w.title,
        excerpt: w.excerpt,
      }));
    }
  }

  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);
  if (totalResults === 0) {
    return ok(`No results found for: ${query}`);
  }

  return ok(JSON.stringify({ query, totalResults, results }, null, 2));
}

// ─── brain_status ─────────────────────────────────────────────────────────────

export async function brainStatus(
  ctx: BrainToolContext,
  _args: Record<string, unknown>
): Promise<McpCallToolResult> {
  const facts = ctx.brain.getAllFacts();
  const memories = ctx.brain.getMemories();
  const wikiPages = ctx.brain.listWikiPages();
  const tasks = ctx.brain.listTasks();
  const mode = ctx.brain.getMode();
  const soul = ctx.brain.getSoul();

  // Get repo learner info
  let lastSync = "unknown";
  try {
    const repoLearner = ctx.brain.getRepoLearner();
    const understanding = await repoLearner.buildIndex();
    lastSync = understanding.lastBuilt || "never";
  } catch {
    // RepoLearner may not be available
  }

  return ok(JSON.stringify({
    mode,
    facts: Object.keys(facts).length,
    memories: memories.length,
    wikiPages: wikiPages.length,
    tasks: { active: tasks.filter((t) => t.status === "active").length, total: tasks.length },
    knowledgeEntries: memories.filter((m) => m.type === "explicit").length,
    lastSync,
    hasSoul: soul.length > 0,
  }, null, 2));
}

// ─── brain_wiki ───────────────────────────────────────────────────────────────

export async function brainWiki(
  ctx: BrainToolContext,
  args: Record<string, unknown>
): Promise<McpCallToolResult> {
  const { action, slug, content } = args;
  if (typeof action !== "string" || !["list", "get", "create", "update"].includes(action)) {
    return err("Error: action must be one of: list, get, create, update");
  }

  switch (action) {
    case "list": {
      const pages = ctx.brain.listWikiPages();
      if (pages.length === 0) return ok("No wiki pages found");
      return ok(JSON.stringify(pages));
    }

    case "get": {
      if (typeof slug !== "string") return err("Error: slug is required for get action");
      const pageContent = ctx.brain.readWikiPage(slug);
      if (pageContent === null) return ok(`Wiki page not found: ${slug}`);
      return ok(pageContent);
    }

    case "create":
    case "update": {
      if (typeof slug !== "string") return err("Error: slug is required");
      if (typeof content !== "string") return err("Error: content is required");

      // Write via filesystem (same pattern as existing mcp-server.ts)
      const { writeFileSync, mkdirSync, existsSync } = await import("fs");
      const { join } = await import("path");
      const repoRoot = (ctx.brain as unknown as { repoRoot: string }).repoRoot;
      const wikiDir = join(repoRoot, "cocapn", "wiki");
      if (!existsSync(wikiDir)) mkdirSync(wikiDir, { recursive: true });
      const filename = slug.endsWith(".md") ? slug : `${slug}.md`;
      writeFileSync(join(wikiDir, filename), content, "utf8");

      // Commit via sync
      const sync = (ctx.brain as unknown as { sync: { commit: (msg: string) => Promise<void> } }).sync;
      await sync.commit(`update memory: ${action} wiki page ${slug}`);

      return ok(`Wiki page ${action === "create" ? "created" : "updated"}: ${slug}`);
    }

    default:
      return err(`Unknown action: ${action}`);
  }
}

// ─── brain_knowledge ──────────────────────────────────────────────────────────

export async function brainKnowledge(
  ctx: BrainToolContext,
  args: Record<string, unknown>
): Promise<McpCallToolResult> {
  const { action, type, content } = args;
  if (typeof action !== "string" || !["ingest", "query", "validate", "export"].includes(action)) {
    return err("Error: action must be one of: ingest, query, validate, export");
  }

  if (!ctx.brain.memoryManager) {
    return err("Error: MemoryManager not available for knowledge operations");
  }

  switch (action) {
    case "ingest": {
      if (typeof content !== "string") return err("Error: content is required for ingest");
      const memType = (typeof type === "string" ? type : "explicit") as "explicit" | "implicit" | "preference" | "error_pattern" | "task_summary";
      const written = await ctx.brain.memoryManager.remember(
        `knowledge_${Date.now()}`,
        content,
        { type: memType, confidence: 0.8 }
      );
      if (!written) return ok("Knowledge not ingested (duplicate or budget exceeded)");
      return ok("Knowledge ingested successfully");
    }

    case "query": {
      if (typeof content !== "string") return err("Error: content (query) is required");
      const memories = ctx.brain.memoryManager.list();
      const lower = content.toLowerCase();
      const matches = memories
        .filter((m) => m.key.toLowerCase().includes(lower) || m.value.toLowerCase().includes(lower))
        .map((m) => ({ key: m.key, value: m.value, type: m.type, confidence: m.confidence }));
      if (matches.length === 0) return ok("No knowledge entries found");
      return ok(JSON.stringify(matches, null, 2));
    }

    case "validate": {
      const stats = await ctx.brain.memoryManager.prune();
      return ok(JSON.stringify({
        validated: true,
        stats,
      }, null, 2));
    }

    case "export": {
      const { KnowledgePackExporter } = await import("../brain/knowledge-pack.js");
      const exporter = new KnowledgePackExporter(ctx.brain, ctx.brain.memoryManager);
      const pack = await exporter.export();
      return ok(JSON.stringify(pack, null, 2));
    }

    default:
      return err(`Unknown action: ${action}`);
  }
}

// ─── brain_repo ───────────────────────────────────────────────────────────────

export async function brainRepo(
  ctx: BrainToolContext,
  args: Record<string, unknown>
): Promise<McpCallToolResult> {
  const { action, path } = args;
  if (typeof action !== "string" || !["architecture", "file-history", "patterns", "modules"].includes(action)) {
    return err("Error: action must be one of: architecture, file-history, patterns, modules");
  }

  try {
    switch (action) {
      case "architecture": {
        const decisions = await ctx.brain.queryArchitecture();
        if (decisions.length === 0) return ok("No architectural decisions found");
        return ok(JSON.stringify(decisions, null, 2));
      }

      case "file-history": {
        if (typeof path !== "string") return err("Error: path is required for file-history");
        const fileCtx = await ctx.brain.queryFileContext(path);
        if (!fileCtx) return ok(`No history found for: ${path}`);
        return ok(JSON.stringify(fileCtx, null, 2));
      }

      case "patterns": {
        const repoLearner = ctx.brain.getRepoLearner();
        const patterns = await repoLearner.queryPatterns();
        if (patterns.length === 0) return ok("No code patterns detected");
        return ok(JSON.stringify(patterns, null, 2));
      }

      case "modules": {
        if (typeof path !== "string") {
          // List all modules
          const repoLearner = ctx.brain.getRepoLearner();
          const understanding = await repoLearner.buildIndex();
          const modules = Object.entries(understanding.moduleMap);
          if (modules.length === 0) return ok("No modules detected");
          return ok(JSON.stringify(
            modules.map(([name, info]) => ({
              name,
              path: info.path,
              responsibility: info.responsibility,
            })),
            null, 2
          ));
        }
        const moduleInfo = await ctx.brain.queryModuleInfo(path);
        if (!moduleInfo) return ok(`Module not found: ${path}`);
        return ok(JSON.stringify(moduleInfo, null, 2));
      }

      default:
        return err(`Unknown action: ${action}`);
    }
  } catch (e) {
    return err(`RepoLearner error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ─── Tool definitions registry ────────────────────────────────────────────────

export const BRAIN_TOOL_DEFINITIONS = [
  {
    name: "brain_read",
    description: "Read brain data — facts, memories, wiki pages, or knowledge entries. Respects mode filtering.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "Data store to read: fact, memory, wiki, knowledge" },
        key: { type: "string", description: "Specific key/slug to read (optional — returns all if omitted)" },
        mode: { type: "string", description: "Access mode override: public or private (optional)" },
      },
      required: ["type"],
    },
  },
  {
    name: "brain_write",
    description: "Write to the brain — set facts, store memories, or ingest knowledge. No-op in public/a2a mode.",
    inputSchema: {
      type: "object" as const,
      properties: {
        type: { type: "string", description: "Data store to write: fact, memory, knowledge" },
        key: { type: "string", description: "Key for the entry" },
        value: { type: "string", description: "Value/content to store" },
      },
      required: ["type", "key", "value"],
    },
  },
  {
    name: "brain_search",
    description: "Search across brain stores (facts, memories, wiki). Returns matching entries.",
    inputSchema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "Search query" },
        types: { type: "array", items: { type: "string" }, description: "Filter to specific stores: fact, memory, wiki" },
        limit: { type: "number", description: "Max results per store (default: 10)" },
      },
      required: ["query"],
    },
  },
  {
    name: "brain_status",
    description: "Get brain overview — store counts, current mode, last sync time.",
    inputSchema: {
      type: "object" as const,
      properties: {},
    },
  },
  {
    name: "brain_wiki",
    description: "Wiki CRUD operations — list, get, create, or update wiki pages.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Operation: list, get, create, update" },
        slug: { type: "string", description: "Wiki page slug (required for get/create/update)" },
        content: { type: "string", description: "Markdown content (required for create/update)" },
      },
      required: ["action"],
    },
  },
  {
    name: "brain_knowledge",
    description: "Knowledge pipeline — ingest, query, validate, or export knowledge entries.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Operation: ingest, query, validate, export" },
        type: { type: "string", description: "Memory type for ingest (default: explicit)" },
        content: { type: "string", description: "Content to ingest or query string" },
      },
      required: ["action"],
    },
  },
  {
    name: "brain_repo",
    description: "RepoLearner queries — architecture decisions, file history, code patterns, module map.",
    inputSchema: {
      type: "object" as const,
      properties: {
        action: { type: "string", description: "Query type: architecture, file-history, patterns, modules" },
        path: { type: "string", description: "File path (for file-history) or module name (for modules)" },
      },
      required: ["action"],
    },
  },
] as const;

// ─── Tool dispatcher ──────────────────────────────────────────────────────────

type ToolHandler = (ctx: BrainToolContext, args: Record<string, unknown>) => Promise<McpCallToolResult>;

const TOOL_HANDLERS: Record<string, ToolHandler> = {
  brain_read: brainRead,
  brain_write: brainWrite,
  brain_search: brainSearch,
  brain_status: brainStatus,
  brain_wiki: brainWiki,
  brain_knowledge: brainKnowledge,
  brain_repo: brainRepo,
};

/**
 * Execute a brain tool by name with the given context and arguments.
 */
export async function executeBrainTool(
  name: string,
  ctx: BrainToolContext,
  args: Record<string, unknown>
): Promise<McpCallToolResult> {
  const handler = TOOL_HANDLERS[name];
  if (!handler) return err(`Unknown brain tool: ${name}`);
  return handler(ctx, args);
}
