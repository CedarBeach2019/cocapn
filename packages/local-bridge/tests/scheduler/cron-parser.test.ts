/**
 * Tests for cron-parser module
 */

import { describe, it, expect } from "vitest";
import {
  validateCronExpression,
  getNextRun,
  expandShortcut,
} from "../../src/scheduler/cron-parser.js";

describe("cron-parser", () => {
  describe("expandShortcut", () => {
    it("should expand @daily to standard cron", () => {
      expect(expandShortcut("@daily")).toBe("0 0 * * *");
    });

    it("should expand @hourly", () => {
      expect(expandShortcut("@hourly")).toBe("0 * * * *");
    });

    it("should expand @weekly", () => {
      expect(expandShortcut("@weekly")).toBe("0 0 * * 0");
    });

    it("should expand @monthly", () => {
      expect(expandShortcut("@monthly")).toBe("0 0 1 * *");
    });

    it("should expand @yearly", () => {
      expect(expandShortcut("@yearly")).toBe("0 0 1 1 *");
    });

    it("should expand @annually", () => {
      expect(expandShortcut("@annually")).toBe("0 0 1 1 *");
    });

    it("should expand @midnight", () => {
      expect(expandShortcut("@midnight")).toBe("0 0 * * *");
    });

    it("should pass through non-shortcut expressions", () => {
      expect(expandShortcut("0 9 * * 1-5")).toBe("0 9 * * 1-5");
    });

    it("should pass through unknown shortcuts unchanged", () => {
      expect(expandShortcut("@invalid")).toBe("@invalid");
    });
  });

  describe("validateCronExpression", () => {
    it("should accept valid 5-field expressions", () => {
      expect(validateCronExpression("0 0 * * *")).toBe(true);
      expect(validateCronExpression("30 5 * * 1-5")).toBe(true);
      expect(validateCronExpression("*/15 * * * *")).toBe(true);
      expect(validateCronExpression("0 9 1 * *")).toBe(true);
      expect(validateCronExpression("* * * * *")).toBe(true);
    });

    it("should accept valid shortcuts", () => {
      expect(validateCronExpression("@daily")).toBe(true);
      expect(validateCronExpression("@hourly")).toBe(true);
      expect(validateCronExpression("@weekly")).toBe(true);
      expect(validateCronExpression("@monthly")).toBe(true);
      expect(validateCronExpression("@yearly")).toBe(true);
      expect(validateCronExpression("@annually")).toBe(true);
      expect(validateCronExpression("@midnight")).toBe(true);
    });

    it("should reject invalid expressions", () => {
      expect(validateCronExpression("invalid")).toBe(false);
      expect(validateCronExpression("")).toBe(false);
      expect(validateCronExpression("* * * *")).toBe(false); // 4 fields
      expect(validateCronExpression("* * * * * *")).toBe(false); // 6 fields
    });

    it("should reject out-of-range values", () => {
      expect(validateCronExpression("60 * * * *")).toBe(false); // minute > 59
      expect(validateCronExpression("0 24 * * *")).toBe(false); // hour > 23
      expect(validateCronExpression("0 0 32 * *")).toBe(false); // day > 31
      expect(validateCronExpression("0 0 * 13 *")).toBe(false); // month > 12
    });

    it("should accept lists", () => {
      expect(validateCronExpression("0,15,30,45 * * * *")).toBe(true);
      expect(validateCronExpression("0 1,13 * * *")).toBe(true);
    });

    it("should accept ranges with steps", () => {
      expect(validateCronExpression("0-30/5 * * * *")).toBe(true);
      expect(validateCronExpression("0 9-17/2 * * *")).toBe(true);
    });

    it("should reject unknown shortcuts", () => {
      expect(validateCronExpression("@invalid")).toBe(false);
      expect(validateCronExpression("@never")).toBe(false);
    });
  });

  describe("getNextRun", () => {
    it("should return a future date", () => {
      const next = getNextRun("0 * * * *");
      expect(next.getTime()).toBeGreaterThan(Date.now() - 1000);
    });

    it("should throw for invalid expressions", () => {
      expect(() => getNextRun("invalid")).toThrow(/Invalid cron/);
    });

    it("should find next hourly match", () => {
      // Fix a "current time" to make the test deterministic
      const after = new Date("2026-03-30T10:30:00Z");
      const next = getNextRun("0 * * * *", after);
      // Should be at minute 0 of the next hour
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCHours()).toBe(11);
      expect(next.getUTCDate()).toBe(30);
    });

    it("should find next daily match", () => {
      const after = new Date("2026-03-30T10:30:00Z");
      const next = getNextRun("0 0 * * *", after);
      // Should be midnight the next day
      expect(next.getUTCHours()).toBe(0);
      expect(next.getUTCMinutes()).toBe(0);
      expect(next.getUTCDate()).toBe(31);
    });

    it("should find next match from shortcut", () => {
      const after = new Date("2026-03-30T10:30:00Z");
      const next = getNextRun("@daily", after);
      expect(next.getUTCHours()).toBe(0);
      expect(next.getUTCMinutes()).toBe(0);
    });

    it("should handle step expressions", () => {
      const after = new Date("2026-03-30T10:00:00Z");
      const next = getNextRun("*/5 * * * *", after);
      expect(next.getUTCMinutes()).toBe(5);
    });

    it("should handle range expressions", () => {
      const after = new Date("2026-03-30T08:00:00Z");
      const next = getNextRun("0 9-17 * * *", after);
      expect(next.getUTCHours()).toBe(9);
      expect(next.getUTCMinutes()).toBe(0);
    });

    it("should handle day-of-week expressions", () => {
      // 2026-03-30 is a Monday (day 1)
      const after = new Date("2026-03-30T10:00:00Z");
      // Schedule for Sunday (0 or 7)
      const next = getNextRun("0 0 * * 0", after);
      // Next Sunday should be 2026-04-05
      expect(next.getUTCDate()).toBe(5);
      expect(next.getUTCMonth()).toBe(3); // April (0-indexed)
    });

    it("should handle month expressions", () => {
      const after = new Date("2026-03-30T10:00:00Z");
      // First of next month
      const next = getNextRun("0 0 1 * *", after);
      expect(next.getUTCDate()).toBe(1);
      expect(next.getUTCMonth()).toBe(3); // April
    });
  });
});
