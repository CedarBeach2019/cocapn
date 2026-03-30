/**
 * Plugin System — Core Types
 *
 * Defines the plugin manifest, skills, and permissions.
 * Plugins are published skill cartridges that extend cocapn agent capabilities.
 */

// ─── Plugin Skill Types ─────────────────────────────────────────────────────────

/**
 * Skill execution mode
 */
export type SkillType = 'hot' | 'cold';

/**
 * Skill tolerance configuration — resource limits and error handling
 */
export interface SkillTolerance {
  /** Maximum tokens this skill may use (default: 2000) */
  maxTokens?: number;
  /** Maximum execution time in milliseconds (default: 30000) */
  timeout?: number;
  /** How to handle network failures */
  network_failure?: 'retry' | 'skip' | 'fallback' | 'error';
  /** How to handle invalid input */
  invalid_input?: 'retry' | 'skip' | 'fallback' | 'error';
}

/**
 * A skill definition within a plugin
 */
export interface PluginSkill {
  /** Unique skill identifier (kebab-case) */
  name: string;
  /** Path to skill implementation file (relative to plugin root) */
  entry: string;
  /** Hot skills load in bridge process; cold skills run on-demand */
  type: SkillType;
  /** Resource limits and error handling */
  tolerance?: SkillTolerance;
  /** Keywords that trigger this skill */
  triggers?: string[];
  /** Human-readable description of what this skill does */
  description?: string;
}

// ─── Permission Types ───────────────────────────────────────────────────────────

/**
 * Permission type categories
 */
export type PermissionType =
  | 'network'    // Network access to specific host
  | 'fs:read'    // Filesystem read access
  | 'fs:write'   // Filesystem write access
  | 'shell'      // Execute shell commands
  | 'env'        // Read environment variables
  | 'admin';     // Bridge administration

/**
 * A permission required by a plugin
 *
 * String format: "type:scope"
 * Examples:
 *   - "network:api.github.com" — access GitHub API
 *   - "network:*" — unrestricted network access
 *   - "fs:read:~/repos" — read files under ~/repos
 *   - "shell:gh" — execute gh command
 *   - "env:GITHUB_TOKEN" — read GITHUB_TOKEN env var
 */
export interface PluginPermission {
  /** Permission type */
  type: PermissionType;
  /** Scope of the permission (host, path, command, var name, or "*" for wildcard) */
  scope?: string;
}

/**
 * Parse a permission string into type and scope
 */
export function parsePermission(permString: string): PluginPermission {
  // Handle multi-part types like 'fs:read' and 'fs:write'
  if (permString.startsWith('fs:read:')) {
    const scope = permString.slice(8); // Remove 'fs:read:'
    return { type: 'fs:read', scope: scope || '*' };
  }

  if (permString.startsWith('fs:write:')) {
    const scope = permString.slice(9); // Remove 'fs:write:'
    return { type: 'fs:write', scope: scope || '*' };
  }

  if (permString === 'fs:read' || permString === 'fs:read:*') {
    return { type: 'fs:read', scope: '*' };
  }

  if (permString === 'fs:write' || permString === 'fs:write:*') {
    return { type: 'fs:write', scope: '*' };
  }

  // Handle other permission types
  const parts = permString.split(':');
  const type = parts[0] as PermissionType;

  if (!['network', 'shell', 'env', 'admin'].includes(type)) {
    throw new Error(`Invalid permission type: ${type}`);
  }

  if (type === 'admin') {
    return { type: 'admin' };
  }

  const scope = parts.slice(1).join(':');
  return { type, scope: scope || '*' };
}

/**
 * Convert permission to string format
 */
export function permissionToString(perm: PluginPermission): string {
  if (perm.type === 'admin') {
    return 'admin';
  }
  return perm.scope ? `${perm.type}:${perm.scope}` : perm.type;
}

/**
 * Check if a permission grant satisfies a permission request
 */
export function permissionSatisfies(granted: PluginPermission, requested: PluginPermission): boolean {
  if (granted.type !== requested.type) {
    return false;
  }

  // Wildcard grants everything
  if (granted.scope === '*' || !granted.scope) {
    return true;
  }

  // Exact match
  if (granted.scope === requested.scope) {
    return true;
  }

  // For fs:read/fs:write, check if requested path is within granted path
  if (granted.type === 'fs:read' || granted.type === 'fs:write') {
    if (!requested.scope) return false;
    return requested.scope.startsWith(granted.scope);
  }

  return false;
}

// ─── Plugin Manifest ────────────────────────────────────────────────────────────

/**
 * Plugin manifest — cocapn-plugin.json
 *
 * Describes a plugin package with its metadata, skills, dependencies, and permissions.
 */
export interface PluginManifest {
  /** Schema identifier (must be "cocapn-plugin-schema-v1") */
  $schema?: string;
  /** Plugin name (must start with "cocapn-plugin-") */
  name: string;
  /** Semantic version string */
  version: string;
  /** Short description (max 200 chars) */
  description: string;
  /** Author name or email */
  author: string;
  /** SPDX license identifier */
  license?: string;
  /** Git repository URL */
  repository?: string;
  /** Package homepage URL */
  homepage?: string;
  /** Bug tracker URL */
  bugs?: string;
  /** Search keywords (max 10) */
  keywords?: string[];
  /** Category for discovery */
  category?: string;
  /** Path to plugin icon (relative to plugin root) */
  icon?: string;

