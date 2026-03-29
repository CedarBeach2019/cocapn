/**
 * Memory Handlers — WebSocket handlers for memory manager operations
 */

import type { WebSocket } from 'ws';
import type { MemoryManager, MemoryEntry } from '../brain/memory-manager.js';
import type { HandlerContext } from './types.js';
import type { TypedMessage } from '../ws/types.js';
import { KnowledgePackExporter, KnowledgePackImporter, type KnowledgePack, type ExportOptions, type ImportOptions } from '../brain/knowledge-pack.js';

/**
 * Handle MEMORY_RECALL WebSocket method
 * Returns memories matching a query
 */
export async function handleMemoryRecall(
  context: HandlerContext,
  sender: any,
  params: { query: string; limit?: number; minConfidence?: number }
): Promise<void> {
  const memoryManager = getMemoryManager(context);
  if (!memoryManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Memory manager not available',
        memories: [],
      },
    });
    return;
  }

  try {
    const memories = await memoryManager.recall(
      params.query,
      { limit: params.limit, minConfidence: params.minConfidence }
    );

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        memories: memories.map(serializeMemory),
        count: memories.length,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        memories: [],
      },
    });
  }
}

/**
 * Handle MEMORY_REMEMBER WebSocket method
 * Writes a memory to the brain
 */
export async function handleMemoryRemember(
  context: HandlerContext,
  sender: any,
  params: {
    key: string;
    value: string;
    type: 'explicit' | 'implicit' | 'error_pattern' | 'preference' | 'task_summary';
    confidence?: number;
    tags?: string[];
    expiresAt?: string;
  }
): Promise<void> {
  const memoryManager = getMemoryManager(context);
  if (!memoryManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Memory manager not available',
        written: false,
      },
    });
    return;
  }

  try {
    const written = await memoryManager.remember(params.key, params.value, {
      type: params.type,
      confidence: params.confidence,
      tags: params.tags,
      expiresAt: params.expiresAt,
    });

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        written,
        budgetRemaining: memoryManager.getWriteCount(),
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        written: false,
      },
    });
  }
}

/**
 * Handle MEMORY_FORGET WebSocket method
 * Forgets a memory by key
 */
export async function handleMemoryForget(
  context: HandlerContext,
  sender: any,
  params: { key: string }
): Promise<void> {
  const memoryManager = getMemoryManager(context);
  if (!memoryManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Memory manager not available',
        forgotten: false,
      },
    });
    return;
  }

  try {
    const forgotten = await memoryManager.forget(params.key);

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        forgotten,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        forgotten: false,
      },
    });
  }
}

/**
 * Handle MEMORY_LIST WebSocket method
 * Lists memories with optional filters
 */
export async function handleMemoryList(
  context: HandlerContext,
  sender: any,
  params?: {
    type?: 'explicit' | 'implicit' | 'error_pattern' | 'preference' | 'task_summary';
    minConfidence?: number;
    autoOnly?: boolean;
  }
): Promise<void> {
  const memoryManager = getMemoryManager(context);
  if (!memoryManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Memory manager not available',
        memories: [],
      },
    });
    return;
  }

  try {
    const memories = memoryManager.list(params);

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        memories: memories.map(serializeMemory),
        count: memories.length,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        memories: [],
      },
    });
  }
}

/**
 * Handle MEMORY_STATS WebSocket method
 * Returns memory statistics
 */
export async function handleMemoryStats(
  context: HandlerContext,
  sender: any
): Promise<void> {
  const memoryManager = getMemoryManager(context);
  if (!memoryManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Memory manager not available',
        stats: null,
      },
    });
    return;
  }

  try {
    const stats = memoryManager.stats();

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        stats,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stats: null,
      },
    });
  }
}

/**
 * Handle MEMORY_PRUNE WebSocket method
 * Prunes old/unused memories
 */
export async function handleMemoryPrune(
  context: HandlerContext,
  sender: any
): Promise<void> {
  const memoryManager = getMemoryManager(context);
  if (!memoryManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Memory manager not available',
        result: null,
      },
    });
    return;
  }

  try {
    const result = await memoryManager.prune();

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        pruneResult: result,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        result: null,
      },
    });
  }
}

// ─── Knowledge Pack Handlers ─────────────────────────────────────────────────────

/**
 * Handle KNOWLEDGE_EXPORT WebSocket method
 * Exports memories as a knowledge pack JSON
 */
export async function handleKnowledgeExport(
  context: HandlerContext,
  sender: any,
  params?: ExportOptions
): Promise<void> {
  const brain = context.brain;
  const memoryManager = getMemoryManager(context);

  if (!brain) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Brain not available',
        pack: null,
      },
    });
    return;
  }

  try {
    const exporter = new KnowledgePackExporter(brain, memoryManager || undefined);
    const pack = await exporter.export(params);

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        pack,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        pack: null,
      },
    });
  }
}

/**
 * Handle KNOWLEDGE_IMPORT WebSocket method
 * Imports a knowledge pack
 */
export async function handleKnowledgeImport(
  context: HandlerContext,
  sender: any,
  params: {
    pack: KnowledgePack | string;
    options?: ImportOptions;
  }
): Promise<void> {
  const brain = context.brain;
  const memoryManager = getMemoryManager(context);

  if (!brain) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Brain not available',
        result: null,
      },
    });
    return;
  }

  try {
    const importer = new KnowledgePackImporter(brain, memoryManager || undefined);
    const result = await importer.import(params.pack, params.options);

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        importResult: result,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        result: null,
      },
    });
  }
}

