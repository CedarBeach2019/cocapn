/**
 * Tests for plugin-installer — install/remove/list cocapn plugins (local)
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "node:fs";
import {
  getPluginDir,
  validateManifest,
  installPlugin,
  removePlugin,
  listPlugins,
  enablePlugin,
  disablePlugin,
  loadEnabledSet,
} from "../src/lib/plugin-installer.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

const testDir = join(process.cwd(), ".test-plugin-installer-tmp");

function setup(): void {
  if (!existsSync(testDir)) mkdirSync(testDir, { recursive: true });
  mkdirSync(join(testDir, "cocapn"), { recursive: true });
}

function cleanup(): void {
  if (existsSync(testDir)) rmSync(testDir, { recursive: true, force: true });
}

// ─── getPluginDir ───────────────────────────────────────────────────────────

describe("getPluginDir", () => {
  it("returns cocapn/plugins under project root", () => {
    expect(getPluginDir(testDir)).toBe(join(testDir, "cocapn", "plugins"));
  });
});

// ─── validateManifest ──────────────────────────────────────────────────────

describe("validateManifest", () => {
  const manifestDir = join(testDir, "cocapn", "plugins", "val");

  beforeEach(() => {
    if (!existsSync(manifestDir)) mkdirSync(manifestDir, { recursive: true });
  });

  it("validates a correct manifest", async () => {
    const path = join(manifestDir, "plugin.json");
    writeFileSync(path, JSON.stringify({
      name: "test",
      version: "1.0.0",
      description: "Test plugin",
    }), "utf-8");

    const m = await validateManifest(path);
    expect(m.name).toBe("test");
    expect(m.version).toBe("1.0.0");
  });

  it("throws when manifest file does not exist", async () => {
    await expect(validateManifest("/nonexistent/plugin.json"))
      .rejects.toThrow("plugin.json not found");
  });

  it("throws when name is missing", async () => {
    const path = join(manifestDir, "plugin.json");
    writeFileSync(path, JSON.stringify({
      version: "1.0.0",
      description: "test",
    }), "utf-8");

    await expect(validateManifest(path)).rejects.toThrow("missing or invalid 'name'");
  });

  it("throws when description is missing", async () => {
    const path = join(manifestDir, "plugin.json");
    writeFileSync(path, JSON.stringify({
      name: "test",
      version: "1.0.0",
    }), "utf-8");

    await expect(validateManifest(path)).rejects.toThrow("missing or invalid 'description'");
  });

  it("throws when JSON is invalid", async () => {
    const path = join(manifestDir, "plugin.json");
    writeFileSync(path, "not json", "utf-8");

    await expect(validateManifest(path)).rejects.toThrow();
  });
});

// ─── listPlugins and removePlugin ──────────────────────────────────────────

describe("listPlugins and removePlugin", () => {
  beforeEach(() => setup());
  afterEach(() => cleanup());

  it("lists installed plugins", async () => {
    await installPlugin("test-list-plugin", testDir);
    const plugins = await listPlugins(testDir);
    const found = plugins.find((p) => p.name === "test-list-plugin");
    expect(found).toBeDefined();
    expect(found!.version).toBe("0.1.0");
    expect(found!.enabled).toBe(true);
  });

  it("removes a plugin", async () => {
    await installPlugin("test-remove-plugin", testDir);
    const pluginDir = join(testDir, "cocapn", "plugins", "test-remove-plugin");
    expect(existsSync(pluginDir)).toBe(true);

    await removePlugin("test-remove-plugin", testDir);
    expect(existsSync(pluginDir)).toBe(false);
  });

  it("removePlugin throws for non-existent plugin", async () => {
    await expect(removePlugin("nonexistent", testDir))
      .rejects.toThrow("not installed");
  });

  it("listPlugins returns empty array when no plugins dir", async () => {
    cleanup();
    const plugins = await listPlugins(testDir);
    expect(plugins).toEqual([]);
  });
});

// ─── installPlugin ──────────────────────────────────────────────────────────

describe("installPlugin", () => {
  beforeEach(() => setup());
  afterEach(() => cleanup());

  it("creates plugin with enabled state", async () => {
    const plugin = await installPlugin("test-install", testDir);
    expect(plugin.enabled).toBe(true);
    expect(plugin.name).toBe("test-install");

    const enabled = await loadEnabledSet(testDir);
    expect(enabled.has("test-install")).toBe(true);
  });

  it("throws when plugin already exists", async () => {
    await installPlugin("dup", testDir);
    await expect(installPlugin("dup", testDir))
      .rejects.toThrow("already installed");
  });
});

// ─── enablePlugin / disablePlugin ───────────────────────────────────────────

describe("enablePlugin / disablePlugin", () => {
  beforeEach(() => setup());
  afterEach(() => cleanup());

  it("toggles enabled state", async () => {
    await installPlugin("toggle", testDir);

    await disablePlugin("toggle", testDir);
    let enabled = await loadEnabledSet(testDir);
    expect(enabled.has("toggle")).toBe(false);

    await enablePlugin("toggle", testDir);
    enabled = await loadEnabledSet(testDir);
    expect(enabled.has("toggle")).toBe(true);
  });
});
