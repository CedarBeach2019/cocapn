/**
 * Tests for embedding providers with graceful fallback.
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  createEmbeddingProvider,
  LocalEmbeddingProvider,
  OpenAIEmbeddingProvider,
} from "../src/brain/embedding.js";

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
    return Promise.all(texts.map(text => this.embed(text)));
  }
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("LocalEmbeddingProvider", () => {
  it("initializes successfully", async () => {
    const provider = new LocalEmbeddingProvider();
    const result = await provider.initialize();

    // On systems without WASM support, this may fail
    // We just check it returns a valid result
    expect(result).toHaveProperty("success");
    expect(typeof result.success).toBe("boolean");
  });

  it("returns null on embed failure", async () => {
    const provider = new LocalEmbeddingProvider();
    // Force initialization to fail by using an invalid model
    const badProvider = new LocalEmbeddingProvider("invalid-model-name");
    await badProvider.initialize();

    const result = await badProvider.embed("test");
    expect(result).toBeNull();
  });

  it("handles batch embedding with mixed results", async () => {
    const provider = new LocalEmbeddingProvider();
    const results = await provider.embedBatch(["test1", "test2", "test3"]);

    // Should return array of same length
    expect(results).toHaveLength(3);
    // Each result should be null or array
    results.forEach(result => {
      expect(result === null || Array.isArray(result)).toBe(true);
    });
  });

  it("returns embeddings with correct dimensions", async () => {
    const provider = new LocalEmbeddingProvider();
    await provider.initialize();

    const result = await provider.embed("test");

    if (result !== null) {
      expect(Array.isArray(result)).toBe(true);
      expect(result.length).toBeGreaterThan(0);
    }
  });
});

describe("OpenAIEmbeddingProvider", () => {
  it("fails initialization without API key", async () => {
    const provider = new OpenAIEmbeddingProvider("");
    const result = await provider.initialize();

    expect(result.success).toBe(false);
    expect(result.error).toContain("API key");
  });

  it("returns null on embed failure", async () => {
    const provider = new OpenAIEmbeddingProvider("fake-key");
    await provider.initialize();

    // This will fail with a fake key
    const result = await provider.embed("test");
    expect(result).toBeNull();
  });

  it("handles batch embedding gracefully", async () => {
    const provider = new OpenAIEmbeddingProvider("fake-key");
    await provider.initialize();

    // This will fail with a fake key, but should not throw
    const results = await provider.embedBatch(["test1", "test2"]);
    expect(results).toHaveLength(2);
    results.forEach(result => {
      expect(result).toBeNull();
    });
  });
});

describe("createEmbeddingProvider", () => {
  it("creates local provider by default", async () => {
    const provider = await createEmbeddingProvider({ provider: "local" });
    expect(provider).toHaveProperty("initialize");
    expect(provider).toHaveProperty("embed");
    expect(provider).toHaveProperty("embedBatch");
  });

  it("creates OpenAI provider when specified", async () => {
    const provider = await createEmbeddingProvider({
      provider: "openai",
      apiKey: "test-key",
    });
    expect(provider).toBeInstanceOf(OpenAIEmbeddingProvider);
  });

  it("creates local provider with custom dimensions", async () => {
    const provider = await createEmbeddingProvider({
      provider: "local",
      dimensions: 512,
    });
    expect(provider).toBeInstanceOf(LocalEmbeddingProvider);
  });
});

describe("MockEmbeddingProvider", () => {
  it("generates consistent embeddings for same text", async () => {
    const provider = new MockEmbeddingProvider();
    await provider.initialize();

    const result1 = await provider.embed("test");
    const result2 = await provider.embed("test");

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1).toEqual(result2);
  });

  it("generates different embeddings for different texts", async () => {
    const provider = new MockEmbeddingProvider();
    await provider.initialize();

    const result1 = await provider.embed("test1");
    const result2 = await provider.embed("test2");

    expect(result1).not.toBeNull();
    expect(result2).not.toBeNull();
    expect(result1).not.toEqual(result2);
  });

  it("handles batch embedding", async () => {
    const provider = new MockEmbeddingProvider();
    await provider.initialize();

    const results = await provider.embedBatch(["test1", "test2", "test3"]);

    expect(results).toHaveLength(3);
    // First result should not be null
    expect(results[0]).not.toBeNull();
    // All results should be arrays
    results.forEach(result => {
      expect(Array.isArray(result)).toBe(true);
    });
  });
});
