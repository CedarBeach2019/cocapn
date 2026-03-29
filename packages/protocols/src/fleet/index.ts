/**
 * Fleet Protocol - Multi-agent coordination
 *
 * Extends A2A protocol with fleet-specific messages and semantics.
 */

// Types
export type {
  FleetConfig,
  FleetAgent,
  FleetTask,
  FleetMessage,
  Fleet,
  FleetRole,
  AgentStatus,
  AgentCapabilities,
  TaskStatus,
  TaskType,
  TaskPriority,
  DecompositionStrategy,
  Subtask,
  Assignment,
  FleetTopology,
  FleetRegistration,
  TaskDedup,
  FleetJWTPayload,
  AuditLog,
  FleetError,
  FleetClientConfig,
  FleetClientState,
  AgentScore,
  TaskSplitResult,
  MergeResult,
} from './types.js';

export type {
  FleetMessageType,
  TaskAssignmentMessage,
  ProgressUpdateMessage,
  ResultSubmissionMessage,
  HeartbeatMessage,
  ErrorEscalationMessage,
} from './types.js';

export type {
  ParallelStrategy,
  SequentialStrategy,
  MapReduceStrategy,
  MergeStrategy,
  TimeoutAction,
} from './types.js';

// Constants
export { DEFAULT_FLEET_CONFIG, FleetErrorCode } from './types.js';

// Classes
export { TaskSplitter, taskSplitter } from './task-splitter.js';
export { FleetRegistry } from './fleet-registry.js';
export { FleetManager, fleetManager } from './fleet-manager.js';
export { FleetClient } from './client.js';
