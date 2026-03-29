/**
 * Tests for DebounceTimer
 *
 * Tests debouncing of rapid function calls.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { DebounceTimer } from "../src/utils/debounce.js";

describe("DebounceTimer", () => {
  describe("schedule", () => {
    it("should schedule function execution", () => {
      const fn = vi.fn();
      const timer = new DebounceTimer({ delayMs: 100, fn });

      timer.schedule();

      expect(fn).not.toHaveBeenCalled();
    });

    it("should execute function after delay", () => {
      return new Promise((resolve) => {
        const fn = vi.fn(() => {
          expect(fn).toHaveBeenCalledTimes(1);
          resolve(null);
        });

        const timer = new DebounceTimer({ delayMs: 50, fn });
        timer.schedule();
      });
    });

    it("should reset timer on multiple calls", () => {
      return new Promise((resolve) => {
        const fn = vi.fn(() => {
          expect(fn).toHaveBeenCalledTimes(1);
          resolve(null);
        });

        const timer = new DebounceTimer({ delayMs: 100, fn });

        // Schedule multiple times rapidly
        timer.schedule();
        timer.schedule();
        timer.schedule();

        // Function should only execute once after last schedule
      });
    });

    it("should handle async functions", () => {
      return new Promise((resolve) => {
        let callCount = 0;
        const fn = async () => {
          callCount++;
          await new Promise(r => setTimeout(r, 10));
          expect(callCount).toBe(1);
          resolve(null);
        };

        const timer = new DebounceTimer({ delayMs: 50, fn });
        timer.schedule();
      });
    });
  });

  describe("flush", () => {
    it("should execute scheduled function immediately", async () => {
      const fn = vi.fn();
      const timer = new DebounceTimer({ delayMs: 1000, fn });

      timer.schedule();
      expect(fn).not.toHaveBeenCalled();

      await timer.flush();
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should do nothing when nothing scheduled", async () => {
      const fn = vi.fn();
      const timer = new DebounceTimer({ delayMs: 100, fn });

      await timer.flush();
      expect(fn).not.toHaveBeenCalled();
    });

    it("should clear timer after flush", async () => {
      const fn = vi.fn();
      const timer = new DebounceTimer({ delayMs: 50, fn });

      timer.schedule();
      await timer.flush();
      expect(fn).toHaveBeenCalledTimes(1);

      // Wait to make sure the original timer doesn't fire again
      await new Promise(resolve => setTimeout(resolve, 100));
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it("should be idempotent", async () => {
      const fn = vi.fn();
      const timer = new DebounceTimer({ delayMs: 1000, fn });

      timer.schedule();
      await timer.flush();
      await timer.flush();
      await timer.flush();

      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe("cancel", () => {
    it("should cancel scheduled execution", () => {
      return new Promise((resolve) => {
        const fn = vi.fn(() => resolve(null));
        const timer = new DebounceTimer({ delayMs: 50, fn });

        timer.schedule();
        timer.cancel();

        // Wait for the original delay to pass
        setTimeout(() => {
          expect(fn).not.toHaveBeenCalled();
          resolve(null);
        }, 100);
      });
    });

    it("should do nothing when nothing scheduled", () => {
      const timer = new DebounceTimer({ delayMs: 100, fn: () => {} });

      expect(() => timer.cancel()).not.toThrow();
    });

    it("should reset pending state", () => {
      const fn = vi.fn();
      const timer = new DebounceTimer({ delayMs: 1000, fn });

      timer.schedule();
      expect(timer.isScheduled()).toBe(true);

      timer.cancel();
      expect(timer.isScheduled()).toBe(false);
    });
  });

  describe("isScheduled", () => {
    it("should return false initially", () => {
      const timer = new DebounceTimer({ delayMs: 100, fn: () => {} });
      expect(timer.isScheduled()).toBe(false);
    });

    it("should return true after schedule", () => {
      const timer = new DebounceTimer({ delayMs: 100, fn: () => {} });
      timer.schedule();
      expect(timer.isScheduled()).toBe(true);
    });

    it("should return false after execution", () => {
      return new Promise((resolve) => {
        const fn = () => {
          expect(timer.isScheduled()).toBe(false);
          resolve(null);
        };

        const timer = new DebounceTimer({ delayMs: 50, fn });
        timer.schedule();
        expect(timer.isScheduled()).toBe(true);
      });
    });

    it("should return false after cancel", () => {
      const timer = new DebounceTimer({ delayMs: 100, fn: () => {} });
      timer.schedule();
      timer.cancel();
      expect(timer.isScheduled()).toBe(false);
    });

    it("should return false after flush", async () => {
      const timer = new DebounceTimer({ delayMs: 1000, fn: () => {} });
      timer.schedule();
      await timer.flush();
      expect(timer.isScheduled()).toBe(false);
    });
  });

  describe("dispose", () => {
    it("should cancel pending execution", () => {
      const fn = vi.fn();
      const timer = new DebounceTimer({ delayMs: 100, fn });

      timer.schedule();
      timer.dispose();

      expect(timer.isScheduled()).toBe(false);
    });

    it("should be safe to call multiple times", () => {
      const timer = new DebounceTimer({ delayMs: 100, fn: () => {} });

      expect(() => {
        timer.dispose();
        timer.dispose();
        timer.dispose();
      }).not.toThrow();
    });
  });

  describe("edge cases", () => {
    it("should handle very short delays", () => {
      return new Promise((resolve) => {
        const fn = vi.fn(() => resolve(null));
        const timer = new DebounceTimer({ delayMs: 1, fn });

        timer.schedule();
      });
    });

    it("should handle zero delay", () => {
      return new Promise((resolve) => {
        const fn = vi.fn(() => resolve(null));
        const timer = new DebounceTimer({ delayMs: 0, fn });

        timer.schedule();
      });
    });

    it("should handle rapid schedule-cancel cycles", () => {
      const fn = vi.fn();
      const timer = new DebounceTimer({ delayMs: 50, fn });

      for (let i = 0; i < 100; i++) {
        timer.schedule();
        if (i % 2 === 0) {
          timer.cancel();
        }
      }

      return new Promise(resolve => setTimeout(resolve, 100)).then(() => {
        // Last cycle should have been a schedule, so function should execute
        expect(fn).toHaveBeenCalledTimes(1);
      });
    });
  });
});
