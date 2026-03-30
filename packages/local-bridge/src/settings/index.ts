/**
 * Settings Manager — Persistent settings that survive bridge restarts.
 *
 * Settings are stored in ~/.cocapn/settings.json and can be overridden by
 * environment variables (COCAPN_*). Environment variables take precedence.
 *
 * Integration:
 * - BridgeServer reads settings on startup via SettingsManager
 * - WebSocket GET_SETTINGS returns current settings (API keys masked)
 * - WebSocket UPDATE_SETTINGS allows runtime changes
 * - Changes are persisted to disk immediately
 */

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { EventEmitter } from "events";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CloudMode = "local" | "cloud" | "hybrid";

export type EmbeddingProvider = "local" | "openai";

export type ContextBudget = "low" | "medium" | "full";

/**
 * All settings that can be configured in Cocapn.
 */
export interface CocapnSettings {
  // Bridge
  /** WebSocket port (default: 3100) */
  port: number;
  /** WebSocket host (default: localhost) */
  host: string;

  // Cloud
  /** Cloud mode: local, cloud, or hybrid */
  cloudMode: CloudMode;
  /** Cloudflare Worker URL for cloud features */
  workerUrl?: string;
  /** API key for DeepSeek/other AI provider */
  apiKey?: string;
  /** Fleet JWT secret for inter-bridge communication */
  fleetJwtSecret?: string;

  // AI
  /** Default model for AI requests (default: deepseek-chat) */
  defaultModel: string;
  /** Maximum tokens for AI responses (default: 4096) */
  maxTokens: number;
  /** Temperature for AI responses (default: 0.7) */
  temperature: number;

  // Search
  /** Embedding provider for vector search */
  embeddingProvider: EmbeddingProvider;
  /** OpenAI API key for embeddings (when provider is "openai") */
  openaiApiKey?: string;
  /** Alpha weight for hybrid search (0-1, default: 0.5) */
  hybridSearchAlpha: number;

  // Skills
  /** Auto-load skills on startup (default: true) */
  autoLoadSkills: boolean;
  /** Memory budget for skills in MB (default: 100) */
  skillMemoryBudget: number;
  /** Maximum number of loaded skills (default: 10) */
  maxLoadedSkills: number;

  // Context
  /** Default context budget (default: medium) */
  defaultContextBudget: ContextBudget;

  // Memory
  /** Path to brain directory (default: ~/.cocapn/brain/) */
  brainPath: string;
  /** Auto-save memory to disk (default: true) */
  autoSaveMemory: boolean;

  // Templates
  /** Path to templates directory (default: ~/.cocapn/templates/) */
  templateDir: string;
  /** URL for template registry (optional) */
  registryUrl?: string;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

const DEFAULT_SETTINGS: CocapnSettings = {
  // Bridge
  port: 3100,
  host: "localhost",

  // Cloud
  cloudMode: "local",
  workerUrl: undefined,
  apiKey: undefined,
  fleetJwtSecret: undefined,

  // AI
  defaultModel: "deepseek-chat",
  maxTokens: 4096,
  temperature: 0.7,

  // Search
  embeddingProvider: "local",
  openaiApiKey: undefined,
  hybridSearchAlpha: 0.5,

  // Skills
  autoLoadSkills: true,
  skillMemoryBudget: 100,
  maxLoadedSkills: 10,

  // Context
  defaultContextBudget: "medium",

  // Memory
  brainPath: join(homedir(), ".cocapn", "brain"),
  autoSaveMemory: true,

  // Templates
  templateDir: join(homedir(), ".cocapn", "templates"),
  registryUrl: undefined,
};

// ---------------------------------------------------------------------------
// Environment Variable Mapping
// ---------------------------------------------------------------------------

const ENV_VAR_MAPPING: Record<string, keyof CocapnSettings> = {
  COCAPN_PORT: "port",
  COCAPN_HOST: "host",
  COCAPN_CLOUD_MODE: "cloudMode",
  COCAPN_WORKER_URL: "workerUrl",
  COCAPN_API_KEY: "apiKey",
  COCAPN_FLEET_JWT_SECRET: "fleetJwtSecret",
  COCAPN_DEFAULT_MODEL: "defaultModel",
  COCAPN_MAX_TOKENS: "maxTokens",
  COCAPN_TEMPERATURE: "temperature",
  COCAPN_EMBEDDING_PROVIDER: "embeddingProvider",
  COCAPN_OPENAI_API_KEY: "openaiApiKey",
  COCAPN_HYBRID_SEARCH_ALPHA: "hybridSearchAlpha",
  COCAPN_AUTO_LOAD_SKILLS: "autoLoadSkills",
  COCAPN_SKILL_MEMORY_BUDGET: "skillMemoryBudget",
  COCAPN_MAX_LOADED_SKILLS: "maxLoadedSkills",
  COCAPN_DEFAULT_CONTEXT_BUDGET: "defaultContextBudget",
  COCAPN_BRAIN_PATH: "brainPath",
  COCAPN_AUTO_SAVE_MEMORY: "autoSaveMemory",
  COCAPN_TEMPLATE_DIR: "templateDir",
  COCAPN_REGISTRY_URL: "registryUrl",
};

// ---------------------------------------------------------------------------
// Settings Manager
// ---------------------------------------------------------------------------

export interface SettingsChangeEvent {
  settings: CocapnSettings;
  changes: Partial<CocapnSettings>;
}

export type SettingsChangeCallback = (event: SettingsChangeEvent) => void;

/**
 * Manages persistent settings with file storage and environment variable overrides.
 */
export class SettingsManager extends EventEmitter {
  private configPath: string;
  private settings: CocapnSettings;
  private changeListeners: SettingsChangeCallback[] = [];

