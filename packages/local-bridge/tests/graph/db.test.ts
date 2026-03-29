/**
 * GraphDB Tests — Database layer unit tests.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import { GraphDB } from "../../src/graph/db.js";
import type { GraphNode, GraphEdge } from "../../src/graph/types.js";

describe("GraphDB", () => {
  const testDir = join(process.cwd(), ".test-graph-db");
  const dbPath = join(testDir, "test.db");
  let db: GraphDB;

  beforeEach(async () => {
    // Clean up before each test
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }

    db = new GraphDB(dbPath);
    await db.initialize();
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

  describe("initialization", () => {
    it("should initialize the database schema", async () => {
      const stats = await db.stats();
      expect(stats.nodes).toBe(0);
      expect(stats.edges).toBe(0);
    });

    it("should be idempotent", async () => {
      await db.initialize();
      await db.initialize();

      const stats = await db.stats();
      expect(stats.nodes).toBe(0);
      expect(stats.edges).toBe(0);
    });
  });

  describe("nodes", () => {
    it("should add nodes to the database", async () => {
      const nodes: GraphNode[] = [
        {
          id: "test-file.ts#testFunc",
          type: "function",
          name: "testFunc",
          file: "test-file.ts",
          startLine: 1,
          endLine: 10,
          docs: "Test function",
          signature: "function testFunc(): void",
        },
      ];

      await db.addNodes(nodes);

      const stats = await db.stats();
      expect(stats.nodes).toBe(1);
    });

    it("should add multiple nodes", async () => {
      const nodes: GraphNode[] = [
        {
          id: "test-file.ts#func1",
          type: "function",
          name: "func1",
          file: "test-file.ts",
        },
        {
          id: "test-file.ts#func2",
          type: "function",
          name: "func2",
          file: "test-file.ts",
        },
        {
          id: "test-file.ts#TestClass",
          type: "class",
          name: "TestClass",
          file: "test-file.ts",
        },
      ];

      await db.addNodes(nodes);

      const stats = await db.stats();
      expect(stats.nodes).toBe(3);
    });

    it("should replace existing nodes with the same ID", async () => {
      const node1: GraphNode = {
        id: "test-file.ts#func1",
        type: "function",
        name: "func1",
        file: "test-file.ts",
        docs: "Original docs",
      };

      const node2: GraphNode = {
        id: "test-file.ts#func1",
        type: "function",
        name: "func1",
        file: "test-file.ts",
        docs: "Updated docs",
      };

      await db.addNodes([node1]);
      await db.addNodes([node2]);

      const stats = await db.stats();
      expect(stats.nodes).toBe(1);
    });

    it("should get nodes by file", async () => {
      const nodes: GraphNode[] = [
        {
          id: "file1.ts#func1",
          type: "function",
          name: "func1",
          file: "file1.ts",
        },
        {
          id: "file2.ts#func2",
          type: "function",
          name: "func2",
          file: "file2.ts",
        },
      ];

      await db.addNodes(nodes);

      const file1Nodes = await db.getNodesByFile("file1.ts");
      expect(file1Nodes.length).toBe(1);
      expect(file1Nodes[0]?.id).toBe("file1.ts#func1");

      const file2Nodes = await db.getNodesByFile("file2.ts");
      expect(file2Nodes.length).toBe(1);
      expect(file2Nodes[0]?.id).toBe("file2.ts#func2");
    });

    it("should find nodes by name pattern", async () => {
      const nodes: GraphNode[] = [
        {
          id: "file1.ts#testFunc",
          type: "function",
          name: "testFunc",
          file: "file1.ts",
        },
        {
          id: "file2.ts#helperFunc",
          type: "function",
          name: "helperFunc",
          file: "file2.ts",
        },
      ];

      await db.addNodes(nodes);

      const results = await db.findByName("test");
      expect(results.length).toBe(1);
      expect(results[0]?.name).toBe("testFunc");
    });

    it("should get exported symbols", async () => {
      const nodes: GraphNode[] = [
        {
          id: "file1.ts#export#testFunc",
          type: "export",
          name: "export testFunc",
          file: "file1.ts",
          exportsSymbol: "testFunc",
        },
        {
          id: "file2.ts#func1",
          type: "function",
          name: "func1",
          file: "file2.ts",
        },
      ];

      await db.addNodes(nodes);

      const exported = await db.getExported();
      expect(exported.length).toBe(1);
      expect(exported[0]?.type).toBe("export");
    });
  });

  describe("edges", () => {
    it("should add edges to the database", async () => {
      const edges: GraphEdge[] = [
        {
          source: "file1.ts",
          target: "file2.ts",
          type: "imports",
          weight: 1.0,
        },
      ];

      await db.addEdges(edges);

      const stats = await db.stats();
      expect(stats.edges).toBe(1);
    });

    it("should add multiple edges", async () => {
      const edges: GraphEdge[] = [
        {
          source: "file1.ts",
          target: "file2.ts",
          type: "imports",
        },
        {
          source: "file2.ts",
          target: "file3.ts",
          type: "imports",
        },
        {
          source: "file1.ts#func1",
          target: "file2.ts#func2",
          type: "calls",
        },
      ];

      await db.addEdges(edges);

      const stats = await db.stats();
      expect(stats.edges).toBe(3);
    });

    it("should replace existing edges with same source, target, and type", async () => {
      const edge1: GraphEdge = {
        source: "file1.ts",
        target: "file2.ts",
        type: "imports",
        weight: 1.0,
      };

      const edge2: GraphEdge = {
        source: "file1.ts",
        target: "file2.ts",
        type: "imports",
        weight: 2.0,
      };

      await db.addEdges([edge1]);
      await db.addEdges([edge2]);

      const stats = await db.stats();
      expect(stats.edges).toBe(1);
    });
  });

  describe("dependencies", () => {
    beforeEach(async () => {
      // Add test data
      const nodes: GraphNode[] = [
        { id: "file1.ts", type: "file", name: "file1.ts", file: "file1.ts" },
        { id: "file2.ts", type: "file", name: "file2.ts", file: "file2.ts" },
        { id: "file3.ts", type: "file", name: "file3.ts", file: "file3.ts" },
      ];

      const edges: GraphEdge[] = [
        { source: "file1.ts", target: "file2.ts", type: "imports" },
        { source: "file1.ts", target: "file3.ts", type: "imports" },
        { source: "file2.ts", target: "file3.ts", type: "imports" },
      ];

      await db.addNodes(nodes);
      await db.addEdges(edges);
    });

    it("should get dependencies for a file", async () => {
      const deps = await db.getDependencies("file1.ts");
      expect(deps).toContain("file2.ts");
      expect(deps).toContain("file3.ts");
    });

    it("should get dependents for a file", async () => {
      const dependents = await db.getDependents("file3.ts");
      expect(dependents).toContain("file1.ts");
      expect(dependents).toContain("file2.ts");
    });

    it("should return empty array for file with no dependencies", async () => {
      const deps = await db.getDependencies("file3.ts");
      expect(deps).toEqual([]);
    });

    it("should return empty array for file with no dependents", async () => {
      const dependents = await db.getDependents("file1.ts");
      expect(dependents).toEqual([]);
    });
  });

  describe("call graph", () => {
    beforeEach(async () => {
      const nodes: GraphNode[] = [
        { id: "file1.ts#func1", type: "function", name: "func1", file: "file1.ts" },
        { id: "file1.ts#func2", type: "function", name: "func2", file: "file1.ts" },
        { id: "file1.ts#func3", type: "function", name: "func3", file: "file1.ts" },
      ];

      const edges: GraphEdge[] = [
        { source: "file1.ts#func1", target: "file1.ts#func2", type: "calls" },
        { source: "file1.ts#func1", target: "file1.ts#func3", type: "calls" },
        { source: "file1.ts#func2", target: "file1.ts#func3", type: "calls" },
      ];

      await db.addNodes(nodes);
      await db.addEdges(edges);
    });

    it("should get call graph for a function", async () => {
      const calls = await db.getCallGraph("file1.ts#func1");
      expect(calls).toContain("file1.ts#func2");
      expect(calls).toContain("file1.ts#func3");
    });

    it("should get reverse call graph for a function", async () => {
      const callers = await db.getReverseCallGraph("file1.ts#func3");
      expect(callers).toContain("file1.ts#func1");
      expect(callers).toContain("file1.ts#func2");
    });
  });

  describe("impact analysis", () => {
    beforeEach(async () => {
      const nodes: GraphNode[] = [
        { id: "file1.ts", type: "file", name: "file1.ts", file: "file1.ts" },
        { id: "file2.ts", type: "file", name: "file2.ts", file: "file2.ts" },
        { id: "file3.ts", type: "file", name: "file3.ts", file: "file3.ts" },
        { id: "file2.ts#func1", type: "function", name: "func1", file: "file2.ts" },
        { id: "file3.ts#func2", type: "function", name: "func2", file: "file3.ts" },
      ];

      const edges: GraphEdge[] = [
        { source: "file1.ts", target: "file2.ts", type: "imports" },
        { source: "file2.ts", target: "file3.ts", type: "imports" },
        { source: "file1.ts", target: "file2.ts#func1", type: "contains" },
        { source: "file2.ts#func1", target: "file3.ts#func2", type: "calls" },
      ];

      await db.addNodes(nodes);
      await db.addEdges(edges);
    });

    it("should calculate impact radius with default depth", async () => {
      const impact = await db.getImpactRadius("file3.ts");

      // Should include file3.ts itself
      const ids = impact.map((n) => n.id);
      expect(ids).toContain("file3.ts");
      expect(ids.length).toBeGreaterThan(0);
    });

    it("should calculate impact radius with custom depth", async () => {
      const impact = await db.getImpactRadius("file3.ts", 1);

      // Should include direct dependents only
      const ids = impact.map((n) => n.id);
      expect(ids).toContain("file3.ts");
      expect(ids).toContain("file2.ts");

      // Should not include file1.ts (depth 2)
      expect(ids).not.toContain("file1.ts");
    });

    it("should include distance information in impact analysis", async () => {
      const impact = await db.getImpactRadius("file3.ts", 2);

      expect(impact.length).toBeGreaterThan(0);

      // Check that distances are present and valid
      for (const node of impact) {
        expect(node.distance).toBeGreaterThanOrEqual(0);
        expect(node.distance).toBeLessThanOrEqual(2);
      }
    });

    it("should return only the root node if it has no dependents", async () => {
      const impact = await db.getImpactRadius("file1.ts");

      const ids = impact.map((n) => n.id);
      expect(ids).toContain("file1.ts");
    });
  });

  describe("file operations", () => {
    beforeEach(async () => {
      const nodes: GraphNode[] = [
        { id: "file1.ts", type: "file", name: "file1.ts", file: "file1.ts" },
        { id: "file1.ts#func1", type: "function", name: "func1", file: "file1.ts" },
        { id: "file2.ts", type: "file", name: "file2.ts", file: "file2.ts" },
        { id: "file2.ts#func2", type: "function", name: "func2", file: "file2.ts" },
      ];

      const edges: GraphEdge[] = [
        { source: "file1.ts", target: "file1.ts#func1", type: "contains" },
        { source: "file2.ts", target: "file2.ts#func2", type: "contains" },
        { source: "file1.ts", target: "file2.ts", type: "imports" },
      ];

      await db.addNodes(nodes);
      await db.addEdges(edges);
    });

    it("should remove all nodes and edges for a file", async () => {
      await db.removeByFile("file1.ts");

      const stats = await db.stats();
      expect(stats.nodes).toBe(2); // file2.ts and its func
      expect(stats.edges).toBe(1); // file2.ts contains its func
    });

    it("should remove edges referencing the removed file", async () => {
      await db.removeByFile("file2.ts");

      const stats = await db.stats();
      expect(stats.edges).toBe(1); // Only file1.ts contains its func
    });
  });

  describe("clear", () => {
    it("should clear all data", async () => {
      const nodes: GraphNode[] = [
        { id: "file1.ts", type: "file", name: "file1.ts", file: "file1.ts" },
      ];

      const edges: GraphEdge[] = [
        { source: "file1.ts", target: "file2.ts", type: "imports" },
      ];

      await db.addNodes(nodes);
      await db.addEdges(edges);

      expect((await db.stats()).nodes).toBe(1);
      expect((await db.stats()).edges).toBe(1);

      await db.clear();

      const stats = await db.stats();
      expect(stats.nodes).toBe(0);
      expect(stats.edges).toBe(0);
    });
  });

  describe("statistics", () => {
    it("should return accurate statistics", async () => {
      const nodes: GraphNode[] = [
        { id: "file1.ts", type: "file", name: "file1.ts", file: "file1.ts" },
        { id: "file1.ts#func1", type: "function", name: "func1", file: "file1.ts" },
        { id: "file1.ts#TestClass", type: "class", name: "TestClass", file: "file1.ts" },
        { id: "file1.ts#MyInterface", type: "interface", name: "MyInterface", file: "file1.ts" },
        { id: "file1.ts#myVar", type: "variable", name: "myVar", file: "file1.ts" },
      ];

      const edges: GraphEdge[] = [
        { source: "file1.ts", target: "file1.ts#func1", type: "contains" },
      ];

      await db.addNodes(nodes);
      await db.addEdges(edges);

      const stats = await db.stats();
      expect(stats.nodes).toBe(5);
      expect(stats.edges).toBe(1);
      expect(stats.files).toBe(1);
      expect(stats.symbols).toBe(4); // func, class, interface, variable
    });
  });
});
