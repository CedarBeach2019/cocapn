/**
 * Permission Manager — Grant, revoke, and check plugin permissions
 *
 * Manages user-approved permissions for plugins with persistent storage.
 * Permissions are stored in ~/.cocapn/plugin-permissions.json.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import type { PluginPermission, Plugin } from './types.js';
import { parsePermission, permissionToString, permissionSatisfies } from './types.js';
import { createLogger } from '../logger.js';

const logger = createLogger('plugins:permissions');

// ─── Permission State File ─────────────────────────────────────────────────────

// Helper functions to get paths (defers homedir() call for test mocking)
function getStateDir(): string {
  return join(homedir(), '.cocapn');
}

function getPermissionsFile(): string {
  return join(getStateDir(), 'plugin-permissions.json');
}

interface PermissionState {
  [pluginId: string]: string[]; // pluginId -> array of granted permission strings
}

// ─── Permission Manager ────────────────────────────────────────────────────────

export class PermissionManager {
  private state: PermissionState = new Map<string, string[]>() as unknown as PermissionState;
  private loaded = false;

  /**
   * Load permission state from disk
   */
  async load(): Promise<void> {
    if (this.loaded) return;

    if (existsSync(getPermissionsFile())) {
      try {
        const content = await readFile(getPermissionsFile(), 'utf-8');
        this.state = JSON.parse(content) as PermissionState;
        logger.debug('Loaded permission state', { count: Object.keys(this.state).length });
      } catch (err) {
        logger.warn('Failed to load permissions file, starting fresh', { error: err });
        this.state = {};
      }
    }

    this.loaded = true;
  }

  /**
   * Save permission state to disk
   */
  async save(): Promise<void> {
    try {
      // Ensure directory exists
      if (!existsSync(getStateDir())) {
        await mkdir(getStateDir(), { recursive: true });
      }

      await writeFile(getPermissionsFile(), JSON.stringify(this.state, null, 2), 'utf-8');
      logger.debug('Saved permission state', { count: Object.keys(this.state).length });
    } catch (err) {
      logger.error('Failed to save permissions file', { error: err });
      throw err;
    }
  }

  /**
   * Get granted permissions for a plugin
   */
  getGrantedPermissions(pluginId: string): string[] {
    return this.state[pluginId] || [];
  }

  /**
   * Check if a plugin has a specific permission granted
   */
  hasPermission(pluginId: string, permission: string | PluginPermission): boolean {
    const granted = this.getGrantedPermissions(pluginId);
    const permString = typeof permission === 'string' ? permission : permissionToString(permission);
    return granted.includes(permString);
  }

  /**
   * Check if granted permissions satisfy required permissions
   */
  checkPermissions(pluginId: string, requiredPermissions: string[]): {
    satisfied: boolean;
    missing: string[];
  } {
    const granted = this.getGrantedPermissions(pluginId);
    const missing: string[] = [];

    for (const required of requiredPermissions) {
      const requiredPerm = parsePermission(required);
      const satisfied = granted.some(g => {
        const grantedPerm = parsePermission(g);
        return permissionSatisfies(grantedPerm, requiredPerm);
      });

      if (!satisfied) {
        missing.push(required);
      }
    }

    return {
      satisfied: missing.length === 0,
      missing,
    };
  }

  /**
   * Grant a permission to a plugin
   */
  async grantPermission(pluginId: string, permission: string | PluginPermission): Promise<void> {
    await this.load();

    const permString = typeof permission === 'string' ? permission : permissionToString(permission);

    if (!this.state[pluginId]) {
      this.state[pluginId] = [];
    }

    if (!this.state[pluginId].includes(permString)) {
      this.state[pluginId].push(permString);
      await this.save();
      logger.info('Permission granted', { pluginId, permission: permString });
    }
  }

  /**
   * Grant multiple permissions to a plugin
   */
  async grantPermissions(pluginId: string, permissions: string[]): Promise<void> {
    await this.load();

    if (!this.state[pluginId]) {
      this.state[pluginId] = [];
    }

    let changed = false;
    for (const permString of permissions) {
      if (!this.state[pluginId].includes(permString)) {
        this.state[pluginId].push(permString);
        changed = true;
      }
    }

    if (changed) {
      await this.save();
      logger.info('Permissions granted', { pluginId, count: permissions.length });
    }
  }

  /**
   * Revoke a permission from a plugin
   */
  async revokePermission(pluginId: string, permission: string | PluginPermission): Promise<void> {
    await this.load();

    const permString = typeof permission === 'string' ? permission : permissionToString(permission);

    if (this.state[pluginId]) {
      const idx = this.state[pluginId].indexOf(permString);
      if (idx !== -1) {
        this.state[pluginId].splice(idx, 1);
        await this.save();
        logger.info('Permission revoked', { pluginId, permission: permString });
      }
    }
  }

  /**
   * Revoke all permissions for a plugin
   */
  async revokeAll(pluginId: string): Promise<void> {
    await this.load();

    if (this.state[pluginId]) {
      delete this.state[pluginId];
      await this.save();
      logger.info('All permissions revoked', { pluginId });
    }
  }

  /**
   * Clear all permission state (useful for testing)
   */
  async clear(): Promise<void> {
    this.state = {};
    await this.save();
  }

  /**
   * Get all plugin IDs with permissions
   */
  getPluginIds(): string[] {
    return Object.keys(this.state);
  }

  /**
   * Export permission state (for backup/migration)
   */
  export(): PermissionState {
    return { ...this.state };
  }

  /**
   * Import permission state (for backup/migration)
   */
  async import(state: PermissionState): Promise<void> {
    this.state = { ...state };
    await this.save();
  }
}
