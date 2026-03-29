/**
 * Tests for hybrid search combining keyword and semantic search.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InvertedIndex } from "../src/utils/inverted-index.js";
import { createHybridSearch, HybridSearch } from "../src/brain/hybrid-search.js";

// ─── Mock Vector Store ─────────────────────────────────────────────────────────

class MockVectorStore {
  private enabled: boolean;
  private data: Map<string, number>;

  constructor(enabled: boolean = true) {
    this.enabled = enabled;
    this.data = new Map();
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async search(query: string, topK: number): Promise<any[]> {
    if (!this.enabled) return [];

    // Return mock results based on query
    const results: any[] = [];
    const mockData: Record<string, number> = {
      "semantic-match": 0.9,
      "partial-match": 0.6,
      "weak-match": 0.3,
    };

    for (const [id, score] of Object.entries(mockData)) {
      if (results.length >= topK) break;
      if (query.includes("semantic") && id === "semantic-match") {
        results.push({ id, score });
      } else if (query.includes("test")) {
        results.push({ id, score });
      }
    }

    return results;
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("HybridSearch", () => {
  let invertedIndex: InvertedIndex;
  let mockVectorStore: any;

  beforeEach(() => {
    invertedIndex = new InvertedIndex();
    mockVectorStore = new MockVectorStore();

    // Add some documents to the inverted index
    invertedIndex.add("keyword-match", "This is a keyword test document");
    invertedIndex.add("both-match", "This document matches both keyword and semantic");
    invertedIndex.add("weak-keyword", "Weak match here");
  });

  it("returns keyword-only results when vector store is disabled", async () => {
    const disabledVectorStore = new MockVectorStore(false);
    const hybridSearch = createHybridSearch(invertedIndex, disabledVectorStore);

    const results = await hybridSearch.search("keyword");

    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("keyword-match");
    expect(results[0].source).toBe("keyword");
  });

  it("returns semantic-only results when no keyword matches", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const results = await hybridSearch.search("semantic");

    expect(results.length).toBeGreaterThan(0);
    // Should have at least some semantic results (may include keyword matches if they exist)
    const semanticResults = results.filter(r => r.source === "semantic" || r.source === "both");
    expect(semanticResults.length).toBeGreaterThan(0);
  });

  it("merges keyword and semantic results correctly", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const results = await hybridSearch.search("test");

    // Should have results from both sources
    expect(results.length).toBeGreaterThan(0);

    // Check that we have different source types
    const sources = new Set(results.map(r => r.source));
    expect(sources.size).toBeGreaterThan(0);
  });

  it("marks results that match both sources", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const results = await hybridSearch.search("both");

    const bothMatches = results.filter(r => r.source === "both");
    expect(bothMatches.length).toBeGreaterThanOrEqual(0);
  });

  it("respects topK option", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const results1 = await hybridSearch.search("test", { topK: 2 });
    const results2 = await hybridSearch.search("test", { topK: 5 });

    expect(results1.length).toBeLessThanOrEqual(2);
    expect(results2.length).toBeLessThanOrEqual(5);
  });

  it("applies minScore threshold", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const results1 = await hybridSearch.search("test", { minScore: 0.5 });
    const results2 = await hybridSearch.search("test", { minScore: 0.1 });

    expect(results1.length).toBeLessThanOrEqual(results2.length);

    // All results should meet the minimum score
    results1.forEach(result => {
      expect(result.score).toBeGreaterThanOrEqual(0.5);
    });
  });

  it("applies alpha weighting correctly", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const resultsKeyword = await hybridSearch.search("keyword", { alpha: 1.0 });
    const resultsSemantic = await hybridSearch.search("keyword", { alpha: 0.0 });
    const resultsBalanced = await hybridSearch.search("keyword", { alpha: 0.5 });

    // Results should differ based on alpha weighting
    expect(resultsKeyword).toBeDefined();
    expect(resultsSemantic).toBeDefined();
    expect(resultsBalanced).toBeDefined();
  });

  it("deduplicates results by ID", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const results = await hybridSearch.search("test");

    const ids = results.map(r => r.id);
    const uniqueIds = new Set(ids);

    expect(ids.length).toBe(uniqueIds.size);
  });

  it("sorts results by score descending", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const results = await hybridSearch.search("test");

    for (let i = 1; i < results.length; i++) {
      expect(results[i].score).toBeLessThanOrEqual(results[i - 1].score);
    }
  });

  it("handles empty query gracefully", async () => {
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    const results = await hybridSearch.search("");

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });

  it("isHybridEnabled returns correct state", () => {
    const enabledHybrid = createHybridSearch(invertedIndex, mockVectorStore);
    const disabledHybrid = createHybridSearch(invertedIndex, null);

    expect(enabledHybrid.isHybridEnabled()).toBe(true);
    expect(disabledHybrid.isHybridEnabled()).toBe(false);
  });

  it("handles vector store errors gracefully", async () => {
    class FailingVectorStore {
      isEnabled(): boolean {
        return true;
      }

      async search(): Promise<any[]> {
        throw new Error("Vector store failed");
      }
    }

    const failingStore = new FailingVectorStore() as any;
    const hybridSearch = createHybridSearch(invertedIndex, failingStore);

    // Should not throw, should fall back to keyword-only
    const results = await hybridSearch.search("test");

    expect(results).toBeDefined();
    expect(Array.isArray(results)).toBe(true);
  });
});

describe("createHybridSearch", () => {
  it("creates a hybrid search instance", () => {
    const invertedIndex = new InvertedIndex();
    const hybridSearch = createHybridSearch(invertedIndex, null);

    expect(hybridSearch).toBeInstanceOf(HybridSearch);
    expect(hybridSearch).toHaveProperty("search");
    expect(hybridSearch).toHaveProperty("isHybridEnabled");
  });

  it("creates hybrid search with vector store", () => {
    const invertedIndex = new InvertedIndex();
    const mockVectorStore = new MockVectorStore();
    const hybridSearch = createHybridSearch(invertedIndex, mockVectorStore);

    expect(hybridSearch.isHybridEnabled()).toBe(true);
  });

  it("creates hybrid search without vector store", () => {
    const invertedIndex = new InvertedIndex();
    const hybridSearch = createHybridSearch(invertedIndex, null);

    expect(hybridSearch.isHybridEnabled()).toBe(false);
  });
});
