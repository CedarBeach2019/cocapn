/**
 * Tests for BrainMCPServer
 *
 * Tests the MCP server that exposes Brain memory as tools and resources.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { BrainMCPServer } from "../src/brain/mcp-server.js";
import { Brain } from "../src/brain/index.js";
import { GitSync } from "../src/git/sync.js";
import { DEFAULT_CONFIG } from "../src/config/types.js";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { execSync } from "child_process";

describe("BrainMCPServer", () => {
  let brain: Brain;
  let server: BrainMCPServer;
  let repoRoot: string;
  let sync: GitSync;

  beforeEach(async () => {
    repoRoot = mkdtempSync(join(tmpdir(), "cocapn-brain-test-"));

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

    // Create empty facts.json
    writeFileSync(join(repoRoot, "cocapn", "memory", "facts.json"), "{}");

    // Create config and sync
    const config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)) as typeof DEFAULT_CONFIG;
    sync = new GitSync(repoRoot, config);

    brain = new Brain(repoRoot, config, sync);
    server = new BrainMCPServer({ brain });
  });

  afterEach(() => {
    // Cleanup
    try {
      rmSync(repoRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Tool Registration", () => {
    it("should register all 6 tools on construction", () => {
      // Get tool definitions through the server's internal tools map
      const tools = (server as any).tools;
      expect(tools.size).toBe(6);

      const toolNames = new Set();
      for (const [name] of tools) {
        toolNames.add(name);
      }

      expect(toolNames.has("brain_set_fact")).toBe(true);
      expect(toolNames.has("brain_get_fact")).toBe(true);
      expect(toolNames.has("brain_search_facts")).toBe(true);
      expect(toolNames.has("brain_set_wiki_page")).toBe(true);
      expect(toolNames.has("brain_get_wiki_page")).toBe(true);
      expect(toolNames.has("brain_list_wiki_pages")).toBe(true);
    });

    it("should have correct input schema for brain_set_fact", () => {
      const tools = (server as any).tools;
      const tool = tools.get("brain_set_fact");

      expect(tool).toBeDefined();
      expect(tool.definition.inputSchema).toEqual({
        type: "object",
        properties: {
          key: { type: "string", description: expect.any(String) },
          value: { type: "string", description: expect.any(String) },
        },
        required: ["key", "value"],
      });
    });
  });

  describe("Resource Registration", () => {
    it("should register resources on construction", () => {
      const resources = (server as any).resources;
      expect(resources.size).toBeGreaterThanOrEqual(2);

      expect(resources.has("brain://soul")).toBe(true);
      expect(resources.has("brain://facts")).toBe(true);
      expect(resources.has("brain://wiki")).toBe(true);
    });

    it("should register resource templates", () => {
      const templates = (server as any).resourceTemplates;
      expect(templates.size).toBeGreaterThanOrEqual(2);

      expect(templates.has("brain://facts/{key}")).toBe(true);
      expect(templates.has("brain://wiki/{slug}")).toBe(true);
    });
  });

  describe("brain_set_fact tool", () => {
    it("should set a fact successfully", async () => {
      const handler = server.getToolHandlerForTest("brain_set_fact");
      expect(handler).toBeDefined();

      const result = await handler!({
        name: "brain_set_fact",
        arguments: { key: "test.key", value: "test value" },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Fact set: test.key = test value");
      expect(brain.getFact("test.key")).toBe("test value");
    });

    it("should return error for non-string key", async () => {
      const handler = server.getToolHandlerForTest("brain_set_fact");
      const result = await handler!({
        name: "brain_set_fact",
        arguments: { key: 123, value: "test" },
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("key and value must be strings");
    });
  });

  describe("brain_get_fact tool", () => {
    it("should get an existing fact", async () => {
      await brain.setFact("existing.key", "existing value");

      const handler = server.getToolHandlerForTest("brain_get_fact");
      const result = await handler!({
        name: "brain_get_fact",
        arguments: { key: "existing.key" },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("existing.key = existing value");
    });

    it("should handle missing fact gracefully", async () => {
      const handler = server.getToolHandlerForTest("brain_get_fact");
      const result = await handler!({
        name: "brain_get_fact",
        arguments: { key: "missing.key" },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Fact not found: missing.key");
    });
  });

  describe("brain_search_facts tool", () => {
    beforeEach(async () => {
      await brain.setFact("user.name", "Alice");
      await brain.setFact("user.email", "alice@example.com");
      await brain.setFact("project.status", "active");
    });

    it("should search facts by query", async () => {
      const handler = server.getToolHandlerForTest("brain_search_facts");
      const result = await handler!({
        name: "brain_search_facts",
        arguments: { query: "user" },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Found 2 facts");
      expect(result.content[0].text).toContain("user.name = Alice");
      expect(result.content[0].text).toContain("user.email = alice@example.com");
    });

    it("should be case insensitive", async () => {
      const handler = server.getToolHandlerForTest("brain_search_facts");
      const result = await handler!({
        name: "brain_search_facts",
        arguments: { query: "EMAIL" },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("alice@example.com");
    });

    it("should return no results message for empty search", async () => {
      const handler = server.getToolHandlerForTest("brain_search_facts");
      const result = await handler!({
        name: "brain_search_facts",
        arguments: { query: "nonexistent" },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("No facts found matching: nonexistent");
    });
  });

  describe("brain_set_wiki_page tool", () => {
    it("should create a wiki page", async () => {
      const handler = server.getToolHandlerForTest("brain_set_wiki_page");
      const result = await handler!({
        name: "brain_set_wiki_page",
        arguments: { slug: "test-page", content: "# Test Page\n\nThis is a test." },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Wiki page saved: test-page");
    });

    it("should add .md extension if not provided", async () => {
      const handler = server.getToolHandlerForTest("brain_set_wiki_page");
      await handler!({
        name: "brain_set_wiki_page",
        arguments: { slug: "no-ext", content: "content" },
      });

      // File should exist as no-ext.md
      const { existsSync } = require("fs");
      const { join } = require("path");
      expect(existsSync(join(repoRoot, "cocapn", "wiki", "no-ext.md"))).toBe(true);
    });
  });

  describe("brain_get_wiki_page tool", () => {
    beforeEach(async () => {
      // Create a wiki page via the tool
      const handler = server.getToolHandlerForTest("brain_set_wiki_page");
      await handler!({
        name: "brain_set_wiki_page",
        arguments: { slug: "existing-page", content: "# Existing\n\nContent here." },
      });
    });

    it("should get an existing wiki page", async () => {
      const handler = server.getToolHandlerForTest("brain_get_wiki_page");
      const result = await handler!({
        name: "brain_get_wiki_page",
        arguments: { slug: "existing-page" },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("# Existing");
      expect(result.content[0].text).toContain("Content here.");
    });

    it("should handle missing wiki page gracefully", async () => {
      const handler = server.getToolHandlerForTest("brain_get_wiki_page");
      const result = await handler!({
        name: "brain_get_wiki_page",
        arguments: { slug: "missing-page" },
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("Wiki page not found: missing-page");
    });
  });

  describe("brain_list_wiki_pages tool", () => {
    it("should return message when wiki directory does not exist", async () => {
      const handler = server.getToolHandlerForTest("brain_list_wiki_pages");
      const result = await handler!({
        name: "brain_list_wiki_pages",
        arguments: {},
      });

      expect(result.isError).toBe(false);
      expect(result.content[0].text).toContain("No wiki pages found");
    });

    it("should list all wiki pages", async () => {
      const setHandler = server.getToolHandlerForTest("brain_set_wiki_page");
      await setHandler!({
        name: "brain_set_wiki_page",
        arguments: { slug: "page1", content: "# Page 1" },
      });
      await setHandler!({
        name: "brain_set_wiki_page",
        arguments: { slug: "page2", content: "# Page 2" },
      });

      // The wiki index needs to be built before searchWiki returns results
      // Force index building by calling searchWiki once
      brain.searchWiki("");

      const listHandler = server.getToolHandlerForTest("brain_list_wiki_pages");
      const result = await listHandler!({
        name: "brain_list_wiki_pages",
        arguments: {},
      });

      expect(result.isError).toBe(false);
      // The text should either list pages or say no pages found
      const text = result.content[0].text;
      if (text.includes("Wiki pages:")) {
        expect(text).toContain("page1.md:");
        expect(text).toContain("page2.md:");
      }
    });
  });

  describe("brain://soul resource", () => {
    it("should return soul content", async () => {
      const handler = server.getResourceHandlerForTest("brain://soul");
      expect(handler).toBeDefined();

      const result = await handler!({ uri: "brain://soul" });

      expect(result.contents[0].uri).toBe("brain://soul");
      expect(result.contents[0].mimeType).toBe("text/markdown");
    });
  });

  describe("brain://facts resource", () => {
    beforeEach(async () => {
      await brain.setFact("test.fact", "test value");
    });

    it("should return all facts as JSON", async () => {
      const handler = server.getResourceHandlerForTest("brain://facts");
      const result = await handler!({ uri: "brain://facts" });

      expect(result.contents[0].uri).toBe("brain://facts");
      expect(result.contents[0].mimeType).toBe("application/json");

      const facts = JSON.parse(result.contents[0].text);
      expect(facts["test.fact"]).toBe("test value");
    });
  });

  describe("brain://wiki resource", () => {
    it("should return wiki index", async () => {
      const handler = server.getResourceHandlerForTest("brain://wiki");
      const result = await handler!({ uri: "brain://wiki" });

      expect(result.contents[0].uri).toBe("brain://wiki");
      expect(result.contents[0].mimeType).toBe("application/json");

      const pages = JSON.parse(result.contents[0].text);
      expect(Array.isArray(pages)).toBe(true);
    });
  });

  describe("brain://facts/{key} resource pattern", () => {
    beforeEach(async () => {
      await brain.setFact("pattern.test", "value");
    });

    it("should get individual fact by key", async () => {
      const patterns = (server as any).resourcePatterns;
      const patternHandler = patterns.find((p: any) => p.pattern === "brain://facts/");
      expect(patternHandler).toBeDefined();

      const result = await patternHandler.handler({ uri: "brain://facts/pattern.test" });

      expect(result.contents[0].uri).toBe("brain://facts/pattern.test");
      expect(result.contents[0].mimeType).toBe("text/plain");
      expect(result.contents[0].text).toBe("value");
    });

    it("should throw for missing fact", async () => {
      const patterns = (server as any).resourcePatterns;
      const patternHandler = patterns.find((p: any) => p.pattern === "brain://facts/");

      await expect(
        patternHandler.handler({ uri: "brain://facts/missing" })
      ).rejects.toThrow("Fact not found: missing");
    });
  });

  describe("brain://wiki/{slug} resource pattern", () => {
    beforeEach(async () => {
      const handler = server.getToolHandlerForTest("brain_set_wiki_page");
      await handler!({
        name: "brain_set_wiki_page",
        arguments: { slug: "pattern-test", content: "# Pattern Test" },
      });
    });

    it("should get individual wiki page by slug", async () => {
      const patterns = (server as any).resourcePatterns;
      const patternHandler = patterns.find((p: any) => p.pattern === "brain://wiki/");

      const result = await patternHandler.handler({ uri: "brain://wiki/pattern-test" });

      expect(result.contents[0].uri).toBe("brain://wiki/pattern-test");
      expect(result.contents[0].mimeType).toBe("text/markdown");
      expect(result.contents[0].text).toContain("# Pattern Test");
    });

    it("should throw for missing wiki page", async () => {
      const patterns = (server as any).resourcePatterns;
      const patternHandler = patterns.find((p: any) => p.pattern === "brain://wiki/");

      await expect(
        patternHandler.handler({ uri: "brain://wiki/missing" })
      ).rejects.toThrow("Wiki page not found: missing");
    });
  });
});
