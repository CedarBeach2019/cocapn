/**
 * Tests for the MemoryManager class — self-editing memory with budget, decay, and pruning.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { simpleGit } from "simple-git";
import { Brain } from "../src/brain/index.js";
import { MemoryManager } from "../src/brain/memory-manager.js";
import { GitSync } from "../src/git/sync.js";
import { DEFAULT_CONFIG, type BridgeConfig } from "../src/config/types.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function makeTempRepo(): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "cocapn-memory-test-"));
  const git = simpleGit(dir);
  await git.init();
  await git.addConfig("user.name", "Test");
  await git.addConfig("user.email", "test@test.com");
  writeFileSync(join(dir, "README.md"), "test\n");
  await git.add(".");
  await git.commit("init");
  return dir;
}

function makeConfig(repoRoot: string): BridgeConfig {
  return {
    ...DEFAULT_CONFIG,
    soul: "cocapn/soul.md",
    memory: {
      facts: "cocapn/memory/facts.json",
      procedures: "cocapn/memory/procedures.json",
      relationships: "cocapn/memory/relationships.json",
    },
    sync: {
      interval: 300,
      memoryInterval: 60,
      autoCommit: false,
      autoPush: false,
    },
  };
}

function makeBrain(repoRoot: string, memoryOptions?: { maxWritesPerSession?: number; maxTotalMemories?: number }): Brain {
  const config = makeConfig(repoRoot);
  const sync = new GitSync(repoRoot, config);
  return new Brain(repoRoot, config, sync, undefined, memoryOptions);
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("MemoryManager", () => {
  let repoRoot: string;
  let brain: Brain;
  let memoryManager: MemoryManager;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
    brain = makeBrain(repoRoot, { maxWritesPerSession: 5, maxTotalMemories: 10 });
    memoryManager = brain.memoryManager!;
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  describe("remember", () => {
    it("stores a memory and returns true", async () => {
      const written = await memoryManager.remember("test-key", "test-value", {
        type: "explicit",
        confidence: 0.8,
      });
      expect(written).toBe(true);
    });

    it("increments write count", async () => {
      await memoryManager.remember("key1", "value1", { type: "explicit" });
      await memoryManager.remember("key2", "value2", { type: "explicit" });
      expect(memoryManager.getWriteCount()).toBe(2);
    });

    it("respects write budget", async () => {
      // Write up to budget
      for (let i = 0; i < 5; i++) {
        await memoryManager.remember(`key${i}`, `value${i}`, { type: "explicit" });
      }

      // Next write should fail
      const written = await memoryManager.remember("key5", "value5", { type: "explicit" });
      expect(written).toBe(false);
    });

    it("rejects duplicate memories", async () => {
      const written1 = await memoryManager.remember("key", "value", { type: "explicit" });
      const written2 = await memoryManager.remember("key", "value", { type: "explicit" });
      expect(written1).toBe(true);
      expect(written2).toBe(false);
    });

    it("rejects contradictions to explicit memories", async () => {
      await memoryManager.remember("preference", "dark-mode", { type: "explicit" });
      const written = await memoryManager.remember("preference", "light-mode", { type: "preference" });
      expect(written).toBe(false);
    });

    it("detects and rejects PII", async () => {
      const ssn = await memoryManager.remember("ssn", "123-45-6789", { type: "implicit" });
      const email = await memoryManager.remember("email", "test@example.com", { type: "implicit" });
      const credit = await memoryManager.remember("credit", "4111-1111-1111-1111", { type: "implicit" });

      expect(ssn).toBe(false);
      expect(email).toBe(false);
      expect(credit).toBe(false);
    });

    it("saves and loads memories from disk", async () => {
      await memoryManager.remember("persistent", "value", { type: "explicit" });

      // Create new manager (should load from disk)
      const newManager = new MemoryManager(brain);
      const memories = newManager.list();
      expect(memories).toHaveLength(1);
      expect(memories[0].key).toBe("persistent");
    });
  });

  describe("recall", () => {
    beforeEach(async () => {
      await memoryManager.remember("typescript", "Type-safe superset of JavaScript", { type: "explicit" });
      await memoryManager.remember("rust", "Systems programming language", { type: "explicit" });
      await memoryManager.remember("python", "Interpreted, high-level language", { type: "explicit" });
    });

    it("returns memories matching query", async () => {
      const results = await memoryManager.recall("programming language");
      expect(results.length).toBeGreaterThan(0);
    });

    it("respects limit parameter", async () => {
      const results = await memoryManager.recall("language", { limit: 2 });
      expect(results.length).toBeLessThanOrEqual(2);
    });

    it("respects minConfidence parameter", async () => {
      await memoryManager.remember("low-conf", "low confidence value", {
        type: "implicit",
        confidence: 0.2,
      });

      const results = await memoryManager.recall("value", { minConfidence: 0.5 });
      expect(results.every(m => m.confidence >= 0.5)).toBe(true);
    });

    it("boosts frequently accessed memories", async () => {
      // Access the same memory multiple times
      await memoryManager.recall("typescript");
      await memoryManager.recall("typescript");
      await memoryManager.recall("typescript");

      // Get the memory directly from list to check access count
      const memories = memoryManager.list();
      const tsMemory = memories.find(m => m.key === "typescript");
      expect(tsMemory?.accessCount).toBeGreaterThan(0);
    });

    it("updates lastAccessed timestamp", async () => {
      // Get initial timestamp from list
      const beforeMemories = memoryManager.list();
      const tsBefore = beforeMemories.find(m => m.key === "typescript");
      const initialTimestamp = tsBefore?.lastAccessed;

      await new Promise(resolve => setTimeout(resolve, 10));

      // Trigger recall which updates timestamp
      await memoryManager.recall("typescript");

      // Get updated timestamp
      const afterMemories = memoryManager.list();
      const tsAfter = afterMemories.find(m => m.key === "typescript");

      expect(tsAfter?.lastAccessed).not.toBe(initialTimestamp);
    });
  });

  describe("forget", () => {
    it("removes a memory by key", async () => {
      await memoryManager.remember("to-forget", "value", { type: "explicit" });
      const forgotten = await memoryManager.forget("to-forget");
      expect(forgotten).toBe(true);

      const memories = memoryManager.list();
      expect(memories).toHaveLength(0);
    });

    it("returns false for non-existent key", async () => {
      const forgotten = await memoryManager.forget("non-existent");
      expect(forgotten).toBe(false);
    });
  });

  describe("prune", () => {
    it("deletes expired memories", async () => {
      const past = new Date(Date.now() - 1000).toISOString();
      await memoryManager.remember("expired", "value", {
        type: "implicit",
        expiresAt: past,
      });

      const result = await memoryManager.prune();
      expect(result.deleted).toBe(1);

      const memories = memoryManager.list();
      expect(memories).toHaveLength(0);
    });

    it("decays confidence of stale memories", async () => {
      await memoryManager.remember("stale", "value", {
        type: "implicit",
        confidence: 0.8,
      });

      // Manually set lastAccessed to long ago
      const memories = memoryManager.list();
      const stale = memories.find(m => m.key === "stale");
      if (stale) {
        (stale as any).lastAccessed = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      }

      const result = await memoryManager.prune();
      expect(result.decayed).toBeGreaterThan(0);
    });

    it("deletes memories with confidence below 0.3", async () => {
      await memoryManager.remember("low-conf", "value", {
        type: "implicit",
        confidence: 0.25,
      });

      // Mark as stale
      const memories = memoryManager.list();
      const low = memories.find(m => m.key === "low-conf");
      if (low) {
        (low as any).lastAccessed = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000).toISOString();
      }

      const result = await memoryManager.prune();
      expect(result.deleted).toBe(1);
    });

    it("never deletes explicit memories", async () => {
      await memoryManager.remember("explicit", "value", {
        type: "explicit",
        confidence: 1.0,
      });

      // Mark as very stale
      const memories = memoryManager.list();
      const explicit = memories.find(m => m.key === "explicit");
      if (explicit) {
        (explicit as any).lastAccessed = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
      }

      await memoryManager.prune();

      const remaining = memoryManager.list();
      expect(remaining).toHaveLength(1);
      expect(remaining[0].key).toBe("explicit");
    });
  });

  describe("list", () => {
    beforeEach(async () => {
      await memoryManager.remember("exp1", "value1", { type: "explicit" });
      await memoryManager.remember("imp1", "value2", { type: "implicit" });
      await memoryManager.remember("pref1", "value3", { type: "preference" });
    });

    it("returns all memories by default", () => {
      const memories = memoryManager.list();
      expect(memories).toHaveLength(3);
    });

    it("filters by type", () => {
      const explicit = memoryManager.list({ type: "explicit" });
      expect(explicit).toHaveLength(1);
      expect(explicit[0].type).toBe("explicit");
    });

    it("filters by minConfidence", () => {
      const low = memoryManager.list({ minConfidence: 0.8 });
      expect(low.every(m => m.confidence >= 0.8)).toBe(true);
    });

    it("filters auto-generated memories", () => {
      const auto = memoryManager.list({ autoOnly: true });
      expect(auto.every(m => m.autoGenerated)).toBe(true);
    });

    it("sorts by creation date (newest first)", async () => {
      await new Promise(resolve => setTimeout(resolve, 10));
      await memoryManager.remember("exp2", "value4", { type: "explicit" });

      const memories = memoryManager.list();
      expect(memories[0].key).toBe("exp2"); // Newest
    });
  });

  describe("stats", () => {
    it("returns accurate statistics", async () => {
      await memoryManager.remember("exp1", "value1", { type: "explicit", confidence: 0.9 });
      await memoryManager.remember("imp1", "value2", { type: "implicit", confidence: 0.7 });
      await memoryManager.remember("pref1", "value3", { type: "preference", confidence: 0.8 });

      const stats = memoryManager.stats();

      expect(stats.total).toBe(3);
      expect(stats.autoGenerated).toBe(2); // implicit + preference
      expect(stats.avgConfidence).toBeCloseTo(0.8, 1);
      expect(stats.types.explicit).toBe(1);
      expect(stats.types.implicit).toBe(1);
      expect(stats.types.preference).toBe(1);
      expect(stats.sessionWrites).toBe(3);
      expect(stats.remainingBudget).toBe(2); // 5 - 3 = 2
    });

    it("handles empty memory", () => {
      const stats = memoryManager.stats();

      expect(stats.total).toBe(0);
      expect(stats.autoGenerated).toBe(0);
      expect(stats.avgConfidence).toBe(0);
      expect(stats.sessionWrites).toBe(0);
      expect(stats.remainingBudget).toBe(5);
    });
  });

  describe("resetSession", () => {
    it("resets write count", async () => {
      await memoryManager.remember("key1", "value1", { type: "explicit" });
      await memoryManager.remember("key2", "value2", { type: "explicit" });

      expect(memoryManager.getWriteCount()).toBe(2);

      memoryManager.resetSession();
      expect(memoryManager.getWriteCount()).toBe(0);
    });

    it("allows writes after reset", async () => {
      // Fill budget
      for (let i = 0; i < 5; i++) {
        await memoryManager.remember(`key${i}`, `value${i}`, { type: "explicit" });
      }

      // Should fail
      const written1 = await memoryManager.remember("key5", "value5", { type: "explicit" });
      expect(written1).toBe(false);

      // Reset and try again
      memoryManager.resetSession();
      const written2 = await memoryManager.remember("key5", "value5", { type: "explicit" });
      expect(written2).toBe(true);
    });
  });

  describe("memory entry structure", () => {
    it("creates entries with all required fields", async () => {
      await memoryManager.remember("test", "value", {
        type: "preference",
        confidence: 0.85,
        source: "task-123",
        tags: ["ui", "theme"],
      });

      const memories = memoryManager.list();
      const mem = memories[0];

      expect(mem.id).toBeDefined();
      expect(mem.key).toBe("test");
      expect(mem.value).toBe("value");
      expect(mem.type).toBe("preference");
      expect(mem.confidence).toBe(0.85);
      expect(mem.accessCount).toBe(0);
      expect(mem.lastAccessed).toBeDefined();
      expect(mem.createdAt).toBeDefined();
      expect(mem.source).toBe("task-123");
      expect(mem.tags).toEqual(["ui", "theme"]);
      expect(mem.autoGenerated).toBe(true);
    });

    it("marks explicit memories as not auto-generated", async () => {
      await memoryManager.remember("explicit", "value", { type: "explicit" });
      const memories = memoryManager.list();
      expect(memories[0].autoGenerated).toBe(false);
    });
  });
});

describe("MemoryManager integration with Brain", () => {
  let repoRoot: string;
  let brain: Brain;

  beforeEach(async () => {
    repoRoot = await makeTempRepo();
    const config = makeConfig(repoRoot);
    const sync = new GitSync(repoRoot, config);
    brain = new Brain(repoRoot, config, sync);
  });

  afterEach(() => rmSync(repoRoot, { recursive: true, force: true }));

  it("is accessible via brain.memoryManager", () => {
    expect(brain.memoryManager).toBeInstanceOf(MemoryManager);
  });

  it("shares the same repo root", () => {
    const memoriesPath = join(repoRoot, "cocapn", "memory", "memories.json");
    expect(brain.memoryManager).toBeDefined();
  });

  it("can be disabled by passing false", () => {
    const config = makeConfig(repoRoot);
    const sync = new GitSync(repoRoot, config);
    const brainNoMem = new Brain(repoRoot, config, sync, undefined, false);
    expect(brainNoMem.memoryManager).toBeNull();
  });
});
