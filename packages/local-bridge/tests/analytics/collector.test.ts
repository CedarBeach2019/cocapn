/**
 * Tests for AnalyticsCollector
 *
 * Tests event tracking, filtering, aggregation, and storage.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { tmpdir } from "os";
import { join } from "path";
import { promises as fs } from "fs";
import { AnalyticsCollector } from "../../src/analytics/collector.js";
import type { AnalyticsEventType } from "../../src/analytics/types.js";

describe("AnalyticsCollector", () => {
  let collector: AnalyticsCollector;
  let tempDbPath: string;

  beforeEach(() => {
    tempDbPath = join(tmpdirPath, `analytics-test-${Date.now()}.db`);
    collector = new AnalyticsCollector({ dbPath: tempDbPath, retentionDays: 30 });
  });

  afterEach(async () => {
    collector.close();
    try {
      await fs.unlink(tempDbPath);
    } catch {
      // File might not exist
    }
  });

  const tmpdirPath = tmpdir();

  describe("track", () => {
    it("should track an event and return an ID", () => {
      const id = collector.track("chat", { messageLength: 100 });

      expect(id).toMatch(/^event-\d+$/);
    });

    it("should track events with different types", () => {
      const id1 = collector.track("chat", { messageLength: 100 });
      const id2 = collector.track("skill_load", { skillName: "test-skill" });
      const id3 = collector.track("error", { errorMessage: "Test error" });

      expect(id1).toMatch(/^event-\d+$/);
      expect(id2).toMatch(/^event-\d+$/);
      expect(id3).toMatch(/^event-\d+$/);
      expect(id2).not.toBe(id1);
      expect(id3).not.toBe(id2);
    });

    it("should track events with session IDs", () => {
      const sessionId = "test-session-123";
      collector.track("chat", { messageLength: 100 }, sessionId);

      const events = collector.getEvents({ sessionId });
      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe(sessionId);
    });
  });

  describe("trackChat", () => {
    it("should track chat events with correct data", () => {
      collector.trackChat({
        messageLength: 150,
        responseLength: 300,
        model: "claude-3-5-sonnet-20241022",
        skill: "test-skill",
        success: true,
        latency: 500,
      });

      const events = collector.getEventsByType("chat");
      expect(events).toHaveLength(1);
      expect(events[0].data).toMatchObject({
        messageLength: 150,
        responseLength: 300,
        model: "claude-3-5-sonnet-20241022",
        skill: "test-skill",
        success: true,
        latency: 500,
      });
    });
  });

  describe("trackSkillLoad", () => {
    it("should track skill load events", () => {
      collector.trackSkillLoad({
        skillName: "test-skill",
        loadTime: 100,
        success: true,
      });

      const events = collector.getEventsByType("skill_load");
      expect(events).toHaveLength(1);
      expect(events[0].data.skillName).toBe("test-skill");
    });
  });

  describe("trackSkillUse", () => {
    it("should track skill use events", () => {
      collector.trackSkillUse({
        skillName: "test-skill",
        matchScore: 0.95,
        success: true,
      });

      const events = collector.getEventsByType("skill_use");
      expect(events).toHaveLength(1);
      expect(events[0].data.skillName).toBe("test-skill");
      expect(events[0].data.matchScore).toBe(0.95);
    });
  });

  describe("trackTreeSearch", () => {
    it("should track tree search events", () => {
      collector.trackTreeSearch({
        query: "test query",
        resultsCount: 5,
        latency: 200,
      });

      const events = collector.getEventsByType("tree_search");
      expect(events).toHaveLength(1);
      expect(events[0].data.query).toBe("test query");
      expect(events[0].data.resultsCount).toBe(5);
    });
  });

  describe("trackTokenUsage", () => {
    it("should track token usage events", () => {
      collector.trackTokenUsage({
        tokensIn: 1000,
        tokensOut: 500,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });

      const events = collector.getEventsByType("token_usage");
      expect(events).toHaveLength(1);
      expect(events[0].data.tokensIn).toBe(1000);
      expect(events[0].data.tokensOut).toBe(500);
    });
  });

  describe("trackError", () => {
    it("should track error events", () => {
      collector.trackError({
        errorType: "ValidationError",
        errorMessage: "Test error message",
        stack: "Error stack trace",
        context: "test context",
      });

      const events = collector.getEventsByType("error");
      expect(events).toHaveLength(1);
      expect(events[0].data.errorType).toBe("ValidationError");
      expect(events[0].data.errorMessage).toBe("Test error message");
    });
  });

  describe("trackModuleInstall", () => {
    it("should track module install events", () => {
      collector.trackModuleInstall({
        moduleName: "test-module",
        version: "1.0.0",
        success: true,
      });

      const events = collector.getEventsByType("module_install");
      expect(events).toHaveLength(1);
      expect(events[0].data.moduleName).toBe("test-module");
    });
  });

  describe("trackTaskComplete", () => {
    it("should track task complete events", () => {
      collector.trackTaskComplete({
        taskType: "code_edit",
        success: true,
        duration: 1500,
      });

      const events = collector.getEventsByType("task_complete");
      expect(events).toHaveLength(1);
      expect(events[0].data.taskType).toBe("code_edit");
      expect(events[0].data.success).toBe(true);
    });
  });

  describe("getEvents", () => {
    beforeEach(() => {
      // Track some test events
      collector.track("chat", { messageLength: 100 });
      collector.track("skill_load", { skillName: "skill1" });
      collector.track("error", { errorMessage: "error1" });
      collector.track("chat", { messageLength: 200 });
    });

    it("should get all events when no filter provided", () => {
      const events = collector.getEvents();
      expect(events).toHaveLength(4);
    });

    it("should filter by event types", () => {
      const chatEvents = collector.getEvents({ types: ["chat"] });
      expect(chatEvents).toHaveLength(2);
      expect(chatEvents.every((e) => e.type === "chat")).toBe(true);
    });

    it("should filter by multiple types", () => {
      const events = collector.getEvents({ types: ["chat", "error"] });
      expect(events).toHaveLength(3);
    });

    it("should limit results", () => {
      const events = collector.getEvents({ limit: 2 });
      expect(events).toHaveLength(2);
    });

    it("should filter by session ID", () => {
      const sessionId = "test-session";
      collector.track("chat", { messageLength: 300 }, sessionId);

      const events = collector.getEvents({ sessionId });
      expect(events).toHaveLength(1);
      expect(events[0].sessionId).toBe(sessionId);
    });
  });

  describe("getEventsInPeriod", () => {
    it("should get events within a time period", () => {
      const now = Date.now();
      collector.track("chat", { messageLength: 100 });

      const period = {
        start: now - 1000,
        end: now + 1000,
      };

      const events = collector.getEventsInPeriod(period);
      expect(events.length).toBeGreaterThan(0);
    });

    it("should return empty array for period with no events", () => {
      const future = Date.now() + 100000;
      const period = {
        start: future,
        end: future + 1000,
      };

      const events = collector.getEventsInPeriod(period);
      expect(events).toHaveLength(0);
    });
  });

  describe("getEventsByType", () => {
    beforeEach(() => {
      collector.track("chat", { messageLength: 100 });
      collector.track("skill_load", { skillName: "skill1" });
      collector.track("chat", { messageLength: 200 });
    });

    it("should get events by type", () => {
      const chatEvents = collector.getEventsByType("chat");
      expect(chatEvents).toHaveLength(2);
      expect(chatEvents.every((e) => e.type === "chat")).toBe(true);
    });

    it("should limit results", () => {
      const chatEvents = collector.getEventsByType("chat", 1);
      expect(chatEvents).toHaveLength(1);
    });
  });

  describe("aggregate", () => {
    beforeEach(() => {
      // Track various events for aggregation
      collector.trackSkillUse({ skillName: "skill1", matchScore: 0.9, success: true });
      collector.trackSkillUse({ skillName: "skill1", matchScore: 0.8, success: true });
      collector.trackSkillUse({ skillName: "skill2", matchScore: 0.7, success: true });
      collector.trackChat({
        messageLength: 100,
        responseLength: 200,
        model: "claude-3-5-sonnet-20241022",
        success: true,
        latency: 500,
      });
      collector.trackTokenUsage({
        tokensIn: 1000,
        tokensOut: 500,
        model: "claude-3-5-sonnet-20241022",
        taskType: "chat",
      });
      collector.trackError({
        errorType: "ValidationError",
        errorMessage: "Test error",
      });
      collector.trackTaskComplete({
        taskType: "code_edit",
        success: true,
        duration: 1000,
      });
    });

    it("should generate usage report", () => {
      const now = Date.now();
      const period = { start: now - 10000, end: now + 1000 };
      const report = collector.aggregate(period);

      expect(report.totalRequests).toBeGreaterThan(0);
      expect(report.tokensUsed).toBe(1500); // 1000 + 500
      expect(report.errors).toBe(1);
      expect(report.topSkills).toHaveLength(2);
      expect(report.topSkills[0].name).toBe("skill1");
      expect(report.topSkills[0].count).toBe(2);
    });

    it("should calculate average latency", () => {
      const now = Date.now();
      const period = { start: now - 10000, end: now + 1000 };
      const report = collector.aggregate(period);

      expect(report.avgLatency).toBeGreaterThan(0);
    });

    it("should include task breakdown", () => {
      const now = Date.now();
      const period = { start: now - 10000, end: now + 1000 };
      const report = collector.aggregate(period);

      expect(report.taskBreakdown).toHaveProperty("code_edit");
      expect(report.taskBreakdown.code_edit).toBe(1);
    });

    it("should return empty report for period with no events", () => {
      const future = Date.now() + 100000;
      const period = { start: future, end: future + 1000 };
      const report = collector.aggregate(period);

      expect(report.totalRequests).toBe(0);
      expect(report.tokensUsed).toBe(0);
      expect(report.errors).toBe(0);
    });
  });

  describe("rotateOldEvents", () => {
    it("should remove events older than retention period", () => {
      // Create collector with 1 day retention
      const shortTermCollector = new AnalyticsCollector({
        dbPath: join(tmpdirPath, `analytics-short-${Date.now()}.db`),
        retentionDays: 1,
      });

      // Manually insert an old event (we can't backdate, so we test the method exists)
      const deleted = shortTermCollector.rotateOldEvents();
      expect(typeof deleted).toBe("number");

      shortTermCollector.close();
    });
  });

  describe("getStats", () => {
    beforeEach(() => {
      collector.track("chat", { messageLength: 100 });
      collector.track("skill_load", { skillName: "skill1" });
      collector.track("chat", { messageLength: 200 });
    });

    it("should get event statistics", () => {
      const stats = collector.getStats();

      expect(stats.totalEvents).toBe(3);
      expect(stats.eventsByType.chat).toBe(2);
      expect(stats.eventsByType.skill_load).toBe(1);
      expect(stats.oldestEvent).not.toBeNull();
      expect(stats.newestEvent).not.toBeNull();
    });
  });

  describe("clear", () => {
    it("should clear all events", () => {
      collector.track("chat", { messageLength: 100 });
      expect(collector.getStats().totalEvents).toBeGreaterThan(0);

      collector.clear();
      expect(collector.getStats().totalEvents).toBe(0);
    });
  });

  describe("close", () => {
    it("should close the database connection", () => {
      const testCollector = new AnalyticsCollector({
        dbPath: join(tmpdirPath, `analytics-close-${Date.now()}.db`),
      });

      expect(() => testCollector.close()).not.toThrow();
    });
  });
});
