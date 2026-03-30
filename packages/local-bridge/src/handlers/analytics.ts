/**
 * Analytics Handlers — WebSocket handlers for analytics operations.
 *
 * Provides ANALYTICS_STATS and ANALYTICS_EXPORT WebSocket methods.
 */

import type { HandlerContext } from "./types.js";
import type { Sender } from "../ws/send.js";
import type {
  TimePeriod,
  ExportFormat,
  EventFilter,
} from "../analytics/types.js";

/**
 * Analytics instance interface (to avoid circular dependency).
 */
export interface AnalyticsLike {
  getSummary(period?: TimePeriod): {
    tokens: {
      perDay: number;
      perTask: number;
      total: number;
      efficiency: number;
    };
    errors: {
      rate: number;
      totalErrors: number;
      totalRequests: number;
      byType: Record<string, number>;
    };
    latency: {
      avg: number;
      p50: number;
      p95: number;
      p99: number;
      min: number;
      max: number;
    };
    topItems: {
      skills: Array<{ name: string; count: number }>;
      intents: Array<{ name: string; count: number }>;
      modules: Array<{ name: string; count: number }>;
    };
    efficiencyTrend: Array<{
      date: string;
      efficiency: number;
      tokens: number;
      tasks: number;
    }>;
  };
  export(options: {
    format: ExportFormat;
    period?: TimePeriod;
    includeMetrics?: boolean;
  }): {
    format: ExportFormat;
    content: string;
    timestamp: string;
  };
  track(type: string, data: Record<string, unknown>, sessionId?: string): string;
  collector: {
    aggregate(period: TimePeriod): {
      period: TimePeriod;
      totalRequests: number;
      tokensUsed: number;
      tokensWasted: number;
      topSkills: Array<{ name: string; count: number }>;
      topIntents: Array<{ name: string; count: number }>;
      topModules: Array<{ name: string; count: number }>;
      errors: number;
      avgLatency: number;
      activeUsers: number;
      taskBreakdown: Record<string, number>;
    };
    getEvents(filter?: EventFilter): Array<{
      id: string;
      type: string;
      timestamp: number;
      data: Record<string, unknown>;
      sessionId?: string;
    }>;
  };
}

/**
 * Handle ANALYTICS_STATS WebSocket method
 * Returns analytics summary including token metrics, error rates, and top items
 */
export async function handleAnalyticsStats(
  context: HandlerContext,
  sender: Sender,
  params: {
    since?: string;   // ISO timestamp
    until?: string;   // ISO timestamp
  }
): Promise<void> {
  const analytics = (context as unknown as { analytics?: AnalyticsLike }).analytics;

  if (!analytics) {
    await sender({
      jsonrpc: "2.0",
      id: null,
      result: {
        success: false,
        error: "Analytics not available",
        stats: null,
      },
    });
    return;
  }

  try {
    let period: TimePeriod | undefined;

    if (params.since || params.until) {
      period = {
        start: params.since ? new Date(params.since).getTime() : Date.now() - 7 * 24 * 60 * 60 * 1000,
        end: params.until ? new Date(params.until).getTime() : Date.now(),
      };
    }

    const summary = analytics.getSummary(period);

    await sender({
      jsonrpc: "2.0",
      id: null,
      result: {
        success: true,
        stats: summary,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: "2.0",
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
 * Handle ANALYTICS_EXPORT WebSocket method
 * Exports analytics data in JSON, CSV, or Markdown format
 */
export async function handleAnalyticsExport(
  context: HandlerContext,
  sender: Sender,
  params: {
    format: ExportFormat;
    since?: string;
    until?: string;
    includeMetrics?: boolean;
  }
): Promise<void> {
  const analytics = (context as unknown as { analytics?: AnalyticsLike }).analytics;

  if (!analytics) {
    await sender({
      jsonrpc: "2.0",
      id: null,
      result: {
        success: false,
        error: "Analytics not available",
        export: null,
      },
    });
    return;
  }

  try {
    let period: TimePeriod | undefined;

    if (params.since || params.until) {
      period = {
        start: params.since ? new Date(params.since).getTime() : Date.now() - 7 * 24 * 60 * 60 * 1000,
        end: params.until ? new Date(params.until).getTime() : Date.now(),
      };
    }

    const result = analytics.export({
      format: params.format,
      period,
      includeMetrics: params.includeMetrics ?? true,
    });

    await sender({
      jsonrpc: "2.0",
      id: null,
      result: {
        success: true,
        export: {
          format: result.format,
          content: result.content,
          timestamp: result.timestamp,
        },
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: "2.0",
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        export: null,
      },
    });
  }
}

/**
 * Handle ANALYTICS_EVENTS WebSocket method
 * Returns raw events matching the given filter
 */
export async function handleAnalyticsEvents(
  context: HandlerContext,
  sender: Sender,
  params: {
    types?: string[];
    since?: string;
    until?: string;
    sessionId?: string;
    limit?: number;
  }
): Promise<void> {
  const analytics = (context as unknown as { analytics?: AnalyticsLike }).analytics;

  if (!analytics) {
    await sender({
      jsonrpc: "2.0",
      id: null,
      result: {
        success: false,
        error: "Analytics not available",
        events: [],
      },
    });
    return;
  }

  try {
    const filter: EventFilter = {};

    if (params.types && params.types.length > 0) {
      filter.types = params.types as any;
    }

    if (params.since) {
      filter.since = new Date(params.since).getTime();
    }

    if (params.until) {
      filter.until = new Date(params.until).getTime();
    }

    if (params.sessionId) {
      filter.sessionId = params.sessionId;
    }

    if (params.limit) {
      filter.limit = params.limit;
    }

    const events = analytics.collector.getEvents(filter);

    await sender({
      jsonrpc: "2.0",
      id: null,
      result: {
        success: true,
        events,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: "2.0",
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        events: [],
      },
    });
  }
}

/**
 * Track helper function - records an analytics event
 */
export function trackAnalyticsEvent(
  analytics: AnalyticsLike | undefined,
  type: string,
  data: Record<string, unknown>,
  sessionId?: string
): void {
  if (!analytics) return;

  try {
    analytics.track(type, data, sessionId);
  } catch (error) {
    // Silently fail to avoid disrupting main flow
    console.error(`[analytics] Failed to track event:`, error);
  }
}

/**
 * Track chat event helper
 */
export function trackChatEvent(
  analytics: AnalyticsLike | undefined,
  data: {
    messageLength: number;
    responseLength: number;
    model: string;
    skill?: string;
    success: boolean;
    latency: number;
  },
  sessionId?: string
): void {
  trackAnalyticsEvent(analytics, "chat", data, sessionId);
}

/**
 * Track skill load event helper
 */
export function trackSkillLoadEvent(
  analytics: AnalyticsLike | undefined,
  data: {
    skillName: string;
    loadTime: number;
    success: boolean;
  },
  sessionId?: string
): void {
  trackAnalyticsEvent(analytics, "skill_load", data, sessionId);
}

/**
 * Track error event helper
 */
export function trackErrorEvent(
  analytics: AnalyticsLike | undefined,
  data: {
    errorType: string;
    errorMessage: string;
    stack?: string;
    context?: string;
  },
  sessionId?: string
): void {
  trackAnalyticsEvent(analytics, "error", data, sessionId);
}

/**
 * Track task completion event helper
 */
export function trackTaskCompleteEvent(
  analytics: AnalyticsLike | undefined,
  data: {
    taskType: string;
    success: boolean;
    duration: number;
  },
  sessionId?: string
): void {
  trackAnalyticsEvent(analytics, "task_complete", data, sessionId);
}
