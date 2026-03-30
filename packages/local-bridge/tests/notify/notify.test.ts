/**
 * Tests for notification notifier — config storage and dispatch
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  loadConfig,
  saveConfig,
  enableNotifications,
  disableNotifications,
  isEnabled,
  addRule,
  removeRule,
  listRules,
  dispatch,
  sendTest,
  isValidEventType,
  isValidPriority,
} from "../../src/notify/notifier.js";

describe("notify/notifier", () => {
  let repoRoot: string;

  beforeEach(() => {
    repoRoot = join(tmpdir(), `cocapn-notify-test-${Date.now()}`);
  });

  afterEach(() => {
    if (existsSync(repoRoot)) {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  describe("loadConfig / saveConfig", () => {
    it("returns default config when no file exists", () => {
      const config = loadConfig(repoRoot);
      expect(config.enabled).toBe(false);
      expect(config.rules).toEqual([]);
    });

    it("persists config to disk", () => {
      const config = loadConfig(repoRoot);
      config.enabled = true;
      saveConfig(repoRoot, config);

      const loaded = loadConfig(repoRoot);
      expect(loaded.enabled).toBe(true);
    });

    it("updates updatedAt on save", () => {
      const config = loadConfig(repoRoot);
      const before = config.updatedAt;
      saveConfig(repoRoot, config);
      const loaded = loadConfig(repoRoot);
      expect(loaded.updatedAt).toBeGreaterThanOrEqual(before);
    });
  });

  describe("enableNotifications / disableNotifications / isEnabled", () => {
    it("enables notifications", () => {
      enableNotifications(repoRoot);
      expect(isEnabled(repoRoot)).toBe(true);
    });

    it("disables notifications", () => {
      enableNotifications(repoRoot);
      disableNotifications(repoRoot);
      expect(isEnabled(repoRoot)).toBe(false);
    });

    it("is disabled by default", () => {
      expect(isEnabled(repoRoot)).toBe(false);
    });
  });

  describe("addRule / removeRule / listRules", () => {
    it("adds a rule and lists it", () => {
      enableNotifications(repoRoot);
      const rule = addRule(repoRoot, {
        name: "test rule",
        events: ["brain:update"],
        minPriority: "normal",
        channels: ["terminal"],
      });

      expect(rule.id).toBeTruthy();
      expect(rule.name).toBe("test rule");
      expect(rule.events).toEqual(["brain:update"]);
      expect(rule.enabled).toBe(true);

      const rules = listRules(repoRoot);
      expect(rules).toHaveLength(1);
      expect(rules[0].id).toBe(rule.id);
    });

    it("removes a rule by ID", () => {
      enableNotifications(repoRoot);
      const rule = addRule(repoRoot, {
        name: "to remove",
        events: ["chat:message"],
        minPriority: "low",
        channels: ["terminal"],
      });

      expect(listRules(repoRoot)).toHaveLength(1);
      const removed = removeRule(repoRoot, rule.id);
      expect(removed).toBe(true);
      expect(listRules(repoRoot)).toHaveLength(0);
    });

    it("returns false for removing non-existent rule", () => {
      expect(removeRule(repoRoot, "nonexistent")).toBe(false);
    });

    it("persists rules across loads", () => {
      enableNotifications(repoRoot);
      addRule(repoRoot, {
        name: "persistent",
        events: ["error:critical"],
        minPriority: "critical",
        channels: ["terminal", "desktop"],
      });

      const rules = listRules(repoRoot);
      expect(rules).toHaveLength(1);
      expect(rules[0].name).toBe("persistent");
    });
  });

  describe("dispatch", () => {
    it("does not dispatch when disabled", async () => {
      disableNotifications(repoRoot);
      const result = await dispatch(repoRoot, {
        type: "brain:update",
        priority: "normal",
        message: "test",
        timestamp: Date.now(),
      });
      expect(result.dispatched).toBe(false);
      expect(result.results).toHaveLength(0);
    });

    it("does not dispatch when no rules match", async () => {
      enableNotifications(repoRoot);
      const result = await dispatch(repoRoot, {
        type: "sync:complete",
        priority: "low",
        message: "sync done",
        timestamp: Date.now(),
      });
      expect(result.dispatched).toBe(false);
    });

    it("dispatches when a matching rule exists", async () => {
      enableNotifications(repoRoot);
      addRule(repoRoot, {
        name: "brain updates",
        events: ["brain:update"],
        minPriority: "low",
        channels: ["terminal"],
      });

      const result = await dispatch(repoRoot, {
        type: "brain:update",
        priority: "normal",
        message: "brain updated",
        timestamp: Date.now(),
      });
      expect(result.dispatched).toBe(true);
      expect(result.results.length).toBeGreaterThan(0);
    });

    it("skips events below minimum priority", async () => {
      enableNotifications(repoRoot);
      addRule(repoRoot, {
        name: "critical only",
        events: ["error:critical"],
        minPriority: "critical",
        channels: ["terminal"],
      });

      const result = await dispatch(repoRoot, {
        type: "error:critical",
        priority: "low",
        message: "minor error",
        timestamp: Date.now(),
      });
      expect(result.dispatched).toBe(false);
    });
  });

  describe("sendTest", () => {
    it("returns error when disabled", async () => {
      disableNotifications(repoRoot);
      const result = await sendTest(repoRoot);
      expect(result.sent).toBe(false);
      expect(result.results[0].success).toBe(false);
      expect(result.results[0].error).toContain("disabled");
    });

    it("sends test when enabled", async () => {
      enableNotifications(repoRoot);
      const result = await sendTest(repoRoot);
      expect(result.sent).toBe(true);
      // Terminal channel should be in results
      expect(result.results.some((r) => r.channel === "terminal")).toBe(true);
    });
  });

  describe("validation re-exports", () => {
    it("re-exports isValidEventType", () => {
      expect(isValidEventType("brain:update")).toBe(true);
      expect(isValidEventType("bogus")).toBe(false);
    });

    it("re-exports isValidPriority", () => {
      expect(isValidPriority("high")).toBe(true);
      expect(isValidPriority("urgent")).toBe(false);
    });
  });
});