/**
 * Handle KNOWLEDGE_PREVIEW WebSocket method
 * Previews what would be imported
 */
export async function handleKnowledgePreview(
  context: HandlerContext,
  sender: any,
  params: { pack: KnowledgePack | string }
): Promise<void> {
  const brain = context.brain;
  const memoryManager = getMemoryManager(context);

  if (!brain) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Brain not available',
        preview: null,
      },
    });
    return;
  }

  try {
    const importer = new KnowledgePackImporter(brain, memoryManager || undefined);
    const preview = await importer.preview(params.pack);

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        preview,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        preview: null,
      },
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

function getMemoryManager(context: HandlerContext): MemoryManager | null {
  // Brain has the memory manager as a property
  const brain = context.brain;
  if (!brain) return null;

  return (brain as any).memoryManager || null;
}

// ─── Typed Message Handlers (for HandlerRegistry) ────────────────────────────
//
// These handle typed WebSocket messages: { type: "MEMORY_LIST", ... }
// They are separate from the RPC handlers above which use JSON-RPC format.

/**
 * Handle MEMORY_LIST typed message — returns all stored facts.
 */
export async function handleMemoryListTyped(
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  if (!ctx.brain) {
    ws.send(JSON.stringify({ type: "MEMORY_LIST_ERROR", id: msg.id, error: "Brain not available" }));
    return;
  }

  const facts = ctx.brain.getAllFacts();
  const entries = Object.entries(facts).map(([key, value]) => ({ key, value }));

  ws.send(JSON.stringify({
    type: "MEMORY_LIST",
    id: msg.id,
    facts: entries,
    count: entries.length,
  }));
}

/**
 * Handle MEMORY_ADD typed message — manually add a fact.
 */
export async function handleMemoryAddTyped(
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  if (!ctx.brain) {
    ws.send(JSON.stringify({ type: "MEMORY_ADD_ERROR", id: msg.id, error: "Brain not available" }));
    return;
  }

  const key = msg["key"] as string | undefined;
  const value = msg["value"] as string | undefined;

  if (!key || !value) {
    ws.send(JSON.stringify({ type: "MEMORY_ADD_ERROR", id: msg.id, error: "Missing key or value" }));
    return;
  }

  await ctx.brain.setFact(key, value);

  ws.send(JSON.stringify({
    type: "MEMORY_ADD",
    id: msg.id,
    key,
    value,
    ok: true,
  }));
}

/**
 * Handle MEMORY_DELETE typed message — remove a fact.
 */
export async function handleMemoryDeleteTyped(
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  if (!ctx.brain) {
    ws.send(JSON.stringify({ type: "MEMORY_DELETE_ERROR", id: msg.id, error: "Brain not available" }));
    return;
  }

  const key = msg["key"] as string | undefined;

  if (!key) {
    ws.send(JSON.stringify({ type: "MEMORY_DELETE_ERROR", id: msg.id, error: "Missing key" }));
    return;
  }

  const existing = ctx.brain.getFact(key);
  if (existing === undefined) {
    ws.send(JSON.stringify({ type: "MEMORY_DELETE_ERROR", id: msg.id, error: `Fact not found: ${key}` }));
    return;
  }

  await ctx.brain.deleteFact(key);

  ws.send(JSON.stringify({
    type: "MEMORY_DELETE",
    id: msg.id,
    key,
    ok: true,
  }));
}

/**
 * Handle WIKI_LIST typed message — returns all wiki pages (file + title).
 */
export async function handleWikiListTyped(
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  if (!ctx.brain) {
    ws.send(JSON.stringify({ type: "WIKI_LIST_ERROR", id: msg.id, error: "Brain not available" }));
    return;
  }

  const pages = ctx.brain.listWikiPages();

  ws.send(JSON.stringify({
    type: "WIKI_LIST",
    id: msg.id,
    pages: pages.map(p => ({ file: p.file, title: p.title })),
    count: pages.length,
  }));
}

/**
 * Handle WIKI_READ typed message — returns content of a specific wiki page.
 */
export async function handleWikiReadTyped(
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  if (!ctx.brain) {
    ws.send(JSON.stringify({ type: "WIKI_READ_ERROR", id: msg.id, error: "Brain not available" }));
    return;
  }

  const file = msg["file"] as string | undefined;
  if (!file) {
    ws.send(JSON.stringify({ type: "WIKI_READ_ERROR", id: msg.id, error: "Missing file parameter" }));
    return;
  }

  const content = ctx.brain.readWikiPage(file);
  if (content === null) {
    ws.send(JSON.stringify({ type: "WIKI_READ_ERROR", id: msg.id, error: `Wiki page not found: ${file}` }));
    return;
  }

  ws.send(JSON.stringify({
    type: "WIKI_READ",
    id: msg.id,
    file,
    content,
  }));
}

/**
 * Handle SOUL_GET typed message — returns the soul.md personality text.
 */
export async function handleSoulGetTyped(
  ws: WebSocket,
  clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  if (!ctx.brain) {
    ws.send(JSON.stringify({ type: "SOUL_GET_ERROR", id: msg.id, error: "Brain not available" }));
    return;
  }

  const soul = ctx.brain.getSoul();

  ws.send(JSON.stringify({
    type: "SOUL_GET",
    id: msg.id,
    content: soul,
  }));
}

// ─── Serializer Helper ────────────────────────────────────────────────────────

function serializeMemory(mem: MemoryEntry): Record<string, unknown> {
  return {
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
  };
}