  constructor(configPath?: string) {
    super();
    this.configPath = configPath ?? join(homedir(), ".cocapn", "settings.json");
    this.settings = { ...DEFAULT_SETTINGS };
  }

  /**
   * Get a single setting value.
   */
  get<K extends keyof CocapnSettings>(key: K): CocapnSettings[K] {
    return this.settings[key];
  }

  /**
   * Set a single setting value and persist to disk.
   */
  set<K extends keyof CocapnSettings>(key: K, value: CocapnSettings[K]): void {
    const oldValue = this.settings[key];

    // Only notify and save if value changed
    if (oldValue !== value) {
      this.settings[key] = value;

      // Notify listeners
      this.notifyChange({ [key]: value } as Partial<CocapnSettings>);

      // Persist to disk
      void this.save();
    }
  }

  /**
   * Get all settings (with env vars applied).
   */
  getAll(): CocapnSettings {
    return this.applyEnvOverrides({ ...this.settings });
  }

  /**
   * Load settings from file.
   */
  async load(): Promise<void> {
    if (!existsSync(this.configPath)) {
      // Create default settings file
      await this.save();
      return;
    }

    try {
      const raw = readFileSync(this.configPath, "utf-8");
      const loaded = JSON.parse(raw) as Partial<CocapnSettings>;

      // Merge with defaults
      this.settings = this.mergeWithDefaults(loaded);
    } catch (err) {
      console.warn(`[settings] Failed to load ${this.configPath}:`, err);
      // Keep defaults
    }
  }

  /**
   * Save current settings to file.
   */
  async save(): Promise<void> {
    try {
      const dir = dirname(this.configPath);
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      // Save without env overrides (only persisted values)
      writeFileSync(this.configPath, JSON.stringify(this.settings, null, 2), "utf-8");
    } catch (err) {
      console.error(`[settings] Failed to save ${this.configPath}:`, err);
      throw err;
    }
  }

  /**
   * Merge partial settings into current settings.
   */
  merge(partial: Partial<CocapnSettings>): void {
    const changes: Partial<CocapnSettings> = {};

    for (const [key, value] of Object.entries(partial)) {
      const typedKey = key as keyof CocapnSettings;
      if (value !== undefined && this.settings[typedKey] !== value) {
        this.settings[typedKey] = value;
        changes[typedKey] = value;
      }
    }

    if (Object.keys(changes).length > 0) {
      this.notifyChange(changes);
      void this.save();
    }
  }

