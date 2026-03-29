/**
 * Tree Search Handler — WebSocket handler for complex task tree search
 */

import type { HandlerContext } from './types.js';
import type { Sender } from '../ws/send.js';
import { TreeSearch } from '../tree-search/index.js';

/**
 * Handle TREE_SEARCH WebSocket method
 * Starts a tree search for a complex task
 */
export async function handleTreeSearch(
  context: HandlerContext,
  sender: Sender,
  params: { task: string; options?: Record<string, unknown> }
): Promise<void> {
  const { repoRoot } = context;

  if (!repoRoot) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Repository root not available',
        searchResult: null,
      },
    });
    return;
  }

  const { task, options } = params;

  try {
    // Create tree search instance
    const treeSearch = new TreeSearch(repoRoot, options);

    // For now, use mock approach generation (real implementation would use LLM)
    treeSearch.setMockGeneratorResponse({
      approaches: [
        'Use iterative refactoring with small steps',
        'Create a comprehensive test suite first, then refactor',
      ],
      tokensUsed: 100,
    });

    treeSearch.setMockExecutorResult({
      result: {
        success: true,
        output: 'Mock execution result',
        testPassRate: 0.8,
        codeQualityScore: 0.7,
        tokenCost: 500,
      },
    });

    // Run the search (with a timeout to prevent blocking)
    const searchResult = await Promise.race([
      treeSearch.search(task),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Tree search timeout')), 30000)
      ),
    ]);

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        searchResult: {
          bestNode: searchResult.bestNode,
          totalTokensUsed: searchResult.totalTokensUsed,
          totalTime: searchResult.totalTime,
          nodesExplored: searchResult.nodesExplored,
          maxDepthReached: searchResult.maxDepthReached,
          allNodes: searchResult.allNodes.slice(0, 10), // Limit for response size
        },
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        searchResult: null,
      },
    });
  }
}

/**
 * Handle TREE_SEARCH_STATUS WebSocket method
 * Returns current search statistics without running a new search
 */
export async function handleTreeSearchStatus(
  context: HandlerContext,
  sender: Sender
): Promise<void> {
  // For now, just return that tree search is available
  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      status: {
        available: true,
        active: false,
        stats: null,
      },
    },
  });
}
