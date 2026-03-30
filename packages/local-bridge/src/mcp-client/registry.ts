/**
 * McpServerRegistry — manages MCP server configurations.
 *
 * Stores server configs in ~/.cocapn/mcp-servers.json and provides
 * methods to register, list, and retrieve MCP server configurations.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import type { McpTransportConfig } from "./transport.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface McpServerEntry {
  name: string;
  transport: McpTransportConfig;
  enabled?: boolean;
  description?: string;
}

export interface McpServersConfig {
  servers: Record<string, McpServerEntry>;
}

// ---------------------------------------------------------------------------
// McpServerRegistry
// ---------------------------------------------------------------------------

const CONFIG_DIR = join(homedir(), ".cocapn");
const CONFIG_FILE = join(CONFIG_DIR, "mcp-servers.json");

export class McpServerRegistry {
  private configPath: string;
  private config: McpServersConfig;

  constructor(configPath: string = CONFIG_FILE) {
    this.configPath = configPath;
    this.config = this.loadConfig();
  }

  /**
   * Load the configuration from disk.
   */
  private loadConfig(): McpServersConfig {
    if (!existsSync(this.configPath)) {
      // Create default config
      const defaultConfig: McpServersConfig = { servers: {} };
      this.ensureConfigDir();
      writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2), "utf8");
      return defaultConfig;
    }

    try {
      const content = readFileSync(this.configPath, "utf8");
      const parsed = JSON.parse(content);
      // Validate the structure
      if (!parsed.servers || typeof parsed.servers !== "object") {
        throw new Error("Invalid config: missing or invalid 'servers' object");
      }
      return parsed as McpServersConfig;
    } catch (error) {
      throw new Error(`Failed to load MCP servers config from ${this.configPath}: ${error}`);
    }
  }

  /**
   * Save the configuration to disk.
   */
  private saveConfig(): void {
    this.ensureConfigDir();
    writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), "utf8");
  }

  /**
   * Ensure the config directory exists.
   */
  private ensureConfigDir(): void {
    const configDir = this.configPath.substring(0, this.configPath.lastIndexOf("/"));
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true });
    }
  }

  /**
   * Register a new MCP server.
   */
  registerServer(entry: McpServerEntry): void {
    if (!entry.name) {
      throw new Error("McpServerRegistry: server entry must have a name");
    }

    if (!entry.transport) {
      throw new Error("McpServerRegistry: server entry must have a transport config");
    }

    this.config.servers[entry.name] = entry;
    this.saveConfig();
  }

  /**
   * Unregister an MCP server.
   */
  unregisterServer(name: string): boolean {
    if (!this.config.servers[name]) {
      return false;
    }

    delete this.config.servers[name];
    this.saveConfig();
    return true;
  }

  /**
   * Get a server configuration by name.
   */
  getServer(name: string): McpServerEntry | null {
    return this.config.servers[name] ?? null;
  }

  /**
   * List all registered server names.
   */
  listServerNames(): string[] {
    return Object.keys(this.config.servers);
  }

  /**
   * List all server entries.
   */
  listServers(): McpServerEntry[] {
    return Object.values(this.config.servers);
  }

  /**
   * List only enabled servers.
   */
  listEnabledServers(): McpServerEntry[] {
    return Object.values(this.config.servers).filter(
      (entry) => entry.enabled !== false
    );
  }

  /**
   * Update a server configuration.
   */
  updateServer(name: string, updates: Partial<Omit<McpServerEntry, "name">>): boolean {
    const existing = this.config.servers[name];
    if (!existing) {
      return false;
    }

    this.config.servers[name] = {
      ...existing,
      ...updates,
    };
    this.saveConfig();
    return true;
  }

  /**
   * Enable or disable a server.
   */
  setServerEnabled(name: string, enabled: boolean): boolean {
    return this.updateServer(name, { enabled });
  }

  /**
   * Check if a server exists.
   */
  hasServer(name: string): boolean {
    return name in this.config.servers;
  }

  /**
   * Get the number of registered servers.
   */
  getServerCount(): number {
    return Object.keys(this.config.servers).length;
  }

  /**
   * Clear all server configurations.
   */
  clear(): void {
    this.config.servers = {};
    this.saveConfig();
  }

  /**
   * Reload the configuration from disk.
   */
  reload(): void {
    this.config = this.loadConfig();
  }
}

// ---------------------------------------------------------------------------
// Convenience functions
// ---------------------------------------------------------------------------

/**
 * Get the default registry instance.
 */
let defaultRegistry: McpServerRegistry | null = null;

export function getRegistry(): McpServerRegistry {
  if (!defaultRegistry) {
    defaultRegistry = new McpServerRegistry();
  }
  return defaultRegistry;
}

/**
 * Register a server using the default registry.
 */
export function registerServer(entry: McpServerEntry): void {
  getRegistry().registerServer(entry);
}

/**
 * List servers using the default registry.
 */
export function listServers(): McpServerEntry[] {
  return getRegistry().listServers();
}

/**
 * Get a server using the default registry.
 */
export function getServer(name: string): McpServerEntry | null {
  return getRegistry().getServer(name);
}
