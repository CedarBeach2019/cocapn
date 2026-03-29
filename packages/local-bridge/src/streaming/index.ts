/**
 * Streaming diff module — apply code diffs as they stream from LLM.
 *
 * This module provides real-time diff parsing and incremental application,
 * making the agent feel faster by showing code changes as they're generated.
 *
 * Components:
 * - DiffStreamParser: Parse streaming text into diff chunks
 * - PartialDiffer: Apply diffs incrementally with rollback support
 * - StreamHandler: Integrate with WebSocket pipeline
 */

export { DiffStreamParser, type DiffChunk } from "./diff-parser.js";
export {
  PartialDiffer,
  type PendingEdit,
  type ApplyResult,
  type FinalizeResult,
} from "./partial-differ.js";