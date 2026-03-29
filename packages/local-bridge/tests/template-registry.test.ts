/**
 * Tests for Template Registry
 *
 * Tests template listing, retrieval, validation, and installation.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { TemplateRegistry } from "../src/templates/registry.js";
import { writeFileSync, unlinkSync, existsSync, mkdirSync, rmSync, mkdtempSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

describe("TemplateRegistry", () => {
  let cacheDir: string;
  let registry: TemplateRegistry;

  beforeEach(() => {
    cacheDir = mkdtempSync(join(tmpdir(), "cocapn-template-test-"));
    registry = new TemplateRegistry(cacheDir);
  });

  afterEach(() => {
    try {
      rmSync(cacheDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("constructor", () => {
    it("should create cache directory if it does not exist", () => {
      const newDir = mkdtempSync(join(tmpdir(), "cocapn-new-"));
      rmSync(newDir, { recursive: true });

      new TemplateRegistry(newDir);
      expect(existsSync(newDir)).toBe(true);

      rmSync(newDir, { recursive: true, force: true });
    });
  });

  describe("listTemplates", () => {
    it("should return empty array when no templates exist", () => {
      const templates = registry.listTemplates();
      expect(templates).toEqual([]);
    });

    it("should list all valid templates", () => {
      // Create valid template manifests
      writeFileSync(
        join(cacheDir, "template1.json"),
        JSON.stringify({
          name: "template1",
          version: "1.0.0",
          displayName: "Template 1",
          description: "First template",
          domains: ["template1.ai"],
          emoji: "📝",
          author: "Test Author",
        })
      );

      writeFileSync(
        join(cacheDir, "template2.json"),
        JSON.stringify({
          name: "template2",
          version: "1.0.0",
          displayName: "Template 2",
          description: "Second template",
          domains: ["template2.ai"],
          emoji: "🚀",
          author: "Test Author",
        })
      );

      const templates = registry.listTemplates();
      expect(templates).toHaveLength(2);
      expect(templates[0].name).toBe("template1");
      expect(templates[1].name).toBe("template2");
    });

    it("should skip non-JSON files", () => {
      writeFileSync(join(cacheDir, "readme.txt"), "not a template");
      writeFileSync(
        join(cacheDir, "valid.json"),
        JSON.stringify({
          name: "valid",
          version: "1.0.0",
          displayName: "Valid",
          description: "Valid template",
          domains: ["valid.ai"],
          emoji: "✓",
          author: "Test",
        })
      );

      const templates = registry.listTemplates();
      expect(templates).toHaveLength(1);
      expect(templates[0].name).toBe("valid");
    });

    it("should skip invalid manifests", () => {
      writeFileSync(
        join(cacheDir, "invalid.json"),
        JSON.stringify({ name: "invalid" }) // Missing required fields
      );

      const templates = registry.listTemplates();
      expect(templates).toHaveLength(0);
    });

    it("should return templates sorted by name", () => {
      writeFileSync(
        join(cacheDir, "zebra.json"),
        JSON.stringify({
          name: "zebra",
          version: "1.0.0",
          displayName: "Zebra",
          description: "Z",
          domains: ["z.ai"],
          emoji: "🦓",
          author: "Test",
        })
      );

      writeFileSync(
        join(cacheDir, "apple.json"),
        JSON.stringify({
          name: "apple",
          version: "1.0.0",
          displayName: "Apple",
          description: "A",
          domains: ["a.ai"],
          emoji: "🍎",
          author: "Test",
        })
      );

      const templates = registry.listTemplates();
      expect(templates[0].name).toBe("apple");
      expect(templates[1].name).toBe("zebra");
    });
  });

  describe("getTemplate", () => {
    beforeEach(() => {
      writeFileSync(
        join(cacheDir, "test-template.json"),
        JSON.stringify({
          name: "test-template",
          version: "1.0.0",
          displayName: "Test Template",
          description: "A test template",
          domains: ["test.ai"],
          emoji: "🧪",
          author: "Test Author",
          repository: "https://github.com/test/repo",
          features: ["feature1", "feature2"],
          modules: ["module1"],
        })
      );
    });

    it("should return template manifest", async () => {
      const template = await registry.getTemplate("test-template");

      expect(template).toBeDefined();
      expect(template!.name).toBe("test-template");
      expect(template!.version).toBe("1.0.0");
      expect(template!.displayName).toBe("Test Template");
      expect(template!.features).toEqual(["feature1", "feature2"]);
      expect(template!.modules).toEqual(["module1"]);
    });

    it("should return null for non-existent template", async () => {
      const template = await registry.getTemplate("nonexistent");
      expect(template).toBeNull();
    });
  });

  describe("installTemplate", () => {
    beforeEach(() => {
      writeFileSync(
        join(cacheDir, "installable.json"),
        JSON.stringify({
          name: "installable",
          version: "1.0.0",
          displayName: "Installable Template",
          description: "Can be installed",
          domains: ["installable.ai"],
          emoji: "✓",
          author: "Test",
        })
      );
    });

    it("should throw error for non-existent template", async () => {
      await expect(
        registry.installTemplate("nonexistent")
      ).rejects.toThrow("Template not found: nonexistent");
    });

    it("should accept valid template name", async () => {
      // Should not throw
      await registry.installTemplate("installable");
    });

    it("should validate template before installing", async () => {
      // Create a template that passes isTemplateManifest but fails validation
      writeFileSync(
        join(cacheDir, "invalid.json"),
        JSON.stringify({
          name: "invalid",
          version: "1.0", // Invalid version format (not semver)
          displayName: "Invalid",
          description: "Invalid template",
          domains: ["invalid.ai"],
          emoji: "X",
          author: "Test",
        })
      );

      await expect(
        registry.installTemplate("invalid")
      ).rejects.toThrow(/Template validation failed/);
    });
  });

  describe("validateTemplate", () => {
    it("should validate correct manifest", () => {
      const manifest = {
        name: "valid",
        version: "1.0.0",
        displayName: "Valid",
        description: "Valid template",
        domains: ["valid.ai"],
        emoji: "✓",
        author: "Test Author",
      };

      const result = registry.validateTemplate(manifest);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject non-object input", () => {
      const result = registry.validateTemplate(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Manifest is not an object");
    });

    it("should validate name format", () => {
      const result1 = registry.validateTemplate({
        name: "Invalid-Name", // Capital letter
        version: "1.0.0",
        displayName: "Test",
        description: "Test",
        domains: ["test.ai"],
        emoji: "T",
        author: "Test",
      });
      expect(result1.valid).toBe(false);
      expect(result1.errors.some(e => e.includes("name must be a kebab-case string"))).toBe(true);

      const result2 = registry.validateTemplate({
        name: "123invalid", // Starts with number
        version: "1.0.0",
        displayName: "Test",
        description: "Test",
        domains: ["test.ai"],
        emoji: "T",
        author: "Test",
      });
      expect(result2.valid).toBe(false);
    });

    it("should validate version format", () => {
      const result = registry.validateTemplate({
        name: "test",
        version: "1.0", // Not semver
        displayName: "Test",
        description: "Test",
        domains: ["test.ai"],
        emoji: "T",
        author: "Test",
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("version must be a semver string"))).toBe(true);
    });

    it("should validate domains array", () => {
      const result1 = registry.validateTemplate({
        name: "test",
        version: "1.0.0",
        displayName: "Test",
        description: "Test",
        domains: [], // Empty array
        emoji: "T",
        author: "Test",
      });
      expect(result1.valid).toBe(false);
      expect(result1.errors.some(e => e.includes("domains must be a non-empty array"))).toBe(true);

      const result2 = registry.validateTemplate({
        name: "test",
        version: "1.0.0",
        displayName: "Test",
        description: "Test",
        domains: ["invalid-domain"], // No TLD
        emoji: "T",
        author: "Test",
      });
      expect(result2.valid).toBe(false);
      expect(result2.errors.some(e => e.includes("Invalid domain"))).toBe(true);
    });

    it("should validate features array format", () => {
      const result = registry.validateTemplate({
        name: "test",
        version: "1.0.0",
        displayName: "Test",
        description: "Test",
        domains: ["test.ai"],
        emoji: "T",
        author: "Test",
        features: ["InvalidFeature"], // Capital letter
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Invalid feature"))).toBe(true);
    });

    it("should validate forks", () => {
      const manifestWithForks = {
        name: "test",
        version: "1.0.0",
        displayName: "Test",
        description: "Test",
        domains: ["test.ai"],
        emoji: "T",
        author: "Test",
        forks: [
          {
            id: "valid-fork",
            label: "Valid Fork",
            description: "A valid fork",
          },
          {
            id: "Invalid", // Capital letter
            label: "Invalid",
            description: "Invalid",
          },
        ],
      };

      const result = registry.validateTemplate(manifestWithForks);
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes("Fork id must be a kebab-case string"))).toBe(true);
    });
  });

  describe("createTemplateFromConfig", () => {
    it("should create manifest from config", () => {
      const config = {
        displayName: "Custom Template",
        description: "A custom template",
        domains: ["custom.ai", "custom.com"],
        emoji: "🎨",
        author: "Custom Author",
        repository: "https://github.com/custom/repo",
        features: ["feature1"],
        modules: ["module1"],
      };

      const manifest = registry.createTemplateFromConfig("custom-template", config);

      expect(manifest.name).toBe("custom-template");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.displayName).toBe("Custom Template");
      expect(manifest.domains).toEqual(["custom.ai", "custom.com"]);
      expect(manifest.emoji).toBe("🎨");
      expect(manifest.author).toBe("Custom Author");
      expect(manifest.repository).toBe("https://github.com/custom/repo");
      expect(manifest.features).toEqual(["feature1"]);
      expect(manifest.modules).toEqual(["module1"]);
    });

    it("should use defaults for missing config", () => {
      const manifest = registry.createTemplateFromConfig("minimal", {});

      expect(manifest.name).toBe("minimal");
      expect(manifest.version).toBe("1.0.0");
      expect(manifest.displayName).toBe("Minimal");
      expect(manifest.description).toBe("Cocapn template: minimal");
      expect(manifest.domains).toEqual(["minimal.ai"]);
      expect(manifest.emoji).toBe("🤖");
      expect(manifest.author).toBe("Unknown");
    });
  });
});
