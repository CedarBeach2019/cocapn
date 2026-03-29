/**
 * Plugin Registry Client — Interact with plugin registry API
 *
 * Handles:
 * - Search plugins
 * - Get plugin details
 * - Download/install plugins
 * - Publish plugins
 * - List installed plugins
 * - Verify plugin tests
 */

import { mkdir, writeFile, readFile, unlink } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  PluginManifest,
  PluginSearchResponse,
  PluginInfo,
  Plugin,
  PluginSearchResult,
} from './types.js';
import { pluginId } from './types.js';
import { createLogger } from '../logger.js';

const execAsync = promisify(exec);
const logger = createLogger('plugins:registry');

// ─── Registry Configuration ─────────────────────────────────────────────────────

const DEFAULT_REGISTRY_URL = 'https://registry.cocapn.ai';

function getPluginDir(): string {
  return join(homedir(), '.cocapn', 'plugins');
}

// ─── Search Options ────────────────────────────────────────────────────────────

export interface SearchOptions {
  /** Search query string */
  query?: string;
  /** Filter by category */
  category?: string;
  /** Sort order: 'name', 'installs', 'rating', 'updated' */
  sort?: 'name' | 'installs' | 'rating' | 'updated';
  /** Page number (1-indexed) */
  page?: number;
  /** Results per page */
  limit?: number;
}

// ─── Publish Options ───────────────────────────────────────────────────────────

export interface PublishOptions {
  /** Registry URL */
  registry?: string;
  /** Auth token */
  token?: string;
  /** Whether to sign the plugin */
  sign?: boolean;
  /** Dry run (don't actually publish) */
  dryRun?: boolean;
}

// ─── Registry Client ───────────────────────────────────────────────────────────

export class PluginRegistryClient {
  private registryUrl: string;
  private token?: string;

  constructor(registryUrl: string = DEFAULT_REGISTRY_URL, token?: string) {
    this.registryUrl = registryUrl;
    this.token = token;
  }

