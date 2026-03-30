/**
 * Tests for AnalyticsExporter
 *
 * Tests export to JSON, CSV, and Markdown formats.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { promises as fs } from "fs";
import { AnalyticsCollector } from "../../src/analytics/collector.js";
import { MetricsCalculator } from "../../src/analytics/metrics.js";
import { AnalyticsExporter } from "../../src/analytics/exporter.js";

describe("AnalyticsExporter", () => {
  let collector: AnalyticsCollector;
  let metrics: MetricsCalculator;
  let exporter: AnalyticsExporter;
  let tempDbPath: string;

  beforeEach(() => {
    tempDbPath = join(tmpdir(), `analytics-exporter-test-${Date.now()}.db`);
    collector = new AnalyticsCollector({ dbPath: tempDbPath, retentionDays: 30 });
    metrics = new MetricsCalculator(collector);
    exporter = new AnalyticsExporter(collector, metrics);

    // Add some test data
    collector.trackChat({
      messageLength: 100,
      responseLength: 200,
      model: "claude-3-5-sonnet-20241022",
      skill: "test-skill",
      success: true,
      latency: 500,
    });
    collector.trackSkillUse({ skillName: "skill1", matchScore: 0.9, success: true });
    collector.trackSkillUse({ skillName: "skill1", matchScore: 0.8, success: true });
    collector.trackSkillUse({ skillName: "skill2", matchScore: 0.7, success: true });
    collector.trackError({
      errorType: "ValidationError",
      errorMessage: "Test error",
    });
    collector.trackTokenUsage({
      tokensIn: 1000,
      tokensOut: 500,
      model: "claude-3-5-sonnet-20241022",
      taskType: "chat",
    });
    collector.trackTaskComplete({
      taskType: "code_edit",
      success: true,
      duration: 1000,
    });
  });

  afterEach(async () => {
    collector.close();
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // File might not exist
    }
  });

  describe("exportJSON", () => {
    it("should export as JSON", () => {
      const result = exporter.exportJSON();

      expect(result.format).toBe("json");
      expect(result.content).toBeDefined();
      expect(result.timestamp).toBeDefined();

      const parsed = JSON.parse(result.content);
      expect(parsed.report).toBeDefined();
      expect(parsed.exportedAt).toBeDefined();
    });

    it("should include metrics when requested", () => {
      const result = exporter.exportJSON({ includeMetrics: true });

      const parsed = JSON.parse(result.content);
      expect(parsed.metrics).toBeDefined();
      expect(parsed.metrics.tokens).toBeDefined();
      expect(parsed.metrics.errors).toBeDefined();
    });

    it("should not include metrics by default", () => {
      const result = exporter.exportJSON();

      const parsed = JSON.parse(result.content);
      expect(parsed.metrics).toBeUndefined();
    });
  });

  describe("exportCSV", () => {
    it("should export events as CSV", () => {
      const result = exporter.exportCSV();

      expect(result.format).toBe("csv");
      expect(result.content).toBeDefined();

      const lines = result.content.split("\n");
      expect(lines[0]).toBe("id,type,timestamp,session_id,data");
      expect(lines.length).toBeGreaterThan(1); // Header + at least one event
    });

    it("should properly escape data in CSV", () => {
      collector.trackError({
        errorType: "Test",
        errorMessage: 'Error with "quotes" and, commas',
      });

      const result = exporter.exportCSV();
      const lines = result.content.split("\n");

      // Find the line with the error
      const errorLine = lines.find((line) => line.includes("Error with"));
      expect(errorLine).toBeDefined();
      expect(errorLine).toContain('""');
    });
  });

  describe("exportReportCSV", () => {
    it("should export usage report as CSV", () => {
      const result = exporter.exportReportCSV();

      expect(result.format).toBe("csv");
      expect(result.content).toBeDefined();

      const lines = result.content.split("\n");

      // Check for report sections
      expect(lines.some((line) => line.includes("# Usage Report"))).toBe(true);
      expect(lines.some((line) => line.includes("# Summary"))).toBe(true);
      expect(lines.some((line) => line.includes("# Top Skills"))).toBe(true);
      expect(lines.some((line) => line.includes("Total Requests,"))).toBe(true);
    });
  });

  describe("exportMarkdown", () => {
    it("should export as Markdown", () => {
      const result = exporter.exportMarkdown();

      expect(result.format).toBe("markdown");
      expect(result.content).toBeDefined();

      const lines = result.content.split("\n");

      // Check for markdown structure
      expect(lines[0]).toBe("# Analytics Report");
      expect(lines.some((line) => line.startsWith("## Summary"))).toBe(true);
      expect(lines.some((line) => line.startsWith("| Metric | Value |"))).toBe(true);
    });

    it("should include summary table", () => {
      const result = exporter.exportMarkdown();

      expect(result.content).toContain("| Total Requests |");
      expect(result.content).toContain("| Tokens Used |");
      expect(result.content).toContain("| Errors |");
    });

    it("should include top skills table", () => {
      const result = exporter.exportMarkdown();

      expect(result.content).toContain("## Top Skills");
      expect(result.content).toContain("| Rank | Skill | Count |");
      expect(result.content).toContain("| 1 | skill1 | 2 |");
    });

    it("should include task breakdown table", () => {
      const result = exporter.exportMarkdown();

      expect(result.content).toContain("## Task Breakdown");
      expect(result.content).toContain("| Task Type | Count |");
      expect(result.content).toContain("| code_edit |");
    });

    it("should include metrics when requested", () => {
      const result = exporter.exportMarkdown({ includeMetrics: true });

      expect(result.content).toContain("## Token Metrics");
      expect(result.content).toContain("## Error Breakdown");
    });

    it("should not include metrics by default", () => {
      const result = exporter.exportMarkdown();

      expect(result.content).not.toContain("## Token Metrics");
      expect(result.content).not.toContain("## Error Breakdown");
    });

    it("should include efficiency trend when metrics enabled", () => {
      const result = exporter.exportMarkdown({ includeMetrics: true });

      expect(result.content).toContain("## Efficiency Trend");
    });
  });

  describe("export", () => {
    it("should export in correct format for JSON", () => {
      const result = exporter.export({ format: "json" });
      expect(result.format).toBe("json");

      const parsed = JSON.parse(result.content);
      expect(parsed.report).toBeDefined();
    });

    it("should export in correct format for CSV", () => {
      const result = exporter.export({ format: "csv" });
      expect(result.format).toBe("csv");
      expect(result.content.split("\n")[0]).toBe("id,type,timestamp,session_id,data");
    });

    it("should export in correct format for Markdown", () => {
      const result = exporter.export({ format: "markdown" });
      expect(result.format).toBe("markdown");
      expect(result.content).toContain("# Analytics Report");
    });

    it("should throw error for unsupported format", () => {
      expect(() => {
        exporter.export({ format: "xml" as any });
      }).toThrow("Unsupported export format: xml");
    });

    it("should respect period parameter", () => {
      const now = Date.now();
      const period = {
        start: now - 10000,
        end: now + 1000,
      };

      const result = exporter.export({ format: "json", period });
      expect(result.format).toBe("json");

      const parsed = JSON.parse(result.content);
      expect(parsed.report.period).toEqual(period);
    });

    it("should include metrics when requested", () => {
      const result = exporter.export({
        format: "json",
        includeMetrics: true,
      });

      const parsed = JSON.parse(result.content);
      expect(parsed.metrics).toBeDefined();
    });
  });

  describe("ExportResult", () => {
    it("should include timestamp in result", () => {
      const result = exporter.exportJSON();
      expect(result.timestamp).toBeDefined();

      const timestamp = new Date(result.timestamp);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
      expect(timestamp.getTime()).toBeGreaterThan(Date.now() - 10000); // Within last 10 seconds
    });

    it("should include format in result", () => {
      const jsonResult = exporter.exportJSON();
      expect(jsonResult.format).toBe("json");

      const csvResult = exporter.exportCSV();
      expect(csvResult.format).toBe("csv");

      const mdResult = exporter.exportMarkdown();
      expect(mdResult.format).toBe("markdown");
    });

    it("should include non-empty content", () => {
      const jsonResult = exporter.exportJSON();
      expect(jsonResult.content.length).toBeGreaterThan(0);

      const csvResult = exporter.exportCSV();
      expect(csvResult.content.length).toBeGreaterThan(0);

      const mdResult = exporter.exportMarkdown();
      expect(mdResult.content.length).toBeGreaterThan(0);
    });
  });
});