  /**
   * Validate settings and return any errors.
   */
  validate(): { valid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate port
    if (this.settings.port < 1 || this.settings.port > 65535) {
      errors.push("Port must be between 1 and 65535");
    }

    // Validate temperature
    if (this.settings.temperature < 0 || this.settings.temperature > 2) {
      errors.push("Temperature must be between 0 and 2");
    }

    // Validate maxTokens
    if (this.settings.maxTokens < 1) {
      errors.push("maxTokens must be positive");
    }

    // Validate hybridSearchAlpha
    if (this.settings.hybridSearchAlpha < 0 || this.settings.hybridSearchAlpha > 1) {
      errors.push("hybridSearchAlpha must be between 0 and 1");
    }

    // Validate skillMemoryBudget
    if (this.settings.skillMemoryBudget < 1) {
      errors.push("skillMemoryBudget must be positive");
    }

    // Validate maxLoadedSkills
    if (this.settings.maxLoadedSkills < 1) {
      errors.push("maxLoadedSkills must be positive");
    }

    // Warnings for missing API keys (not errors)
    if (!this.settings.apiKey) {
      warnings.push("No API key configured — AI features will be limited");
    }

    if (this.settings.embeddingProvider === "openai" && !this.settings.openaiApiKey) {
      warnings.push("Embedding provider is 'openai' but no OpenAI API key is configured");
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Get settings as a safe string (API keys masked).
   */
  toSafeString(): string {
    const safe = this.maskSensitiveFields({ ...this.settings });
    return JSON.stringify(safe, null, 2);
  }

  /**
   * Register a callback for settings changes.
   */
  onDidChange(callback: SettingsChangeCallback): void {
    this.changeListeners.push(callback);
  }

  /**
   * Remove a change listener.
   */
  removeChangeListener(callback: SettingsChangeCallback): void {
    const index = this.changeListeners.indexOf(callback);
    if (index !== -1) {
      this.changeListeners.splice(index, 1);
    }
  }

  // ---------------------------------------------------------------------------
  // Private Methods
  // ---------------------------------------------------------------------------

  private mergeWithDefaults(partial: Partial<CocapnSettings>): CocapnSettings {
    return {
      ...DEFAULT_SETTINGS,
      ...partial,
    };
  }

  private applyEnvOverrides(settings: CocapnSettings): CocapnSettings {
    const result = { ...settings };

    for (const [envVar, key] of Object.entries(ENV_VAR_MAPPING)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        result[key] = this.parseEnvValue(envValue, key);
      }
    }

    return result;
  }

  private parseEnvValue(value: string, key: keyof CocapnSettings): CocapnSettings[keyof CocapnSettings] {
    // Boolean values
    if (key === "autoLoadSkills" || key === "autoSaveMemory") {
      return (value.toLowerCase() === "true" || value === "1") as CocapnSettings[keyof CocapnSettings];
    }

    // Number values
    if (key === "port" || key === "maxTokens" || key === "temperature" ||
        key === "hybridSearchAlpha" || key === "skillMemoryBudget" || key === "maxLoadedSkills") {
      const num = parseFloat(value);
      return (isNaN(num) ? DEFAULT_SETTINGS[key] : num) as CocapnSettings[keyof CocapnSettings];
    }

    // String values (pass through)
    return value as CocapnSettings[keyof CocapnSettings];
  }

  private maskSensitiveFields(settings: CocapnSettings): CocapnSettings {
    const masked = { ...settings };

    // Mask API keys
    if (masked.apiKey) {
      masked.apiKey = this.maskValue(masked.apiKey);
    }
    if (masked.openaiApiKey) {
      masked.openaiApiKey = this.maskValue(masked.openaiApiKey);
    }
    if (masked.fleetJwtSecret) {
      masked.fleetJwtSecret = this.maskValue(masked.fleetJwtSecret);
    }

    return masked;
  }

  private maskValue(value: string): string {
    if (value.length <= 8) {
      return "***";
    }
    return `${value.slice(0, 4)}...${value.slice(-4)}`;
  }

  private notifyChange(changes: Partial<CocapnSettings>): void {
    const event: SettingsChangeEvent = {
      settings: this.getAll(),
      changes,
    };

    for (const listener of this.changeListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("[settings] Change listener error:", err);
      }
    }

    // Also emit EventEmitter style
    this.emit("change", event);
  }
}

// ---------------------------------------------------------------------------
// Re-exports
// ---------------------------------------------------------------------------

export { DEFAULT_SETTINGS };
