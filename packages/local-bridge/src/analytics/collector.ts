/**
 * Analytics Event Collector — tracks and stores analytics events.
 *
 * Uses SQLite (better-sqlite3) for persistent event storage with automatic
 * rotation of old events (keeps last 30 days by default).
 */

import Database from "better-sqlite3";
import { join } from "path";
import { existsSync } from "fs";
import type {
  AnalyticsEvent,
  AnalyticsEventType,
  EventFilter,
  TimePeriod,
  UsageReport,
  UsageStatistic,
} from "./types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Configuration options for the AnalyticsCollector.
 */
export interface CollectorOptions {
  dbPath?: string;           // Path to SQLite database (default: in-memory)
  retentionDays?: number;    // Days to keep events (default: 30)
  maxEvents?: number;        // Max events in memory cache (default: 10000)
}

// ---------------------------------------------------------------------------
// AnalyticsCollector
// ---------------------------------------------------------------------------

/**
 * Collects and manages analytics events with SQLite persistence.
 */
export class AnalyticsCollector {
  private db: Database.Database;
  private retentionDays: number;
  private nextId = 0;

  constructor(options: CollectorOptions = {}) {
    this.retentionDays = options.retentionDays ?? 30;

    const dbPath = options.dbPath ?? ":memory:";
    this.db = new Database(dbPath);
    this.db.pragma("journal_mode = WAL");

    this.initializeSchema();

    // Load next ID from database
    const row = this.db.prepare("SELECT MAX(id) as maxId FROM events").get() as { maxId: number | null };
    if (row?.maxId !== null) {
      this.nextId = row.maxId + 1;
    }

    // Rotate old events on startup
    this.rotateOldEvents();
  }

  // -------------------------------------------------------------------------
  // Schema Management
  // -------------------------------------------------------------------------

