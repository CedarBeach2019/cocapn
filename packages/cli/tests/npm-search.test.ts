/**
 * Tests for npm-search — npm registry search for cocapn plugins
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { searchPlugins, getPluginInfo } from "../src/lib/npm-search.js";

describe("searchPlugins", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns search results mapped from npm response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        objects: [
          {
            package: {
              name: "cocapn-plugin-weather",
              version: "1.0.0",
              description: "Weather skill plugin",
              author: { name: "Alice" },
            },
            score: { detail: { popularity: 5000 } },
          },
          {
            package: {
              name: "cocapn-plugin-calendar",
              version: "2.1.3",
              description: "Calendar integration",
              author: "Bob",
            },
            score: { detail: { popularity: 1200 } },
          },
        ],
        total: 2,
      }),
    });

    const results = await searchPlugins("weather");

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const calledUrl = mockFetch.mock.calls[0][0] as string;
    expect(calledUrl).toContain("weather");
    expect(calledUrl).toContain("keywords%3Acocapn-plugin");
    expect(calledUrl).toContain("size=20");

    expect(results).toHaveLength(2);
    expect(results[0]).toEqual({
      name: "cocapn-plugin-weather",
      version: "1.0.0",
      description: "Weather skill plugin",
      author: "Alice",
      downloads: 5000,
    });
    expect(results[1]).toEqual({
      name: "cocapn-plugin-calendar",
      version: "2.1.3",
      description: "Calendar integration",
      author: "Bob",
      downloads: 1200,
    });
  });

  it("returns empty array when no results", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ objects: [], total: 0 }),
    });

    const results = await searchPlugins("nonexistent");
    expect(results).toEqual([]);
  });

  it("handles missing optional fields", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        objects: [
          {
            package: {
              name: "cocapn-plugin-minimal",
              version: "0.1.0",
            },
          },
        ],
        total: 1,
      }),
    });

    const results = await searchPlugins("minimal");
    expect(results[0]).toEqual({
      name: "cocapn-plugin-minimal",
      version: "0.1.0",
      description: "",
      author: "",
      downloads: 0,
    });
  });

  it("throws on non-ok response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      statusText: "Service Unavailable",
    });

    await expect(searchPlugins("test")).rejects.toThrow("npm search failed: Service Unavailable");
  });
});

describe("getPluginInfo", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("returns detailed package info", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        "dist-tags": { latest: "3.0.0" },
        versions: {
          "3.0.0": {
            license: "MIT",
            homepage: "https://example.com",
            repository: { url: "https://github.com/example/plugin" },
          },
        },
        description: "A test plugin",
        author: { name: "Test Author" },
        keywords: ["cocapn-plugin", "test"],
      }),
    });

    const info = await getPluginInfo("cocapn-plugin-test");

    expect(info).toEqual({
      name: "cocapn-plugin-test",
      version: "3.0.0",
      description: "A test plugin",
      author: "Test Author",
      license: "MIT",
      repository: "https://github.com/example/plugin",
      homepage: "https://example.com",
      keywords: ["cocapn-plugin", "test"],
    });
  });

  it("throws on 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: "Not Found",
    });

    await expect(getPluginInfo("nonexistent")).rejects.toThrow("Package not found: nonexistent");
  });

  it("handles missing dist-tags by using first version", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        versions: {
          "1.0.0": { license: "Apache-2.0" },
        },
        description: "Fallback version",
        author: "Author",
      }),
    });

    const info = await getPluginInfo("cocapn-plugin-fallback");
    expect(info.version).toBe("1.0.0");
    expect(info.license).toBe("Apache-2.0");
  });
});
