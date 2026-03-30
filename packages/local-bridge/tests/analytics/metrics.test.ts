/**
 * Tests for MetricsCalculator
 *
 * Tests metrics calculation including token metrics, error rates,
 * efficiency trends, and latency percentiles.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { promises as fs } from "fs";
import { AnalyticsCollector } from "../../src/analytics/collector.js";
import { MetricsCalculator } from "../../src/analytics/metrics.js";

describe("MetricsCalculator", () => {
  let collector: AnalyticsCollector;
  let metrics: MetricsCalculator;
  let tempDbPath: string;

  beforeEach(() => {
    tempDbPath = join(tmpdir(), `analytics-metrics-test-${Date.now()}.db`);
    collector = new AnalyticsCollector({ dbPath: tempDbPath, retentionDays: 30 });
    metrics = new MetricsCalculator(collector);
  });

  afterEach(async () => {
    collector.close();
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // File might not exist
    }
  });

  describe("tokensPerDay", () => {
    it("should calculate tokens per day", () => {
      collector.trackTokenUsage({
        tokensIn: 1000,
        tokensOut: 500,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });
      collector.trackTokenUsage({
        tokensIn: 2000,
        tokensOut: 1000,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });

      const perDay = metrics.tokensPerDay();
      expect(perDay).toBeGreaterThan(0);
    });

    it("should return 0 when no token events", () => {
      const perDay = metrics.tokensPerDay();
      expect(perDay).toBe(0);
    });
  });

  describe("tokensPerTask", () => {
    it("should calculate tokens per task", () => {
      collector.trackTokenUsage({
        tokensIn: 1000,
        tokensOut: 500,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });
      collector.trackTaskComplete({
        taskType: "chat",
        success: true,
        duration: 500,
      });

      const perTask = metrics.tokensPerTask();
      expect(perTask).toBeGreaterThan(0);
    });

    it("should return 0 when no tasks", () => {
      collector.trackTokenUsage({
        tokensIn: 1000,
        tokensOut: 500,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });

      const perTask = metrics.tokensPerTask();
      expect(perTask).toBe(0);
    });
  });

  describe("getTokenMetrics", () => {
    it("should calculate comprehensive token metrics", () => {
      collector.trackTokenUsage({
        tokensIn: 1000,
        tokensOut: 500,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });
      collector.trackTokenUsage({
        tokensIn: 2000,
        tokensOut: 1000,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });
      collector.trackTaskComplete({
        taskType: "chat",
        success: true,
        duration: 500,
      });
      collector.trackTaskComplete({
        taskType: "code_edit",
        success: false,
        duration: 1000,
      });

      const tokenMetrics = metrics.getTokenMetrics();

      expect(tokenMetrics.total).toBe(4500); // 1500 + 3000
      expect(tokenMetrics.perDay).toBeGreaterThan(0);
      expect(tokenMetrics.perTask).toBeGreaterThan(0);
      expect(tokenMetrics.efficiency).toBeGreaterThanOrEqual(0);
      expect(tokenMetrics.efficiency).toBeLessThanOrEqual(1);
    });
  });

  describe("efficiencyTrend", () => {
    it("should calculate efficiency trend over time", () => {
      for (let i = 0; i < 10; i++) {
        collector.trackTokenUsage({
          tokensIn: 1000 + i * 100,
          tokensOut: 500 + i * 50,
          model: "claude-3-5-sonnet-20241022",
          taskType: "chat",
        });
        collector.trackTaskComplete({
          taskType: "chat",
          success: i % 2 === 0, // Half succeed
          duration: 500,
        });
      }

      const trend = metrics.efficiencyTrend(7, 7);

      expect(trend.length).toBeGreaterThan(0);
      expect(trend[0]).toHaveProperty("date");
      expect(trend[0]).toHaveProperty("efficiency");
      expect(trend[0]).toHaveProperty("tokens");
      expect(trend[0]).toHaveProperty("tasks");
    });

    it("should return empty array when no events", () => {
      const trend = metrics.efficiencyTrend(7, 7);
      expect(trend).toHaveLength(0);
    });
  });

  describe("errorRate", () => {
    it("should calculate error rate", () => {
      collector.trackError({
        errorType: "ValidationError",
        errorMessage: "Test error 1",
      });
      collector.trackError({
        errorType: "RuntimeError",
        errorMessage: "Test error 2",
      });
      collector.trackChat({
        messageLength: 100,
        responseLength: 200,
        model: "claude-3-5-sonnet-20241022",
        success: true,
        latency: 500,
      });
      collector.trackChat({
        messageLength: 150,
        responseLength: 250,
        model: "claude-3-5-sonnet-20241022",
        success: true,
        latency: 600,
      });
      collector.trackChat({
        messageLength: 200,
        responseLength: 300,
        model: "claude-3-5-sonnet-20241022",
        success: true,
        latency: 700,
      });

      const rate = metrics.errorRate();
      expect(rate).toBe(0.4); // 2 errors / 5 total events
    });

    it("should return 0 when no events", () => {
      const rate = metrics.errorRate();
      expect(rate).toBe(0);
    });
  });

  describe("getErrorMetrics", () => {
    it("should calculate comprehensive error metrics", () => {
      collector.trackError({
        errorType: "ValidationError",
        errorMessage: "Test error 1",
      });
      collector.trackError({
        errorType: "ValidationError",
        errorMessage: "Test error 2",
      });
      collector.trackError({
        errorType: "RuntimeError",
        errorMessage: "Test error 3",
      });
      collector.trackChat({
        messageLength: 100,
        responseLength: 200,
        model: "claude-3-5-sonnet-20241022",
        success: true,
        latency: 500,
      });

      const errorMetrics = metrics.getErrorMetrics();

      expect(errorMetrics.totalErrors).toBe(3);
      expect(errorMetrics.totalRequests).toBe(4);
      expect(errorMetrics.rate).toBe(0.75);
      expect(errorMetrics.byType.ValidationError).toBe(2);
      expect(errorMetrics.byType.RuntimeError).toBe(1);
    });
  });

  describe("topSkills", () => {
    it("should return top used skills", () => {
      collector.trackSkillUse({ skillName: "skill1", matchScore: 0.9, success: true });
      collector.trackSkillUse({ skillName: "skill1", matchScore: 0.8, success: true });
      collector.trackSkillUse({ skillName: "skill1", matchScore: 0.7, success: true });
      collector.trackSkillUse({ skillName: "skill2", matchScore: 0.9, success: true });
      collector.trackSkillUse({ skillName: "skill2", matchScore: 0.8, success: true });
      collector.trackSkillUse({ skillName: "skill3", matchScore: 0.9, success: true });

      const topSkills = metrics.topSkills(10);

      expect(topSkills).toHaveLength(3);
      expect(topSkills[0].name).toBe("skill1");
      expect(topSkills[0].count).toBe(3);
      expect(topSkills[1].name).toBe("skill2");
      expect(topSkills[1].count).toBe(2);
      expect(topSkills[2].name).toBe("skill3");
      expect(topSkills[2].count).toBe(1);
    });

    it("should respect count limit", () => {
      collector.trackSkillUse({ skillName: "skill1", matchScore: 0.9, success: true });
      collector.trackSkillUse({ skillName: "skill2", matchScore: 0.8, success: true });
      collector.trackSkillUse({ skillName: "skill3", matchScore: 0.7, success: true });

      const topSkills = metrics.topSkills(2);

      expect(topSkills).toHaveLength(2);
    });

    it("should return empty array when no skills", () => {
      const topSkills = metrics.topSkills();
      expect(topSkills).toHaveLength(0);
    });
  });

  describe("topIntents", () => {
    it("should return top matched intents", () => {
      collector.trackChat({
        messageLength: 100,
        responseLength: 200,
        model: "claude-3-5-sonnet-20241022",
        intent: "code.edit",
        success: true,
        latency: 500,
      });
      collector.trackChat({
        messageLength: 150,
        responseLength: 250,
        model: "claude-3-5-sonnet-20241022",
        intent: "code.edit",
        success: true,
        latency: 600,
      });
      collector.trackChat({
        messageLength: 200,
        responseLength: 300,
        model: "claude-3-5-sonnet-20241022",
        intent: "chat.general",
        success: true,
        latency: 700,
      });

      const topIntents = metrics.topIntents();

      expect(topIntents).toHaveLength(2);
      expect(topIntents[0].name).toBe("code.edit");
      expect(topIntents[0].count).toBe(2);
    });
  });

  describe("topModules", () => {
    it("should return top used modules", () => {
      collector.trackModuleInstall({
        moduleName: "module1",
        version: "1.0.0",
        success: true,
      });
      collector.trackModuleInstall({
        moduleName: "module1",
        version: "1.0.1",
        success: true,
      });
      collector.trackModuleInstall({
        moduleName: "module2",
        version: "1.0.0",
        success: true,
      });

      const topModules = metrics.topModules();

      expect(topModules).toHaveLength(2);
      expect(topModules[0].name).toBe("module1");
      expect(topModules[0].count).toBe(2);
    });
  });

  describe("getTopItems", () => {
    it("should return all top items", () => {
      collector.trackSkillUse({ skillName: "skill1", matchScore: 0.9, success: true });
      collector.trackChat({
        messageLength: 100,
        responseLength: 200,
        model: "claude-3-5-sonnet-20241022",
        intent: "code.edit",
        success: true,
        latency: 500,
      });
      collector.trackModuleInstall({
        moduleName: "module1",
        version: "1.0.0",
        success: true,
      });

      const topItems = metrics.getTopItems();

      expect(topItems.skills.length).toBeGreaterThan(0);
      expect(topItems.intents.length).toBeGreaterThan(0);
      expect(topItems.modules.length).toBeGreaterThan(0);
    });
  });

  describe("latencyPercentile", () => {
    it("should calculate latency percentile", () => {
      const latencies = [100, 200, 300, 400, 500];
      for (const latency of latencies) {
        collector.trackChat({
          messageLength: 100,
          responseLength: 200,
          model: "claude-3-5-sonnet-20241022",
          success: true,
          latency,
        });
      }

      // First check that we have the right number of events
      const events = collector.getEventsByType("chat");
      expect(events.length).toBeGreaterThanOrEqual(5);

      const p50 = metrics.latencyPercentile(50);
      const p95 = metrics.latencyPercentile(95);
      const p99 = metrics.latencyPercentile(99);

      expect(p50).toBeGreaterThan(0);
      expect(p95).toBeGreaterThan(p50);
      expect(p99).toBeGreaterThan(p95);
    });

    it("should return 0 when no latency events", () => {
      const percentile = metrics.latencyPercentile(50);
      expect(percentile).toBe(0);
    });
  });

  describe("getLatencyMetrics", () => {
    it("should calculate comprehensive latency metrics", () => {
      const latencies = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
      for (const latency of latencies) {
        collector.trackChat({
          messageLength: 100,
          responseLength: 200,
          model: "claude-3-5-sonnet-20241022",
          success: true,
          latency,
        });
      }

      const latencyMetrics = metrics.getLatencyMetrics();

      expect(latencyMetrics.min).toBe(100);
      expect(latencyMetrics.max).toBe(1000);
      expect(latencyMetrics.avg).toBeGreaterThan(0);
      expect(latencyMetrics.p50).toBeCloseTo(550, 0); // Linear interpolation: 500 + 0.5*(600-500) = 550
      expect(latencyMetrics.p95).toBeCloseTo(955, 0); // Linear interpolation: 900 + 0.55*(1000-900) = 955
      expect(latencyMetrics.p99).toBeCloseTo(991, 0); // Linear interpolation: 900 + 0.91*(1000-900) = 991
    });

    it("should return zeros when no latency events", () => {
      const latencyMetrics = metrics.getLatencyMetrics();

      expect(latencyMetrics.avg).toBe(0);
      expect(latencyMetrics.p50).toBe(0);
      expect(latencyMetrics.p95).toBe(0);
      expect(latencyMetrics.p99).toBe(0);
      expect(latencyMetrics.min).toBe(0);
      expect(latencyMetrics.max).toBe(0);
    });
  });

  describe("getSummary", () => {
    it("should return comprehensive summary", () => {
      collector.trackTokenUsage({
        tokensIn: 1000,
        tokensOut: 500,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });
      collector.trackSkillUse({ skillName: "skill1", matchScore: 0.9, success: true });
      collector.trackChat({
        messageLength: 100,
        responseLength: 200,
        model: "claude-3-5-sonnet-20241022",
        success: true,
        latency: 500,
      });
      collector.trackError({
        errorType: "ValidationError",
        errorMessage: "Test error",
      });

      const summary = metrics.getSummary();

      expect(summary.tokens).toBeDefined();
      expect(summary.errors).toBeDefined();
      expect(summary.latency).toBeDefined();
      expect(summary.topItems).toBeDefined();
      expect(summary.efficiencyTrend).toBeDefined();
    });
  });
});
