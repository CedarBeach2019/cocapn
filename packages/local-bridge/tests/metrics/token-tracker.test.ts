/**
 * Tests for TokenTracker
 *
 * Tests token recording, statistics calculation, efficiency trends,
 * waste detection, and persistence.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "fs";
import { join } from "path";
import { TokenTracker } from "../src/metrics/token-tracker.js";
import type { TokenRecord, TokenStats } from "../src/metrics/token-tracker.js";
import { tmpdir } from "os";

describe("TokenTracker", () => {
  let tracker: TokenTracker;
  let tempDir: string;
  let testFilePath: string;

  beforeEach(() => {
    tracker = new TokenTracker({ maxRecords: 100 });
    tempDir = tmpdir();
    testFilePath = join(tempDir, `token-test-${Date.now()}.json`);
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath);
    } catch {
      // File might not exist
    }
  });

  describe("record", () => {
    it("should record a token entry and return an ID", () => {
      const id = tracker.record({
        messageType: "user",
        tokensIn: 100,
        tokensOut: 200,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
        duration: 1000,
        success: true,
      });

      expect(id).toMatch(/^token-\d+$/);
    });

    it("should add timestamp to records", () => {
      const beforeTime = new Date();
      tracker.record({
        messageType: "user",
        tokensIn: 100,
        tokensOut: 200,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
        duration: 1000,
        success: true,
      });
      const afterTime = new Date();

      const stats = tracker.getStats();
      expect(new Date(stats.period.start)).greaterThanOrEqual(beforeTime);
      expect(new Date(stats.period.start)).lessThanOrEqual(afterTime);
    });

    it("should respect maxRecords limit", () => {
      const smallTracker = new TokenTracker({ maxRecords: 5 });

      for (let i = 0; i < 10; i++) {
        smallTracker.record({
          messageType: "user",
          tokensIn: 10,
          tokensOut: 20,
          model: "test",
          taskType: "chat",
          duration: 100,
          success: true,
        });
      }

      const stats = smallTracker.getStats();
      expect(stats.tasksCompleted + stats.tasksFailed).toBe(5);
    });
  });

  describe("recordChat", () => {
    it("should estimate tokens from text content", () => {
      const id = tracker.recordChat({
        content: "This is a test message with some text",
        responseContent: "This is the response content",
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
        duration: 1500,
        success: true,
      });

      expect(id).toMatch(/^token-\d+$/);

      const stats = tracker.getStats();
      expect(stats.totalTokensIn).toBeGreaterThan(0);
      expect(stats.totalTokensOut).toBeGreaterThan(0);
    });

    it("should handle empty content", () => {
      tracker.recordChat({
        content: "",
        responseContent: "",
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
        duration: 100,
        success: true,
      });

      const stats = tracker.getStats();
      expect(stats.totalTokensIn).toBe(0);
      expect(stats.totalTokensOut).toBe(0);
    });
  });

  describe("estimateTokens", () => {
    it("should estimate tokens using ~4 chars per token rule", () => {
      const text = "This is a test message"; // 22 characters
      const tokens = TokenTracker.estimateTokens(text);
      expect(tokens).toBe(Math.ceil(22 / 4)); // 6 tokens
    });

    it("should return 0 for empty string", () => {
      expect(TokenTracker.estimateTokens("")).toBe(0);
    });

    it("should handle longer text", () => {
      const text = "a".repeat(100); // 100 characters
      const tokens = TokenTracker.estimateTokens(text);
      expect(tokens).toBe(25); // 100 / 4 = 25
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      // Add sample data
      tracker.record({
        messageType: "user",
        tokensIn: 100,
        tokensOut: 200,
        model: "claude-3-5-sonnet-20241022",
        module: "chat-module",
        skill: "conversation",
        taskType: "chat",
        duration: 1000,
        success: true,
      });

      tracker.record({
        messageType: "user",
        tokensIn: 150,
        tokensOut: 250,
        model: "claude-3-5-sonnet-20241022",
        module: "search-module",
        taskType: "search",
        duration: 1500,
        success: true,
      });

      tracker.record({
        messageType: "assistant",
        tokensIn: 50,
        tokensOut: 100,
        model: "claude-3-5-sonnet-20241022",
        taskType: "code_edit",
        duration: 500,
        success: false,
      });
    });

    it("should calculate total tokens correctly", () => {
      const stats = tracker.getStats();
      expect(stats.totalTokensIn).toBe(300); // 100 + 150 + 50
      expect(stats.totalTokensOut).toBe(550); // 200 + 250 + 100
      expect(stats.totalTokens).toBe(850);
    });

    it("should calculate task completion stats", () => {
      const stats = tracker.getStats();
      expect(stats.tasksCompleted).toBe(2);
      expect(stats.tasksFailed).toBe(1);
    });

    it("should calculate average tokens per task", () => {
      const stats = tracker.getStats();
      expect(stats.avgTokensPerTask).toBeCloseTo(283.33, 1); // 850 / 3
    });

    it("should group by module", () => {
      const stats = tracker.getStats();
      expect(stats.tokensByModule["chat-module"]).toEqual({
        in: 100,
        out: 200,
        total: 300,
      });
      expect(stats.tokensByModule["search-module"]).toEqual({
        in: 150,
        out: 250,
        total: 400,
      });
    });

    it("should group by skill", () => {
      const stats = tracker.getStats();
      expect(stats.tokensBySkill["conversation"]).toEqual({
        in: 100,
        out: 200,
        total: 300,
      });
    });

    it("should group by task type", () => {
      const stats = tracker.getStats();
      expect(stats.tokensByTask["chat"]).toEqual({
        in: 100,
        out: 200,
        total: 300,
      });
      expect(stats.tokensByTask["search"]).toEqual({
        in: 150,
        out: 250,
        total: 400,
      });
      expect(stats.tokensByTask["code_edit"]).toEqual({
        in: 50,
        out: 100,
        total: 150,
      });
    });

    it("should calculate efficiency", () => {
      const stats = tracker.getStats();
      expect(stats.efficiency).toBeCloseTo(425, 0); // 850 / 2 successful tasks
    });

    it("should filter by date range", () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      const stats = tracker.getStats(yesterday, tomorrow);
      expect(stats.tasksCompleted + stats.tasksFailed).toBe(3);
    });

    it("should return empty stats for no records in range", () => {
      const future = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
      const stats = tracker.getStats(future);

      expect(stats.totalTokens).toBe(0);
      expect(stats.tasksCompleted).toBe(0);
      expect(stats.tasksFailed).toBe(0);
    });
  });

  describe("getStatsByTask", () => {
    beforeEach(() => {
      tracker.record({
        messageType: "user",
        tokensIn: 100,
        tokensOut: 200,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
        duration: 1000,
        success: true,
      });

      tracker.record({
        messageType: "user",
        tokensIn: 150,
        tokensOut: 250,
        model: "claude-3-5-sonnet-20241022",
        taskType: "search",
        duration: 1500,
        success: true,
      });

      tracker.record({
        messageType: "user",
        tokensIn: 120,
        tokensOut: 220,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
        duration: 1200,
        success: true,
      });
    });

    it("should filter by task type", () => {
      const stats = tracker.getStatsByTask("chat");
      expect(stats.totalTokensIn).toBe(220); // 100 + 120
      expect(stats.totalTokensOut).toBe(420); // 200 + 220
      expect(stats.tasksCompleted).toBe(2);
    });

    it("should return empty stats for unknown task type", () => {
      const stats = tracker.getStatsByTask("unknown");
      expect(stats.totalTokens).toBe(0);
      expect(stats.tasksCompleted).toBe(0);
    });
  });

  describe("getEfficiencyTrend", () => {
    beforeEach(() => {
      const now = Date.now();

      // Add records over time
      for (let i = 0; i < 10; i++) {
        tracker.record({
          messageType: "user",
          tokensIn: 100 + i * 10,
          tokensOut: 200 + i * 20,
          model: "claude-3-5-sonnet-20241022",
          taskType: "chat",
          duration: 1000 + i * 100,
          success: i % 2 === 0, // Alternate success
        });
      }
    });

    it("should calculate efficiency trend with default buckets", () => {
      const trend = tracker.getEfficiencyTrend(5);
      expect(trend.length).toBeGreaterThan(0);
      expect(trend.length).toBeLessThanOrEqual(5);
    });

    it("should include period and efficiency data", () => {
      const trend = tracker.getEfficiencyTrend(3);
      expect(trend[0]).toHaveProperty("period");
      expect(trend[0]).toHaveProperty("efficiency");
      expect(trend[0]).toHaveProperty("totalTokens");
      expect(trend[0]).toHaveProperty("tasksCompleted");
    });

    it("should return empty array for insufficient data", () => {
      const emptyTracker = new TokenTracker();
      const trend = emptyTracker.getEfficiencyTrend(10);
      expect(trend).toEqual([]);
    });

    it("should handle more buckets than data points", () => {
      const trend = tracker.getEfficiencyTrend(100);
      expect(trend.length).toBeLessThanOrEqual(100);
    });
  });

  describe("findWaste", () => {
    beforeEach(() => {
      // Efficient module
      for (let i = 0; i < 10; i++) {
        tracker.record({
          messageType: "user",
          tokensIn: 10,
          tokensOut: 20,
          model: "claude-3-5-sonnet-20241022",
          module: "efficient-module",
          taskType: "chat",
          duration: 100,
          success: true,
        });
      }

      // Wasteful module (uses 5x more tokens)
      for (let i = 0; i < 10; i++) {
        tracker.record({
          messageType: "user",
          tokensIn: 50,
          tokensOut: 100,
          model: "claude-3-5-sonnet-20241022",
          module: "wasteful-module",
          taskType: "search",
          duration: 500,
          success: true,
        });
      }

      // Wasteful skill
      for (let i = 0; i < 10; i++) {
        tracker.record({
          messageType: "user",
          tokensIn: 60,
          tokensOut: 120,
          model: "claude-3-5-sonnet-20241022",
          skill: "wasteful-skill",
          taskType: "code_edit",
          duration: 600,
          success: true,
        });
      }
    });

    it("should identify wasteful modules", () => {
      const waste = tracker.findWaste();
      const wastefulModules = waste.filter((w) => w.module === "wasteful-module");

      expect(wastefulModules.length).toBeGreaterThan(0);
      expect(wastefulModules[0].avgTokens).toBeGreaterThan(0);
      expect(wastefulModules[0].suggestions.length).toBeGreaterThan(0);
    });

    it("should identify wasteful skills", () => {
      const waste = tracker.findWaste();
      const wastefulSkills = waste.filter((w) => w.skill === "wasteful-skill");

      expect(wastefulSkills.length).toBeGreaterThan(0);
      expect(wastefulSkills[0].avgTokens).toBeGreaterThan(0);
    });

    it("should provide suggestions for reducing waste", () => {
      const waste = tracker.findWaste();
      const wasteful = waste[0];

      expect(wasteful.suggestions).toBeInstanceOf(Array);
      expect(wasteful.suggestions.length).toBeGreaterThan(0);
      expect(wasteful.suggestions[0]).toMatch(/(token|optimize|cache|reduce)/i);
    });

    it("should sort results by avgTokens descending", () => {
      const waste = tracker.findWaste();
      for (let i = 1; i < waste.length; i++) {
        expect(waste[i - 1].avgTokens).toBeGreaterThanOrEqual(waste[i].avgTokens);
      }
    });

    it("should not flag efficient modules", () => {
      const waste = tracker.findWaste();
      const efficientModules = waste.filter((w) => w.module === "efficient-module");

      expect(efficientModules.length).toBe(0);
    });
  });

  describe("save and load", () => {
    beforeEach(() => {
      tracker.record({
        messageType: "user",
        tokensIn: 100,
        tokensOut: 200,
        model: "claude-3-5-sonnet-20241022",
        module: "test-module",
        taskType: "chat",
        duration: 1000,
        success: true,
      });

      tracker.record({
        messageType: "assistant",
        tokensIn: 50,
        tokensOut: 100,
        model: "claude-3-5-sonnet-20241022",
        taskType: "search",
        duration: 500,
        success: false,
      });
    });

    it("should save records to file", async () => {
      await tracker.save(testFilePath);

      const fileExists = await fs
        .access(testFilePath)
        .then(() => true)
        .catch(() => false);
      expect(fileExists).toBe(true);
    });

    it("should load records from file", async () => {
      await tracker.save(testFilePath);

      const newTracker = new TokenTracker();
      await newTracker.load(testFilePath);

      const originalStats = tracker.getStats();
      const loadedStats = newTracker.getStats();

      expect(loadedStats.totalTokens).toBe(originalStats.totalTokens);
      expect(loadedStats.tasksCompleted).toBe(originalStats.tasksCompleted);
      expect(loadedStats.tasksFailed).toBe(originalStats.tasksFailed);
    });

    it("should preserve record data on load", async () => {
      await tracker.save(testFilePath);

      const newTracker = new TokenTracker();
      await newTracker.load(testFilePath);

      const stats = newTracker.getStats();
      expect(stats.tokensByModule["test-module"]).toEqual({
        in: 100,
        out: 200,
        total: 300,
      });
    });

    it("should throw error for non-existent file", async () => {
      const newTracker = new TokenTracker();

      await expect(newTracker.load("/non/existent/path.json")).rejects.toThrow();
    });

    it("should handle invalid JSON in file", async () => {
      await fs.writeFile(testFilePath, "invalid json", "utf-8");

      const newTracker = new TokenTracker();
      await expect(newTracker.load(testFilePath)).rejects.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle empty tracker", () => {
      const emptyTracker = new TokenTracker();
      const stats = emptyTracker.getStats();

      expect(stats.totalTokens).toBe(0);
      expect(stats.tasksCompleted).toBe(0);
      expect(stats.tasksFailed).toBe(0);
      expect(stats.avgTokensPerTask).toBe(0);
    });

    it("should handle records with undefined optional fields", () => {
      tracker.record({
        messageType: "user",
        tokensIn: 100,
        tokensOut: 200,
        model: "claude-3-5-sonnet-20241022",
        duration: 1000,
        success: true,
        // module, skill, taskType are undefined
      });

      const stats = tracker.getStats();
      expect(stats.tasksCompleted).toBe(1);
      expect(stats.tokensByModule["unknown"]).toBeDefined();
    });

    it("should handle zero token values", () => {
      tracker.record({
        messageType: "user",
        tokensIn: 0,
        tokensOut: 0,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
        duration: 100,
        success: true,
      });

      const stats = tracker.getStats();
      expect(stats.totalTokens).toBe(0);
      expect(stats.avgTokensPerTask).toBe(0);
    });

    it("should handle very large token values", () => {
      tracker.record({
        messageType: "user",
        tokensIn: 1000000,
        tokensOut: 2000000,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
        duration: 60000,
        success: true,
      });

      const stats = tracker.getStats();
      expect(stats.totalTokens).toBe(3000000);
    });
  });

  describe("topWasters", () => {
    beforeEach(() => {
      // Add some records with varying token usage
      for (let i = 0; i < 5; i++) {
        tracker.record({
          messageType: "user",
          tokensIn: 100,
          tokensOut: 200,
          model: "claude-3-5-sonnet-20241022",
          module: `module-${i}`,
          taskType: "chat",
          duration: 1000,
          success: true,
        });
      }

      // Add one very wasteful module
      tracker.record({
        messageType: "user",
        tokensIn: 5000,
        tokensOut: 10000,
        model: "claude-3-5-sonnet-20241022",
        module: "super-wasteful",
        taskType: "search",
        duration: 5000,
        success: true,
      });
    });

    it("should identify top wasters", () => {
      const stats = tracker.getStats();
      expect(stats.topWasters.length).toBeGreaterThan(0);
    });

    it("should include wasteful module at top", () => {
      const stats = tracker.getStats();
      const topWaster = stats.topWasters[0];

      expect(topWaster.name).toBe("super-wasteful");
      expect(topWaster.type).toBe("module");
      expect(topWaster.tokens).toBeGreaterThan(0);
    });

    it("should calculate waste amount", () => {
      const stats = tracker.getStats();
      const topWaster = stats.topWasters[0];

      expect(topWaster.waste).toBeGreaterThan(0);
    });
  });
});
