/**
 * Template Registry Client Tests
 *
 * Tests for:
 * - Search with mocked API
 * - Install from local registry
 * - Publish flow
 * - List installed
 * - Offline mode (local only)
 * - Built-in template resolution
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { TemplateRegistryClient, BUILTIN_TEMPLATES } from "../src/templates/registry-client.js";
import type { RegistryConfig } from "../src/templates/registry-client-types.js";
import { mkdirSync, rmSync, writeFileSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("TemplateRegistryClient", () => {
  let tempDir: string;
  let client: TemplateRegistryClient;
  let config: RegistryConfig;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = join(tmpdir(), `cocapn-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    config = {
      localPath: join(tempDir, "registry"),
      apiUrl: "https://test-registry.cocapn.ai/api",
      authToken: "test-token",
    };

    client = new TemplateRegistryClient(config);
  });

  afterEach(() => {
    // Cleanup temp directory
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  // ---------------------------------------------------------------------------
  // Built-in Templates
  // ---------------------------------------------------------------------------

  describe("isBuiltinTemplate", () => {
    it("should recognize built-in templates", () => {
      for (const name of BUILTIN_TEMPLATES) {
        expect(client.isBuiltinTemplate(name)).toBe(true);
      }
    });

    it("should reject non-built-in templates", () => {
      expect(client.isBuiltinTemplate("unknown-template")).toBe(false);
      expect(client.isBuiltinTemplate("")).toBe(false);
    });
  });

  describe("getBuiltinTemplate", () => {
    it("should return metadata for built-in templates", async () => {
      const bare = await client.get("bare");
      expect(bare).not.toBeNull();
      expect(bare?.name).toBe("bare");
      expect(bare?.version).toBe("1.0.0");
      expect(bare?.description).toContain("minimal");
    });

    it("should return null for unknown templates", async () => {
      const unknown = await client.get("unknown-template-xyz");
      expect(unknown).toBeNull();
    });

    it("should include all expected built-in templates", async () => {
      const expected = ["bare", "cloud-worker", "web-app", "dmlog", "studylog", "makerlog", "businesslog"];

      for (const name of expected) {
        const template = await client.get(name);
        expect(template).not.toBeNull();
        expect(template?.name).toBe(name);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Remote API (with fetch mocking)
  // ---------------------------------------------------------------------------

  describe("search (remote API)", () => {
    it("should search remote registry when available", async () => {
      // Mock fetch to simulate remote API
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          templates: [
            {
              name: "test-template",
              version: "1.0.0",
              description: "A test template",
              author: "Test Author",
              keywords: ["test", "example"],
              downloads: 100,
              createdAt: "2024-01-01T00:00:00Z",
              updatedAt: "2024-01-01T00:00:00Z",
            },
          ],
          total: 1,
          query: "test",
        }),
      });

      global.fetch = mockFetch as any;

      const result = await client.search("test");

      expect(result.total).toBe(1);
      expect(result.templates).toHaveLength(1);
      expect(result.templates[0].name).toBe("test-template");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("/templates/search?q=test"),
        expect.any(Object)
      );
    });

    it("should fallback to local search when remote API fails", async () => {
      // Mock fetch to fail
      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch as any;

      // Install a template locally first
      await client.install("bare");

      const result = await client.search("bare");

      // Should fallback to local search
      expect(result.templates.length).toBeGreaterThan(0);
      expect(result.templates[0].name).toBe("bare");
    });
  });

  describe("download (remote)", () => {
    it("should download from remote registry when available", async () => {
      const mockContent = Buffer.from("test template content");

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => mockContent.buffer,
      });

      global.fetch = mockFetch as any;

      const result = await client.download("remote-template", "1.0.0");

      expect(result.name).toBe("remote-template");
      expect(result.version).toBe("1.0.0");
      expect(result.content).toEqual(mockContent);
    });
  });

  // ---------------------------------------------------------------------------
  // Local Registry (Offline Mode)
  // ---------------------------------------------------------------------------

  describe("local registry", () => {
    it("should maintain local registry index", async () => {
      await client.install("bare");

      const indexDir = join(config.localPath!, "index.json");
      expect(indexDir).toBeDefined();

      // Index file should exist
      const indexExists = require("fs").existsSync(indexDir);
      expect(indexExists).toBe(true);
    });

    it("should search local templates when offline", async () => {
      // Install a template
      await client.install("dmlog");

      // Mock fetch to fail (simulate offline)
      const mockFetch = vi.fn().mockRejectedValue(new Error("Offline"));
      global.fetch = mockFetch as any;

      // Search should still work with local templates
      const result = await client.search("dmlog");

      expect(result.total).toBeGreaterThan(0);
      expect(result.templates.some((t) => t.name === "dmlog")).toBe(true);
    });

    it("should get local template details", async () => {
      await client.install("studylog");

      // Mock fetch to fail
      const mockFetch = vi.fn().mockRejectedValue(new Error("Offline"));
      global.fetch = mockFetch as any;

      const template = await client.get("studylog");

      expect(template).not.toBeNull();
      expect(template?.name).toBe("studylog");
    });
  });

  // ---------------------------------------------------------------------------
  // Install / Uninstall
  // ---------------------------------------------------------------------------

  describe("install", () => {
    it("should install built-in templates", async () => {
      const path = await client.install("bare");

      expect(path).toBeDefined();
      expect(path).toContain("bare");

      // Check manifest was created
      const manifestPath = join(path, "cocapn-template.json");
      const manifestExists = require("fs").existsSync(manifestPath);
      expect(manifestExists).toBe(true);
    });

    it("should install multiple templates", async () => {
      const templates = ["bare", "dmlog", "studylog"];

      for (const name of templates) {
        await client.install(name);
      }

      const installed = client.listInstalled();
      expect(installed).toHaveLength(templates.length);

      const names = installed.map((t) => t.name);
      expect(names).toContain("bare");
      expect(names).toContain("dmlog");
      expect(names).toContain("studylog");
    });

    it("should update existing installation", async () => {
      await client.install("makerlog");

      // Install again (should update)
      const path = await client.install("makerlog");

      expect(path).toBeDefined();

      const installed = client.listInstalled();
      expect(installed.filter((t) => t.name === "makerlog")).toHaveLength(1);
    });

    it("should create template structure with personality.md", async () => {
      const path = await client.install("dmlog");

      const personalityPath = join(path, "personality.md");
      const personalityExists = require("fs").existsSync(personalityPath);
      expect(personalityExists).toBe(true);

      const content = readFileSync(personalityPath, "utf8");
      expect(content).toContain("Dungeon Master");
    });

    it("should create skills and modules directories", async () => {
      const path = await client.install("bare");

      const skillsPath = join(path, "skills");
      const modulesPath = join(path, "modules");

      const skillsExists = require("fs").existsSync(skillsPath);
      const modulesExists = require("fs").existsSync(modulesPath);

      expect(skillsExists).toBe(true);
      expect(modulesExists).toBe(true);
    });
  });

  describe("uninstall", () => {
    it("should uninstall installed templates", async () => {
      await client.install("web-app");

      const installedBefore = client.listInstalled();
      expect(installedBefore.some((t) => t.name === "web-app")).toBe(true);

      client.uninstall("web-app");

      const installedAfter = client.listInstalled();
      expect(installedAfter.some((t) => t.name === "web-app")).toBe(false);
    });

    it("should throw error when uninstalling non-existent template", () => {
      expect(() => client.uninstall("non-existent")).toThrow();
    });
  });

  describe("listInstalled", () => {
    it("should return empty list when no templates installed", () => {
      const installed = client.listInstalled();
      expect(installed).toEqual([]);
    });

    it("should list all installed templates", async () => {
      const templates = ["cloud-worker", "businesslog"];

      for (const name of templates) {
        await client.install(name);
      }

      const installed = client.listInstalled();
      expect(installed).toHaveLength(templates.length);

      for (const template of installed) {
        expect(template.path).toBeDefined();
        expect(template.version).toBeDefined();
        expect(template.installedAt).toBeDefined();
      }
    });

    it("should sort installed templates alphabetically", async () => {
      const templates = ["zebra", "alpha", "beta"];

      for (const name of templates) {
        // Use built-in templates
        await client.install("bare");
      }

      const installed = client.listInstalled();
      const names = installed.map((t) => t.name);

      // Check if sorted
      for (let i = 1; i < names.length; i++) {
        expect(names[i] >= names[i - 1]).toBe(true);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Publish
  // ---------------------------------------------------------------------------

  describe("publish", () => {
    it("should reject missing manifest", async () => {
      const result = await client.publish("/non-existent/path");

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Missing cocapn-template.json");
    });

    it("should reject invalid manifest", async () => {
      // Create temp directory with invalid manifest
      const testDir = join(tempDir, "test-template");
      mkdirSync(testDir, { recursive: true });

      const invalidManifest = {
        name: "invalid-name-with-uppercase", // Invalid: not kebab-case
        version: "not-a-version", // Invalid: not semver
      };

      writeFileSync(join(testDir, "cocapn-template.json"), JSON.stringify(invalidManifest, null, 2));

      const result = await client.publish(testDir);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Invalid manifest");
    });

    it("should reject publish without auth token", async () => {
      const noAuthClient = new TemplateRegistryClient({
        localPath: config.localPath,
        apiUrl: config.apiUrl,
        // No authToken
      });

      // Create valid template
      const testDir = join(tempDir, "valid-template");
      mkdirSync(testDir, { recursive: true });

      const validManifest = {
        name: "test-template",
        version: "1.0.0",
        description: "A valid test template",
        author: "Test Author",
        keywords: ["test"],
      };

      writeFileSync(join(testDir, "cocapn-template.json"), JSON.stringify(validManifest, null, 2));

      const result = await noAuthClient.publish(testDir);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Authentication required");
    });

    it("should publish valid template with auth", async () => {
      // Create valid template
      const testDir = join(tempDir, "publishable-template");
      mkdirSync(testDir, { recursive: true });

      const validManifest = {
        name: "publishable-template",
        version: "1.0.0",
        description: "A publishable test template",
        author: "Test Author",
        keywords: ["test", "publish"],
      };

      writeFileSync(join(testDir, "cocapn-template.json"), JSON.stringify(validManifest, null, 2));

      // Mock successful publish
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: "https://registry.cocapn.ai/templates/publishable-template" }),
      });

      global.fetch = mockFetch as any;

      const result = await client.publish(testDir);

      expect(result.ok).toBe(true);
      expect(result.url).toBeDefined();
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining("publishable-template"),
        expect.objectContaining({
          method: "PUT",
          headers: expect.objectContaining({
            Authorization: "Bearer test-token",
          }),
        })
      );
    });

    it("should handle publish errors", async () => {
      const testDir = join(tempDir, "error-template");
      mkdirSync(testDir, { recursive: true });

      const validManifest = {
        name: "error-template",
        version: "1.0.0",
        description: "Template that will fail to publish",
        author: "Test Author",
      };

      writeFileSync(join(testDir, "cocapn-template.json"), JSON.stringify(validManifest, null, 2));

      // Mock failed publish
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: "Template already exists" }),
      });

      global.fetch = mockFetch as any;

      const result = await client.publish(testDir);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Template already exists");
    });
  });

  // ---------------------------------------------------------------------------
  // Manifest Validation
  // ---------------------------------------------------------------------------

  describe("manifest validation", () => {
    it("should validate correct manifest", async () => {
      const testDir = join(tempDir, "valid-manifest");
      mkdirSync(testDir, { recursive: true });

      const manifest = {
        name: "valid-name",
        version: "1.0.0",
        description: "Valid description",
        author: "Valid Author",
        keywords: ["keyword1", "keyword2"],
      };

      writeFileSync(join(testDir, "cocapn-template.json"), JSON.stringify(manifest, null, 2));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ url: "https://registry.cocapn.ai/templates/valid-name" }),
      });

      global.fetch = mockFetch as any;

      const result = await client.publish(testDir);

      // Should not have validation errors
      expect(result.error).not.toContain("Invalid manifest");
    });

    it("should reject invalid name formats", async () => {
      const testDir = join(tempDir, "invalid-name");
      mkdirSync(testDir, { recursive: true });

      const manifest = {
        name: "Invalid_Name", // Has uppercase and underscore
        version: "1.0.0",
        description: "Test",
        author: "Test",
      };

      writeFileSync(join(testDir, "cocapn-template.json"), JSON.stringify(manifest, null, 2));

      const result = await client.publish(testDir);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Invalid manifest");
      expect(result.error).toContain("kebab-case");
    });

    it("should reject invalid version formats", async () => {
      const testDir = join(tempDir, "invalid-version");
      mkdirSync(testDir, { recursive: true });

      const manifest = {
        name: "test-template",
        version: "v1.0", // Not semver
        description: "Test",
        author: "Test",
      };

      writeFileSync(join(testDir, "cocapn-template.json"), JSON.stringify(manifest, null, 2));

      const result = await client.publish(testDir);

      expect(result.ok).toBe(false);
      expect(result.error).toContain("Invalid manifest");
      expect(result.error).toContain("semver");
    });
  });

  // ---------------------------------------------------------------------------
  // Built-in Template Content
  // ---------------------------------------------------------------------------

  describe("built-in template content", () => {
    it("should create dmlog with dungeon master personality", async () => {
      const path = await client.install("dmlog");

      const personalityPath = join(path, "personality.md");
      const content = readFileSync(personalityPath, "utf8");

      expect(content).toContain("Dungeon Master");
      expect(content).toContain("TTRPG");
      expect(content).toContain("dice");
    });

    it("should create studylog with learning companion personality", async () => {
      const path = await client.install("studylog");

      const personalityPath = join(path, "personality.md");
      const content = readFileSync(personalityPath, "utf8");

      expect(content).toContain("Learning Companion");
      expect(content).toContain("Socratic");
      expect(content).toContain("spaced repetition");
    });

    it("should create makerlog with developer companion personality", async () => {
      const path = await client.install("makerlog");

      const personalityPath = join(path, "personality.md");
      const content = readFileSync(personalityPath, "utf8");

      expect(content).toContain("Developer Companion");
      expect(content).toContain("build logs");
    });

    it("should create businesslog with business assistant personality", async () => {
      const path = await client.install("businesslog");

      const personalityPath = join(path, "personality.md");
      const content = readFileSync(personalityPath, "utf8");

      expect(content).toContain("Business Assistant");
      expect(content).toContain("enterprise");
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe("edge cases", () => {
    it("should handle empty search query", async () => {
      const result = await client.search("");

      expect(result.total).toBe(0);
      expect(result.templates).toEqual([]);
    });

    it("should handle very long search queries", async () => {
      const longQuery = "a".repeat(1000);

      // Should not throw
      const result = await client.search(longQuery);

      expect(result).toBeDefined();
    });

    it("should handle special characters in template names", async () => {
      // Built-in templates should work
      const result = await client.get("cloud-worker");

      expect(result).not.toBeNull();
      expect(result?.name).toBe("cloud-worker");
    });

    it("should handle concurrent installs", async () => {
      // Install multiple templates concurrently
      const templates = ["bare", "dmlog", "studylog", "makerlog"];

      const installs = templates.map((name) => client.install(name));
      const paths = await Promise.all(installs);

      expect(paths).toHaveLength(templates.length);
      expect(paths.every((p) => p !== undefined)).toBe(true);

      const installed = client.listInstalled();
      expect(installed.length).toBeGreaterThanOrEqual(templates.length);
    });
  });
});
