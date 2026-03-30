/**
 * TokenTracker — tracks token usage across the bridge for efficiency analysis.
 *
 * Records token consumption per task, module, and skill, providing:
 *   - Total token usage (in/out)
 *   - Per-module and per-skill breakdowns
 *   - Efficiency metrics (successful tokens / total tokens)
 *   - Waste detection (modules using 2x+ average tokens)
 *   - Trend analysis over time
 *
 * Token counting uses the ~4 chars = 1 token heuristic for English text.
 * For more accurate counting, integrate a proper tokenizer when available.
 */

import { promises as fs } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * A single token usage record.
 */
export interface TokenRecord {
  id: string;
  timestamp: string;
  messageType: "user" | "assistant" | "system" | "tool_call" | "tool_result";
  tokensIn: number;
  tokensOut: number;
  model: string;
  module?: string;       // which module handled it
  skill?: string;        // which skill was active
  taskType?: string;     // chat, code_edit, search, publish, etc.
  duration: number;      // ms to process
  success: boolean;
}

/**
 * A test run record for tracking test execution.
 */
export interface TestRunRecord {
  file: string;
  passed: number;
  failed: number;
  total: number;
  duration: number;
  timestamp: string;
}

/**
 * Aggregated token statistics.
 */
export interface TokenStats {
  totalTokensIn: number;
  totalTokensOut: number;
  totalTokens: number;
  avgTokensPerTask: number;
  tasksCompleted: number;
  tasksFailed: number;
  tokensByModule: Record<string, { in: number; out: number; total: number; count: number }>;
  tokensBySkill: Record<string, { in: number; out: number; total: number; count: number }>;
  tokensByTask: Record<string, { in: number; out: number; total: number; count: number }>;
  efficiency: number; // successful_tokens / total_tokens
  topWasters: Array<{ name: string; tokens: number; waste: number; type: "module" | "skill" }>;
  period: { start: string; end: string };
}

/**
 * Efficiency trend data point.
 */
export interface EfficiencyTrendPoint {
  period: string;
  efficiency: number;
  totalTokens: number;
  tasksCompleted: number;
}

/**
 * Waste analysis result.
 */
export interface WasteAnalysis {
  module: string;
  skill: string;
  avgTokens: number;
  tasksAnalyzed: number;
  suggestions: string[];
}

/**
 * Options for TokenTracker construction.
 */
export interface TokenTrackerOptions {
  maxRecords?: number;
}

// ---------------------------------------------------------------------------
// TokenTracker
// ---------------------------------------------------------------------------

/**
 * Tracks and analyzes token usage across the bridge.
 */
export class TokenTracker {
  private records: TokenRecord[] = [];
  private maxRecords: number;
  private nextId = 0;
  private testRuns: TestRunRecord[] = [];

  constructor(options: TokenTrackerOptions = {}) {
    this.maxRecords = options.maxRecords ?? 10000;
  }

  // ---------------------------------------------------------------------------
  // Recording
  // ---------------------------------------------------------------------------

  /**
   * Record a token usage event.
   * @returns The record ID
   */
  record(entry: Omit<TokenRecord, "id" | "timestamp">): string {
    const id = `token-${this.nextId++}`;
    const record: TokenRecord = {
      ...entry,
      id,
      timestamp: new Date().toISOString(),
    };

    this.records.push(record);

    // Keep records under the limit
    if (this.records.length > this.maxRecords) {
      this.records.shift();
    }

    return id;
  }

  /**
   * Estimate token count from text using the ~4 chars = 1 token heuristic.
   * For more accurate results, use a proper tokenizer.
   */
  static estimateTokens(text: string): number {
    if (!text) return 0;
    // Rough approximation: 4 characters ≈ 1 token for English text
    return Math.ceil(text.length / 4);
  }

  /**
   * Record a chat message with automatic token estimation.
   */
  recordChat(params: {
    content: string;
    responseContent: string;
    model: string;
    module?: string;
    skill?: string;
    taskType?: string;
    duration: number;
    success: boolean;
  }): string {
    const tokensIn = TokenTracker.estimateTokens(params.content);
    const tokensOut = TokenTracker.estimateTokens(params.responseContent);

    return this.record({
      messageType: "user",
      tokensIn,
      tokensOut,
      model: params.model,
      module: params.module,
      skill: params.skill,
      taskType: params.taskType ?? "chat",
      duration: params.duration,
      success: params.success,
    });
  }

  /**
   * Record a test run result.
   */
  addTestRun(params: {
    file: string;
    passed: number;
    failed: number;
    total: number;
    duration: number;
  }): void {
    const record: TestRunRecord = {
      file: params.file,
      passed: params.passed,
      failed: params.failed,
      total: params.total,
      duration: params.duration,
      timestamp: new Date().toISOString(),
    };

    this.testRuns.push(record);

    // Keep only the last 100 test runs
    if (this.testRuns.length > 100) {
      this.testRuns.shift();
    }
  }

  /**
   * Get recent test run results.
   */
  getTestRuns(limit: number = 10): TestRunRecord[] {
    return this.testRuns.slice(-limit);
  }

