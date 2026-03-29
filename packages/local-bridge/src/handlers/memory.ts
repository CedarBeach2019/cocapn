/**
 * Memory Handlers — WebSocket handlers for memory manager operations
 */

import type { MemoryManager, MemoryEntry } from '../brain/memory-manager.js';
import type { HandlerContext } from './types.js';
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
