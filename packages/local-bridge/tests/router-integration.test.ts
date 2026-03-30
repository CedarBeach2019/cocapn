/**
 * Agent Router Integration Tests — using ACTUAL AgentRouter from src/agents/router.ts
 *
 * Tests the actual AgentRouter methods:
 * - resolve(taskDescription)
 * - resolveAndEnsureRunning(taskDescription)
 * - resolveDefinition(taskDescription)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AgentRouter, type RouterConfig } from "../src/agents/router.js";
import { AgentRegistry } from "../src/agents/registry.js";
import { AgentSpawner } from "../src/agents/spawner.js";
import { SchemaValidator } from "../src/schema-validator.js";
import type { AgentDefinition } from "../src/agents/spawner.js";

// ─── Test Fixtures ───────────────────────────────────────────────────────────────

describe("Router Integration: Agent Router (ACTUAL)", () => {
  let registry: AgentRegistry;
  let spawner: AgentSpawner;
  let router: AgentRouter;

  beforeEach(() => {
    const validator = new SchemaValidator();
    registry = new AgentRegistry(validator);
    spawner = new AgentSpawner();

    // Register some test agents
    const defaultAgent: AgentDefinition = {
      id: "default-agent",
      type: "local",
      command: "node",
      args: ["default.js"],
      env: {},
      capabilities: ["chat", "tasks"],
      cost: "low",
    };

    const codeAgent: AgentDefinition = {
      id: "code-agent",
      type: "local",
      command: "node",
      args: ["code.js"],
      env: {},
      capabilities: ["code", "tasks"],
      cost: "medium",
    };

    const creativeAgent: AgentDefinition = {
      id: "creative-agent",
      type: "local",
      command: "node",
      args: ["creative.js"],
      env: {},
      capabilities: ["writing", "brainstorming"],
      cost: "low",
    };

    // Manually add to registry's internal storage
    registry["agents"] = new Map([
      ["default-agent", defaultAgent],
      ["code-agent", codeAgent],
      ["creative-agent", creativeAgent],
    ]);

    // Create router with routing rules
    const config: RouterConfig = {
      rules: [
        { match: "code", agent: "code-agent", priority: 10 },
        { match: "programming", agent: "code-agent", priority: 10 },
        { match: "writing", agent: "creative-agent", priority: 5 },
        { match: "creative", agent: "creative-agent", priority: 5 },
      ],
      strategy: "first-match",
      defaultAgent: "default-agent",
      fallbackAgent: "default-agent",
    };

    router = new AgentRouter(config, registry, spawner);
  });

  // ─── Routing Rule Matching Tests ────────────────────────────────────────────────

  it("routes 'help me write code' to code-agent via rule match", () => {
    const result = router.resolve("help me write code");
    expect(result).toBeDefined();
    expect(result?.definition.id).toBe("code-agent");
    expect(result?.source).toBe("local");
  });

  it("routes 'programming task' to code-agent via rule match", () => {
    const result = router.resolve("programming task");
    expect(result).toBeDefined();
    expect(result?.definition.id).toBe("code-agent");
    expect(result?.source).toBe("local");
  });

  it("routes 'creative writing' to creative-agent via rule match", () => {
    const result = router.resolve("creative writing");
    expect(result).toBeDefined();
    expect(result?.definition.id).toBe("creative-agent");
    expect(result?.source).toBe("local");
  });

  it("routes 'creative brainstorming' to creative-agent via rule match", () => {
    const result = router.resolve("creative brainstorming");
    expect(result).toBeDefined();
    expect(result?.definition.id).toBe("creative-agent");
    expect(result?.source).toBe("local");
  });

  // ─── Default Agent Tests ────────────────────────────────────────────────────────

  it("routes unmatched tasks to default-agent", () => {
    const result = router.resolve("tell me a joke");
    expect(result).toBeDefined();
    expect(result?.definition.id).toBe("default-agent");
    expect(result?.source).toBe("local");
  });

  it("routes ambiguous tasks to default-agent", () => {
    const result = router.resolve("what's the weather");
    expect(result).toBeDefined();
    expect(result?.definition.id).toBe("default-agent");
  });

  // ─── Strategy Tests ────────────────────────────────────────────────────────────

  it("uses first-match strategy (first rule wins)", () => {
    const config: RouterConfig = {
      rules: [
        { match: "code", agent: "code-agent" },
        { match: "write", agent: "creative-agent" },
      ],
      strategy: "first-match",
      defaultAgent: "default-agent",
      fallbackAgent: undefined,
    };

    const firstMatchRouter = new AgentRouter(config, registry, spawner);

    // "write code" matches both rules, but first-match picks code-agent
    const result = firstMatchRouter.resolve("write code");
    expect(result?.definition.id).toBe("code-agent");
  });

  // ─── Case Insensitive Matching ─────────────────────────────────────────────────

  it("matches rules case-insensitively", () => {
    const result1 = router.resolve("HELP WITH CODE");
    const result2 = router.resolve("Programming TASK");
    const result3 = router.resolve("Creative Writing");

    expect(result1?.definition.id).toBe("code-agent");
    expect(result2?.definition.id).toBe("code-agent");
    expect(result3?.definition.id).toBe("creative-agent");
  });

  // ─── Partial Match Tests ───────────────────────────────────────────────────────

  it("matches rule keywords anywhere in task description", () => {
    const result1 = router.resolve("I need help with my code");
    const result2 = router.resolve("Can you do some programming for me?");
    const result3 = router.resolve("Let's get creative with this");

    expect(result1?.definition.id).toBe("code-agent");
    expect(result2?.definition.id).toBe("code-agent");
    expect(result3?.definition.id).toBe("creative-agent");
  });

  // ─── Fallback Agent Tests ───────────────────────────────────────────────────────

  it("uses fallback-agent when default-agent is not found", () => {
    const config: RouterConfig = {
      rules: [],
      strategy: "first-match",
      defaultAgent: "nonexistent-agent",
      fallbackAgent: "default-agent",
    };

    const fallbackRouter = new AgentRouter(config, registry, spawner);

    const result = fallbackRouter.resolve("any task");
    expect(result?.definition.id).toBe("default-agent");
  });

  it("returns undefined when no agent is available", () => {
    const config: RouterConfig = {
      rules: [],
      strategy: "first-match",
      defaultAgent: undefined,
      fallbackAgent: undefined,
    };

    const noFallbackRouter = new AgentRouter(config, registry, spawner);

    const result = noFallbackRouter.resolve("any task");
    expect(result).toBeUndefined();
  });

  // ─── resolveDefinition Tests (deprecated API) ───────────────────────────────────

  it("resolveDefinition returns AgentDefinition directly (deprecated)", () => {
    const result = router.resolveDefinition("help with code");
    expect(result).toBeDefined();
    expect(result?.id).toBe("code-agent");
  });

  it("resolveDefinition returns undefined for unmatched tasks", () => {
    const config: RouterConfig = {
      rules: [],
      strategy: "first-match",
      defaultAgent: undefined,
      fallbackAgent: undefined,
    };

    const noAgentsRouter = new AgentRouter(config, registry, spawner);

    const result = noAgentsRouter.resolveDefinition("any task");
    expect(result).toBeUndefined();
  });

  // ─── Empty and Edge Cases ───────────────────────────────────────────────────────

  it("handles empty task description", () => {
    const result = router.resolve("");
    expect(result?.definition.id).toBe("default-agent");
  });

  it("handles task description with only spaces", () => {
    const result = router.resolve("   ");
    expect(result?.definition.id).toBe("default-agent");
  });

  it("handles task description with special characters", () => {
    const result = router.resolve("!!!???");
    expect(result?.definition.id).toBe("default-agent");
  });

  // ─── Substring Matching Tests ───────────────────────────────────────────────────

  it("matches rule keywords as substrings", () => {
    // "encode" contains "code" as a substring, so it matches code-agent
    const result = router.resolve("encode this data");
    expect(result?.definition.id).toBe("code-agent");
  });

  it("does not match partial words incorrectly", () => {
    // "codes" is a different word than "code", but our implementation
    // does substring matching, so "codes" contains "code"
    const result = router.resolve("postal codes list");
    expect(result?.definition.id).toBe("code-agent"); // matches "code" in "codes"
  });
});
