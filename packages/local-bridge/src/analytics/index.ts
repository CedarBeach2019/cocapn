/**
 * Analytics Module — event tracking, metrics, and exports.
 *
 * Main entry point for the analytics system.
 *
 * Example usage:
 * ```ts
 * import { Analytics } from "./analytics/index.js";
 *
 * const analytics = new Analytics({ dbPath: "./analytics.db" });
 *
 * // Track events
 * analytics.track("chat", { messageLength: 100, success: true });
 *
 * // Get metrics
 * const summary = analytics.getSummary();
 *
 * // Export data
 * const report = analytics.exportMarkdown();
 * ```
 */

// Re-export all public APIs
export type {
  AnalyticsEventType,
  AnalyticsEvent,
  EventFilter,
  TimePeriod,
  UsageReport,
  UsageStatistic,
  TokenMetrics,
  EfficiencyTrendPoint,
  ErrorMetrics,
  LatencyMetrics,
  TopItems,
  ExportFormat,
  ExportOptions,
  ExportResult,
} from "./types.js";

export { AnalyticsCollector, type CollectorOptions } from "./collector.js";
export { MetricsCalculator } from "./metrics.js";
export { AnalyticsExporter } from "./exporter.js";

import { AnalyticsCollector, type CollectorOptions } from "./collector.js";
import { MetricsCalculator } from "./metrics.js";
import { AnalyticsExporter } from "./exporter.js";
import type {
  TimePeriod,
  ExportOptions,
  ExportResult,
  ExportFormat,
} from "./types.js";

/**
 * Main Analytics class — combines collector, metrics, and exporter.
 */
export class Analytics {
  public readonly collector: AnalyticsCollector;
  public readonly metrics: MetricsCalculator;
  public readonly exporter: AnalyticsExporter;

  constructor(options: CollectorOptions = {}) {
    this.collector = new AnalyticsCollector(options);
    this.metrics = new MetricsCalculator(this.collector);
    this.exporter = new AnalyticsExporter(this.collector, this.metrics);
  }

  /**
   * Track an analytics event (delegates to collector).
   */
  track(type: string, data: Record<string, unknown>, sessionId?: string): string {
    return this.collector.track(type as any, data, sessionId);
  }

  /**
   * Get a summary of all metrics.
   */
  getSummary(period?: TimePeriod) {
    return this.metrics.getSummary(period);
  }

  /**
   * Export analytics data.
   */
  export(options: ExportOptions): ExportResult {
    return this.exporter.export(options);
  }

  /**
   * Export as JSON.
   */
  exportJSON(period?: TimePeriod): string {
    const options: ExportOptions = { format: "json" };
    if (period !== undefined) {
      options.period = period;
    }
    return this.exporter.exportJSON(options).content;
  }

  /**
   * Export as CSV.
   */
  exportCSV(period?: TimePeriod): string {
    const options: ExportOptions = { format: "csv" };
    if (period !== undefined) {
      options.period = period;
    }
    return this.exporter.exportCSV(options).content;
  }

  /**
   * Export as Markdown.
   */
  exportMarkdown(period?: TimePeriod): string {
    const options: ExportOptions = { format: "markdown" };
    if (period !== undefined) {
      options.period = period;
    }
    return this.exporter.exportMarkdown(options).content;
  }

  /**
   * Close the analytics system.
   */
  close(): void {
    this.collector.close();
  }

  /**
   * Rotate old events.
   */
  rotateOldEvents(): number {
    return this.collector.rotateOldEvents();
  }
}
