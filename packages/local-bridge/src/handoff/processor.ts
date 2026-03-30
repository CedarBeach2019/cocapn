/**
 * Handoff Processor — processes module handoff chains.
 *
 * Handles delegation between modules, enforces depth limits,
 * prevents circular handoffs, and tracks handoff chains for debugging.
 */

import type {
  ModuleResult,
  HandoffResponse,
  HandoffState,
  HandoffChainEntry,
  HandoffProcessorOptions,
  RouteToModuleFn,
} from './types.js';

// ─── Defaults ────────────────────────────────────────────────────────────────────

const DEFAULT_MAX_DEPTH = 5;
const DEFAULT_ENABLE_LOGGING = true;

// ─── Handoff Processor ───────────────────────────────────────────────────────────

export class HandoffProcessor {
  private maxDepth: number;
  private enableLogging: boolean;

  constructor(options: HandoffProcessorOptions = {}) {
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.enableLogging = options.enableLogging ?? DEFAULT_ENABLE_LOGGING;
  }

  /**
   * Process a module result, following any handoffs until a final response is reached.
   *
   * @param initialResult - The initial result from a module handler
   * @param routeToModule - Function to route messages to modules
   * @param state - Current conversation state (optional)
   * @returns Final module result (response type)
   */
  async process(
    initialResult: ModuleResult,
    routeToModule: RouteToModuleFn,
    state?: HandoffState
  ): Promise<ModuleResult> {
    // Initialize or reuse handoff state
    let handoffState: HandoffState = state ?? {
      depth: 0,
      chain: [],
      previousModule: null,
    };

    let currentResult = initialResult;

    // Process handoff chain
    while ((currentResult.type === 'handoff' || currentResult.type === 'multi') && handoffState.depth < this.maxDepth) {
      // Handle multi-type results
      if (currentResult.type === 'multi') {
        if (currentResult.handoffs.length > 0) {
          // Process first handoff in multi-response
          const firstHandoff = currentResult.handoffs[0]!;
          currentResult = { type: 'handoff', handoff: firstHandoff };
          continue;
        } else {
          // No more handoffs, we're done - flatten and return
          return {
            type: 'response',
            content: currentResult.responses.join('\n\n'),
          };
        }
      }

      // Now currentResult.type === 'handoff'
      const handoff = currentResult.handoff;

      // Check for circular handoff (module handing off to itself)
      if (handoffState.previousModule === handoff.module) {
        if (this.enableLogging) {
          console.warn(
            `[handoff] Circular handoff detected: ${handoff.module} → ${handoff.module}`
          );
        }
        // Return error response
        return {
          type: 'response',
          content: 'I got stuck trying to complete your request. Let me try a different approach.',
        };
      }

      // Log handoff
      if (this.enableLogging) {
        console.info(
          `[handoff] ${handoffState.previousModule || 'initial'} → ${handoff.module} ` +
          `(depth: ${handoffState.depth + 1}/${this.maxDepth}, urgency: ${handoff.urgency || 'normal'})`
        );
      }

      // Record handoff in chain
      const chainEntry: HandoffChainEntry = {
        fromModule: handoffState.previousModule || 'system',
        toModule: handoff.module,
        context: handoff.context,
        timestamp: Date.now(),
        urgency: handoff.urgency || 'normal',
      };
      handoffState.chain.push(chainEntry);

      // Update state for next iteration BEFORE routing
      handoffState.depth++;
      handoffState.previousModule = handoff.module;

      // Route to target module
      try {
        currentResult = await routeToModule(handoff.context, handoff.module, handoffState);
      } catch (error) {
        // If routing fails, return error response
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[handoff] Error routing to ${handoff.module}:`, errorMessage);
        return {
          type: 'response',
          content: `I encountered an error while trying to complete your request: ${errorMessage}`,
        };
      }
    }

    // Check if we exceeded max depth
    if (currentResult.type === 'handoff' && handoffState.depth >= this.maxDepth) {
      if (this.enableLogging) {
        console.warn(
          `[handoff] Max depth exceeded (${this.maxDepth}), forcing response`
        );
      }
      return {
        type: 'response',
        content: 'I got stuck trying to complete your request. Let me try a different approach.',
      };
    }

    return currentResult;
  }

  /**
   * Create a handoff result for delegating to another module.
   */
  static handoff(module: string, context: string, options?: {
    urgency?: 'low' | 'normal' | 'high';
    returnTo?: string;
  }): ModuleResult {
    return {
      type: 'handoff',
      handoff: {
        module,
        context,
        urgency: options?.urgency || 'normal',
        returnTo: options?.returnTo,
      },
    };
  }

  /**
   * Create a response result for direct replies.
   */
  static response(content: string): ModuleResult {
    return {
      type: 'response',
      content,
    };
  }

  /**
   * Create a multi result with responses and optional handoffs.
   */
  static multi(
    responses: string[],
    handoffs: HandoffResponse[] = []
  ): ModuleResult {
    return {
      type: 'multi',
      responses,
      handoffs,
    };
  }

  /**
   * Get current handoff chain for debugging.
   */
  getChain(state: HandoffState): HandoffChainEntry[] {
    return state.chain;
  }

  /**
   * Format handoff chain as human-readable string.
   */
  formatChain(state: HandoffState): string {
    if (state.chain.length === 0) {
      return 'No handoffs';
    }

    return state.chain
      .map((entry, i) => {
        const time = new Date(entry.timestamp).toISOString().split('T')[1]!.slice(0, 8);
        return `${i + 1}. ${entry.fromModule} → ${entry.toModule} (${time}, ${entry.urgency})`;
      })
      .join('\n');
  }

  /**
   * Check if a handoff would create a circular dependency.
   */
  wouldBeCircular(
    targetModule: string,
    state: HandoffState
  ): boolean {
    return state.previousModule === targetModule;
  }

  /**
   * Estimate token cost of a handoff chain.
   * Each handoff has overhead for context transfer.
   */
  estimateTokenCost(state: HandoffState): number {
    // Base cost: ~200 tokens per handoff for context transfer
    const baseCostPerHandoff = 200;
    // Add estimated context size from chain entries
    const contextCost = state.chain.reduce(
      (sum, entry) => sum + entry.context.length * 0.25, // Rough token estimate
      0
    );

    return Math.round(baseCostPerHandoff * state.depth + contextCost);
  }

  /**
   * Get handoff statistics.
   */
  getStats(state: HandoffState): {
    depth: number;
    chainLength: number;
    estimatedTokens: number;
    isCircular: boolean;
  } {
    return {
      depth: state.depth,
      chainLength: state.chain.length,
      estimatedTokens: this.estimateTokenCost(state),
      isCircular: state.previousModule !== null,
    };
  }
}
