/**
 * Module Handoff Types — enable inter-module delegation.
 *
 * Modules can return special handoff responses that route the conversation
 * to other modules, enabling multi-step workflows without user intervention.
 */

// ─── Handoff Response ─────────────────────────────────────────────────────────────

export interface HandoffResponse {
  /** Target module name to route to */
  module: string;
  /** Context/message to pass to the target module */
  context: string;
  /** Urgency level for the handoff (default: 'normal') */
  urgency?: 'low' | 'normal' | 'high';
  /** Optional module to return to after completion (default: sender) */
  returnTo?: string;
}

// ─── Module Result ───────────────────────────────────────────────────────────────

/**
 * Result type returned by module handlers.
 * Enables modules to respond, hand off, or do both.
 */
export type ModuleResult =
  | { type: 'response'; content: string }
  | { type: 'handoff'; handoff: HandoffResponse }
  | { type: 'multi'; responses: string[]; handoffs: HandoffResponse[] };

// ─── Handoff State ───────────────────────────────────────────────────────────────

export interface HandoffState {
  /** Current handoff depth (prevents infinite loops) */
  depth: number;
  /** Handoff chain history for debugging */
  chain: HandoffChainEntry[];
  /** Previous module before current handoff */
  previousModule: string | null;
}

export interface HandoffChainEntry {
  /** Source module that initiated the handoff */
  fromModule: string;
  /** Target module that received the handoff */
  toModule: string;
  /** Context passed in the handoff */
  context: string;
  /** Timestamp of the handoff */
  timestamp: number;
  /** Urgency level */
  urgency: 'low' | 'normal' | 'high';
}

// ─── Handoff Config ──────────────────────────────────────────────────────────────

/**
 * Handoff configuration for module manifests.
 * Declares which modules can participate in handoffs.
 */
export interface ModuleHandoffConfig {
  /** List of module names this module can hand off to */
  canHandoffTo: string[];
  /** Whether this module can receive handoffs from other modules */
  canReceiveHandoff: boolean;
  /** Examples of handoff triggers for documentation */
  handoffExamples: Array<{ trigger: string; target: string }>;
}

// ─── Handoff Options ─────────────────────────────────────────────────────────────

export interface HandoffProcessorOptions {
  /** Maximum handoff depth before forcing a response (default: 5) */
  maxDepth?: number;
  /** Whether to log handoff chains (default: true) */
  enableLogging?: boolean;
}

// ─── Route Function ───────────────────────────────────────────────────────────────

/**
 * Function type for routing to a module.
 * Used by HandoffProcessor to execute handoffs.
 */
export type RouteToModuleFn = (
  context: string,
  module?: string,
  handoffState?: HandoffState
) => Promise<ModuleResult>;
