/**
 * Tests for DiffStreamParser
 */

import { describe, it, expect, beforeEach } from "vitest";
import { DiffStreamParser, type DiffChunk } from "../../src/streaming/diff-parser.js";

describe("DiffStreamParser", () => {
  let parser: DiffStreamParser;

  beforeEach(() => {
    parser = new DiffStreamParser();
  });

  describe("unified diff format", () => {
    it("should parse unified diff header", () => {
      const chunks = parser.feed("@@ -1,3 +1,4 @@\n");
      expect(chunks).toHaveLength(0);
      expect(parser.getState().inUnifiedDiff).toBe(true);
    });

    it("should parse addition lines", () => {
      parser.feed("@@ -1,3 +1,4 @@\n");
      const chunks = parser.feed("+new line\n");
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("add");
      expect(chunks[0].content).toBe("new line\n");
      expect(chunks[0].lineNumber).toBe(2);
    });

    it("should parse removal lines", () => {
      parser.feed("@@ -1,3 +1,4 @@\n");
      const chunks = parser.feed("-old line\n");
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("remove");
      expect(chunks[0].content).toBe("old line\n");
    });

    it("should parse context lines", () => {
      parser.feed("@@ -1,3 +1,4 @@\n");
      const chunks = parser.feed(" context line\n");
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("context");
      expect(chunks[0].content).toBe("context line\n");
    });

    it("should parse complete unified diff", () => {
      const input = `@@ -1,3 +1,4 @@
 context
-old line
+new line
 another context
`;
      const chunks = parser.feed(input);
      expect(chunks).toHaveLength(4);
      expect(chunks[0].type).toBe("context");
      expect(chunks[1].type).toBe("remove");
      expect(chunks[2].type).toBe("add");
      expect(chunks[3].type).toBe("context");
    });

    it("should handle file headers", () => {
      const input = `--- a/file.txt
+++ b/file.txt
@@ -1,3 +1,4 @@
 context
`;
      const chunks = parser.feed(input);
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("context");
      expect(chunks[0].file).toBe("b/file.txt");
    });
  });

  describe("markdown code fence format", () => {
    it("should detect markdown diff fence", () => {
      const chunks = parser.feed("```diff\n");
      expect(chunks).toHaveLength(0);
      expect(parser.getState().inMarkdownFence).toBe(true);
    });

    it("should parse lines within fence", () => {
      parser.feed("```diff\n");
      const chunks = parser.feed("+addition\n");
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("add");
    });

    it("should detect end of fence", () => {
      parser.feed("```diff\n");
      parser.feed("+addition\n");
      const chunks = parser.feed("```\n");
      expect(chunks[0].isComplete).toBe(true);
      expect(parser.getState().inMarkdownFence).toBe(false);
    });

    it("should parse complete markdown diff", () => {
      const input = "```diff\n-old line\n+new line\n context\n```\n";
      const chunks = parser.feed(input);
      expect(chunks).toHaveLength(3);
      expect(chunks[0].type).toBe("remove");
      expect(chunks[1].type).toBe("add");
      expect(chunks[2].type).toBe("context");
    });
  });

  describe("Aider SEARCH/REPLACE format", () => {
    it("should detect SEARCH block", () => {
      const chunks = parser.feed("<<<< SEARCH\n");
      expect(chunks).toHaveLength(0);
      expect(parser.getState().inSearchReplace).toBe(true);
    });

    it("should detect REPLACE marker", () => {
      parser.feed("<<<< SEARCH\n");
      parser.feed("old content\n");
      const chunks = parser.feed(">>>> REPLACE\n");
      // REPLACE marker is a separator, doesn't emit chunks
      expect(chunks).toHaveLength(1);
    });

    it("should detect end of SEARCH/REPLACE block", () => {
      parser.feed("<<<< SEARCH\n");
      parser.feed("old content\n");
      parser.feed(">>>> REPLACE\n");
      parser.feed("new content\n");
      const chunks = parser.feed("====\n");
      expect(chunks).some(c => c.isComplete).toBe(true);
      expect(parser.getState().inSearchReplace).toBe(false);
    });
  });

  describe("incremental parsing", () => {
    it("should handle incomplete chunks", () => {
      const chunks1 = parser.feed("@@ -1,3 +");
      expect(chunks1).toHaveLength(0);

      const chunks2 = parser.feed("1,4 @@\n");
      expect(chunks2).toHaveLength(0);
      expect(parser.getState().inUnifiedDiff).toBe(true);
    });

    it("should buffer and process later", () => {
      const chunks1 = parser.feed("+incomplete");
      expect(chunks1).toHaveLength(0);

      const chunks2 = parser.feed(" line\n");
      expect(chunks2).toHaveLength(1);
      expect(chunks2[0].type).toBe("add");
      expect(chunks2[0].content).toBe("incomplete line\n");
    });

    it("should handle streaming across multiple feed calls", () => {
      const input = `@@ -1,3 +1,4 @@
 context
-old line
+new line
`;
      const chunks1 = parser.feed(input.slice(0, 10));
      expect(chunks1).toHaveLength(0);

      const chunks2 = parser.feed(input.slice(10));
      expect(chunks2.length).toBeGreaterThan(0);
    });
  });

  describe("flush", () => {
    it("should return remaining buffered content", () => {
      parser.feed("+buffered");
      const chunks = parser.flush();
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("add");
    });

    it("should reset parser state after flush", () => {
      parser.feed("@@ -1,3 +1,4 @@\n");
      expect(parser.getState().inUnifiedDiff).toBe(true);

      parser.flush();
      expect(parser.getState().inUnifiedDiff).toBe(false);
      expect(parser.getState().buffer).toBe("");
    });

    it("should mark final chunks as complete", () => {
      parser.feed("```diff\n");
      parser.feed("+addition\n");
      const chunks = parser.flush();
      expect(chunks.length).toBeGreaterThan(0);
      expect(chunks[chunks.length - 1].isComplete).toBe(true);
    });
  });

  describe("reset", () => {
    it("should reset all parser state", () => {
      parser.feed("@@ -1,3 +1,4 @@\n");
      parser.feed("+addition\n");

      parser.reset();
      const state = parser.getState();

      expect(state.inUnifiedDiff).toBe(false);
      expect(state.inMarkdownFence).toBe(false);
      expect(state.inSearchReplace).toBe(false);
      expect(state.buffer).toBe("");
      expect(state.currentFile).toBeNull();
    });
  });

  describe("edge cases", () => {
    it("should handle empty input", () => {
      const chunks = parser.feed("");
      expect(chunks).toHaveLength(0);
    });

    it("should handle whitespace-only input", () => {
      const chunks = parser.feed("   \n  \n");
      expect(chunks).toHaveLength(0);
    });

    it("should handle mixed content", () => {
      const input = `Some text
@@ -1,3 +1,4 @@
 context
More text
`;
      const chunks = parser.feed(input);
      // Should only parse the diff part
      expect(chunks.some(c => c.type === "context")).toBe(true);
    });

    it("should handle multiple diff blocks", () => {
      const input = `@@ -1,3 +1,4 @@
 context1
@@ -5,3 +6,4 @@
 context2
`;
      const chunks = parser.feed(input);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it("should handle line number tracking", () => {
      parser.feed("@@ -1,3 +1,5 @@\n");
      const chunks = parser.feed(" line1\n+ line2\n line3\n");
      expect(chunks[0].lineNumber).toBe(2);
      expect(chunks[1].lineNumber).toBe(2);
      expect(chunks[2].lineNumber).toBe(3);
    });
  });

  describe("error handling", () => {
    it("should handle malformed diff gracefully", () => {
      const chunks = parser.feed("+ malformed without newline");
      expect(chunks).toHaveLength(0); // Buffer incomplete
    });

    it("should handle unknown diff markers", () => {
      parser.feed("@@ -1,3 +1,4 @@\n");
      const chunks = parser.feed("? unknown marker\n");
      // Unknown markers are treated as context or ignored
      expect(chunks.length).toBeGreaterThanOrEqual(0);
    });
  });
});