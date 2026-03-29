/**
 * Tests for vector store with graceful fallback.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { VectorStore, createVectorStore } from "../src/brain/vector-store.js";

// ─── Mock Embedding Provider ───────────────────────────────────────────────────

class MockEmbeddingProvider {
  async initialize(): Promise<{ success: boolean; error?: string }> {
    return { success: true };
  }

  async embed(text: string): Promise<number[] | null> {
    // Return a simple hash-based embedding
    const embedding = new Array(384).fill(0);
    for (let i = 0; i < text.length; i++) {
      embedding[i % 384] = text.charCodeAt(i) / 255;
    }
    return embedding;
  }

  async embedBatch(texts: string[]): Promise<(number[] | null)[]> {
    return texts.map(text => this.embed(text));
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("VectorStore", () => {
  const mockProvider = new MockEmbeddingProvider() as any;
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), "cocapn-vector-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("initializes gracefully when sqlite-vec is not available", async () => {
    const dbPath = join(tempDir, "test.db");
    const store = new VectorStore(
      { enabled: true, dbPath, dimensions: 384 },
      mockProvider
    );

    const result = await store.initialize();

    // On systems without sqlite-vec, this should fail gracefully
    expect(result).toHaveProperty("enabled");
    expect(typeof result.enabled).toBe("boolean");

    if (!result.enabled) {
      expect(result.reason).toBeTruthy();
    }
  });

  it("returns empty search results when disabled", async () => {
    const dbPath = join(tempDir, "test.db");
    const store = new VectorStore(
      { enabled: false, dbPath, dimensions: 384 },
      mockProvider
    );

    await store.initialize();
    const results = await store.search("test query");

    expect(results).toEqual([]);
  });

  it("handles store operation gracefully when disabled", async () => {
    const dbPath = join(tempDir, "test.db");
    const store = new VectorStore(
      { enabled: false, dbPath, dimensions: 384 },
      mockProvider
    );

    await store.initialize();
    const success = await store.store("doc1", "test content");

    expect(success).toBe(false);
  });

  it("handles delete operation gracefully when disabled", async () => {
    const dbPath = join(tempDir, "test.db");
    const store = new VectorStore(
      { enabled: false, dbPath, dimensions: 384 },
      mockProvider
    );

    await store.initialize();
    // Should not throw
    await store.delete("doc1");
  });

  it("isEnabled returns correct state", async () => {
    const dbPath = join(tempDir, "test.db");
    const store = new VectorStore(
      { enabled: false, dbPath, dimensions: 384 },
      mockProvider
    );

    await store.initialize();
    expect(store.isEnabled()).toBe(false);
  });

  it("getDisableReason returns reason when disabled", async () => {
    const dbPath = join(tempDir, "test.db");
    const store = new VectorStore(
      { enabled: false, dbPath, dimensions: 384 },
      mockProvider
    );

    const result = await store.initialize();

    if (!result.enabled) {
      expect(store.getDisableReason()).toBe(result.reason);
    }
  });

  it("close does not throw when disabled", async () => {
    const dbPath = join(tempDir, "test.db");
    const store = new VectorStore(
      { enabled: false, dbPath, dimensions: 384 },
      mockProvider
    );

    await store.initialize();
    // Should not throw
    store.close();
  });
});

describe("createVectorStore", () => {
  it("creates a vector store with correct configuration", async () => {
    const mockProvider = new MockEmbeddingProvider() as any;
    const store = await createVectorStore("/tmp", mockProvider, 384);

    expect(store).toBeInstanceOf(VectorStore);
    expect(store).toHaveProperty("initialize");
    expect(store).toHaveProperty("store");
    expect(store).toHaveProperty("search");
    expect(store).toHaveProperty("delete");
    expect(store).toHaveProperty("isEnabled");
  });

  it("handles initialization failure gracefully", async () => {
    const mockProvider = new MockEmbeddingProvider() as any;
    const store = await createVectorStore("/tmp", mockProvider, 384);

    // Should not throw even if sqlite-vec is not available
    await expect(store.initialize()).resolves.toBeDefined();
  });
});

describe("VectorStore with mock sqlite-vec", () => {
  const mockProvider = new MockEmbeddingProvider() as any;

  it("handles all operations without throwing", async () => {
    const tempDir = mkdtempSync(join(tmpdir(), "cocapn-vector-mock-test-"));
    const dbPath = join(tempDir, "test.db");

    try {
      const store = new VectorStore(
        { enabled: true, dbPath, dimensions: 384 },
        mockProvider
      );

      // Initialize
      await store.initialize();

      // Store
      await store.store("doc1", "test content");

      // Search
      const results = await store.search("test query");
      expect(Array.isArray(results)).toBe(true);

      // Delete
      await store.delete("doc1");

      // Close
      store.close();
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("returns false on store when provider fails", async () => {
    class FailingMockProvider {
      async initialize(): Promise<{ success: boolean; error?: string }> {
        return { success: true };
      }

      async embed(): Promise<number[] | null> {
        return null; // Simulate failure
      }
    }

    const failingProvider = new FailingMockProvider() as any;
    const tempDir = mkdtempSync(join(tmpdir(), "cocapn-vector-fail-test-"));
    const dbPath = join(tempDir, "test.db");

    try {
      const store = new VectorStore(
        { enabled: true, dbPath, dimensions: 384 },
        failingProvider
      );

      await store.initialize();
      const success = await store.store("doc1", "test content");

      expect(success).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
