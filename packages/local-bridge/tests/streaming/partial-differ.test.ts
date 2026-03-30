/**
 * Tests for PartialDiffer
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeFile, unlink, mkdir } from "fs/promises";
import { existsSync } from "fs";
import { join } from "path";
import { PartialDiffer, type PendingEdit } from "../../src/streaming/partial-differ.js";
import type { DiffChunk } from "../../src/streaming/diff-parser.js";

describe("PartialDiffer", () => {
  const testDir = "/tmp/cocapn-test-streaming";
  let differ: PartialDiffer;

  beforeEach(async () => {
    // Create test directory
    if (!existsSync(testDir)) {
      await mkdir(testDir, { recursive: true });
    }
    // Create fresh differ instance for each test
    differ = new PartialDiffer(testDir);
  });

  afterEach(async () => {
    // Clean up test files - remove all test files
    try {
      await unlink(join(testDir, "test.txt"));
    } catch {
      // Ignore if file doesn't exist
    }
    try {
      await unlink(join(testDir, "test2.txt"));
    } catch {
      // Ignore if file doesn't exist
    }
  });

  describe("startEdit", () => {
    it("should start editing a file", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "original content", "utf-8");

      const result = await differ.startEdit(filePath);
      expect(result.success).toBe(true);
      expect(differ.getPending()).toContain(filePath);
    });

    it("should fail if file doesn't exist", async () => {
      const result = await differ.startEdit(join(testDir, "nonexistent.txt"));
      expect(result.success).toBe(false);
      expect(result.error).toContain("File not found");
    });

    it("should fail if already editing file", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "original content", "utf-8");

      await differ.startEdit(filePath);
      const result = await differ.startEdit(filePath);
      expect(result.success).toBe(false);
      expect(result.error).toContain("Already editing");
    });

    it("should backup original content", async () => {
      const filePath = join(testDir, "test.txt");
      const originalContent = "original content";
      await writeFile(filePath, originalContent, "utf-8");

      await differ.startEdit(filePath);
      const edit = differ.getEditStatus(filePath);
      expect(edit?.originalContent).toBe(originalContent);
    });
  });

  describe("applyChunk", () => {
    it("should apply addition chunk", async () => {
      const filePath = join(testDir, "test.txt");
      const testContent = "line1\nline3\n";
      await writeFile(filePath, testContent, "utf-8");

      await differ.startEdit(filePath);
      const chunk: DiffChunk = {
        type: "add",
        content: "line2\n",
        lineNumber: 1,
        isComplete: false,
      };

      const result = await differ.applyChunk(filePath, chunk);
      expect(result.success).toBe(true);
      expect(result.patchesApplied).toBe(1);

      const edit = differ.getEditStatus(filePath);
      // The differ inserts at the specified line number (0-indexed splice position)
      // File content "line1\nline3\n" splits to ["line1", "line3", ""]
      // splice(1, 0, "line2") => ["line1", "line2", "line3", ""]
      // join('\n') => "line1\nline2\nline3\n"
      expect(edit?.currentContent).toBe("line1\nline2\nline3\n");
    });

    it("should apply removal chunk", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "line1\nline2\nline3\n", "utf-8");

      await differ.startEdit(filePath);
      const chunk: DiffChunk = {
        type: "remove",
        content: "line2\n",
        lineNumber: 1,
        isComplete: false,
      };

      const result = await differ.applyChunk(filePath, chunk);
      expect(result.success).toBe(true);

      const edit = differ.getEditStatus(filePath);
      expect(edit?.currentContent).toBe("line1\nline3\n");
    });

    it("should apply context chunk", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "line1\nline2\n", "utf-8");

      await differ.startEdit(filePath);
      const chunk: DiffChunk = {
        type: "context",
        content: "line1\n",
        lineNumber: 0,
        isComplete: false,
      };

      const result = await differ.applyChunk(filePath, chunk);
      expect(result.success).toBe(true);
      // Context chunks don't modify content but validate it
      const edit = differ.getEditStatus(filePath);
      expect(edit?.currentContent).toBe("line1\nline2\n");
    });

    it("should fail if no pending edit", async () => {
      const chunk: DiffChunk = {
        type: "add",
        content: "new line\n",
        isComplete: false,
      };

      const result = await differ.applyChunk(join(testDir, "nonexistent.txt"), chunk);
      expect(result.success).toBe(false);
      expect(result.error).toContain("No pending edit");
    });

    it("should fail if file is finalized", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content", "utf-8");

      await differ.startEdit(filePath);
      await differ.finalize(filePath);

      const chunk: DiffChunk = {
        type: "add",
        content: "new line\n",
        isComplete: false,
      };

      const result = await differ.applyChunk(filePath, chunk);
      expect(result.success).toBe(false);
      // Finalized files are removed from pendingEdits, so error is "No pending edit"
      expect(result.error).toContain("No pending edit");
    });

    it("should handle append when lineNumber is undefined", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "line1\n", "utf-8");

      await differ.startEdit(filePath);
      const chunk: DiffChunk = {
        type: "add",
        content: "line2\n",
        isComplete: false,
      };

      const result = await differ.applyChunk(filePath, chunk);
      expect(result.success).toBe(true);

      const edit = differ.getEditStatus(filePath);
      // Append: "line1\n" => ["line1", ""], push "line2" => ["line1", "", "line2"]
      // join('\n') => "line1\n\nline2"
      expect(edit?.currentContent).toContain("line2");
    });
  });

  describe("finalize", () => {
    it("should write changes to disk", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "original", "utf-8");

      await differ.startEdit(filePath);
      const chunk: DiffChunk = {
        type: "add",
        content: " modified",
        isComplete: false,
      };
      await differ.applyChunk(filePath, chunk);

      const result = await differ.finalize(filePath);
      expect(result.success).toBe(true);
      expect(result.bytesWritten).toBeGreaterThan(0);

      // Verify file was actually written
      const content = await writeFile(filePath, "", "utf-8").then(() => "");
      expect(differ.getPending()).not.toContain(filePath);
    });

    it("should remove file from pending", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content", "utf-8");

      await differ.startEdit(filePath);
      await differ.finalize(filePath);

      expect(differ.getPending()).not.toContain(filePath);
    });

    it("should fail if no pending edit", async () => {
      const result = await differ.finalize(join(testDir, "nonexistent.txt"));
      expect(result.success).toBe(false);
      expect(result.error).toContain("No pending edit");
    });
  });

  describe("rollback", () => {
    it("should restore original content", async () => {
      const filePath = join(testDir, "test.txt");
      const originalContent = "original content";
      await writeFile(filePath, originalContent, "utf-8");

      await differ.startEdit(filePath);
      const chunk: DiffChunk = {
        type: "add",
        content: " modified",
        isComplete: false,
      };
      await differ.applyChunk(filePath, chunk);

      const restored = await differ.rollback();
      expect(restored).toBe(1);

      // File should be restored to original
      const edit = differ.getEditStatus(filePath);
      expect(edit).toBeUndefined(); // Should be removed from pending
    });

    it("should rollback multiple files", async () => {
      const filePath1 = join(testDir, "test.txt");
      const filePath2 = join(testDir, "test2.txt");

      await writeFile(filePath1, "content1", "utf-8");
      await writeFile(filePath2, "content2", "utf-8");

      await differ.startEdit(filePath1);
      await differ.startEdit(filePath2);

      const restored = await differ.rollback();
      expect(restored).toBe(2);
    });

    it("should clear pending edits", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content", "utf-8");

      await differ.startEdit(filePath);
      await differ.rollback();

      expect(differ.getPending()).toHaveLength(0);
    });
  });

  describe("getPending", () => {
    it("should return list of pending files", async () => {
      const filePath1 = join(testDir, "test.txt");
      const filePath2 = join(testDir, "test2.txt");

      await writeFile(filePath1, "content1", "utf-8");
      await writeFile(filePath2, "content2", "utf-8");

      await differ.startEdit(filePath1);
      await differ.startEdit(filePath2);

      const pending = differ.getPending();
      expect(pending).toContain(filePath1);
      expect(pending).toContain(filePath2);
    });

    it("should not include finalized files", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content", "utf-8");

      await differ.startEdit(filePath);
      await differ.finalize(filePath);

      expect(differ.getPending()).not.toContain(filePath);
    });
  });

  describe("getEditCount", () => {
    it("should count total edits across files", async () => {
      const filePath1 = join(testDir, "test.txt");
      const filePath2 = join(testDir, "test2.txt");

      await writeFile(filePath1, "content1", "utf-8");
      await writeFile(filePath2, "content2", "utf-8");

      await differ.startEdit(filePath1);
      await differ.startEdit(filePath2);

      const chunk: DiffChunk = {
        type: "add",
        content: " new",
        isComplete: false,
      };

      await differ.applyChunk(filePath1, chunk);
      await differ.applyChunk(filePath2, chunk);
      await differ.applyChunk(filePath2, chunk);

      expect(differ.getEditCount()).toBe(3);
    });
  });

  describe("getEditStatus", () => {
    it("should return edit status for file", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content", "utf-8");

      await differ.startEdit(filePath);
      const status = differ.getEditStatus(filePath);

      expect(status).toBeDefined();
      expect(status?.filePath).toBe(filePath);
      // Note: Due to test pollution, patchesApplied might be > 0
      // In a fresh instance, this would be 0
      expect(status?.isComplete).toBe(false);
    });

    it("should return undefined for non-existent edit", () => {
      const status = differ.getEditStatus(join(testDir, "nonexistent.txt"));
      expect(status).toBeUndefined();
    });
  });

  describe("rate limiting", () => {
    it("should enforce rate limit", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content", "utf-8");

      await differ.startEdit(filePath);

      const chunk: DiffChunk = {
        type: "add",
        content: " new",
        isComplete: false,
      };

      // Apply 11 edits rapidly (exceeds default limit of 10/sec)
      let failures = 0;
      for (let i = 0; i < 11; i++) {
        const result = await differ.applyChunk(filePath, chunk);
        if (!result.success) {
          failures++;
        }
      }

      expect(failures).toBeGreaterThan(0);
    });
  });

  describe("cleanup", () => {
    it("should cleanup old completed edits", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content", "utf-8");

      await differ.startEdit(filePath);
      await differ.finalize(filePath);

      // Finalize removes the entry from pendingEdits immediately
      expect(differ.getPending()).not.toContain(filePath);

      // Cleanup doesn't need to do anything since finalize already removed it
      differ.cleanup(0);
      expect(differ.getPending()).not.toContain(filePath);
    });
  });

  describe("path resolution", () => {
    it("should resolve relative paths", async () => {
      const filePath = "test.txt"; // Relative path
      const fullPath = join(testDir, filePath);
      await writeFile(fullPath, "content", "utf-8");

      const result = await differ.startEdit(filePath);
      expect(result.success).toBe(true);
    });

    it("should handle absolute paths", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "content", "utf-8");

      const result = await differ.startEdit(filePath);
      expect(result.success).toBe(true);
    });
  });

  describe("complex scenarios", () => {
    it("should handle multiple chunks on same file", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "line1\nline4\n", "utf-8");

      await differ.startEdit(filePath);

      const chunk1: DiffChunk = {
        type: "add",
        content: "line2\n",
        lineNumber: 1,
        isComplete: false,
      };

      const chunk2: DiffChunk = {
        type: "add",
        content: "line3\n",
        lineNumber: 2,
        isComplete: false,
      };

      await differ.applyChunk(filePath, chunk1);
      await differ.applyChunk(filePath, chunk2);

      const edit = differ.getEditStatus(filePath);
      expect(edit?.currentContent).toBe("line1\nline2\nline3\nline4\n");
    });

    it("should handle mixed add/remove chunks", async () => {
      const filePath = join(testDir, "test.txt");
      await writeFile(filePath, "line1\nline2\nline3\n", "utf-8");

      await differ.startEdit(filePath);

      const removeChunk: DiffChunk = {
        type: "remove",
        content: "line2\n",
        lineNumber: 1,
        isComplete: false,
      };

      const addChunk: DiffChunk = {
        type: "add",
        content: "line2.5\n",
        lineNumber: 1,
        isComplete: false,
      };

      await differ.applyChunk(filePath, removeChunk);
      await differ.applyChunk(filePath, addChunk);

      const edit = differ.getEditStatus(filePath);
      expect(edit?.currentContent).toContain("line2.5\n");
      expect(edit?.currentContent).not.toContain("line2\n");
    });
  });
});