/**
 * Tests for PermissionManager — grant, revoke, and check permissions
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { PermissionManager } from '../../src/plugins/permission-manager.js';
import type { PluginPermission } from '../../src/plugins/types.js';

// ─── Mock home directory for testing ───────────────────────────────────────────

const MOCK_HOME = mkdtempSync(join(os.tmpdir(), 'cocapn-perm-test-'));

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof import('os')>();
  return {
    ...actualOs,
    homedir: () => MOCK_HOME,
  };
});

describe('PermissionManager', () => {
  let manager: PermissionManager;

  beforeEach(() => {
    manager = new PermissionManager();
  });

  afterEach(async () => {
    await manager.clear();
    rmSync(MOCK_HOME, { recursive: true, force: true });
  });

  describe('load', () => {
    it('loads empty state when no file exists', async () => {
      await manager.load();
      expect(manager.getPluginIds()).toHaveLength(0);
    });

    it('loads saved state from disk', async () => {
      const pluginId = 'cocapn-plugin-test@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');

      // Create new manager instance
      const manager2 = new PermissionManager();
      await manager2.load();

      expect(manager2.hasPermission(pluginId, 'network:api.github.com')).toBe(true);
    });
  });

  describe('save', () => {
    it('saves state to disk', async () => {
      const pluginId = 'cocapn-plugin-test@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');
      await manager.save();

      // Create new manager instance
      const manager2 = new PermissionManager();
      await manager2.load();

      expect(manager2.hasPermission(pluginId, 'network:api.github.com')).toBe(true);
    });
  });

  describe('getGrantedPermissions', () => {
    it('returns empty array for plugin with no permissions', async () => {
      await manager.load();
      const perms = manager.getGrantedPermissions('test-plugin@1.0.0');
      expect(perms).toEqual([]);
    });

    it('returns granted permissions for plugin', async () => {
      const pluginId = 'test-plugin@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');
      await manager.grantPermission(pluginId, 'shell:git');

      const perms = manager.getGrantedPermissions(pluginId);
      expect(perms).toEqual(['network:api.github.com', 'shell:git']);
    });
  });

  describe('hasPermission', () => {
    it('returns false when permission not granted', async () => {
      await manager.load();
      expect(manager.hasPermission('test@1.0.0', 'network:api.github.com')).toBe(false);
    });

    it('returns true when permission is granted', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');

      expect(manager.hasPermission(pluginId, 'network:api.github.com')).toBe(true);
    });

    it('works with PluginPermission objects', async () => {
      const pluginId = 'test@1.0.0';
      const perm: PluginPermission = { type: 'network', scope: 'api.github.com' };

      expect(manager.hasPermission(pluginId, perm)).toBe(false);

      await manager.grantPermission(pluginId, 'network:api.github.com');
      expect(manager.hasPermission(pluginId, perm)).toBe(true);
    });
  });

  describe('checkPermissions', () => {
    it('returns satisfied when all permissions granted', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermissions(pluginId, [
        'network:api.github.com',
        'shell:git',
      ]);

      const result = manager.checkPermissions(pluginId, [
        'network:api.github.com',
        'shell:git',
      ]);

      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });

    it('returns missing permissions when not all granted', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');

      const result = manager.checkPermissions(pluginId, [
        'network:api.github.com',
        'shell:git',
      ]);

      expect(result.satisfied).toBe(false);
      expect(result.missing).toEqual(['shell:git']);
    });

    it('handles wildcard permissions', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermission(pluginId, 'network:*');

      const result = manager.checkPermissions(pluginId, [
        'network:api.github.com',
        'network:api.gitlab.com',
      ]);

      expect(result.satisfied).toBe(true);
      expect(result.missing).toHaveLength(0);
    });
  });

  describe('grantPermission', () => {
    it('grants a permission to a plugin', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');

      expect(manager.hasPermission(pluginId, 'network:api.github.com')).toBe(true);
    });

    it('does not duplicate existing permissions', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');
      await manager.grantPermission(pluginId, 'network:api.github.com');

      const perms = manager.getGrantedPermissions(pluginId);
      expect(perms).toEqual(['network:api.github.com']);
    });

    it('works with PluginPermission objects', async () => {
      const pluginId = 'test@1.0.0';
      const perm: PluginPermission = { type: 'shell', scope: 'git' };

      await manager.grantPermission(pluginId, perm);

      expect(manager.hasPermission(pluginId, 'shell:git')).toBe(true);
    });
  });

  describe('grantPermissions', () => {
    it('grants multiple permissions at once', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermissions(pluginId, [
        'network:api.github.com',
        'shell:git',
        'env:GITHUB_TOKEN',
      ]);

      expect(manager.hasPermission(pluginId, 'network:api.github.com')).toBe(true);
      expect(manager.hasPermission(pluginId, 'shell:git')).toBe(true);
      expect(manager.hasPermission(pluginId, 'env:GITHUB_TOKEN')).toBe(true);
    });

    it('only adds new permissions', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');
      await manager.grantPermissions(pluginId, [
        'network:api.github.com', // existing
        'shell:git', // new
      ]);

      const perms = manager.getGrantedPermissions(pluginId);
      expect(perms).toEqual(['network:api.github.com', 'shell:git']);
    });
  });

  describe('revokePermission', () => {
    it('revokes a permission from a plugin', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermission(pluginId, 'network:api.github.com');
      expect(manager.hasPermission(pluginId, 'network:api.github.com')).toBe(true);

      await manager.revokePermission(pluginId, 'network:api.github.com');
      expect(manager.hasPermission(pluginId, 'network:api.github.com')).toBe(false);
    });

    it('does nothing when permission not granted', async () => {
      const pluginId = 'test@1.0.0';
      await manager.revokePermission(pluginId, 'network:api.github.com');

      expect(manager.hasPermission(pluginId, 'network:api.github.com')).toBe(false);
    });

    it('works with PluginPermission objects', async () => {
      const pluginId = 'test@1.0.0';
      const perm: PluginPermission = { type: 'network', scope: 'api.github.com' };

      await manager.grantPermission(pluginId, perm);
      expect(manager.hasPermission(pluginId, 'network:api.github.com')).toBe(true);

      await manager.revokePermission(pluginId, perm);
      expect(manager.hasPermission(pluginId, 'network:api.github.com')).toBe(false);
    });
  });

  describe('revokeAll', () => {
    it('revokes all permissions for a plugin', async () => {
      const pluginId = 'test@1.0.0';
      await manager.grantPermissions(pluginId, [
        'network:api.github.com',
        'shell:git',
      ]);

      await manager.revokeAll(pluginId);

      expect(manager.getGrantedPermissions(pluginId)).toEqual([]);
    });
  });

  describe('clear', () => {
    it('clears all permission state', async () => {
      await manager.grantPermissions('test@1.0.0', ['network:*']);
      await manager.grantPermissions('other@1.0.0', ['shell:git']);

      await manager.clear();

      expect(manager.getPluginIds()).toHaveLength(0);
    });
  });

  describe('getPluginIds', () => {
    it('returns empty array when no plugins', async () => {
      await manager.load();
      expect(manager.getPluginIds()).toEqual([]);
    });

    it('returns all plugin IDs with permissions', async () => {
      await manager.grantPermissions('test@1.0.0', ['network:*']);
      await manager.grantPermissions('other@1.0.0', ['shell:git']);

      const ids = manager.getPluginIds();
      expect(ids).toContain('test@1.0.0');
      expect(ids).toContain('other@1.0.0');
    });
  });

  describe('export/import', () => {
    it('exports and imports permission state', async () => {
      await manager.grantPermissions('test@1.0.0', ['network:*']);
      await manager.grantPermissions('other@1.0.0', ['shell:git']);

      const exported = manager.export();
      expect(exported).toHaveProperty('test@1.0.0');
      expect(exported).toHaveProperty('other@1.0.0');

      // Clear and import
      await manager.clear();
      expect(manager.getPluginIds()).toHaveLength(0);

      await manager.import(exported);
      expect(manager.getPluginIds()).toHaveLength(2);
    });
  });
});
