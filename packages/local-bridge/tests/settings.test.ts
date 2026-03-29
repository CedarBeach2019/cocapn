/**
 * Settings Manager Tests
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, readFileSync, writeFileSync } from "fs";
import { SettingsManager, DEFAULT_SETTINGS, type CocapnSettings } from "../src/settings/index.js";

const TEST_CONFIG_PATH = "/tmp/cocapn-test-settings.json";

describe("SettingsManager", () => {
  let manager: SettingsManager;

  beforeEach(async () => {
    // Clean up test file
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }

    manager = new SettingsManager(TEST_CONFIG_PATH);
    await manager.load();
  });

  afterEach(() => {
    // Clean up test file
    if (existsSync(TEST_CONFIG_PATH)) {
      unlinkSync(TEST_CONFIG_PATH);
    }
  });

  describe("constructor and defaults", () => {
    it("should initialize with default settings", () => {
      const all = manager.getAll();

      expect(all.port).toBe(DEFAULT_SETTINGS.port);
      expect(all.host).toBe(DEFAULT_SETTINGS.host);
      expect(all.cloudMode).toBe(DEFAULT_SETTINGS.cloudMode);
      expect(all.defaultModel).toBe(DEFAULT_SETTINGS.defaultModel);
      expect(all.maxTokens).toBe(DEFAULT_SETTINGS.maxTokens);
      expect(all.temperature).toBe(DEFAULT_SETTINGS.temperature);
      expect(all.autoLoadSkills).toBe(DEFAULT_SETTINGS.autoLoadSkills);
    });

    it("should use default config path if none provided", () => {
      const m = new SettingsManager();
      expect(m).toBeDefined();
    });
  });

  describe("get and set", () => {
    it("should get a single setting value", () => {
      expect(manager.get("port")).toBe(DEFAULT_SETTINGS.port);
      expect(manager.get("defaultModel")).toBe(DEFAULT_SETTINGS.defaultModel);
    });

    it("should set a single setting value", () => {
      manager.set("port", 3200);
      expect(manager.get("port")).toBe(3200);

      manager.set("defaultModel", "gpt-4");
      expect(manager.get("defaultModel")).toBe("gpt-4");
    });

    it("should persist changes to disk", async () => {
      manager.set("port", 3200);
      manager.set("cloudMode", "cloud");

      // Create new manager and load
      const manager2 = new SettingsManager(TEST_CONFIG_PATH);
      await manager2.load();

      expect(manager2.get("port")).toBe(3200);
      expect(manager2.get("cloudMode")).toBe("cloud");
    });
  });

  describe("getAll", () => {
    it("should return all settings with env overrides applied", () => {
      // Set a value
      manager.set("port", 3200);

      const all = manager.getAll();
      expect(all.port).toBeDefined();
      expect(all.defaultModel).toBeDefined();
      expect(all.temperature).toBeDefined();
    });

    it("should apply environment variable overrides", () => {
      const originalPort = process.env.COCAPN_PORT;
      const originalMode = process.env.COCAPN_CLOUD_MODE;

      try {
        process.env.COCAPN_PORT = "9999";
        process.env.COCAPN_CLOUD_MODE = "cloud";

        const all = manager.getAll();
        expect(all.port).toBe(9999);
        expect(all.cloudMode).toBe("cloud");
      } finally {
        if (originalPort !== undefined) {
          process.env.COCAPN_PORT = originalPort;
        } else {
          delete process.env.COCAPN_PORT;
        }

        if (originalMode !== undefined) {
          process.env.COCAPN_CLOUD_MODE = originalMode;
        } else {
          delete process.env.COCAPN_CLOUD_MODE;
        }
      }
    });
  });

  describe("load and save", () => {
    it("should create default settings file if none exists", async () => {
      expect(existsSync(TEST_CONFIG_PATH)).toBe(true);

      const content = JSON.parse(readFileSync(TEST_CONFIG_PATH, "utf-8"));
      expect(content).toEqual(DEFAULT_SETTINGS);
    });

    it("should load settings from file", async () => {
      // Set some values
      manager.set("port", 3200);
      manager.set("cloudMode", "hybrid");
      manager.set("apiKey", "test-key-123");

      // Create new manager and load
      const manager2 = new SettingsManager(TEST_CONFIG_PATH);
      await manager2.load();

      expect(manager2.get("port")).toBe(3200);
      expect(manager2.get("cloudMode")).toBe("hybrid");
      expect(manager2.get("apiKey")).toBe("test-key-123");
    });

    it("should merge loaded settings with defaults", async () => {
      // Write partial settings
      writeFileSync(TEST_CONFIG_PATH, JSON.stringify({
        port: 3200,
        cloudMode: "cloud",
      }, null, 2));

      const manager2 = new SettingsManager(TEST_CONFIG_PATH);
      await manager2.load();

      expect(manager2.get("port")).toBe(3200);
      expect(manager2.get("cloudMode")).toBe("cloud");
      // Other values should be defaults
      expect(manager2.get("host")).toBe(DEFAULT_SETTINGS.host);
      expect(manager2.get("defaultModel")).toBe(DEFAULT_SETTINGS.defaultModel);
    });

    it("should handle malformed JSON gracefully", async () => {
      writeFileSync(TEST_CONFIG_PATH, "invalid json {{{");

      const manager2 = new SettingsManager(TEST_CONFIG_PATH);
      await manager2.load();

      // Should keep defaults
      expect(manager2.get("port")).toBe(DEFAULT_SETTINGS.port);
    });
  });

  describe("merge", () => {
    it("should merge partial settings", () => {
      manager.merge({
        port: 3200,
        cloudMode: "hybrid",
        apiKey: "test-key",
      });

      expect(manager.get("port")).toBe(3200);
      expect(manager.get("cloudMode")).toBe("hybrid");
      expect(manager.get("apiKey")).toBe("test-key");
      // Unchanged values should remain
      expect(manager.get("host")).toBe(DEFAULT_SETTINGS.host);
    });

    it("should ignore undefined values in merge", () => {
      const originalPort = manager.get("port");
      manager.merge({
        port: undefined as unknown as number,
        cloudMode: "cloud",
      });

      expect(manager.get("port")).toBe(originalPort);
      expect(manager.get("cloudMode")).toBe("cloud");
    });

    it("should persist merged values to disk", async () => {
      manager.merge({
        port: 3200,
        cloudMode: "hybrid",
      });

      const manager2 = new SettingsManager(TEST_CONFIG_PATH);
      await manager2.load();

      expect(manager2.get("port")).toBe(3200);
      expect(manager2.get("cloudMode")).toBe("hybrid");
    });
  });

  describe("validate", () => {
    it("should validate correct settings", () => {
      const result = manager.validate();
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it("should detect invalid port", () => {
      manager.set("port", -1);
      let result = manager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Port must be between 1 and 65535");

      manager.set("port", 99999);
      result = manager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Port must be between 1 and 65535");
    });

    it("should detect invalid temperature", () => {
      manager.set("temperature", -0.5);
      let result = manager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Temperature must be between 0 and 2");

      manager.set("temperature", 3);
      result = manager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("Temperature must be between 0 and 2");
    });

    it("should detect invalid maxTokens", () => {
      manager.set("maxTokens", 0);
      const result = manager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("maxTokens must be positive");
    });

    it("should detect invalid hybridSearchAlpha", () => {
      manager.set("hybridSearchAlpha", -0.1);
      let result = manager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("hybridSearchAlpha must be between 0 and 1");

      manager.set("hybridSearchAlpha", 1.5);
      result = manager.validate();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain("hybridSearchAlpha must be between 0 and 1");
    });

    it("should warn about missing API key", () => {
      const result = manager.validate();
      expect(result.valid).toBe(true); // Missing API key is a warning, not error
      expect(result.warnings).toContain("No API key configured — AI features will be limited");
    });

    it("should warn about missing OpenAI key when using OpenAI embeddings", () => {
      manager.set("embeddingProvider", "openai");
      manager.set("openaiApiKey", undefined);
      const result = manager.validate();
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain("Embedding provider is 'openai' but no OpenAI API key is configured");
    });
  });

  describe("toSafeString", () => {
    it("should mask API keys", () => {
      manager.set("apiKey", "sk-test-api-key-12345");
      manager.set("openaiApiKey", "sk-openai-key-67890");
      manager.set("fleetJwtSecret", "secret-jwt-token-abc");

      const safeStr = manager.toSafeString();
      const safeObj = JSON.parse(safeStr) as CocapnSettings;

      expect(safeObj.apiKey).toBe("sk-t...2345");
      expect(safeObj.openaiApiKey).toBe("sk-o...7890");
      expect(safeObj.fleetJwtSecret).toBe("secr...-abc");
    });

    it("should mask short API keys", () => {
      manager.set("apiKey", "short");
      const safeStr = manager.toSafeString();
      const safeObj = JSON.parse(safeStr) as CocapnSettings;

      expect(safeObj.apiKey).toBe("***");
    });

    it("should not mask non-sensitive fields", () => {
      manager.set("port", 3200);
      manager.set("cloudMode", "cloud");

      const safeStr = manager.toSafeString();
      const safeObj = JSON.parse(safeStr) as CocapnSettings;

      expect(safeObj.port).toBe(3200);
      expect(safeObj.cloudMode).toBe("cloud");
    });
  });

  describe("onDidChange", () => {
    it("should call listener when setting changes", () => {
      let called = false;
      let receivedChanges: Partial<CocapnSettings> | undefined;

      manager.onDidChange((event) => {
        called = true;
        receivedChanges = event.changes;
      });

      manager.set("port", 3200);

      expect(called).toBe(true);
      expect(receivedChanges).toEqual({ port: 3200 });
    });

    it("should call listener on merge", () => {
      let callCount = 0;
      let lastChanges: Partial<CocapnSettings> | undefined;

      manager.onDidChange((event) => {
        callCount++;
        lastChanges = event.changes;
      });

      manager.merge({
        port: 3200,
        cloudMode: "hybrid",
      });

      expect(callCount).toBe(1);
      expect(lastChanges).toEqual({
        port: 3200,
        cloudMode: "hybrid",
      });
    });

    it("should not call listener if value doesn't change", () => {
      let called = false;

      manager.onDidChange(() => {
        called = true;
      });

      manager.set("port", DEFAULT_SETTINGS.port);

      expect(called).toBe(false);
    });

    it("should support multiple listeners", () => {
      let calls1 = 0;
      let calls2 = 0;

      manager.onDidChange(() => calls1++);
      manager.onDidChange(() => calls2++);

      manager.set("port", 3200);

      expect(calls1).toBe(1);
      expect(calls2).toBe(1);
    });

    it("should allow removing listeners", () => {
      let called = false;

      const listener = () => { called = true; };
      manager.onDidChange(listener);
      manager.removeChangeListener(listener);

      manager.set("port", 3200);

      expect(called).toBe(false);
    });

    it("should include full settings in event", () => {
      let receivedSettings: CocapnSettings | undefined;

      manager.onDidChange((event) => {
        receivedSettings = event.settings;
      });

      manager.set("port", 3200);

      expect(receivedSettings).toBeDefined();
      expect(receivedSettings?.port).toBe(3200);
    });
  });

  describe("environment variable parsing", () => {
    afterEach(() => {
      // Clean up env vars
      delete process.env.COCAPN_PORT;
      delete process.env.COCAPN_AUTO_LOAD_SKILLS;
      delete process.env.COCAPN_TEMPERATURE;
      delete process.env.COCAPN_CLOUD_MODE;
    });

    it("should parse boolean env vars", () => {
      process.env.COCAPN_AUTO_LOAD_SKILLS = "true";
      expect(manager.getAll().autoLoadSkills).toBe(true);

      process.env.COCAPN_AUTO_LOAD_SKILLS = "false";
      expect(manager.getAll().autoLoadSkills).toBe(false);

      process.env.COCAPN_AUTO_LOAD_SKILLS = "1";
      expect(manager.getAll().autoLoadSkills).toBe(true);

      process.env.COCAPN_AUTO_LOAD_SKILLS = "0";
      expect(manager.getAll().autoLoadSkills).toBe(false);
    });

    it("should parse number env vars", () => {
      process.env.COCAPN_PORT = "9999";
      expect(manager.getAll().port).toBe(9999);

      process.env.COCAPN_TEMPERATURE = "0.5";
      expect(manager.getAll().temperature).toBe(0.5);
    });

    it("should handle invalid number env vars", () => {
      process.env.COCAPN_PORT = "invalid";
      expect(manager.getAll().port).toBe(DEFAULT_SETTINGS.port);
    });

    it("should parse string env vars", () => {
      process.env.COCAPN_CLOUD_MODE = "cloud";
      expect(manager.getAll().cloudMode).toBe("cloud");
    });
  });

  describe("integration scenarios", () => {
    it("should handle complete settings workflow", async () => {
      // 1. Load defaults
      expect(manager.get("port")).toBe(DEFAULT_SETTINGS.port);

      // 2. Update settings
      manager.merge({
        port: 3200,
        cloudMode: "hybrid",
        apiKey: "test-api-key",
        defaultModel: "gpt-4",
      });

      // 3. Validate
      const validation = manager.validate();
      expect(validation.valid).toBe(true);

      // 4. Get safe string for logging
      const safeStr = manager.toSafeString();
      expect(safeStr).toContain("test...-key"); // masked version
      expect(safeStr).not.toContain("test-api-key"); // should not have exact value

      // 5. Persist and reload
      const manager2 = new SettingsManager(TEST_CONFIG_PATH);
      await manager2.load();

      expect(manager2.get("port")).toBe(3200);
      expect(manager2.get("cloudMode")).toBe("hybrid");
      expect(manager2.get("apiKey")).toBe("test-api-key");
      expect(manager2.get("defaultModel")).toBe("gpt-4");

      // 6. Update via env var
      const originalPort = process.env.COCAPN_PORT;
      try {
        process.env.COCAPN_PORT = "9999";
        expect(manager2.getAll().port).toBe(9999); // env overrides file
      } finally {
        if (originalPort !== undefined) {
          process.env.COCAPN_PORT = originalPort;
        } else {
          delete process.env.COCAPN_PORT;
        }
      }
    });
  });
});
