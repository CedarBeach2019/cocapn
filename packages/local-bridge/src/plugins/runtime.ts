/**
 * Plugin Runtime — dynamic plugin loading, sandboxing, and lifecycle management.
 *
 * Loads plugins from cocapn/plugins/<name>/ directories. Each plugin has a
 * plugin.json manifest and an index.js entry point. Plugins receive a
 * sandboxed API with controlled access to brain, chat, events, and config.
 *
 * Lifecycle: load() → activate() → ready → deactivate() → unload()
 * Crashed plugins are deactivated, logged, and isolated — the runtime keeps running.
 */

import { readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve, normalize, relative, extname } from "node:path";
import { EventEmitter } from "node:events";
import { createLogger } from "../logger.js";

const logger = createLogger("plugin-runtime");

// ─── Types ────────────────────────────────────────────────────────────────────

/** Simplified plugin manifest (plugin.json). */
export interface PluginManifest {
  name: string;
  version: string;
  description?: string;
  main: string;
  permissions: PluginPermission[];
  hooks?: string[];
  config?: Record<string, unknown>;
}

export type PluginPermission =
  | "brain.read"
  | "brain.write"
  | "chat.send"
  | "network"
  | "fs.plugin";

export type PluginState = "unloaded" | "loaded" | "activating" | "active" | "deactivating" | "error";

/** Event names plugins can subscribe to. */
export type PluginEvent =
  | "chat.message"
  | "brain.fact-set"
  | "brain.fact-deleted"
  | "plugin.loaded"
  | "plugin.activated"
  | "plugin.deactivated"
  | "plugin.error";

export interface PluginContext {
  /** Read from brain stores. */
  brain: {
    read(type: "fact" | "wiki" | "task", key: string): Promise<unknown>;
    write(type: "fact" | "task", key: string, value: unknown): Promise<void>;
  };
  /** Send a message to the current chat session. */
  chat: {
    send(message: string): void;
  };
  /** Subscribe to runtime events. */
  events: {
    on(event: string, handler: (...args: unknown[]) => void): void;
  };
  /** Read plugin configuration. */
  config: {
    get(key: string): unknown;
    getAll(): Record<string, unknown>;
  };
}

export interface LoadedPlugin {
  name: string;
  manifest: PluginManifest;
  dir: string;
  state: PluginState;
  error?: string;
  module?: PluginModule;
  config: Record<string, unknown>;
  eventHandlers: Map<string, Set<(...args: unknown[]) => void>>;
}

export interface PluginModule {
  load?(ctx: PluginContext): Promise<void>;
  activate?(ctx: PluginContext): Promise<void>;
  deactivate?(ctx: PluginContext): Promise<void>;
  unload?(ctx: PluginContext): Promise<void>;
}

export interface RuntimeOptions {
  pluginsDir: string;
  brain?: {
    getFact(key: string): Promise<unknown>;
    setFact(key: string, value: unknown): Promise<void>;
    searchWiki?(query: string): Promise<unknown>;
    createTask?(title: string, description: string): Promise<unknown>;
  };
  chatSend?: (message: string) => void;
  timeout?: number;
}

// ─── Validation ───────────────────────────────────────────────────────────────

const VALID_PERMISSIONS = new Set<PluginPermission>([
  "brain.read",
  "brain.write",
  "chat.send",
  "network",
  "fs.plugin",
]);

const VALID_HOOKS = new Set<string>([
  "chat.message",
  "brain.fact-set",
  "brain.fact-deleted",
  "plugin.loaded",
  "plugin.activated",
  "plugin.deactivated",
  "plugin.error",
]);