  /** Skills provided by this plugin */
  skills: PluginSkill[];

  /** Plugin dependencies (name -> semver range) */
  dependencies?: Record<string, string>;

  /** Permissions required by this plugin */
  permissions: string[];

  /** Runtime version constraints */
  engines?: {
    /** Minimum Node.js version */
    node?: string;
    /** Minimum cocapn version */
    cocapn?: string;
  };

  /** npm-like scripts */
  scripts?: {
    test?: string;
    lint?: string;
    build?: string;
  };

  /** Quality metrics (set by registry) */
  quality?: {
    /** Test coverage percentage */
    testCoverage?: number;
    /** Last updated date */
    lastUpdated?: string;
    /** Install count */
    installs?: number;
    /** User rating (0-5) */
    rating?: number;
  };
}

// ─── Installed Plugin ───────────────────────────────────────────────────────────

/**
 * Status of an installed plugin
 */
export type PluginStatus = 'enabled' | 'disabled' | 'error';

/**
 * An installed plugin record
 */
export interface Plugin {
  /** Plugin manifest */
  manifest: PluginManifest;
  /** Absolute path to plugin directory */
  path: string;
  /** When the plugin was installed (timestamp) */
  installedAt: number;
  /** Current plugin status */
  status: PluginStatus;
  /** Error message if status is 'error' */
  error?: string;
  /** Approved permissions (subset of manifest.permissions) */
  approvedPermissions: string[];
  /** Plugin ID (name@version) */
  id: string;
}

/**
 * Create a plugin ID from name and version
 */
export function pluginId(name: string, version: string): string {
  return `${name}@${version}`;
}

/**
 * Parse a plugin ID into name and version
 */
export function parsePluginId(id: string): { name: string; version: string } {
  const match = id.match(/^(.+?)@(.+)$/);
  if (!match) {
    throw new Error(`Invalid plugin ID: ${id}`);
  }
  return { name: match[1], version: match[2] };
}

// ─── Plugin Search Results ──────────────────────────────────────────────────────

/**
 * A plugin search result (from registry)
 */
export interface PluginSearchResult {
  /** Plugin name */
  name: string;
  /** Latest version */
  version: string;
  /** Short description */
  description: string;
  /** Author */
  author: string;
  /** Category */
  category?: string;
  /** Install count */
  installs: number;
  /** User rating (0-5) */
  rating: number;
  /** Keywords */
  keywords: string[];
}

/**
 * Plugin search response
 */
export interface PluginSearchResponse {
  /** Matching plugins */
  plugins: PluginSearchResult[];
  /** Total results */
  total: number;
  /** Current page */
  page: number;
}

// ─── Plugin Registry Info ───────────────────────────────────────────────────────

/**
 * Detailed plugin information from registry
 */
export interface PluginInfo {
  /** Plugin name */
  name: string;
  /** Version */
  version: string;
  /** Description */
  description: string;
  /** Author */
  author: string;
  /** License */
  license?: string;
  /** Repository */
  repository?: string;
  /** Homepage */
  homepage?: string;
  /** README content */
  readme?: string;
  /** Skills */
  skills: PluginSkill[];
  /** Required permissions */
  permissions: string[];
  /** Dependencies */
  dependencies?: Record<string, string>;
  /** All available versions */
  versions: string[];
  /** Install count */
  installs: number;
  /** User rating */
  rating: number;
  /** Quality metrics */
  quality?: {
    testCoverage?: number;
    hasSecurityAudit?: boolean;
    lastUpdated?: string;
  };
}

// ─── Sandbox Execution Context ─────────────────────────────────────────────────

/**
 * Context provided to cold plugin skills during execution
 */
export interface SandboxContext {
  /** Plugin name */
  plugin: string;
  /** Skill name */
  skill: string;
  /** Granted permissions */
  permissions: PluginPermission[];
  /** Maximum execution time (ms) */
  timeout: number;
  /** Maximum memory usage (bytes) */
  maxMemory: number;
  /** Abort signal for cancellation */
  signal: AbortSignal;
  /** Environment variables (filtered by permissions) */
  env: Record<string, string>;
}

/**
 * Result of cold plugin skill execution
 */
export interface SandboxResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution time (ms) */
  duration: number;
  /** Peak memory usage (bytes) */
  memory: number;
  /** Whether execution was killed due to timeout */
  timedOut: boolean;
}

// ─── Plugin System Options ─────────────────────────────────────────────────────

/**
 * Configuration options for PluginSystem
 */
export interface PluginSystemOptions {
  /** Directory where plugins are installed */
  pluginDir?: string;
  /** Directory for plugin state (permissions.json) */
  stateDir?: string;
  /** Default timeout for cold skills (ms) */
  defaultTimeout?: number;
  /** Default memory limit for cold skills (bytes) */
  defaultMemory?: number;
  /** Registry API base URL */
  registryUrl?: string;
}
