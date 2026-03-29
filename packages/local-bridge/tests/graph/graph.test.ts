/**
 * Graph Tests — RepoGraph facade integration tests.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { join } from "path";
import { rmSync, existsSync } from "fs";
import { RepoGraph, createRepoGraph } from "../../src/graph/index.js";

describe("RepoGraph", () => {
  const testDir = join(process.cwd(), ".test-graph-tmp");
  const dbPath = join(testDir, "graph.db");

  beforeAll(async () => {
    // Clean up any previous test artifacts
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  afterAll(() => {
    // Clean up test artifacts
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it("should create and initialize a RepoGraph", async () => {
    const graph = await createRepoGraph(testDir, dbPath);
    expect(graph).toBeDefined();

    const stats = await graph.stats();
    expect(stats).toBeDefined();
    expect(stats.nodes).toBe(0);
    expect(stats.edges).toBe(0);

    graph.close();
  });

  it("should build a graph from a repository", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);

    await graph.build();

    const stats = await graph.stats();
    expect(stats.nodes).toBeGreaterThan(0);
    expect(stats.edges).toBeGreaterThan(0);
    expect(stats.files).toBeGreaterThan(0);

    graph.close();
  });

  it("should find nodes by name pattern", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);
    await graph.build();

    const results = await graph.findByName("Brain");
    expect(results.length).toBeGreaterThan(0);
    expect(results[0]?.name).toContain("Brain");

    graph.close();
  });

  it("should get nodes by file", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);
    await graph.build();

    const nodes = await graph.findByFile("src/brain/index.ts");
    expect(nodes.length).toBeGreaterThan(0);
    expect(nodes[0]?.file).toBe("src/brain/index.ts");

    graph.close();
  });

  it("should get exported symbols", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);
    await graph.build();

    const exported = await graph.findExported();
    expect(Array.isArray(exported)).toBe(true);

    graph.close();
  });

  it("should get dependencies for a file", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);
    await graph.build();

    const deps = await graph.getDependencies("src/brain/index.ts");
    expect(Array.isArray(deps)).toBe(true);

    graph.close();
  });

  it("should get dependents for a file", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);
    await graph.build();

    const dependents = await graph.getDependents("src/brain/index.ts");
    expect(Array.isArray(dependents)).toBe(true);

    graph.close();
  });

  it("should calculate impact radius", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);
    await graph.build();

    // Find a node to test with
    const nodes = await graph.findByName("Brain");
    if (nodes.length > 0 && nodes[0]) {
      const impact = await graph.getImpactRadius(nodes[0].id, 2);
      expect(Array.isArray(impact)).toBe(true);
      // At least the node itself should be in the impact
      expect(impact.length).toBeGreaterThanOrEqual(1);
    }

    graph.close();
  });

  it("should get call graph for a function", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);
    await graph.build();

    const calls = await graph.getCallGraph("src/brain/index.ts#getSoul");
    expect(Array.isArray(calls)).toBe(true);

    graph.close();
  });

  it("should update a file in the graph", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);

    // Build the graph first
    await graph.build();

    // Update a file (this should not throw)
    await graph.updateFile("src/brain/index.ts");

    const stats = await graph.stats();
    expect(stats.nodes).toBeGreaterThan(0);

    graph.close();
  });

  it("should remove a file from the graph", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);

    await graph.build();

    const statsBefore = await graph.stats();

    // Remove a file
    await graph.removeFile("src/brain/index.ts");

    const statsAfter = await graph.stats();
    expect(statsAfter.nodes).toBeLessThan(statsBefore.nodes);

    graph.close();
  });

  it("should return accurate statistics", async () => {
    const graph = await createRepoGraph(process.cwd(), dbPath);
    await graph.build();

    const stats = await graph.stats();
    expect(stats).toEqual({
      nodes: expect.any(Number),
      edges: expect.any(Number),
      files: expect.any(Number),
      symbols: expect.any(Number),
    });

    // Sanity checks
    expect(stats.nodes).toBeGreaterThanOrEqual(0);
    expect(stats.edges).toBeGreaterThanOrEqual(0);
    expect(stats.files).toBeGreaterThanOrEqual(0);
    expect(stats.symbols).toBeGreaterThanOrEqual(0);
    expect(stats.symbols).toBeLessThanOrEqual(stats.nodes);

    graph.close();
  });
});