export function validateManifest(raw: unknown): { valid: true; manifest: PluginManifest } | { valid: false; errors: string[] } {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { valid: false, errors: ["Manifest must be an object"] };
  }

  const m = raw as Record<string, unknown>;

  // Required fields
  if (typeof m.name !== "string" || !m.name) errors.push("name is required and must be a non-empty string");
  if (typeof m.version !== "string" || !/^\d+\.\d+\.\d+/.test(m.version as string))
    errors.push("version is required and must be semver (x.y.z)");
  if (typeof m.main !== "string" || !m.main) errors.push("main is required and must be a non-empty string");

  // Permissions
  if (!Array.isArray(m.permissions)) {
    errors.push("permissions must be an array");
  } else {
    for (const p of m.permissions as string[]) {
      if (!VALID_PERMISSIONS.has(p as PluginPermission)) {
        errors.push(`Invalid permission: "${p}"`);
      }
    }
  }

  // Hooks
  if (m.hooks !== undefined) {
    if (!Array.isArray(m.hooks)) {
      errors.push("hooks must be an array");
    } else {
      for (const h of m.hooks as string[]) {
        if (!VALID_HOOKS.has(h)) {
          errors.push(`Invalid hook: "${h}"`);
        }
      }
    }
  }

  // Config
  if (m.config !== undefined && typeof m.config !== "object") {
    errors.push("config must be an object");
  }

  if (errors.length > 0) return { valid: false, errors };

  return {
    valid: true,
    manifest: {
      name: m.name as string,
      version: m.version as string,
      description: m.description as string | undefined,
      main: m.main as string,
      permissions: m.permissions as PluginPermission[],
      hooks: (m.hooks as string[]) || [],
      config: (m.config as Record<string, unknown>) || {},
    },
  };
}

// ─── Sandbox helpers ──────────────────────────────────────────────────────────

/** Validate a path stays within the plugin directory. */
function ensureWithin(base: string, target: string): void {
  const resolved = resolve(base, target);
  const normBase = normalize(base);
  if (!resolved.startsWith(normBase + "/") && resolved !== normBase) {
    throw new Error(`Path escapes plugin directory: ${target}`);
  }
}