  // ---------------------------------------------------------------------------
  // Query
  // ---------------------------------------------------------------------------

  /**
   * Get aggregated statistics for a time period.
   */
  getStats(since?: Date, until?: Date): TokenStats {
    const filtered = this.filterByDate(since, until);

    if (filtered.length === 0) {
      return this.emptyStats(since, until);
    }

    const totalTokensIn = filtered.reduce((sum, r) => sum + r.tokensIn, 0);
    const totalTokensOut = filtered.reduce((sum, r) => sum + r.tokensOut, 0);
    const totalTokens = totalTokensIn + totalTokensOut;
    const tasksCompleted = filtered.filter((r) => r.success).length;
    const tasksFailed = filtered.filter((r) => !r.success).length;
    const avgTokensPerTask = totalTokens / filtered.length;
    const efficiency = tasksCompleted > 0 ? totalTokens / tasksCompleted : 0;

    const tokensByModule = this.groupBy(filtered, "module");
    const tokensBySkill = this.groupBy(filtered, "skill");
    const tokensByTask = this.groupBy(filtered, "taskType");

    const topWasters = this.findTopWasters(tokensByModule, tokensBySkill, avgTokensPerTask);

    const period = {
      start: since?.toISOString() ?? filtered[0].timestamp,
      end: until?.toISOString() ?? filtered[filtered.length - 1].timestamp,
    };

    return {
      totalTokensIn,
      totalTokensOut,
      totalTokens,
      avgTokensPerTask,
      tasksCompleted,
      tasksFailed,
      tokensByModule,
      tokensBySkill,
      tokensByTask,
      efficiency,
      topWasters,
      period,
    };
  }

  /**
   * Get statistics for a specific task type.
   */
  getStatsByTask(taskType: string, since?: Date): TokenStats {
    const filtered = this.filterByDate(since)
      .filter((r) => r.taskType === taskType);

    if (filtered.length === 0) {
      return this.emptyStats(since);
    }

    const totalTokensIn = filtered.reduce((sum, r) => sum + r.tokensIn, 0);
    const totalTokensOut = filtered.reduce((sum, r) => sum + r.tokensOut, 0);
    const totalTokens = totalTokensIn + totalTokensOut;
    const tasksCompleted = filtered.filter((r) => r.success).length;
    const tasksFailed = filtered.filter((r) => !r.success).length;
    const avgTokensPerTask = totalTokens / filtered.length;
    const efficiency = tasksCompleted > 0 ? totalTokens / tasksCompleted : 0;

    const tokensByModule = this.groupBy(filtered, "module");
    const tokensBySkill = this.groupBy(filtered, "skill");
    const tokensByTask = this.groupBy(filtered, "taskType");

    const topWasters = this.findTopWasters(tokensByModule, tokensBySkill, avgTokensPerTask);

    const period = {
      start: since?.toISOString() ?? filtered[0].timestamp,
      end: filtered[filtered.length - 1].timestamp,
    };

    return {
      totalTokensIn,
      totalTokensOut,
      totalTokens,
      avgTokensPerTask,
      tasksCompleted,
      tasksFailed,
      tokensByModule,
      tokensBySkill,
      tokensByTask,
      efficiency,
      topWasters,
      period,
    };
  }