  /**
   * Initialize the database schema.
   */
  private initializeSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        type TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        data TEXT NOT NULL,
        sessionId TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
      CREATE INDEX IF NOT EXISTS idx_events_timestamp ON events(timestamp);
      CREATE INDEX IF NOT EXISTS idx_events_session ON events(sessionId);
    `);
  }

  // -------------------------------------------------------------------------
  // Event Recording
  // -------------------------------------------------------------------------

  /**
   * Track an analytics event.
   * @returns The event ID
   */
  track(type: AnalyticsEventType, data: Record<string, unknown>, sessionId?: string): string {
    const id = this.nextId++;
    const timestamp = Date.now();

    const stmt = this.db.prepare(`
      INSERT INTO events (id, type, timestamp, data, sessionId)
      VALUES (?, ?, ?, ?, ?)
    `);

    stmt.run(id, type, timestamp, JSON.stringify(data), sessionId ?? null);

    return `event-${id}`;
  }

  /**
   * Track a chat message event.
   */
  trackChat(data: {
    messageLength: number;
    responseLength: number;
    model: string;
    skill?: string;
    success: boolean;
    latency: number;
  }, sessionId?: string): string {
    return this.track("chat", data, sessionId);
  }

  /**
   * Track a skill load event.
   */
  trackSkillLoad(data: {
    skillName: string;
    loadTime: number;
    success: boolean;
  }, sessionId?: string): string {
    return this.track("skill_load", data, sessionId);
  }

  /**
   * Track a skill use event.
   */
  trackSkillUse(data: {
    skillName: string;
    matchScore: number;
    success: boolean;
  }, sessionId?: string): string {
    return this.track("skill_use", data, sessionId);
  }

  /**
   * Track a tree search event.
   */
  trackTreeSearch(data: {
    query: string;
    resultsCount: number;
    latency: number;
  }, sessionId?: string): string {
    return this.track("tree_search", data, sessionId);
  }

  /**
   * Track a token usage event.
   */
  trackTokenUsage(data: {
    tokensIn: number;
    tokensOut: number;
    model: string;
    taskType: string;
  }, sessionId?: string): string {
    return this.track("token_usage", data, sessionId);
  }

  /**
   * Track an error event.
   */
  trackError(data: {
    errorType: string;
    errorMessage: string;
    stack?: string;
    context?: string;
  }, sessionId?: string): string {
    return this.track("error", data, sessionId);
  }

  /**
   * Track a module install event.
   */
  trackModuleInstall(data: {
    moduleName: string;
    version: string;
    success: boolean;
  }, sessionId?: string): string {
    return this.track("module_install", data, sessionId);
  }

  /**
   * Track a task completion event.
   */
  trackTaskComplete(data: {
    taskType: string;
    success: boolean;
    duration: number;
  }, sessionId?: string): string {
    return this.track("task_complete", data, sessionId);
  }

  // -------------------------------------------------------------------------
  // Event Querying
  // -------------------------------------------------------------------------

  /**
   * Get events matching the given filter.
   */
  getEvents(filter?: EventFilter): AnalyticsEvent[] {
    let query = "SELECT * FROM events WHERE 1=1";
    const params: unknown[] = [];

    if (filter?.types && filter.types.length > 0) {
      const placeholders = filter.types.map(() => "?").join(",");
      query += ` AND type IN (${placeholders})`;
      params.push(...filter.types);
    }

    if (filter?.since !== undefined) {
      query += " AND timestamp >= ?";
      params.push(filter.since);
    }

    if (filter?.until !== undefined) {
      query += " AND timestamp <= ?";
      params.push(filter.until);
    }

    if (filter?.sessionId !== undefined) {
      query += " AND sessionId = ?";
      params.push(filter.sessionId);
    }

    query += " ORDER BY timestamp DESC";

    if (filter?.limit !== undefined) {
      query += " LIMIT ?";
      params.push(filter.limit);
    }

    const rows = this.db.prepare(query).all(...params) as Array<{
      id: number;
      type: string;
      timestamp: number;
      data: string;
      sessionId: string | null;
    }>;

    return rows.map((row): AnalyticsEvent => ({
      id: `event-${row.id}`,
      type: row.type as AnalyticsEventType,
      timestamp: row.timestamp,
      data: JSON.parse(row.data) as Record<string, unknown>,
      ...(row.sessionId !== null ? { sessionId: row.sessionId } : {}),
    }));
  }

  /**
   * Get events for a specific time period.
   */
  getEventsInPeriod(period: TimePeriod): AnalyticsEvent[] {
    return this.getEvents({
      since: period.start,
      until: period.end,
    });
  }

  /**
   * Get events by type.
   */
  getEventsByType(type: AnalyticsEventType, limit?: number): AnalyticsEvent[] {
    return this.getEvents({ types: [type], limit });
  }

  // -------------------------------------------------------------------------
  // Aggregation
  // -------------------------------------------------------------------------

  /**
   * Generate a usage report for a time period.
   */
  aggregate(period: TimePeriod): UsageReport {
    const events = this.getEventsInPeriod(period);

    if (events.length === 0) {
      return this.emptyReport(period);
    }

    // Count by type
    const byType = new Map<AnalyticsEventType, number>();
    // Track skills
    const skills = new Map<string, number>();
    // Track intents
    const intents = new Map<string, number>();
    // Track modules
    const modules = new Map<string, number>();
    // Track errors
    let errorCount = 0;
    const errorTypes = new Map<string, number>();
    // Track tokens
    let tokensUsed = 0;
    let tokensWasted = 0;
    // Track latency
    const latencies: number[] = [];
    // Track active sessions
    const sessions = new Set<string>();
    // Track tasks
    const tasks = new Map<string, number>();

    for (const event of events) {
      // Count by type
      byType.set(event.type, (byType.get(event.type) ?? 0) + 1);

      // Track sessions
      if (event.sessionId) {
        sessions.add(event.sessionId);
      }

      // Type-specific processing
      switch (event.type) {
        case "skill_use": {
          const skillName = event.data.skillName as string | undefined;
          if (skillName) {
            skills.set(skillName, (skills.get(skillName) ?? 0) + 1);
          }
          break;
        }

        case "skill_load": {
          const skillName = event.data.skillName as string | undefined;
          if (skillName) {
            skills.set(skillName, (skills.get(skillName) ?? 0) + 1);
          }
          break;
        }

        case "chat": {
          const intent = event.data.intent as string | undefined;
          if (intent) {
            intents.set(intent, (intents.get(intent) ?? 0) + 1);
          }
          const latency = event.data.latency as number | undefined;
          if (latency !== undefined) {
            latencies.push(latency);
          }
          break;
        }

        case "module_install": {
          const moduleName = event.data.moduleName as string | undefined;
          if (moduleName) {
            modules.set(moduleName, (modules.get(moduleName) ?? 0) + 1);
          }
          break;
        }

        case "error": {
          errorCount++;
          const errorType = event.data.errorType as string | undefined;
          if (errorType) {
            errorTypes.set(errorType, (errorTypes.get(errorType) ?? 0) + 1);
          }
          break;
        }

        case "token_usage": {
          const tokensIn = event.data.tokensIn as number ?? 0;
          const tokensOut = event.data.tokensOut as number ?? 0;
          tokensUsed += tokensIn + tokensOut;

          // Estimate waste (e.g., if failed tasks consumed tokens)
          const success = event.data.success as boolean ?? true;
          if (!success) {
            tokensWasted += tokensIn + tokensOut;
          }
          break;
        }

        case "task_complete": {
          const taskType = event.data.taskType as string | undefined;
          if (taskType) {
            tasks.set(taskType, (tasks.get(taskType) ?? 0) + 1);
          }
          const duration = event.data.duration as number | undefined;
          if (duration !== undefined) {
            latencies.push(duration);
          }
          break;
        }
      }
    }

    // Calculate averages
    const avgLatency = latencies.length > 0
      ? latencies.reduce((a, b) => a + b, 0) / latencies.length
      : 0;

    // Build top lists
    const topSkills = this.buildTopList(skills, 10);
    const topIntents = this.buildTopList(intents, 10);
    const topModules = this.buildTopList(modules, 10);

    // Build task breakdown
    const taskBreakdown: Record<string, number> = {};
    tasks.forEach((count, type) => {
      taskBreakdown[type] = count;
    });

    return {
      period,
      totalRequests: events.length,
      tokensUsed,
      tokensWasted,
      topSkills,
      topIntents,
      topModules,
      errors: errorCount,
      avgLatency,
      activeUsers: sessions.size,
      taskBreakdown,
    };
  }

  // -------------------------------------------------------------------------
  // Maintenance
  // -------------------------------------------------------------------------

  /**
   * Rotate old events (delete events older than retention period).
   */
  rotateOldEvents(): number {
    const cutoff = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;

    const stmt = this.db.prepare("DELETE FROM events WHERE timestamp < ?");
    const result = stmt.run(cutoff);

    return result.changes;
  }

  /**
   * Get event count statistics.
   */
  getStats(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    oldestEvent: number | null;
    newestEvent: number | null;
  } {
    const totalRow = this.db.prepare("SELECT COUNT(*) as count FROM events").get() as { count: number };
    const typeRows = this.db.prepare("SELECT type, COUNT(*) as count FROM events GROUP BY type").all() as Array<{ type: string; count: number }>;
    const oldestRow = this.db.prepare("SELECT MIN(timestamp) as oldest FROM events").get() as { oldest: number | null };
    const newestRow = this.db.prepare("SELECT MAX(timestamp) as newest FROM events").get() as { newest: number | null };

    const eventsByType: Record<string, number> = {};
    for (const row of typeRows) {
      eventsByType[row.type] = row.count;
    }

    return {
      totalEvents: totalRow.count,
      eventsByType,
      oldestEvent: oldestRow.oldest,
      newestEvent: newestRow.newest,
    };
  }

  /**
   * Clear all events.
   */
  clear(): void {
    this.db.prepare("DELETE FROM events").run();
    this.nextId = 0;
  }

  /**
   * Close the database connection.
   */
  close(): void {
    this.db.close();
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private buildTopList(items: Map<string, number>, limit: number): UsageStatistic[] {
    return Array.from(items.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  private emptyReport(period: TimePeriod): UsageReport {
    return {
      period,
      totalRequests: 0,
      tokensUsed: 0,
      tokensWasted: 0,
      topSkills: [],
      topIntents: [],
      topModules: [],
      errors: 0,
      avgLatency: 0,
      activeUsers: 0,
      taskBreakdown: {},
    };
  }
}
