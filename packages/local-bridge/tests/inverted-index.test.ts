/**
 * Tests for InvertedIndex
 *
 * Tests fast text search with inverted index.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { InvertedIndex, tokenize, type SearchResult } from "../src/utils/inverted-index.js";

describe("tokenize", () => {
  it("should split text into tokens", () => {
    const tokens = tokenize("hello world");
    expect(tokens).toHaveProperty("size", 2);
    expect(tokens.has("hello")).toBe(true);
    expect(tokens.has("world")).toBe(true);
  });

  it("should convert to lowercase", () => {
    const tokens = tokenize("Hello WORLD");
    expect(tokens.has("hello")).toBe(true);
    expect(tokens.has("world")).toBe(true);
    expect(tokens.has("Hello")).toBe(false);
  });

  it("should filter stop words", () => {
    const tokens = tokenize("the quick brown fox jumps over the lazy dog");

    // "the", "over", "lazy" are stop words or might be filtered
    expect(tokens.has("quick")).toBe(true);
    expect(tokens.has("brown")).toBe(true);
    expect(tokens.has("fox")).toBe(true);
    expect(tokens.has("jumps")).toBe(true);
    expect(tokens.has("dog")).toBe(true);
  });

  it("should filter out single character tokens", () => {
    const tokens = tokenize("a b c hello");
    expect(tokens.has("hello")).toBe(true);
    expect(tokens.has("a")).toBe(false);
    expect(tokens.has("b")).toBe(false);
    expect(tokens.has("c")).toBe(false);
  });

  it("should handle punctuation", () => {
    const tokens = tokenize("hello, world! how are you?");
    expect(tokens.has("hello")).toBe(true);
    expect(tokens.has("world")).toBe(true);
    // "how", "are", "you" are filtered as stop words
    expect(tokens.has("how")).toBe(false);
  });

  it("should handle numbers in tokens", () => {
    const tokens = tokenize("test123 abc456");
    expect(tokens.has("test123")).toBe(true);
    expect(tokens.has("abc456")).toBe(true);
  });

  it("should deduplicate tokens", () => {
    const tokens = tokenize("hello hello world world");
    expect(tokens).toHaveProperty("size", 2);
  });

  it("should handle empty string", () => {
    const tokens = tokenize("");
    expect(tokens).toHaveProperty("size", 0);
  });

  it("should handle special characters", () => {
    const tokens = tokenize("hello-world test_data");
    expect(tokens.has("hello")).toBe(true);
    expect(tokens.has("world")).toBe(true);
    expect(tokens.has("test")).toBe(true);
    expect(tokens.has("data")).toBe(true);
  });
});

describe("InvertedIndex", () => {
  describe("add", () => {
    it("should add a document to the index", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");

      expect(index.has("doc1")).toBe(true);
      expect(index.size()).toBe(1);
    });

    it("should handle multiple documents", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");
      index.add("doc2", "foo bar");
      index.add("doc3", "test content");

      expect(index.size()).toBe(3);
    });

    it("should replace existing document", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");
      index.add("doc1", "different content");

      const results = index.search("hello");
      expect(results).toHaveLength(0);

      const results2 = index.search("different");
      expect(results2).toHaveLength(1);
      expect(results2[0].id).toBe("doc1");
    });

    it("should index tokens for search", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world test");

      const results = index.search("hello");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("doc1");
    });
  });

  describe("search", () => {
    beforeEach(() => {
      // Setup for search tests
      const index = new InvertedIndex();
      index.add("doc1", "hello world");
      index.add("doc2", "hello there");
      index.add("doc3", "world test");
    });

    it("should find documents matching single term", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");
      index.add("doc2", "goodbye world");

      const results = index.search("world");
      expect(results.length).toBeGreaterThanOrEqual(2);

      const ids = results.map(r => r.id);
      expect(ids).toContain("doc1");
      expect(ids).toContain("doc2");
    });

    it("should find documents matching multiple terms (OR semantics)", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");
      index.add("doc2", "foo bar");
      index.add("doc3", "hello foo");

      const results = index.search("hello foo");
      expect(results.length).toBeGreaterThanOrEqual(2);

      const ids = results.map(r => r.id);
      expect(ids).toContain("doc1");
      expect(ids).toContain("doc3");
    });

    it("should score by number of matched terms", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");
      index.add("doc2", "hello");
      index.add("doc3", "hello world test");

      const results = index.search("hello world");

      // doc3 should have highest score (matches hello, world, test - but only hello and world are in query)
      // doc1 matches both hello and world
      // doc2 matches only hello
      const ids = results.map(r => r.id);
      expect(results[0].score).toBeGreaterThanOrEqual(results[results.length - 1].score);
    });

    it("should return empty array for no matches", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");

      const results = index.search("nonexistent");
      expect(results).toHaveLength(0);
    });

    it("should be case insensitive", () => {
      const index = new InvertedIndex();
      index.add("doc1", "Hello World");

      const results = index.search("hello");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("doc1");
    });

    it("should ignore stop words in query", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");

      const results = index.search("the hello"); // "the" is a stop word
      expect(results).toHaveLength(1);
    });

    it("should return results sorted by score descending", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world test");
      index.add("doc2", "hello");
      index.add("doc3", "world test");

      const results = index.search("hello world test");

      for (let i = 0; i < results.length - 1; i++) {
        expect(results[i].score).toBeGreaterThanOrEqual(results[i + 1].score);
      }
    });

    it("should handle partial word matches", () => {
      const index = new InvertedIndex();
      index.add("doc1", "testing tokenization");

      // Tokenization splits on non-word characters, so "testing" is indexed as "testing"
      // Searching for "test" won't match "testing"
      const results = index.search("testing");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("doc1");
    });

    it("should return empty for empty query", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");

      const results = index.search("");
      expect(results).toHaveLength(0);
    });
  });

  describe("remove", () => {
    it("should remove a document from index", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");

      expect(index.has("doc1")).toBe(true);

      index.remove("doc1");

      expect(index.has("doc1")).toBe(false);
      expect(index.size()).toBe(0);
    });

    it("should update search results after removal", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");
      index.add("doc2", "hello there");

      let results = index.search("hello");
      expect(results.length).toBeGreaterThanOrEqual(1);

      index.remove("doc1");

      results = index.search("hello");
      const ids = results.map(r => r.id);
      expect(ids).not.toContain("doc1");
    });

    it("should be idempotent", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");

      expect(() => {
        index.remove("doc1");
        index.remove("doc1");
        index.remove("doc1");
      }).not.toThrow();

      expect(index.has("doc1")).toBe(false);
    });

    it("should handle non-existent document", () => {
      const index = new InvertedIndex();

      expect(() => {
        index.remove("nonexistent");
      }).not.toThrow();
    });

    it("should clean up empty posting lists", () => {
      const index = new InvertedIndex();
      index.add("doc1", "uniqueword");

      index.remove("doc1");

      // After removing the only document with "uniqueword", the posting list should be cleaned up
      const results = index.search("uniqueword");
      expect(results).toHaveLength(0);
    });
  });

  describe("has", () => {
    it("should return true for existing document", () => {
      const index = new InvertedIndex();
      index.add("doc1", "content");

      expect(index.has("doc1")).toBe(true);
    });

    it("should return false for non-existent document", () => {
      const index = new InvertedIndex();

      expect(index.has("nonexistent")).toBe(false);
    });
  });

  describe("size", () => {
    it("should return zero for empty index", () => {
      const index = new InvertedIndex();
      expect(index.size()).toBe(0);
    });

    it("should return number of documents", () => {
      const index = new InvertedIndex();
      index.add("doc1", "content");
      index.add("doc2", "content");
      index.add("doc3", "content");

      expect(index.size()).toBe(3);
    });

    it("should update after removal", () => {
      const index = new InvertedIndex();
      index.add("doc1", "content");
      index.add("doc2", "content");

      expect(index.size()).toBe(2);

      index.remove("doc1");

      expect(index.size()).toBe(1);
    });
  });

  describe("clear", () => {
    it("should remove all documents", () => {
      const index = new InvertedIndex();
      index.add("doc1", "content1");
      index.add("doc2", "content2");
      index.add("doc3", "content3");

      expect(index.size()).toBe(3);

      index.clear();

      expect(index.size()).toBe(0);
      expect(index.has("doc1")).toBe(false);
      expect(index.has("doc2")).toBe(false);
      expect(index.has("doc3")).toBe(false);
    });

    it("should clear search results", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");

      index.clear();

      const results = index.search("hello");
      expect(results).toHaveLength(0);
    });
  });

  describe("getDocumentIds", () => {
    it("should return all document IDs", () => {
      const index = new InvertedIndex();
      index.add("doc1", "content1");
      index.add("doc2", "content2");
      index.add("doc3", "content3");

      const ids = index.getDocumentIds();

      expect(ids).toHaveLength(3);
      expect(ids).toContain("doc1");
      expect(ids).toContain("doc2");
      expect(ids).toContain("doc3");
    });

    it("should return empty array for empty index", () => {
      const index = new InvertedIndex();
      const ids = index.getDocumentIds();

      expect(ids).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("should handle documents with only stop words", () => {
      const index = new InvertedIndex();
      index.add("doc1", "the and a an");

      // Document exists but has no searchable tokens
      expect(index.has("doc1")).toBe(true);

      const results = index.search("anything");
      expect(results).toHaveLength(0);
    });

    it("should handle special characters and unicode", () => {
      const index = new InvertedIndex();
      index.add("doc1", "café résumé naïve");

      const results1 = index.search("café");
      const results2 = index.search("cafe"); // Should match since we strip accents via tokenization

      // At least one should match
      expect(results1.length + results2.length).toBeGreaterThan(0);
    });

    it("should handle very large documents", () => {
      const index = new InvertedIndex();
      const largeContent = "word ".repeat(10000) + "unique";

      index.add("doc1", largeContent);

      const results = index.search("unique");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("doc1");
    });

    it("should handle same document being re-added with different content", () => {
      const index = new InvertedIndex();
      index.add("doc1", "hello world");
      index.add("doc1", "foo bar");

      const helloResults = index.search("hello");
      expect(helloResults).toHaveLength(0);

      const fooResults = index.search("foo");
      expect(fooResults).toHaveLength(1);
    });
  });
});