/** Wrap a plugin operation with a timeout. Handles sync (non-Promise) returns. */
function withTimeout<T>(value: T | Promise<T> | void, ms: number, label: string): Promise<T> {
  const promise = value instanceof Promise ? value : Promise.resolve(value);
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Plugin operation timed out (${ms}ms): ${label}`)),
      ms,
    );
    promise.then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); },
    );
  });
}

// ─── Plugin Runtime ───────────────────────────────────────────────────────────

export class PluginRuntime {
  private pluginsDir: string;
  private plugins: Map<string, LoadedPlugin> = new Map();
  private bus: EventEmitter = new EventEmitter();
  private brain: NonNullable<RuntimeOptions["brain"]>;
  private chatSend: (message: string) => void;
  private timeout: number;

  constructor(options: RuntimeOptions) {
    this.pluginsDir = options.pluginsDir;
    this.brain = options.brain || {
      getFact: async () => undefined,
      setFact: async () => {},
    };
    this.chatSend = options.chatSend || (() => {});
    this.timeout = options.timeout ?? 30_000;
    this.bus.setMaxListeners(100);
  }

  // ── Discovery & Loading ────────────────────────────────────────────────────

  /** Scan the plugins directory and load all valid plugins. */
  async loadAll(): Promise<{ loaded: string[]; failed: Array<{ name: string; error: string }> }> {
    const loaded: string[] = [];
    const failed: Array<{ name: string; error: string }> = [];

    if (!existsSync(this.pluginsDir)) {
      return { loaded, failed };
    }

    const entries = readdirSync(this.pluginsDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pluginDir = join(this.pluginsDir, entry.name);
      try {
        const plugin = await this.load(pluginDir);
        loaded.push(plugin.name);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        failed.push({ name: entry.name, error: msg });
        logger.warn(`Failed to load plugin from ${entry.name}`, { error: msg });
      }
    }

    logger.info(`Loaded ${loaded.length} plugins, ${failed.length} failed`);
    return { loaded, failed };
  }

  /** Load a single plugin from its directory. */
  async load(pluginDir: string): Promise<LoadedPlugin> {
    const manifestPath = join(pluginDir, "plugin.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`No plugin.json found in ${pluginDir}`);
    }

    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const result = validateManifest(raw);
    if (!result.valid) {
      throw new Error(`Invalid manifest: ${result.errors.join("; ")}`);
    }

    const manifest = result.manifest;

    // Validate main entry path stays within plugin dir
    ensureWithin(pluginDir, manifest.main);
    const mainPath = resolve(pluginDir, manifest.main);
    if (!existsSync(mainPath)) {
      throw new Error(`Entry file not found: ${manifest.main}`);
    }

    // Only allow JS entry files
    const ext = extname(mainPath);
    if (ext !== ".js" && ext !== ".mjs") {
      throw new Error(`Entry file must be .js or .mjs, got: ${ext}`);
    }

    const plugin: LoadedPlugin = {
      name: manifest.name,
      manifest,
      dir: pluginDir,
      state: "loaded",
      config: { ...manifest.config },
      eventHandlers: new Map(),
    };

    this.plugins.set(manifest.name, plugin);
    logger.info(`Plugin loaded: ${manifest.name}@${manifest.version}`);
    this.emit("plugin.loaded", manifest.name);

    return plugin;
  }

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  /** Activate a loaded plugin (calls load() then activate() on the module). */
  async activate(name: string): Promise<void> {
    const plugin = this.getPlugin(name);
    if (!plugin) throw new Error(`Plugin not found: ${name}`);
    if (plugin.state === "active") return;
    if (plugin.state === "error") throw new Error(`Plugin is in error state: ${name}`);

    plugin.state = "activating";

    try {
      const ctx = this.createContext(plugin);
      const mod = await this.loadModule(plugin);
      plugin.module = mod;

      if (mod.load) {
        await withTimeout(mod.load(ctx), this.timeout, `${name}.load()`);
      }
      if (mod.activate) {
        await withTimeout(mod.activate(ctx), this.timeout, `${name}.activate()`);
      }

      plugin.state = "active";
      logger.info(`Plugin activated: ${name}`);
      this.emit("plugin.activated", name);
    } catch (err) {
      plugin.state = "error";
      plugin.error = err instanceof Error ? err.message : String(err);
      logger.error(`Plugin activation failed: ${name}`, { error: plugin.error });
      this.emit("plugin.error", name, plugin.error);
    }
  }

  /** Activate all loaded plugins. */
  async activateAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.state === "loaded") {
        await this.activate(plugin.name);
      }
    }
  }

  /** Deactivate a running plugin. */
  async deactivate(name: string): Promise<void> {
    const plugin = this.getPlugin(name);
    if (!plugin) throw new Error(`Plugin not found: ${name}`);
    if (plugin.state !== "active" && plugin.state !== "error") return;

    plugin.state = "deactivating";

    try {
      const ctx = this.createContext(plugin);
      if (plugin.module?.deactivate) {
        await withTimeout(plugin.module.deactivate(ctx), this.timeout, `${name}.deactivate()`);
      }
      if (plugin.module?.unload) {
        await withTimeout(plugin.module.unload(ctx), this.timeout, `${name}.unload()`);
      }
    } catch (err) {
      logger.warn(`Error during deactivation of ${name}: ${err}`);
    }

    // Remove all event handlers
    for (const [event, handlers] of plugin.eventHandlers) {
      for (const handler of handlers) {
        this.bus.removeListener(event, handler);
      }
    }
    plugin.eventHandlers.clear();

    plugin.state = "unloaded";
    plugin.module = undefined;
    plugin.error = undefined;
    logger.info(`Plugin deactivated: ${name}`);
    this.emit("plugin.deactivated", name);
  }

  /** Unload a plugin from the runtime entirely. */
  async unload(name: string): Promise<void> {
    await this.deactivate(name);
    this.plugins.delete(name);
    logger.info(`Plugin unloaded: ${name}`);
  }

  /** Shut down the entire runtime. */
  async shutdown(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        await this.deactivate(plugin.name);
      } catch {
        // best-effort during shutdown
      }
    }
    this.plugins.clear();
    this.bus.removeAllListeners();
    logger.info("Plugin runtime shut down");
  }

  // ── Event dispatching ──────────────────────────────────────────────────────

  /** Emit an event to all subscribed plugins. Returns when all sync handlers done. */
  emit(event: string, ...args: unknown[]): void {
    this.bus.emit(event, ...args);
  }

  /**
   * Emit an event and wait for all async handlers to settle.
   * Use this when you need handlers to complete before asserting results.
   */
  async emitAsync(event: string, ...args: unknown[]): Promise<void> {
    const listeners = this.bus.listeners(event);
    const promises = listeners.map((fn) => {
      try {
        return Promise.resolve((fn as (...a: unknown[]) => unknown)(...args));
      } catch (err) {
        return Promise.resolve();
      }
    });
    await Promise.all(promises);
  }

  /** Subscribe to runtime-level events (lifecycle, errors). */
  on(event: string, handler: (...args: unknown[]) => void): void {
    this.bus.on(event, handler);
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  getPlugin(name: string): LoadedPlugin | undefined {
    return this.plugins.get(name);
  }

  listPlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values());
  }

  getActivePlugins(): LoadedPlugin[] {
    return Array.from(this.plugins.values()).filter((p) => p.state === "active");
  }

  getPluginState(name: string): PluginState | undefined {
    return this.plugins.get(name)?.state;
  }

  // ── Internal ───────────────────────────────────────────────────────────────

  /** Dynamic import of the plugin module. */
  private async loadModule(plugin: LoadedPlugin): Promise<PluginModule> {
    const mainPath = resolve(plugin.dir, plugin.manifest.main);
    const mod = await import(`file://${mainPath}`);
    return (mod.default ?? mod) as PluginModule;
  }

  /** Build a sandboxed context for a plugin. */
  private createContext(plugin: LoadedPlugin): PluginContext {
    const hasPermission = (perm: PluginPermission) => plugin.manifest.permissions.includes(perm);

    const ctx: PluginContext = {
      brain: {
        read: async (type, key) => {
          if (!hasPermission("brain.read")) {
            throw new Error(`Plugin "${plugin.name}" lacks brain.read permission`);
          }
          switch (type) {
            case "fact":
              return this.brain.getFact(key);
            case "wiki":
              return this.brain.searchWiki?.(key);
            case "task":
              return this.brain.getFact(`task.${key}`);
            default:
              throw new Error(`Unknown brain read type: ${type}`);
          }
        },
        write: async (type, key, value) => {
          if (!hasPermission("brain.write")) {
            throw new Error(`Plugin "${plugin.name}" lacks brain.write permission`);
          }
          switch (type) {
            case "fact":
              return this.brain.setFact(key, value);
            case "task":
              return this.brain.setFact(`task.${key}`, value);
            default:
              throw new Error(`Unknown brain write type: ${type}`);
          }
        },
      },
      chat: {
        send: (message) => {
          if (!hasPermission("chat.send")) {
            throw new Error(`Plugin "${plugin.name}" lacks chat.send permission`);
          }
          this.chatSend(message);
        },
      },
      events: {
        on: (event, handler) => {
          const hookAllowed = plugin.manifest.hooks?.length
            ? plugin.manifest.hooks.includes(event)
            : true;
          if (!hookAllowed) {
            throw new Error(`Plugin "${plugin.name}" not declared hook: ${event}`);
          }
          if (!plugin.eventHandlers.has(event)) {
            plugin.eventHandlers.set(event, new Set());
          }
          plugin.eventHandlers.get(event)!.add(handler);
          this.bus.on(event, handler);
        },
      },
      config: {
        get: (key) => plugin.config[key],
        getAll: () => ({ ...plugin.config }),
      },
    };

    return ctx;
  }
}
