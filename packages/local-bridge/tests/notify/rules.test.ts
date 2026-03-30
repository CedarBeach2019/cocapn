/**
 * Tests for notification rules
 */

import { describe, it, expect } from "vitest";
import {
  meetsPriority,
  isValidEventType,
  isValidPriority,
  getValidEvents,
  getValidPriorities,
  createDefaultConfig,
  matchRules,
  type NotifyRule,
  type AgentEvent,
} from "../../src/notify/rules.js";

describe("meetsPriority", () => {
  it("returns true when priority equals minimum", () => {
    expect(meetsPriority("normal", "normal")).toBe(true);
  });

  it("returns true when priority exceeds minimum", () => {
    expect(meetsPriority("critical", "low")).toBe(true);
    expect(meetsPriority("critical", "normal")).toBe(true);
    expect(meetsPriority("high", "low")).toBe(true);
  });

  it("returns false when priority is below minimum", () => {
    expect(meetsPriority("low", "normal")).toBe(false);
    expect(meetsPriority("low", "critical")).toBe(false);
    expect(meetsPriority("normal", "high")).toBe(false);
  });

  it("handles all priority levels correctly", () => {
    const levels: Array<import("../../src/notify/rules.js").NotifyPriority> = [
      "low",
      "normal",
      "high",
      "critical",
    ];
    for (const p of levels) {
      expect(meetsPriority(p, "low")).toBe(true);
    }
    for (const p of levels) {
      expect(meetsPriority("low", p)).toBe(p === "low");
    }
  });
});

describe("isValidEventType", () => {
  it("accepts valid event types", () => {
    expect(isValidEventType("brain:update")).toBe(true);
    expect(isValidEventType("chat:message")).toBe(true);
    expect(isValidEventType("fleet:alert")).toBe(true);
    expect(isValidEventType("sync:complete")).toBe(true);
    expect(isValidEventType("error:critical")).toBe(true);
  });

  it("rejects invalid event types", () => {
    expect(isValidEventType("unknown:event")).toBe(false);
    expect(isValidEventType("")).toBe(false);
    expect(isValidEventType("brain")).toBe(false);
  });
});

describe("isValidPriority", () => {
  it("accepts valid priorities", () => {
    expect(isValidPriority("low")).toBe(true);
    expect(isValidPriority("normal")).toBe(true);
    expect(isValidPriority("high")).toBe(true);
    expect(isValidPriority("critical")).toBe(true);
  });

  it("rejects invalid priorities", () => {
    expect(isValidPriority("urgent")).toBe(false);
    expect(isValidPriority("")).toBe(false);
    expect(isValidPriority("HIGH")).toBe(false);
  });
});

describe("getValidEvents", () => {
  it("returns all five event types", () => {
    const events = getValidEvents();
    expect(events).toHaveLength(5);
    expect(events).toContain("brain:update");
    expect(events).toContain("chat:message");
    expect(events).toContain("fleet:alert");
    expect(events).toContain("sync:complete");
    expect(events).toContain("error:critical");
  });
});

describe("getValidPriorities", () => {
  it("returns all four priority levels", () => {
    const priorities = getValidPriorities();
    expect(priorities).toHaveLength(4);
    expect(priorities).toEqual(["low", "normal", "high", "critical"]);
  });
});

describe("createDefaultConfig", () => {
  it("returns a disabled config with no rules", () => {
    const config = createDefaultConfig();
    expect(config.enabled).toBe(false);
    expect(config.rules).toEqual([]);
    expect(config.updatedAt).toBeLessThanOrEqual(Date.now());
  });
});

describe("matchRules", () => {
  const rules: NotifyRule[] = [
    {
      id: "r1",
      name: "critical errors",
      events: ["error:critical"],
      minPriority: "critical",
      channels: ["terminal", "desktop"],
      enabled: true,
      createdAt: Date.now(),
    },
    {
      id: "r2",
      name: "all brain events",
      events: ["brain:update"],
      minPriority: "low",
      channels: ["terminal"],
      enabled: true,
      createdAt: Date.now(),
    },
    {
      id: "r3",
      name: "disabled rule",
      events: ["chat:message"],
      minPriority: "low",
      channels: ["terminal"],
      enabled: false,
      createdAt: Date.now(),
    },
    {
      id: "r4",
      name: "high priority fleet",
      events: ["fleet:alert"],
      minPriority: "high",
      channels: ["desktop"],
      enabled: true,
      createdAt: Date.now(),
    },
  ];

  it("matches rules by event type", () => {
    const event: AgentEvent = {
      type: "brain:update",
      priority: "low",
      message: "brain updated",
      timestamp: Date.now(),
    };
    const matched = matchRules(rules, event);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe("r2");
  });

  it("matches rules by priority threshold", () => {
    const event: AgentEvent = {
      type: "fleet:alert",
      priority: "normal",
      message: "fleet event",
      timestamp: Date.now(),
    };
    // r4 requires high priority, normal doesn't meet it
    const matched = matchRules(rules, event);
    expect(matched).toHaveLength(0);
  });

  it("matches when priority meets threshold", () => {
    const event: AgentEvent = {
      type: "fleet:alert",
      priority: "high",
      message: "fleet event",
      timestamp: Date.now(),
    };
    const matched = matchRules(rules, event);
    expect(matched).toHaveLength(1);
    expect(matched[0].id).toBe("r4");
  });

  it("excludes disabled rules", () => {
    const event: AgentEvent = {
      type: "chat:message",
      priority: "low",
      message: "chat msg",
      timestamp: Date.now(),
    };
    const matched = matchRules(rules, event);
    // r3 is disabled, should not match
    expect(matched).toHaveLength(0);
  });

  it("matches multiple rules for same event", () => {
    const multiRules: NotifyRule[] = [
      {
        id: "m1",
        name: "rule 1",
        events: ["error:critical"],
        minPriority: "low",
        channels: ["terminal"],
        enabled: true,
        createdAt: Date.now(),
      },
      {
        id: "m2",
        name: "rule 2",
        events: ["error:critical"],
        minPriority: "critical",
        channels: ["desktop"],
        enabled: true,
        createdAt: Date.now(),
      },
    ];
    const event: AgentEvent = {
      type: "error:critical",
      priority: "critical",
      message: "critical error",
      timestamp: Date.now(),
    };
    const matched = matchRules(multiRules, event);
    expect(matched).toHaveLength(2);
  });

  it("returns empty for no matching rules", () => {
    const event: AgentEvent = {
      type: "sync:complete",
      priority: "low",
      message: "sync done",
      timestamp: Date.now(),
    };
    const matched = matchRules(rules, event);
    expect(matched).toHaveLength(0);
  });

  it("returns empty for empty rules array", () => {
    const event: AgentEvent = {
      type: "brain:update",
      priority: "low",
      message: "update",
      timestamp: Date.now(),
    };
    expect(matchRules([], event)).toHaveLength(0);
  });
});
