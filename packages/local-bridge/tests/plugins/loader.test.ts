/**
 * Tests for PluginLoader — load, validate, and manage plugins
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { PluginLoader } from '../../src/plugins/loader.js';
import { PermissionManager } from '../../src/plugins/permission-manager.js';
import { pluginId } from '../../src/plugins/types.js';

// ─── Test Setup ───────────────────────────────────────────────────────────────

const MOCK_HOME = mkdtempSync(join(os.tmpdir(), 'cocapn-loader-test-'));

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof import('os')>();
  return {
    ...actualOs,
    homedir: () => MOCK_HOME,
  };
});

function createTempPluginDir(): string {
  return mkdtempSync(join(os.tmpdir(), 'cocapn-plugin-'));
}

function writePluginManifest(dir: string, manifest: object): void {
  writeFileSync(join(dir, 'cocapn-plugin.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

function writeSkillFile(dir: string, skillName: string, content: string): void {
  const skillsDir = join(dir, 'skills');
  mkdirSync(skillsDir, { recursive: true });
  writeFileSync(join(skillsDir, skillName), content, 'utf-8');
}

const VALID_MANIFEST = {
  $schema: 'cocapn-plugin-schema-v1',
  name: 'cocapn-plugin-test',
  version: '1.0.0',
  description: 'Test plugin',
  author: 'Test Author',
  license: 'MIT',
  skills: [
    {
      name: 'test-hot',
      entry: 'skills/hot.ts',
      type: 'hot',
      triggers: ['test'],
      description: 'Hot test skill',
    },
    {
      name: 'test-cold',
      entry: 'skills/cold.ts',
      type: 'cold',
      triggers: ['cold'],
      description: 'Cold test skill',
      tolerance: {
        timeout: 60000,
      },
    },
  ],
  permissions: ['network:api.example.com'],
  engines: {
    cocapn: '>=0.1.0',
    node: '>=18.0.0',
  },
};

describe('PluginLoader', () => {
  let loader: PluginLoader;
  let permissionManager: PermissionManager;

  beforeEach(() => {
    permissionManager = new PermissionManager();
    loader = new PluginLoader(permissionManager, {
      cocapnVersion: '0.1.0',
      nodeVersion: '20.0.0',
    });
  });

  afterEach(async () => {
    await permissionManager.clear();
    rmSync(MOCK_HOME, { recursive: true, force: true });
  });

  describe('load', () => {
    it('loads a valid plugin', async () => {
      const dir = createTempPluginDir();
      try {
        writePluginManifest(dir, VALID_MANIFEST);
        writeSkillFile(dir, 'hot.ts', 'export default function test() {}');
        writeSkillFile(dir, 'cold.ts', 'export default function cold() {}');

        await permissionManager.grantPermissions(
          pluginId(VALID_MANIFEST.name, VALID_MANIFEST.version),
          VALID_MANIFEST.permissions
        );

        const result = await loader.load(dir);

        expect(result.success).toBe(true);
        expect(result.plugin).toBeDefined();
        expect(result.plugin?.manifest.name).toBe('cocapn-plugin-test');
        expect(result.plugin?.status).toBe('enabled');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('fails when cocapn-plugin.json not found', async () => {
      const dir = createTempPluginDir();
      try {
        const result = await loader.load(dir);

        expect(result.success).toBe(false);
        expect(result.errors).toContain('cocapn-plugin.json not found');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('validates plugin name prefix', async () => {
      const dir = createTempPluginDir();
      try {
        const invalidManifest = { ...VALID_MANIFEST, name: 'invalid-name' };
        writePluginManifest(dir, invalidManifest);

        const result = await loader.load(dir);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.includes('cocapn-plugin-'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('requires at least one skill', async () => {
      const dir = createTempPluginDir();
      try {
        const invalidManifest = { ...VALID_MANIFEST, skills: [] };
        writePluginManifest(dir, invalidManifest);

        const result = await loader.load(dir);

        expect(result.success).toBe(false);
        expect(result.errors.some(e => e.includes('at least one skill'))).toBe(true);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('sets plugin to error when permissions not granted', async () => {
      const dir = createTempPluginDir();
      try {
        writePluginManifest(dir, VALID_MANIFEST);
        writeSkillFile(dir, 'hot.ts', 'export default function test() {}');
        writeSkillFile(dir, 'cold.ts', 'export default function cold() {}');

        const result = await loader.load(dir);

        expect(result.success).toBe(true);
        expect(result.plugin?.status).toBe('error');
        expect(result.plugin?.error).toContain('Missing permissions');
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('validateSkillEntries', () => {
    it('validates existing skill entries', async () => {
      const dir = createTempPluginDir();
      try {
        writePluginManifest(dir, VALID_MANIFEST);
        writeSkillFile(dir, 'hot.ts', 'export default function test() {}');
        writeSkillFile(dir, 'cold.ts', 'export default function cold() {}');

        await permissionManager.grantPermissions(
          pluginId(VALID_MANIFEST.name, VALID_MANIFEST.version),
          VALID_MANIFEST.permissions
        );

        const result = await loader.load(dir);
        if (result.plugin) {
          const validation = await loader.validateSkillEntries(result.plugin);

          expect(validation.valid).toBe(true);
          expect(validation.errors).toHaveLength(0);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('detects missing skill entry points', async () => {
      const dir = createTempPluginDir();
      try {
        writePluginManifest(dir, VALID_MANIFEST);
        // Don't write skill files

        await permissionManager.grantPermissions(
          pluginId(VALID_MANIFEST.name, VALID_MANIFEST.version),
          VALID_MANIFEST.permissions
        );

        const result = await loader.load(dir);
        if (result.plugin) {
          const validation = await loader.validateSkillEntries(result.plugin);

          expect(validation.valid).toBe(false);
          expect(validation.errors).toHaveLength(2);
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('getHotSkills / getColdSkills', () => {
    it('separates hot and cold skills', async () => {
      const dir = createTempPluginDir();
      try {
        writePluginManifest(dir, VALID_MANIFEST);
        writeSkillFile(dir, 'hot.ts', 'export default function test() {}');
        writeSkillFile(dir, 'cold.ts', 'export default function cold() {}');

        await permissionManager.grantPermissions(
          pluginId(VALID_MANIFEST.name, VALID_MANIFEST.version),
          VALID_MANIFEST.permissions
        );

        const result = await loader.load(dir);
        if (result.plugin) {
          const hotSkills = loader.getHotSkills(result.plugin);
          const coldSkills = loader.getColdSkills(result.plugin);

          expect(hotSkills).toHaveLength(1);
          expect(hotSkills[0]?.name).toBe('test-hot');
          expect(hotSkills[0]?.type).toBe('hot');

          expect(coldSkills).toHaveLength(1);
          expect(coldSkills[0]?.name).toBe('test-cold');
          expect(coldSkills[0]?.type).toBe('cold');
        }
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });
  });

  describe('scanDirectory', () => {
    it('finds plugins in a directory', async () => {
      const scanDir = createTempPluginDir();
      try {
        // Create multiple plugin directories
        const plugin1 = join(scanDir, 'plugin1');
        const plugin2 = join(scanDir, 'plugin2');
        mkdirSync(plugin1, { recursive: true });
        mkdirSync(plugin2, { recursive: true });

        writePluginManifest(plugin1, VALID_MANIFEST);
        writePluginManifest(plugin2, { ...VALID_MANIFEST, name: 'cocapn-plugin-test2' });

        // Create a directory without a manifest
        mkdirSync(join(scanDir, 'not-a-plugin'), { recursive: true });

        const found = await loader.scanDirectory(scanDir);

        expect(found).toHaveLength(2);
        expect(found).toContain(plugin1);
        expect(found).toContain(plugin2);
      } finally {
        rmSync(scanDir, { recursive: true, force: true });
      }
    });

    it('returns empty array for non-existent directory', async () => {
      const found = await loader.scanDirectory('/non/existent/path');
      expect(found).toHaveLength(0);
    });
  });
});
