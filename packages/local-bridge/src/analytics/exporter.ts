/**
 * Analytics Exporter — exports analytics data in multiple formats.
 *
 * Supports JSON, CSV, and Markdown export formats for reports and
 * integration with external tools.
 */

import type {
  ExportFormat,
  ExportOptions,
  ExportResult,
  TimePeriod,
  UsageReport,
} from "./types.js";
import { AnalyticsCollector } from "./collector.js";
import { MetricsCalculator } from "./metrics.js";

// ---------------------------------------------------------------------------
// AnalyticsExporter
// ---------------------------------------------------------------------------

/**
 * Exports analytics data in various formats.
 */
export class AnalyticsExporter {
  constructor(
    private collector: AnalyticsCollector,
    private metrics: MetricsCalculator,
  ) {}

  // -------------------------------------------------------------------------
  // JSON Export
  // -------------------------------------------------------------------------

  /**
   * Export analytics data as JSON.
   */
  exportJSON(options: ExportOptions = { format: "json" }): ExportResult {
    const period = options.period ?? this.getDefaultPeriod();

    const report = this.collector.aggregate(period);

    let data: Record<string, unknown>;

    if (options.includeMetrics) {
      const metrics = this.metrics.getSummary(period);

      data = {
        report,
        metrics: {
          tokens: metrics.tokens,
          errors: metrics.errors,
          latency: metrics.latency,
          topItems: metrics.topItems,
        },
        exportedAt: new Date().toISOString(),
      };
    } else {
      data = {
        report,
        exportedAt: new Date().toISOString(),
      };
    }

    return {
      format: "json",
      content: JSON.stringify(data, null, 2),
      timestamp: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // CSV Export
  // -------------------------------------------------------------------------

  /**
   * Export analytics data as CSV.
   */
  exportCSV(options: ExportOptions = { format: "csv" }): ExportResult {
    const period = options.period ?? this.getDefaultPeriod();
    const events = this.collector.getEventsInPeriod(period);

    // CSV header
    const header = "id,type,timestamp,session_id,data\n";

    // Convert events to CSV rows
    const rows = events.map((event) => {
      const dataJson = JSON.stringify(event.data).replace(/"/g, '""');
      return [
        event.id,
        event.type,
        event.timestamp,
        event.sessionId ?? "",
        `"${dataJson}"`,
      ].join(",");
    });

    const content = header + rows.join("\n");

    return {
      format: "csv",
      content,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Export usage report as CSV.
   */
  exportReportCSV(options: ExportOptions = { format: "csv" }): ExportResult {
    const period = options.period ?? this.getDefaultPeriod();
    const report = this.collector.aggregate(period);

    const lines: string[] = [];

    // Report metadata
    lines.push("# Usage Report");
    lines.push(`Period Start,${new Date(period.start).toISOString()}`);
    lines.push(`Period End,${new Date(period.end).toISOString()}`);
    lines.push("");

    // Summary stats
    lines.push("# Summary");
    lines.push(`Total Requests,${report.totalRequests}`);
    lines.push(`Tokens Used,${report.tokensUsed}`);
    lines.push(`Tokens Wasted,${report.tokensWasted}`);
    lines.push(`Errors,${report.errors}`);
    lines.push(`Average Latency,${report.avgLatency.toFixed(2)}`);
    lines.push(`Active Users,${report.activeUsers}`);
    lines.push("");

    // Top skills
    lines.push("# Top Skills");
    lines.push("Skill,Count");
    for (const skill of report.topSkills) {
      lines.push(`${skill.name},${skill.count}`);
    }
    lines.push("");

    // Top intents
    lines.push("# Top Intents");
    lines.push("Intent,Count");
    for (const intent of report.topIntents) {
      lines.push(`${intent.name},${intent.count}`);
    }
    lines.push("");

    // Top modules
    lines.push("# Top Modules");
    lines.push("Module,Count");
    for (const module of report.topModules) {
      lines.push(`${module.name},${module.count}`);
    }
    lines.push("");

    // Task breakdown
    lines.push("# Task Breakdown");
    lines.push("Task Type,Count");
    for (const [taskType, count] of Object.entries(report.taskBreakdown)) {
      lines.push(`${taskType},${count}`);
    }

    return {
      format: "csv",
      content: lines.join("\n"),
      timestamp: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Markdown Export
  // -------------------------------------------------------------------------

  /**
   * Export analytics data as Markdown (suitable for GitHub/wiki).
   */
  exportMarkdown(options: ExportOptions = { format: "markdown" }): ExportResult {
    const period = options.period ?? this.getDefaultPeriod();
    const report = this.collector.aggregate(period);

    const lines: string[] = [];

    // Title
    lines.push("# Analytics Report");
    lines.push("");
    lines.push(`**Period:** ${new Date(period.start).toISOString()} - ${new Date(period.end).toISOString()}`);
    lines.push(`**Generated:** ${new Date().toISOString()}`);
    lines.push("");

    // Summary
    lines.push("## Summary");
    lines.push("");
    lines.push("| Metric | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Total Requests | ${report.totalRequests.toLocaleString()} |`);
    lines.push(`| Tokens Used | ${report.tokensUsed.toLocaleString()} |`);
    lines.push(`| Tokens Wasted | ${report.tokensWasted.toLocaleString()} |`);
    lines.push(`| Errors | ${report.errors.toLocaleString()} |`);
    lines.push(`| Average Latency | ${report.avgLatency.toFixed(2)} ms |`);
    lines.push(`| Active Users | ${report.activeUsers.toLocaleString()} |`);
    lines.push("");

    // Token metrics
    if (options.includeMetrics) {
      const tokenMetrics = this.metrics.getTokenMetrics(period);
      lines.push("## Token Metrics");
      lines.push("");
      lines.push("| Metric | Value |");
      lines.push("|--------|-------|");
      lines.push(`| Per Day | ${tokenMetrics.perDay.toLocaleString()} |`);
      lines.push(`| Per Task | ${tokenMetrics.perTask.toLocaleString()} |`);
      lines.push(`| Total | ${tokenMetrics.total.toLocaleString()} |`);
      lines.push(`| Efficiency | ${(tokenMetrics.efficiency * 100).toFixed(1)}% |`);
      lines.push("");
    }

    // Top Skills
    if (report.topSkills.length > 0) {
      lines.push("## Top Skills");
      lines.push("");
      lines.push("| Rank | Skill | Count |");
      lines.push("|------|-------|-------|");
      report.topSkills.forEach((skill, i) => {
        lines.push(`| ${i + 1} | ${skill.name} | ${skill.count.toLocaleString()} |`);
      });
      lines.push("");
    }

    // Top Intents
    if (report.topIntents.length > 0) {
      lines.push("## Top Intents");
      lines.push("");
      lines.push("| Rank | Intent | Count |");
      lines.push("|------|--------|-------|");
      report.topIntents.forEach((intent, i) => {
        lines.push(`| ${i + 1} | ${intent.name} | ${intent.count.toLocaleString()} |`);
      });
      lines.push("");
    }

    // Top Modules
    if (report.topModules.length > 0) {
      lines.push("## Top Modules");
      lines.push("");
      lines.push("| Rank | Module | Count |");
      lines.push("|------|--------|-------|");
      report.topModules.forEach((module, i) => {
        lines.push(`| ${i + 1} | ${module.name} | ${module.count.toLocaleString()} |`);
      });
      lines.push("");
    }

    // Task Breakdown
    if (Object.keys(report.taskBreakdown).length > 0) {
      lines.push("## Task Breakdown");
      lines.push("");
      lines.push("| Task Type | Count |");
      lines.push("|-----------|-------|");
      const sortedTasks = Object.entries(report.taskBreakdown)
        .sort(([, a], [, b]) => b - a);
      for (const [taskType, count] of sortedTasks) {
        lines.push(`| ${taskType} | ${count.toLocaleString()} |`);
      }
      lines.push("");
    }

    // Error breakdown
    if (options.includeMetrics && report.errors > 0) {
      const errorMetrics = this.metrics.getErrorMetrics(period);
      lines.push("## Error Breakdown");
      lines.push("");
      lines.push(`**Error Rate:** ${(errorMetrics.rate * 100).toFixed(2)}%`);
      lines.push("");
      lines.push("| Error Type | Count |");
      lines.push("|------------|-------|");
      for (const [errorType, count] of Object.entries(errorMetrics.byType)) {
        lines.push(`| ${errorType} | ${count.toLocaleString()} |`);
      }
      lines.push("");
    }

    // Efficiency trend
    if (options.includeMetrics) {
      const trend = this.metrics.efficiencyTrend(7, 7);
      if (trend.length > 0) {
        lines.push("## Efficiency Trend (7 Days)");
        lines.push("");
        lines.push("| Date | Efficiency | Tokens | Tasks |");
        lines.push("|------|------------|--------|-------|");
        for (const point of trend) {
          lines.push(`| ${point.date} | ${(point.efficiency * 100).toFixed(1)}% | ${point.tokens.toLocaleString()} | ${point.tasks} |`);
        }
        lines.push("");
      }
    }

    return {
      format: "markdown",
      content: lines.join("\n"),
      timestamp: new Date().toISOString(),
    };
  }

  // -------------------------------------------------------------------------
  // Generic Export
  // -------------------------------------------------------------------------

  /**
   * Export in the specified format.
   */
  export(options: ExportOptions): ExportResult {
    switch (options.format) {
      case "json":
        return this.exportJSON(options);
      case "csv":
        return this.exportCSV(options);
      case "markdown":
        return this.exportMarkdown(options);
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }

  // -------------------------------------------------------------------------
  // Private Helpers
  // -------------------------------------------------------------------------

  private getDefaultPeriod(): TimePeriod {
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
      start: sevenDaysAgo,
      end: now,
    };
  }
}