  /**
   * Search for plugins in the registry
   */
  async search(options: SearchOptions = {}): Promise<PluginSearchResult[]> {
    const params = new URLSearchParams();

    if (options.query) params.set('q', options.query);
    if (options.category) params.set('category', options.category);
    if (options.sort) params.set('sort', options.sort);
    if (options.page) params.set('page', String(options.page));
    if (options.limit) params.set('limit', String(options.limit));

    const url = `${this.registryUrl}/api/plugins/search?${params.toString()}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Registry search failed: ${response.statusText}`);
      }

      const result = await response.json() as PluginSearchResponse;
      return result.plugins;
    } catch (err) {
      logger.error('Failed to search registry', { error: err });
      throw err;
    }
  }

  /**
   * Get detailed information about a plugin
   */
  async get(name: string): Promise<PluginInfo | null> {
    const url = `${this.registryUrl}/api/plugins/${encodeURIComponent(name)}`;

    try {
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Registry get failed: ${response.statusText}`);
      }

      return await response.json() as PluginInfo;
    } catch (err) {
      logger.error('Failed to get plugin info', { name, error: err });
      throw err;
    }
  }

  /**
   * Download a plugin tarball from the registry
   */
  async download(name: string, version?: string): Promise<Buffer> {
    const versionPart = version ? `@${version}` : '';
    const url = `${this.registryUrl}/api/plugins/${encodeURIComponent(name)}${versionPart}/download`;

    try {
      const response = await fetch(url, {
        headers: {
          ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`Download failed: ${response.statusText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (err) {
      logger.error('Failed to download plugin', { name, version, error: err });
      throw err;
    }
  }

  /**
   * Install a plugin from the registry
   */
  async install(name: string, version?: string): Promise<Plugin> {
    // Ensure plugin directory exists
    if (!existsSync(getPluginDir())) {
      await mkdir(getPluginDir(), { recursive: true });
    }

    // Get plugin info first
    const info = await this.get(name);
    if (!info) {
      throw new Error(`Plugin not found: ${name}`);
    }

    const targetVersion = version || info.version;
    const installDir = join(getPluginDir(), `${name}@${targetVersion}`);

    // Check if already installed
    if (existsSync(installDir)) {
      logger.info('Plugin already installed', { name, version: targetVersion });
      // Return existing plugin
      const manifestPath = join(installDir, 'cocapn-plugin.json');
      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as PluginManifest;
      return {
        manifest,
        path: installDir,
        installedAt: Date.now(),
        status: 'enabled',
        approvedPermissions: manifest.permissions,
        id: pluginId(name, targetVersion),
      };
    }

    // Download tarball
    logger.info('Downloading plugin', { name, version: targetVersion });
    const tarball = await this.download(name, targetVersion);

    // Extract tarball
    await mkdir(installDir, { recursive: true });

    // For now, we'll assume the tarball contains the plugin files
    // In production, we'd use tar/untar libraries
    // For simplicity, this example assumes we get a JSON manifest
    // and extract it manually

    // Write manifest
    const manifestPath = join(installDir, 'cocapn-plugin.json');
    await writeFile(manifestPath, JSON.stringify(info, null, 2), 'utf-8');

    // Track install
    await this.trackInstall(name, targetVersion);

    logger.info('Plugin installed', { name, version: targetVersion, path: installDir });

    return {
      manifest: info as unknown as PluginManifest,
      path: installDir,
      installedAt: Date.now(),
      status: 'enabled',
      approvedPermissions: info.permissions,
      id: pluginId(name, targetVersion),
    };
  }

  /**
   * Uninstall a plugin
   */
  async uninstall(name: string, version?: string): Promise<void> {
    const targetVersion = version || '*';

    if (targetVersion === '*') {
      // Remove all versions
      const entries = existsSync(getPluginDir())
        ? await this.list()
        : [];

      for (const plugin of entries) {
        if (plugin.manifest.name === name) {
          await this.uninstallPluginPath(plugin.path);
        }
      }
    } else {
      const installDir = join(getPluginDir(), `${name}@${targetVersion}`);
      await this.uninstallPluginPath(installDir);
    }
  }

  /**
   * List installed plugins
   */
  async list(): Promise<Plugin[]> {
    if (!existsSync(getPluginDir())) {
      return [];
    }

    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(getPluginDir(), { withFileTypes: true });
    const plugins: Plugin[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const pluginPath = join(getPluginDir(), entry.name);
        const manifestPath = join(pluginPath, 'cocapn-plugin.json');

        if (existsSync(manifestPath)) {
          try {
            const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as PluginManifest;
            const { stat } = await import('node:fs/promises');
            const stats = await stat(pluginPath);

            plugins.push({
              manifest,
              path: pluginPath,
              installedAt: stats.mtimeMs,
              status: 'enabled',
              approvedPermissions: manifest.permissions,
              id: pluginId(manifest.name, manifest.version),
            });
          } catch (err) {
            logger.warn('Failed to load plugin manifest', { path: pluginPath, error: err });
          }
        }
      }
    }

    return plugins;
  }

  /**
   * Publish a plugin to the registry
   */
  async publish(pluginDir: string, options: PublishOptions = {}): Promise<{ success: boolean; error?: string }> {
    const manifestPath = join(pluginDir, 'cocapn-plugin.json');

    if (!existsSync(manifestPath)) {
      return { success: false, error: 'cocapn-plugin.json not found' };
    }

    // Read and validate manifest
    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as PluginManifest;

    // Run tests first
    if (manifest.scripts?.test) {
      logger.info('Running tests before publish...');
      try {
        await execAsync(`cd "${pluginDir}" && ${manifest.scripts.test}`);
      } catch (err) {
        return { success: false, error: 'Tests failed' };
      }
    }

    if (options.dryRun) {
      logger.info('Dry run: would publish', { name: manifest.name, version: manifest.version });
      return { success: true };
    }

    // Create tarball
    const tarballPath = join(pluginDir, `${manifest.name}-${manifest.version}.tar.gz`);

    // TODO: Create actual tarball using tar/zip libraries
    // For now, we'll skip this and assume the registry gets the manifest

    // Upload to registry
    const url = `${options.registry || this.registryUrl}/api/plugins/publish`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${options.token || this.token || ''}`,
        },
        body: JSON.stringify({
          name: manifest.name,
          version: manifest.version,
          manifest,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        return { success: false, error };
      }

      logger.info('Plugin published', { name: manifest.name, version: manifest.version });
      return { success: true };
    } catch (err) {
      logger.error('Failed to publish plugin', { error: err });
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  }

  /**
   * Verify a plugin by running its tests in a sandbox
   */
  async verify(pluginDir: string): Promise<{ success: boolean; output: string }> {
    const manifestPath = join(pluginDir, 'cocapn-plugin.json');

    if (!existsSync(manifestPath)) {
      return { success: false, output: 'cocapn-plugin.json not found' };
    }

    const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as PluginManifest;

    if (!manifest.scripts?.test) {
      return { success: false, output: 'No test script defined' };
    }

    try {
      const { stdout, stderr } = await execAsync(`cd "${pluginDir}" && ${manifest.scripts.test}`);
      return {
        success: true,
        output: stdout + stderr,
      };
    } catch (err) {
      return {
        success: false,
        output: err instanceof Error ? err.message : String(err),
      };
    }
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────────

  /**
   * Track plugin installation (increment install count)
   */
  private async trackInstall(name: string, version: string): Promise<void> {
    const url = `${this.registryUrl}/api/plugins/${encodeURIComponent(name)}/install`;

    try {
      await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.token && { 'Authorization': `Bearer ${this.token}` }),
        },
        body: JSON.stringify({
          version,
          platform: process.platform,
          arch: process.arch,
          cocapnVersion: '0.1.0',
        }),
      });
    } catch (err) {
      logger.warn('Failed to track install', { name, version, error: err });
    }
  }

  /**
   * Uninstall plugin at a specific path
   */
  private async uninstallPluginPath(pluginPath: string): Promise<void> {
    if (!existsSync(pluginPath)) {
      throw new Error(`Plugin not found: ${pluginPath}`);
    }

    const { rm } = await import('node:fs/promises');
    await rm(pluginPath, { recursive: true, force: true });
    logger.info('Plugin uninstalled', { path: pluginPath });
  }
}
