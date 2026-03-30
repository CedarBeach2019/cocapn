/**
 * Tests for cocapn plugin command — install, list, remove, enable, disable
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, writeFileSync } from "fs";
import { join } from "path";
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

const testDir = join(process.cwd(), ".test-plugin-tmp");

function setupProject(): void {
  if (!existsSync(testDir)) {
    mkdirSync(testDir, { recursive: true });
  }
  mkdirSync(join(testDir, "cocapn"), { recursive: true });
}

function cleanupProject(): void {
  if (existsSync(testDir)) {
    rmSync(testDir, { recursive: true, force: true });
  }
}

function createPluginManifest(name: string, overrides: Record<string, unknown> = {}): void {
  const pluginDir = join(testDir, "cocapn", "plugins", name);
  mkdirSync(pluginDir, { recursive: true });
  const manifest = {
    name,
    version: "1.0.0",
    description: `Test plugin ${name}`,
    main: "index.js",
    ...overrides,
  };
  writeFileSync(join(pluginDir, "plugin.json"), JSON.stringify(manifest, null, 2), "utf-8");
}

// ─── getPluginDir ───────────────────────────────────────────────────────────

describe("getPluginDir", () => {
  it("returns cocapn/plugins under project root", () => {
    expect(getPluginDir(testDir)).toBe(join(testDir, "cocapn", "plugins"));
  });

  it("defaults to cwd when no root given", () => {
    expect(getPluginDir()).toBe(join(process.cwd(), "cocapn", "plugins"));
  });
});

// ─── validateManifest ──────────────────────────────────────────────────────

describe("validateManifest", () => {
  const manifestDir = join(testDir, "cocapn", "plugins", "validate-test");

  beforeEach(() => {
    if (!existsSync(manifestDir)) {
      mkdirSync(manifestDir, { recursive: true });
    }
  });

  it("validates a correct manifest", async () => {
    const path = join(manifestDir, "plugin.json");
    writeFileSync(path, JSON.stringify({
      name: "test-plugin",
      version: "1.0.0",
      description: "A test plugin",
      main: "index.js",
    }), "utf-8");

    const manifest = await validateManifest(path);
    expect(manifest.name).toBe("test-plugin");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.description).toBe("A test plugin");
    expect(manifest.main).toBe("index.js");
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

  it("throws when version is missing", async () => {
    const path = join(manifestDir, "plugin.json");
    writeFileSync(path, JSON.stringify({
      name: "test",
      description: "test",
    }), "utf-8");

    await expect(validateManifest(path)).rejects.toThrow("missing or invalid 'version'");
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

  it("defaults main to index.js when not specified", async () => {
    const path = join(manifestDir, "plugin.json");
    writeFileSync(path, JSON.stringify({
      name: "test",
      version: "1.0.0",
      description: "test",
    }), "utf-8");

    const manifest = await validateManifest(path);
    expect(manifest.main).toBe("index.js");
  });
});

// ─── installPlugin ──────────────────────────────────────────────────────────

describe("installPlugin", () => {
  beforeEach(() => setupProject());
  afterEach(() => cleanupProject());

  it("creates a plugin directory with manifest", async () => {
    const plugin = await installPlugin("my-plugin", testDir);

    expect(plugin.name).toBe("my-plugin");
    expect(plugin.version).toBe("0.1.0");
    expect(plugin.enabled).toBe(true);
    expect(existsSync(join(testDir, "cocapn", "plugins", "my-plugin", "plugin.json"))).toBe(true);
  });

  it("enables the plugin by default", async () => {
    await installPlugin("auto-enabled", testDir);
    const enabled = await loadEnabledSet(testDir);
    expect(enabled.has("auto-enabled")).toBe(true);
  });

  it("throws when plugin already exists", async () => {
    await installPlugin("dup-plugin", testDir);
    await expect(installPlugin("dup-plugin", testDir))
      .rejects.toThrow("already installed");
  });
});

// ─── listPlugins ────────────────────────────────────────────────────────────

describe("listPlugins", () => {
  beforeEach(() => setupProject());
  afterEach(() => cleanupProject());

  it("returns empty array when no plugins directory", async () => {
    const plugins = await listPlugins(testDir);
    expect(plugins).toEqual([]);
  });

  it("lists installed plugins", async () => {
    createPluginManifest("alpha");
    createPluginManifest("beta");

    const plugins = await listPlugins(testDir);
    expect(plugins.length).toBe(2);
    expect(plugins.map((p) => p.name)).toContain("alpha");
    expect(plugins.map((p) => p.name)).toContain("beta");
  });

  it("skips directories without plugin.json", async () => {
    const noManifestDir = join(testDir, "cocapn", "plugins", "no-manifest");
    mkdirSync(noManifestDir, { recursive: true });

    createPluginManifest("valid-plugin");

    const plugins = await listPlugins(testDir);
    expect(plugins.length).toBe(1);
    expect(plugins[0].name).toBe("valid-plugin");
  });

  it("skips directories with invalid manifests", async () => {
    const badDir = join(testDir, "cocapn", "plugins", "bad-plugin");
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, "plugin.json"), "not json", "utf-8");

    createPluginManifest("good-plugin");

    const plugins = await listPlugins(testDir);
    expect(plugins.length).toBe(1);
    expect(plugins[0].name).toBe("good-plugin");
  });

  it("shows enabled state correctly", async () => {
    createPluginManifest("enabled-plugin");
    createPluginManifest("disabled-plugin");

    await enablePlugin("enabled-plugin", testDir);
    await disablePlugin("disabled-plugin", testDir);

    const plugins = await listPlugins(testDir);
    const enabledPlugin = plugins.find((p) => p.name === "enabled-plugin");
    const disabledPlugin = plugins.find((p) => p.name === "disabled-plugin");

    expect(enabledPlugin!.enabled).toBe(true);
    expect(disabledPlugin!.enabled).toBe(false);
  });
});

// ─── removePlugin ───────────────────────────────────────────────────────────

describe("removePlugin", () => {
  beforeEach(() => setupProject());
  afterEach(() => cleanupProject());

  it("removes a plugin directory", async () => {
    await installPlugin("to-remove", testDir);
    const pluginDir = join(testDir, "cocapn", "plugins", "to-remove");
    expect(existsSync(pluginDir)).toBe(true);

    await removePlugin("to-remove", testDir);
    expect(existsSync(pluginDir)).toBe(false);
  });

  it("removes plugin from enabled set", async () => {
    await installPlugin("to-remove", testDir);
    await removePlugin("to-remove", testDir);

    const enabled = await loadEnabledSet(testDir);
    expect(enabled.has("to-remove")).toBe(false);
  });

  it("throws for non-existent plugin", async () => {
    await expect(removePlugin("nonexistent", testDir))
      .rejects.toThrow("not installed");
  });
});

// ─── enablePlugin / disablePlugin ───────────────────────────────────────────

describe("enablePlugin / disablePlugin", () => {
  beforeEach(() => setupProject());
  afterEach(() => cleanupProject());

  it("enables a disabled plugin", async () => {
    createPluginManifest("toggle-plugin");
    await disablePlugin("toggle-plugin", testDir);

    let enabled = await loadEnabledSet(testDir);
    expect(enabled.has("toggle-plugin")).toBe(false);

    await enablePlugin("toggle-plugin", testDir);
    enabled = await loadEnabledSet(testDir);
    expect(enabled.has("toggle-plugin")).toBe(true);
  });

  it("disables an enabled plugin", async () => {
    createPluginManifest("toggle-plugin");
    await enablePlugin("toggle-plugin", testDir);

    let enabled = await loadEnabledSet(testDir);
    expect(enabled.has("toggle-plugin")).toBe(true);

    await disablePlugin("toggle-plugin", testDir);
    enabled = await loadEnabledSet(testDir);
    expect(enabled.has("toggle-plugin")).toBe(false);
  });

  it("enable throws for non-existent plugin", async () => {
    await expect(enablePlugin("nonexistent", testDir))
      .rejects.toThrow("not installed");
  });

  it("disable throws for non-existent plugin", async () => {
    await expect(disablePlugin("nonexistent", testDir))
      .rejects.toThrow("not installed");
  });
});

// ─── loadEnabledSet ─────────────────────────────────────────────────────────

describe("loadEnabledSet", () => {
  beforeEach(() => setupProject());
  afterEach(() => cleanupProject());

  it("returns empty set when no enabled.json", async () => {
    const enabled = await loadEnabledSet(testDir);
    expect(enabled.size).toBe(0);
  });

  it("returns empty set for malformed JSON", async () => {
    const enabledPath = join(testDir, "cocapn", "plugins", "enabled.json");
    mkdirSync(join(testDir, "cocapn", "plugins"), { recursive: true });
    writeFileSync(enabledPath, "not json", "utf-8");

    const enabled = await loadEnabledSet(testDir);
    expect(enabled.size).toBe(0);
  });

  it("loads enabled plugins from file", async () => {
    const enabledPath = join(testDir, "cocapn", "plugins", "enabled.json");
    mkdirSync(join(testDir, "cocapn", "plugins"), { recursive: true });
    writeFileSync(enabledPath, JSON.stringify(["a", "b", "c"]), "utf-8");

    const enabled = await loadEnabledSet(testDir);
    expect(enabled.size).toBe(3);
    expect(enabled.has("a")).toBe(true);
    expect(enabled.has("b")).toBe(true);
    expect(enabled.has("c")).toBe(true);
  });
});