  /**
   * Get efficiency trend over time.
   * @param buckets Number of time buckets to divide the period into
   */
  getEfficiencyTrend(buckets: number): EfficiencyTrendPoint[] {
    if (this.records.length < 2) {
      return [];
    }

    const sorted = [...this.records].sort((a, b) =>
      new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    const startTime = new Date(sorted[0].timestamp).getTime();
    const endTime = new Date(sorted[sorted.length - 1].timestamp).getTime();
    const bucketSize = Math.max(1, Math.floor((endTime - startTime) / buckets));

    const trend: EfficiencyTrendPoint[] = [];

    for (let i = 0; i < buckets; i++) {
      const bucketStart = startTime + i * bucketSize;
      const bucketEnd = bucketStart + bucketSize;

      const bucketRecords = sorted.filter((r) => {
        const t = new Date(r.timestamp).getTime();
        return t >= bucketStart && t < bucketEnd;
      });

      if (bucketRecords.length === 0) continue;

      const totalTokens = bucketRecords.reduce(
        (sum, r) => sum + r.tokensIn + r.tokensOut,
        0
      );
      const tasksCompleted = bucketRecords.filter((r) => r.success).length;
      const efficiency = tasksCompleted > 0 ? totalTokens / tasksCompleted : 0;

      trend.push({
        period: new Date(bucketStart).toISOString(),
        efficiency,
        totalTokens,
        tasksCompleted,
      });
    }

    return trend;
  }

  // ---------------------------------------------------------------------------
  // Persistence
  // ---------------------------------------------------------------------------

  /**
   * Save records to a JSON file.
   */
  async save(filePath: string): Promise<void> {
    const data = {
      records: this.records,
      savedAt: new Date().toISOString(),
    };
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Load records from a JSON file.
   */
  async load(filePath: string): Promise<void> {
    try {
      const content = await fs.readFile(filePath, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data.records)) {
        this.records = data.records;
        this.nextId = this.records.length;
      }
    } catch (error) {
      throw new Error(`Failed to load token records: ${error}`);
    }
  }

  // ---------------------------------------------------------------------------
  // Analysis
  // ---------------------------------------------------------------------------

  /**
   * Find modules and skills with inefficient token usage.
   */
  findWaste(): WasteAnalysis[] {
    const stats = this.getStats();
    const analyses: WasteAnalysis[] = [];

    // Analyze modules
    for (const [module, data] of Object.entries(stats.tokensByModule)) {
      const avgTokens = data.total / data.count; // Average per task for this module
      const overallAvg = stats.avgTokensPerTask;

      if (avgTokens > overallAvg * 2 && data.total > 1000) {
        analyses.push({
          module,
          skill: "",
          avgTokens,
          tasksAnalyzed: data.count,
          suggestions: this.generateWasteSuggestions(module, avgTokens, overallAvg),
        });
      }
    }

    // Analyze skills
    for (const [skill, data] of Object.entries(stats.tokensBySkill)) {
      const avgTokens = data.total / data.count; // Average per task for this skill
      const overallAvg = stats.avgTokensPerTask;

      if (avgTokens > overallAvg * 2 && data.total > 1000) {
        analyses.push({
          module: "",
          skill,
          avgTokens,
          tasksAnalyzed: data.count,
          suggestions: this.generateWasteSuggestions(skill, avgTokens, overallAvg),
        });
      }
    }

    return analyses.sort((a, b) => b.avgTokens - a.avgTokens);
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private filterByDate(since?: Date, until?: Date): TokenRecord[] {
    let filtered = [...this.records];

    if (since) {
      const sinceTime = since.getTime();
      filtered = filtered.filter((r) => new Date(r.timestamp).getTime() >= sinceTime);
    }

    if (until) {
      const untilTime = until.getTime();
      filtered = filtered.filter((r) => new Date(r.timestamp).getTime() <= untilTime);
    }

    return filtered;
  }

  private groupBy(
    records: TokenRecord[],
    field: "module" | "skill" | "taskType"
  ): Record<string, { in: number; out: number; total: number; count: number }> {
    const result: Record<string, { in: number; out: number; total: number; count: number }> = {};

    for (const record of records) {
      const key = record[field] || "unknown";
      if (!result[key]) {
        result[key] = { in: 0, out: 0, total: 0, count: 0 };
      }
      result[key].in += record.tokensIn;
      result[key].out += record.tokensOut;
      result[key].total += record.tokensIn + record.tokensOut;
      result[key].count += 1;
    }

    return result;
  }

  private findTopWasters(
    byModule: Record<string, { in: number; out: number; total: number; count: number }>,
    bySkill: Record<string, { in: number; out: number; total: number; count: number }>,
    avgTokens: number
  ): Array<{ name: string; tokens: number; waste: number; type: "module" | "skill" }> {
    const wasters: Array<{ name: string; tokens: number; waste: number; type: "module" | "skill" }> = [];

    for (const [name, data] of Object.entries(byModule)) {
      if (data.total > 1000) {
        const expected = avgTokens * data.count;
        const waste = data.total - expected;
        if (waste > 0) {
          wasters.push({ name, tokens: data.total, waste, type: "module" });
        }
      }
    }

    for (const [name, data] of Object.entries(bySkill)) {
      if (data.total > 1000) {
        const expected = avgTokens * data.count;
        const waste = data.total - expected;
        if (waste > 0) {
          wasters.push({ name, tokens: data.total, waste, type: "skill" });
        }
      }
    }

    return wasters.sort((a, b) => b.waste - a.waste).slice(0, 10);
  }

  private generateWasteSuggestions(name: string, avgTokens: number, overallAvg: number): string[] {
    const suggestions: string[] = [];
    const ratio = avgTokens / overallAvg;

    if (ratio > 5) {
      suggestions.push("Token usage is extremely high (>5x average). Consider caching results.");
      suggestions.push("Review prompt templates for redundant context.");
    } else if (ratio > 3) {
      suggestions.push("Token usage is high (>3x average). Optimize prompts.");
      suggestions.push("Consider using smaller models for simpler tasks.");
    } else if (ratio > 2) {
      suggestions.push("Token usage is above average. Review for optimization opportunities.");
    }

    suggestions.push(`Current: ${avgTokens.toFixed(0)} tokens/task vs. ${overallAvg.toFixed(0)} average.`);

    return suggestions;
  }

  private emptyStats(since?: Date, until?: Date): TokenStats {
    return {
      totalTokensIn: 0,
      totalTokensOut: 0,
      totalTokens: 0,
      avgTokensPerTask: 0,
      tasksCompleted: 0,
      tasksFailed: 0,
      tokensByModule: {},
      tokensBySkill: {},
      tokensByTask: {},
      efficiency: 0,
      topWasters: [],
      period: {
        start: since?.toISOString() ?? new Date().toISOString(),
        end: until?.toISOString() ?? new Date().toISOString(),
      },
    };
  }
}
