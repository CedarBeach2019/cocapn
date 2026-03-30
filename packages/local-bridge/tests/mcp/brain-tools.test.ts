/**
 * Tests for MCP brain tools v0.2.0
 *
 * Tests the 7 brain tools: brain_read, brain_write, brain_search, brain_status,
 * brain_wiki, brain_knowledge, brain_repo.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  executeBrainTool,
  BRAIN_TOOL_DEFINITIONS,
  type BrainToolContext,
} from "../../src/mcp/brain-tools.js";
import { Brain } from "../../src/brain/index.js";
import { GitSync } from "../../src/git/sync.js";
import { DEFAULT_CONFIG } from "../../src/config/types.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

describe("MCP Brain Tools v0.2.0", () => {
  let brain: Brain;
  let ctx: BrainToolContext;
  let repoRoot: string;

  beforeEach(async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "cocapn-bt-test-"));

    // Initialize a minimal git repo
    try {
      execSync("git init", { cwd: repoRoot, stdio: "ignore" });
      execSync("git config user.email 'test@test.com'", { cwd: repoRoot, stdio: "ignore" });
      execSync("git config user.name 'Test'", { cwd: repoRoot, stdio: "ignore" });
    } catch {
      // Ignore git errors
    }

    // Create cocapn directories
    mkdirSync(join(repoRoot, "cocapn"), { recursive: true });
    mkdirSync(join(repoRoot, "cocapn", "memory"), { recursive: true });
    mkdirSync(join(repoRoot, "cocapn", "wiki"), { recursive: true });

    // Create empty facts.json
    writeFileSync(join(repoRoot, "cocapn", "memory", "facts.json"), "{}");

    // Create config and sync
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as typeof DEFAULT_CONFIG;
    const sync = new GitSync(repoRoot, config);

    brain = new Brain(repoRoot, config, sync);
    ctx = { brain };
  });

  afterEach(() => {
    try {
      rmSync(repoRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ─── Tool definitions ─────────────────────────────────────────────────────

  describe("Tool definitions", () => {
    it("should export 7 tool definitions", () => {
      expect(BRAIN_TOOL_DEFINITIONS).toHaveLength(7);
      const names = BRAIN_TOOL_DEFINITIONS.map((t) => t.name);
      expect(names).toContain("brain_read");
      expect(names).toContain("brain_write");
      expect(names).toContain("brain_search");
      expect(names).toContain("brain_status");
      expect(names).toContain("brain_wiki");
      expect(names).toContain("brain_knowledge");
      expect(names).toContain("brain_repo");
    });

    it("each definition should have required fields", () => {
      for (const def of BRAIN_TOOL_DEFINITIONS) {
        expect(def.name).toBeTruthy();
        expect(def.description).toBeTruthy();
        expect(def.inputSchema).toBeDefined();
        expect(def.inputSchema.type).toBe("object");
      }
    });
  });

  // ─── brain_read ───────────────────────────────────────────────────────────

  describe("brain_read", () => {
    it("should read a fact by key", async () => {
      await brain.setFact("user.name", "Alice");

      const result = await executeBrainTool("brain_read", ctx, {
        type: "fact",
        key: "user.name",
      });

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.key).toBe("user.name");
      expect(parsed.value).toBe("Alice");
    });

    it("should return not found for missing fact", async () => {
      const result = await executeBrainTool("brain_read", ctx, {
        type: "fact",
        key: "missing",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Fact not found: missing");
    });

    it("should return all facts when key is omitted", async () => {
      await brain.setFact("a", "1");
      await brain.setFact("b", "2");

      const result = await executeBrainTool("brain_read", ctx, { type: "fact" });
      expect(result.isError).toBe(false);
      // getAllFacts returns all as JSON
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty("a", "1");
      expect(parsed).toHaveProperty("b", "2");
    });

    it("should filter private.* facts in public mode", async () => {
      await brain.setFact("user.name", "Alice");
      await brain.setFact("private.secret", "hidden");

      const result = await executeBrainTool("brain_read", ctx, {
        type: "fact",
        key: "private.secret",
        mode: "public",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Fact not found: private.secret");
    });

    it("should read memories", async () => {
      const result = await executeBrainTool("brain_read", ctx, { type: "memory" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("should read wiki pages list when no key", async () => {
      const result = await executeBrainTool("brain_read", ctx, { type: "wiki" });
      expect(result.isError).toBe(false);
    });

    it("should read a specific wiki page", async () => {
      writeFileSync(join(repoRoot, "cocapn", "wiki", "test.md"), "# Test\nContent", "utf8");

      const result = await executeBrainTool("brain_read", ctx, {
        type: "wiki",
        key: "test.md",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("# Test");
    });

    it("should read knowledge entries", async () => {
      const result = await executeBrainTool("brain_read", ctx, { type: "knowledge" });
      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(Array.isArray(parsed)).toBe(true);
    });

    it("should error on invalid type", async () => {
      const result = await executeBrainTool("brain_read", ctx, { type: "invalid" });
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("type must be one of");
    });
  });

  // ─── brain_write ──────────────────────────────────────────────────────────

  describe("brain_write", () => {
    it("should write a fact", async () => {
      const result = await executeBrainTool("brain_write", ctx, {
        type: "fact",
        key: "new.fact",
        value: "hello",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Fact set: new.fact");
      expect(brain.getFact("new.fact")).toBe("hello");
    });

    it("should write a memory", async () => {
      const result = await executeBrainTool("brain_write", ctx, {
        type: "memory",
        key: "test-memory",
        value: "learned something",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Memory stored: test-memory");
    });

    it("should write knowledge", async () => {
      const result = await executeBrainTool("brain_write", ctx, {
        type: "knowledge",
        key: "test-knowledge",
        value: "pattern detected",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Knowledge stored: test-knowledge");
    });

    it("should error on missing key", async () => {
      const result = await executeBrainTool("brain_write", ctx, {
        type: "fact",
        value: "no key",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("key is required");
    });

    it("should error on invalid type", async () => {
      const result = await executeBrainTool("brain_write", ctx, {
        type: "invalid",
        key: "x",
        value: "y",
      });

      expect(result.isError).toBe(true);
    });
  });

  // ─── brain_search ─────────────────────────────────────────────────────────

  describe("brain_search", () => {
    beforeEach(async () => {
      await brain.setFact("user.name", "Alice");
      await brain.setFact("user.email", "alice@example.com");
      await brain.setFact("project.status", "active");
    });

    it("should search facts by query", async () => {
      const result = await executeBrainTool("brain_search", ctx, { query: "user" });

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalResults).toBe(2);
      expect(parsed.results.facts).toHaveLength(2);
    });

    it("should search case-insensitively", async () => {
      const result = await executeBrainTool("brain_search", ctx, { query: "ALICE" });

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalResults).toBeGreaterThanOrEqual(1);
    });

    it("should filter by types", async () => {
      const result = await executeBrainTool("brain_search", ctx, {
        query: "user",
        types: ["fact"],
      });

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.facts).toBeDefined();
      expect(parsed.results.memories).toBeUndefined();
    });

    it("should return no results for non-matching query", async () => {
      const result = await executeBrainTool("brain_search", ctx, { query: "nonexistent" });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("No results found");
    });

    it("should error on missing query", async () => {
      const result = await executeBrainTool("brain_search", ctx, {});
      expect(result.isError).toBe(true);
    });

    it("should respect limit parameter", async () => {
      // Set many facts
      for (let i = 0; i < 20; i++) {
        await brain.setFact(`item.${i}`, `value ${i}`);
      }

      const result = await executeBrainTool("brain_search", ctx, {
        query: "item",
        limit: 5,
      });

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.results.facts.length).toBeLessThanOrEqual(5);
    });
  });

  // ─── brain_status ─────────────────────────────────────────────────────────

  describe("brain_status", () => {
    it("should return status overview", async () => {
      await brain.setFact("x", "y");

      const result = await executeBrainTool("brain_status", ctx, {});

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed).toHaveProperty("mode");
      expect(parsed).toHaveProperty("facts", 1);
      expect(parsed).toHaveProperty("memories");
      expect(parsed).toHaveProperty("wikiPages");
      expect(parsed).toHaveProperty("tasks");
      expect(parsed).toHaveProperty("knowledgeEntries");
      expect(parsed).toHaveProperty("lastSync");
      expect(parsed).toHaveProperty("hasSoul");
    });
  });

  // ─── brain_wiki ───────────────────────────────────────────────────────────

  describe("brain_wiki", () => {
    it("should list wiki pages (empty)", async () => {
      const result = await executeBrainTool("brain_wiki", ctx, { action: "list" });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("No wiki pages found");
    });

    it("should create a wiki page", async () => {
      const result = await executeBrainTool("brain_wiki", ctx, {
        action: "create",
        slug: "test-page",
        content: "# Test Page\n\nHello world",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Wiki page created: test-page");

      // Verify file exists
      const { existsSync } = await import("fs");
      expect(existsSync(join(repoRoot, "cocapn", "wiki", "test-page.md"))).toBe(true);
    });

    it("should get a wiki page", async () => {
      writeFileSync(join(repoRoot, "cocapn", "wiki", "existing.md"), "# Existing\nContent", "utf8");

      const result = await executeBrainTool("brain_wiki", ctx, {
        action: "get",
        slug: "existing.md",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("# Existing");
    });

    it("should handle missing wiki page", async () => {
      const result = await executeBrainTool("brain_wiki", ctx, {
        action: "get",
        slug: "missing",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Wiki page not found: missing");
    });

    it("should update a wiki page", async () => {
      writeFileSync(join(repoRoot, "cocapn", "wiki", "update-test.md"), "old", "utf8");

      const result = await executeBrainTool("brain_wiki", ctx, {
        action: "update",
        slug: "update-test.md",
        content: "# Updated\nNew content",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Wiki page updated: update-test.md");
    });

    it("should error on invalid action", async () => {
      const result = await executeBrainTool("brain_wiki", ctx, { action: "delete" });
      expect(result.isError).toBe(true);
    });

    it("should error on create without content", async () => {
      const result = await executeBrainTool("brain_wiki", ctx, {
        action: "create",
        slug: "no-content",
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── brain_knowledge ──────────────────────────────────────────────────────

  describe("brain_knowledge", () => {
    it("should ingest knowledge", async () => {
      const result = await executeBrainTool("brain_knowledge", ctx, {
        action: "ingest",
        content: "Learned: user prefers dark mode",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Knowledge ingested");
    });

    it("should query knowledge", async () => {
      // Ingest first
      await executeBrainTool("brain_knowledge", ctx, {
        action: "ingest",
        content: "Learned: user prefers dark mode",
      });

      const result = await executeBrainTool("brain_knowledge", ctx, {
        action: "query",
        content: "dark mode",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("dark mode");
    });

    it("should validate knowledge", async () => {
      const result = await executeBrainTool("brain_knowledge", ctx, {
        action: "validate",
      });

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.validated).toBe(true);
      expect(parsed).toHaveProperty("stats");
    });

    it("should export knowledge", async () => {
      const result = await executeBrainTool("brain_knowledge", ctx, {
        action: "export",
      });

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.version).toBe("1.0");
      expect(parsed).toHaveProperty("memories");
      expect(parsed).toHaveProperty("stats");
    });

    it("should error on invalid action", async () => {
      const result = await executeBrainTool("brain_knowledge", ctx, { action: "delete" });
      expect(result.isError).toBe(true);
    });

    it("should error on ingest without content", async () => {
      const result = await executeBrainTool("brain_knowledge", ctx, { action: "ingest" });
      expect(result.isError).toBe(true);
    });
  });

  // ─── brain_repo ───────────────────────────────────────────────────────────

  describe("brain_repo", () => {
    it("should query architecture", async () => {
      const result = await executeBrainTool("brain_repo", ctx, {
        action: "architecture",
      });

      expect(result.isError).toBe(false);
      // May be empty in a fresh test repo, but should not error
    });

    it("should query file history", async () => {
      const result = await executeBrainTool("brain_repo", ctx, {
        action: "file-history",
        path: "nonexistent.ts",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("No history found");
    });

    it("should query patterns", async () => {
      const result = await executeBrainTool("brain_repo", ctx, {
        action: "patterns",
      });

      expect(result.isError).toBe(false);
    });

    it("should list modules", async () => {
      const result = await executeBrainTool("brain_repo", ctx, {
        action: "modules",
      });

      expect(result.isError).toBe(false);
    });

    it("should query a specific module", async () => {
      const result = await executeBrainTool("brain_repo", ctx, {
        action: "modules",
        path: "nonexistent",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Module not found");
    });

    it("should error on invalid action", async () => {
      const result = await executeBrainTool("brain_repo", ctx, { action: "invalid" });
      expect(result.isError).toBe(true);
    });

    it("should error on file-history without path", async () => {
      const result = await executeBrainTool("brain_repo", ctx, { action: "file-history" });
      expect(result.isError).toBe(true);
    });
  });

  // ─── Error handling ───────────────────────────────────────────────────────

  describe("Error handling", () => {
    it("should return error for unknown tool", async () => {
      const result = await executeBrainTool("nonexistent", ctx, {});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Unknown brain tool");
    });

    it("brain_read should return error for invalid type", async () => {
      const result = await executeBrainTool("brain_read", ctx, { type: 123 });
      expect(result.isError).toBe(true);
    });

    it("brain_write should return error for non-string value on fact", async () => {
      const result = await executeBrainTool("brain_write", ctx, {
        type: "fact",
        key: "x",
        value: 123,
      });
      expect(result.isError).toBe(true);
    });
  });

  // ─── Mode filtering ───────────────────────────────────────────────────────

  describe("Mode filtering", () => {
    it("public mode should not expose private.* facts", async () => {
      await brain.setFact("public.name", "Alice");
      await brain.setFact("private.apiKey", "secret123");

      // Read with public mode
      const result = await executeBrainTool("brain_read", ctx, {
        type: "fact",
        key: "private.apiKey",
        mode: "public",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Fact not found");
    });

    it("private mode should expose private.* facts", async () => {
      await brain.setFact("private.apiKey", "secret123");

      const result = await executeBrainTool("brain_read", ctx, {
        type: "fact",
        key: "private.apiKey",
        mode: "private",
      });

      expect(result.isError).toBe(false);
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.value).toBe("secret123");
    });

    it("brain_write should be no-op in public mode", async () => {
      brain.setMode("public");

      const result = await executeBrainTool("brain_write", ctx, {
        type: "fact",
        key: "test.noop",
        value: "should not write",
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Fact set: test.noop");
      // But the fact should not actually be stored
      expect(brain.getFact("test.noop")).toBeUndefined();
    });
  });
});
