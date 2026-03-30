/**
 * Analytics Types — event types, usage reports, and metrics.
 *
 * Provides type definitions for tracking agent usage, events, and analytics.
 */

// ---------------------------------------------------------------------------
// Event Types
// ---------------------------------------------------------------------------

/**
 * Supported analytics event types.
 */
export type AnalyticsEventType =
  | "chat"              // Chat messages sent/received
  | "skill_load"        // Skills loaded into memory
  | "skill_use"         // Skills invoked/matched
  | "tree_search"       // Tree search queries executed
  | "token_usage"       // Token consumption events
  | "error"             // Errors and exceptions
  | "module_install"    // Module installation events
  | "task_complete"     // Task completion events
  | "file_edit"         // File editing operations
  | "test_run"          // Test execution events
  | "cloud_request";    // Cloud API requests

/**
 * A single analytics event record.
 */
export interface AnalyticsEvent {
  id: string;                    // Unique event ID
  type: AnalyticsEventType;      // Event type
  timestamp: number;             // Unix timestamp (ms)
  data: Record<string, unknown>; // Event-specific data
  sessionId?: string;            // Optional session identifier
}

/**
 * Filter options for querying events.
 */
export interface EventFilter {
  types?: AnalyticsEventType[];  // Filter by event types
  since?: number;                // Start timestamp (ms)
  until?: number;                // End timestamp (ms)
  sessionId?: string;            // Filter by session
  limit?: number;                // Max events to return
}

// ---------------------------------------------------------------------------
// Usage Reports
// ---------------------------------------------------------------------------

/**
 * A time period for analytics reports.
 */
export interface TimePeriod {
  start: number;  // Start timestamp (ms)
  end: number;    // End timestamp (ms)
}

/**
 * Usage statistics for a specific item (skill, module, intent, etc.).
 */
export interface UsageStatistic {
  name: string;   // Item name
  count: number;  // Usage count
}

/**
 * Comprehensive usage report for a time period.
 */
export interface UsageReport {
  period: TimePeriod;
  totalRequests: number;       // Total events/requests
  tokensUsed: number;          // Total tokens consumed
  tokensWasted: number;        // Wasted tokens (inefficient usage)
  topSkills: UsageStatistic[]; // Most used skills
  topIntents: UsageStatistic[]; // Most matched intents
  topModules: UsageStatistic[]; // Most used modules
  errors: number;              // Total errors
  avgLatency: number;          // Average latency (ms)
  activeUsers: number;         // Active users/sessions
  taskBreakdown: Record<string, number>; // Tasks by type
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

/**
 * Token usage metrics.
 */
export interface TokenMetrics {
  perDay: number;              // Tokens per day
  perTask: number;             // Tokens per task
  total: number;               // Total tokens in period
  efficiency: number;          // Success ratio (0-1)
}

/**
 * Efficiency trend data point.
 */
export interface EfficiencyTrendPoint {
  date: string;     // ISO date string
  efficiency: number; // Efficiency score (0-1)
  tokens: number;   // Tokens used in period
  tasks: number;    // Tasks completed
}

/**
 * Error rate metrics.
 */
export interface ErrorMetrics {
  rate: number;           // Error rate (0-1)
  totalErrors: number;    // Total error count
  totalRequests: number;  // Total request count
  byType: Record<string, number>; // Errors by type
}

/**
 * Latency metrics.
 */
export interface LatencyMetrics {
  avg: number;             // Average latency (ms)
  p50: number;             // 50th percentile (ms)
  p95: number;             // 95th percentile (ms)
  p99: number;             // 99th percentile (ms)
  min: number;             // Minimum latency (ms)
  max: number;             // Maximum latency (ms)
}

/**
 * Top items statistics.
 */
export interface TopItems {
  skills: UsageStatistic[];
  intents: UsageStatistic[];
  modules: UsageStatistic[];
}

// ---------------------------------------------------------------------------
// Export Formats
// ---------------------------------------------------------------------------

/**
 * Export format options.
 */
export type ExportFormat = "json" | "csv" | "markdown";

/**
 * Export options.
 */
export interface ExportOptions {
  format: ExportFormat;    // Export format
  period?: TimePeriod;     // Optional time period
  includeMetrics?: boolean; // Include calculated metrics
}

/**
 * Export result.
 */
export interface ExportResult {
  format: ExportFormat;
  content: string;         // Exported content
  timestamp: string;       // ISO timestamp
}
