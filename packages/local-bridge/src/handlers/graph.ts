/**
 * Graph Handler — WebSocket handler for knowledge graph queries
 */

import type { HandlerContext } from './types.js';
import type { Sender } from '../ws/send.js';
import type { RepoGraph } from '../graph/index.js';

/**
 * Handle GRAPH_QUERY WebSocket method
 * Queries the repository knowledge graph
 */
export async function handleGraphQuery(
  context: HandlerContext,
  sender: Sender,
  params: { type: string; params?: Record<string, unknown> }
): Promise<void> {
  const { brain } = context;

  if (!brain?.hasGraph()) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Knowledge graph not available',
        data: null,
      },
    });
    return;
  }

  const graph = brain.getGraph()!;
  const { type, params: queryParams = {} } = params;

  try {
    let data: unknown = null;

    switch (type) {
      case 'dependencies': {
        const file = queryParams.file as string;
        if (!file) {
          throw new Error('Missing "file" parameter for dependencies query');
        }
        data = await graph.getDependencies(file);
        break;
      }

      case 'dependents': {
        const file = queryParams.file as string;
        if (!file) {
          throw new Error('Missing "file" parameter for dependents query');
        }
        data = await graph.getDependents(file);
        break;
      }

      case 'callGraph': {
        const functionId = queryParams.functionId as string;
        if (!functionId) {
          throw new Error('Missing "functionId" parameter for callGraph query');
        }
        data = await graph.getCallGraph(functionId);
        break;
      }

      case 'reverseCallGraph': {
        const functionId = queryParams.functionId as string;
        if (!functionId) {
          throw new Error('Missing "functionId" parameter for reverseCallGraph query');
        }
        data = await graph.getReverseCallGraph(functionId);
        break;
      }

      case 'findByName': {
        const pattern = queryParams.pattern as string;
        if (!pattern) {
          throw new Error('Missing "pattern" parameter for findByName query');
        }
        data = await graph.findByName(pattern);
        break;
      }

      case 'findByFile': {
        const file = queryParams.file as string;
        if (!file) {
          throw new Error('Missing "file" parameter for findByFile query');
        }
        data = await graph.findByFile(file);
        break;
      }

      case 'findExported': {
        data = await graph.findExported();
        break;
      }

      case 'impactRadius': {
        const nodeId = queryParams.nodeId as string;
        const depth = queryParams.depth as number | undefined;
        if (!nodeId) {
          throw new Error('Missing "nodeId" parameter for impactRadius query');
        }
        data = await graph.getImpactRadius(nodeId, depth);
        break;
      }

      case 'stats': {
        data = await graph.stats();
        break;
      }

      default:
        throw new Error(`Unknown graph query type: ${type}`);
    }

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        data,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        data: null,
      },
    });
  }
}

/**
 * Handle GRAPH_STATS WebSocket method
 * Returns graph statistics
 */
export async function handleGraphStats(
  context: HandlerContext,
  sender: Sender
): Promise<void> {
  const { brain } = context;

  if (!brain?.hasGraph()) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Knowledge graph not available',
        stats: null,
      },
    });
    return;
  }

  try {
    const graph = brain.getGraph()!;
    const stats = await graph.stats();

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
