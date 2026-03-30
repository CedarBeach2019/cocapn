/**
 * Template Registry Client Types
 *
 * Types for the remote template registry API and local registry cache.
 */

/**
 * Configuration for the registry client
 */
export interface RegistryConfig {
  /** API URL for the registry (default: https://registry.cocapn.ai/api) */
  apiUrl?: string;
  /** Auth token for publishing templates */
  authToken?: string;
  /** Local registry path (default: ~/.cocapn/registry) */
  localPath?: string;
}

/**
 * Published template metadata from the registry
 */
export interface PublishedTemplate {
  /** Template name (kebab-case) */
  name: string;
  /** Semantic version */
  version: string;
  /** Short description */
  description: string;
  /** Author/organization */
  author: string;
  /** Search keywords */
  keywords: string[];
  /** Download count */
  downloads: number;
  /** Creation date */
  createdAt: string;
  /** Last update date */
  updatedAt: string;
  /** Homepage URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** License */
  license?: string;
}

/**
 * Search result from the registry
 */
export interface SearchResult {
  /** Matching templates */
  templates: PublishedTemplate[];
  /** Total results */
  total: number;
  /** Search query */
  query: string;
}

/**
 * Installed template metadata
 */
export interface InstalledTemplate {
  /** Template name */
  name: string;
  /** Installed version */
  version: string;
  /** Installation path */
  path: string;
  /** Installation date */
  installedAt: string;
}

/**
 * Template manifest for cocapn-template.json
 */
export interface TemplatePackageManifest {
  /** Template name */
  name: string;
  /** Version (semver) */
  version: string;
  /** Description */
  description: string;
  /** Keywords for search */
  keywords?: string[];
  /** Author */
  author: string;
  /** License */
  license?: string;
  /** Homepage URL */
  homepage?: string;
  /** Repository URL */
  repository?: string;
  /** Supported domains */
  domains?: string[];
  /** Template icon (emoji) */
  emoji?: string;
  /** Features included */
  features?: string[];
}

/**
 * Download result
 */
export interface DownloadResult {
  /** Template name */
  name: string;
  /** Version downloaded */
  version: string;
  /** Downloaded content */
  content: Buffer;
  /** Target path */
  targetPath: string;
}

/**
 * Publish result
 */
export interface PublishResult {
  /** Success status */
  ok: boolean;
  /** Published template URL */
  url?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Local registry index
 */
export interface LocalRegistryIndex {
  /** Indexed templates */
  templates: Record<string, LocalRegistryEntry>;
  /** Last updated */
  lastUpdated: string;
}

/**
 * Local registry entry
 */
export interface LocalRegistryEntry {
  /** Template name */
  name: string;
  /** Version */
  version: string;
  /** Local path */
  path: string;
  /** Indexed date */
  indexedAt: string;
}
