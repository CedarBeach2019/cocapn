/**
 * Repo Map Generator Tests — Aider-style repository summary tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { rmSync, existsSync, mkdirSync, writeFileSync } from "fs";
import { GraphDB } from "../../src/graph/db.js";
import { RepoMapGenerator } from "../../src/graph/repo-map.js";
import type { GraphNode, GraphEdge } from "../../src/graph/types.js";

describe("RepoMapGenerator", () => {
  const testDir = join(process.cwd(), ".test-repo-map");
  const dbPath = join(testDir, "test.db");
  let db: GraphDB;
  let generator: RepoMapGenerator;

  beforeEach(async () => {
    // Clean up before each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    db = new GraphDB(dbPath);
    await db.initialize();
    generator = new RepoMapGenerator(db);
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    // Clean up after each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe("basic generation", () => {
    it("should generate empty map for empty database", async () => {
      const map = await generator.generate();

      expect(map).toBe("");
    });

    it("should generate map for a single file with functions", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/utils.ts#helper",
          type: "function",
          name: "helper",
          file: "src/utils.ts",
          signature: "function helper(x: number): number",
          docs: "A helper function",
        },
        {
          id: "src/utils.ts#another",
          type: "function",
          name: "another",
          file: "src/utils.ts",
          signature: "function another(): void",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).toContain("src/utils.ts:");
      expect(map).toContain("function helper");
      expect(map).toContain("function another");
    });

    it("should generate map for a single file with classes", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/models.ts#User",
          type: "class",
          name: "User",
          file: "src/models.ts",
          signature: "class User { constructor(id: string) }",
          docs: "User model",
        },
        {
          id: "src/models.ts#Product",
          type: "class",
          name: "Product",
          file: "src/models.ts",
          signature: "class Product",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).toContain("src/models.ts:");
      expect(map).toContain("class User");
      expect(map).toContain("class Product");
    });

    it("should include signatures when requested", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/api.ts#fetchData",
          type: "function",
          name: "fetchData",
          file: "src/api.ts",
          signature: "async function fetchData(url: string): Promise<Response>",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate({ includeSignatures: true });

      expect(map).toContain("fetchData");
      expect(map).toContain("url: string");
    });

    it("should exclude signatures when not requested", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/api.ts#fetchData",
          type: "function",
          name: "fetchData",
          file: "src/api.ts",
          signature: "async function fetchData(url: string): Promise<Response>",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate({ includeSignatures: false });

      expect(map).toContain("fetchData");
      expect(map).not.toContain("url: string");
    });

    it("should include docstrings when requested", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/utils.ts#helper",
          type: "function",
          name: "helper",
          file: "src/utils.ts",
          docs: "This is a helpful function",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate({ includeDocStrings: true });

      expect(map).toContain("helpful function");
    });

    it("should exclude docstrings when not requested", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/utils.ts#helper",
          type: "function",
          name: "helper",
          file: "src/utils.ts",
          docs: "This is a helpful function",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate({ includeDocStrings: false });

      expect(map).not.toContain("helpful function");
    });

    it("should use tree-dotted format", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/file.ts#func",
          type: "function",
          name: "func",
          file: "src/file.ts",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).toContain("⋮...");
      expect(map).toContain("│");
    });
  });

  describe("token budget", () => {
    it("should respect max tokens limit", async () => {
      const nodes: GraphNode[] = [];
      for (let i = 0; i < 100; i++) {
        nodes.push({
          id: `src/file${i}.ts#func${i}`,
          type: "function",
          name: `func${i}`,
          file: `src/file${i}.ts`,
          signature: `function func${i}(): void`,
        });
      }

      await db.addNodes(nodes);

      const map = await generator.generate({ maxTokens: 100 });
      const estimatedTokens = generator.estimateTokens(map);

      expect(estimatedTokens).toBeLessThanOrEqual(150); // Allow some margin
    });

    it("should prioritize files with more dependents", async () => {
      const nodes: GraphNode[] = [
        { id: "src/popular.ts#func", type: "function", name: "func", file: "src/popular.ts" },
        { id: "src/unpopular.ts#func", type: "function", name: "func", file: "src/unpopular.ts" },
      ];

      const edges: GraphEdge[] = [
        { source: "src/file1.ts", target: "src/popular.ts", type: "imports" },
        { source: "src/file2.ts", target: "src/popular.ts", type: "imports" },
        { source: "src/file3.ts", target: "src/unpopular.ts", type: "imports" },
      ];

      await db.addNodes(nodes);
      await db.addEdges(edges);

      const map = await generator.generate({ maxTokens: 50 });

      // Popular file should be included
      expect(map).toContain("src/popular.ts");
    });
  });

  describe("focus files", () => {
    it("should allocate more budget to focused files", async () => {
      const nodes: GraphNode[] = [
        { id: "src/focused.ts#func1", type: "function", name: "func1", file: "src/focused.ts" },
        { id: "src/focused.ts#func2", type: "function", name: "func2", file: "src/focused.ts" },
        { id: "src/other.ts#func", type: "function", name: "func", file: "src/other.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate({
        maxTokens: 30,
        focusFiles: ["src/focused.ts"],
      });

      expect(map).toContain("src/focused.ts");
      expect(map).toContain("func1");
      expect(map).toContain("func2");
    });

    it("should generate map for only specified files", async () => {
      const nodes: GraphNode[] = [
        { id: "src/file1.ts#func1", type: "function", name: "func1", file: "src/file1.ts" },
        { id: "src/file2.ts#func2", type: "function", name: "func2", file: "src/file2.ts" },
        { id: "src/file3.ts#func3", type: "function", name: "func3", file: "src/file3.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generateForFiles(["src/file1.ts", "src/file2.ts"]);

      expect(map).toContain("src/file1.ts");
      expect(map).toContain("src/file2.ts");
      expect(map).not.toContain("src/file3.ts");
    });
  });

  describe("exclude patterns", () => {
    it("should skip test files by default", async () => {
      const nodes: GraphNode[] = [
        { id: "src/utils.test.ts#test", type: "function", name: "test", file: "src/utils.test.ts" },
        { id: "src/utils.ts#func", type: "function", name: "func", file: "src/utils.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).not.toContain("src/utils.test.ts");
      expect(map).toContain("src/utils.ts");
    });

    it("should include test files when skipTests is false", async () => {
      const nodes: GraphNode[] = [
        { id: "src/utils.test.ts#test", type: "function", name: "test", file: "src/utils.test.ts" },
        { id: "src/utils.ts#func", type: "function", name: "func", file: "src/utils.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate({ skipTests: false });

      expect(map).toContain("src/utils.test.ts");
      expect(map).toContain("src/utils.ts");
    });

    it("should apply custom exclude patterns", async () => {
      const nodes: GraphNode[] = [
        { id: "src/internal.ts#func", type: "function", name: "func", file: "src/internal.ts" },
        { id: "src/public.ts#func", type: "function", name: "func", file: "src/public.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate({
        excludePatterns: [/internal/],
      });

      expect(map).not.toContain("src/internal.ts");
      expect(map).toContain("src/public.ts");
    });

    it("should skip node_modules files", async () => {
      const nodes: GraphNode[] = [
        { id: "node_modules/lib/index.ts#func", type: "function", name: "func", file: "node_modules/lib/index.ts" },
        { id: "src/utils.ts#func", type: "function", name: "func", file: "src/utils.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).not.toContain("node_modules");
      expect(map).toContain("src/utils.ts");
    });

    it("should skip dist files", async () => {
      const nodes: GraphNode[] = [
        { id: "dist/index.js#func", type: "function", name: "func", file: "dist/index.js" },
        { id: "src/utils.ts#func", type: "function", name: "func", file: "src/utils.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).not.toContain("dist/");
      expect(map).toContain("src/utils.ts");
    });
  });

  describe("token estimation", () => {
    it("should estimate tokens for a simple map", () => {
      const map = "src/file.ts:\n⋮...\n│function test()";
      const tokens = generator.estimateTokens(map);

      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(100);
    });

    it("should estimate tokens proportionally to length", () => {
      const shortMap = "src/file.ts:\n⋮...\n│function test()";
      const longMap = "src/file.ts:\n⋮...\n│function test()\n│function another()\n│function third()";

      const shortTokens = generator.estimateTokens(shortMap);
      const longTokens = generator.estimateTokens(longMap);

      expect(longTokens).toBeGreaterThan(shortTokens);
    });
  });

  describe("formatting", () => {
    it("should truncate long signatures", async () => {
      const longSignature = "function veryLongFunctionName(parameter1: VeryLongTypeName, parameter2: AnotherLongTypeName): Promise<VeryLongReturnType>";

      const nodes: GraphNode[] = [
        {
          id: "src/file.ts#func",
          type: "function",
          name: "func",
          file: "src/file.ts",
          signature: longSignature,
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      // Check that the signature was truncated
      const lines = map.split("\n");
      const sigLine = lines.find(l => l.includes("func"));
      expect(sigLine).toBeDefined();
      expect(sigLine!.length).toBeLessThan(120);
    });

    it("should truncate long docstrings", async () => {
      const longDocs = "This is a very long documentation string that goes on and on and on and on and on and on and on and on";

      const nodes: GraphNode[] = [
        {
          id: "src/file.ts#func",
          type: "function",
          name: "func",
          file: "src/file.ts",
          docs: longDocs,
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate({ includeDocStrings: true });

      // Check that the docs were truncated
      expect(map.length).toBeLessThan(longDocs.length + 50);
    });

    it("should handle multiple files with tree dots between symbols", async () => {
      const nodes: GraphNode[] = [
        { id: "src/file1.ts#func1", type: "function", name: "func1", file: "src/file1.ts" },
        { id: "src/file1.ts#func2", type: "function", name: "func2", file: "src/file1.ts" },
        { id: "src/file2.ts#func3", type: "function", name: "func3", file: "src/file2.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).toContain("src/file1.ts:");
      expect(map).toContain("src/file2.ts:");
      expect(map).toContain("⋮...");
    });
  });

  describe("edge cases", () => {
    it("should handle files with no exported symbols", async () => {
      const nodes: GraphNode[] = [
        { id: "src/empty.ts", type: "file", name: "empty.ts", file: "src/empty.ts" },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).toContain("src/empty.ts");
    });

    it("should handle special characters in signatures", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/file.ts#func",
          type: "function",
          name: "func",
          file: "src/file.ts",
          signature: "function func<T>(x: T[]): T[]",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).toContain("func");
    });

    it("should handle Unicode characters in names", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/file.ts#日本語",
          type: "function",
          name: "日本語",
          file: "src/file.ts",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).toContain("日本語");
    });

    it("should handle very deep file paths", async () => {
      const nodes: GraphNode[] = [
        {
          id: "src/very/deep/nested/path/to/file.ts#func",
          type: "function",
          name: "func",
          file: "src/very/deep/nested/path/to/file.ts",
        },
      ];

      await db.addNodes(nodes);

      const map = await generator.generate();

      expect(map).toContain("src/very/deep/nested/path/to/file.ts");
    });
  });

  describe("integration scenarios", () => {
    it("should handle a realistic small project structure", async () => {
      const nodes: GraphNode[] = [
        // Models
        { id: "src/models/User.ts#User", type: "class", name: "User", file: "src/models/User.ts", signature: "class User" },
        { id: "src/models/Product.ts#Product", type: "class", name: "Product", file: "src/models/Product.ts", signature: "class Product" },

        // Services
        { id: "src/services/AuthService.ts#authenticate", type: "function", name: "authenticate", file: "src/services/AuthService.ts", signature: "function authenticate(user: User, password: string): boolean" },
        { id: "src/services/AuthService.ts#authorize", type: "function", name: "authorize", file: "src/services/AuthService.ts", signature: "function authorize(user: User, resource: string): boolean" },
        { id: "src/services/DataService.ts#fetchUser", type: "function", name: "fetchUser", file: "src/services/DataService.ts", signature: "function fetchUser(id: string): User" },

        // Handlers
        { id: "src/handlers/userHandler.ts#createUser", type: "function", name: "createUser", file: "src/handlers/userHandler.ts", signature: "function createUser(req: Request): Response" },
        { id: "src/handlers/userHandler.ts#getUser", type: "function", name: "getUser", file: "src/handlers/userHandler.ts", signature: "function getUser(req: Request): Response" },

        // Utils
        { id: "src/utils/validator.ts#validateEmail", type: "function", name: "validateEmail", file: "src/utils/validator.ts", signature: "function validateEmail(email: string): boolean" },
        { id: "src/utils/logger.ts#log", type: "function", name: "log", file: "src/utils/logger.ts", signature: "function log(message: string): void" },

        // Main
        { id: "src/index.ts#start", type: "function", name: "start", file: "src/index.ts", signature: "function start(): void" },
      ];

      const edges: GraphEdge[] = [
        { source: "src/services/AuthService.ts", target: "src/models/User.ts", type: "imports" },
        { source: "src/services/DataService.ts", target: "src/models/User.ts", type: "imports" },
        { source: "src/handlers/userHandler.ts", target: "src/services/AuthService.ts", type: "imports" },
        { source: "src/handlers/userHandler.ts", target: "src/services/DataService.ts", type: "imports" },
        { source: "src/handlers/userHandler.ts", target: "src/utils/validator.ts", type: "imports" },
        { source: "src/handlers/userHandler.ts", target: "src/utils/logger.ts", type: "imports" },
        { source: "src/index.ts", target: "src/handlers/userHandler.ts", type: "imports" },
      ];

      await db.addNodes(nodes);
      await db.addEdges(edges);

      const map = await generator.generate({ maxTokens: 1024 });

      // Should include all important files
      expect(map).toContain("src/models/User.ts");
      expect(map).toContain("src/services/AuthService.ts");
      expect(map).toContain("src/handlers/userHandler.ts");

      // Should show symbols
      expect(map).toContain("class User");
      expect(map).toContain("function authenticate");
      expect(map).toContain("function createUser");

      // Should respect token budget
      const estimatedTokens = generator.estimateTokens(map);
      expect(estimatedTokens).toBeLessThanOrEqual(1200); // Allow some margin

      // Should have Aider-style format
      expect(map).toContain("⋮...");
      expect(map).toContain("│");
    });
  });
});
