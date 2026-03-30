/**
 * Tests for PluginSandbox — cold plugin execution in isolated subprocess
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { PluginSandbox } from '../../src/plugins/sandbox.js';
import type { PluginPermission, SandboxContext } from '../../src/plugins/types.js';
import { parsePermission } from '../../src/plugins/types.js';

// ─── Test Setup ───────────────────────────────────────────────────────────────

const MOCK_HOME = mkdtempSync(join(os.tmpdir(), 'cocapn-sandbox-test-'));

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof import('os')>();
  return {
    ...actualOs,
    homedir: () => MOCK_HOME,
    tmpdir: () => actualOs.tmpdir(),
  };
});

describe('PluginSandbox', () => {
  let sandbox: PluginSandbox;
  let testPluginDir: string;

  beforeEach(() => {
    sandbox = new PluginSandbox();
    testPluginDir = mkdtempSync(join(os.tmpdir(), 'cocapn-skill-'));
  });

  afterEach(() => {
    rmSync(testPluginDir, { recursive: true, force: true });
    rmSync(MOCK_HOME, { recursive: true, force: true });
  });

  describe('execute', () => {
    it('executes a simple skill', async () => {
      const skillPath = join(testPluginDir, 'skill.js');
      writeFileSync(
        skillPath,
        `
console.log('Hello from skill');
process.exit(0);
`,
        'utf-8'
      );

      const context: SandboxContext = {
        plugin: 'test-plugin',
        skill: 'test-skill',
        permissions: [],
        timeout: 5000,
        maxMemory: 10 * 1024 * 1024,
        signal: AbortSignal.timeout(10000),
        env: {},
      };

      const result = await sandbox.execute(testPluginDir, 'skill.js', null, context);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('Hello from skill');
      expect(result.timedOut).toBe(false);
    });

    it('times out when skill exceeds timeout', async () => {
      const skillPath = join(testPluginDir, 'slow-skill.js');
      writeFileSync(
        skillPath,
        `
// Never exit
setTimeout(() => {}, 100000);
`,
        'utf-8'
      );

      const context: SandboxContext = {
        plugin: 'test-plugin',
        skill: 'slow-skill',
        permissions: [],
        timeout: 100, // 100ms timeout
        maxMemory: 10 * 1024 * 1024,
        signal: AbortSignal.timeout(10000),
        env: {},
      };

      const result = await sandbox.execute(testPluginDir, 'slow-skill.js', null, context);

      expect(result.timedOut).toBe(true);
    });

    it('captures stderr output', async () => {
      const skillPath = join(testPluginDir, 'error-skill.js');
      writeFileSync(
        skillPath,
        `
console.error('Error message');
process.exit(1);
`,
        'utf-8'
      );

      const context: SandboxContext = {
        plugin: 'test-plugin',
        skill: 'error-skill',
        permissions: [],
        timeout: 5000,
        maxMemory: 10 * 1024 * 1024,
        signal: AbortSignal.timeout(10000),
        env: {},
      };

      const result = await sandbox.execute(testPluginDir, 'error-skill.js', null, context);

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toContain('Error message');
    });
  });
});

describe('PluginSandbox permission checks', () => {
  describe('isNetworkAllowed', () => {
    it('allows specific host permission', () => {
      const permissions: PluginPermission[] = [
        parsePermission('network:api.github.com'),
      ];

      expect(PluginSandbox.isNetworkAllowed('api.github.com', permissions)).toBe(true);
      expect(PluginSandbox.isNetworkAllowed('api.gitlab.com', permissions)).toBe(false);
    });

    it('allows wildcard permission', () => {
      const permissions: PluginPermission[] = [
        parsePermission('network:*'),
      ];

      expect(PluginSandbox.isNetworkAllowed('api.github.com', permissions)).toBe(true);
      expect(PluginSandbox.isNetworkAllowed('api.gitlab.com', permissions)).toBe(true);
    });

    it('denies when no network permission', () => {
      const permissions: PluginPermission[] = [
        parsePermission('shell:git'),
      ];

      expect(PluginSandbox.isNetworkAllowed('api.github.com', permissions)).toBe(false);
    });
  });

  describe('isFsAccessAllowed', () => {
    it('allows read access within granted path', () => {
      const permissions: PluginPermission[] = [
        parsePermission('fs:read:/home/user/repos'),
      ];

      expect(PluginSandbox.isFsAccessAllowed('/home/user/repos/project', permissions, false)).toBe(true);
      expect(PluginSandbox.isFsAccessAllowed('/home/user/repos/project/file.txt', permissions, false)).toBe(true);
      expect(PluginSandbox.isFsAccessAllowed('/home/user/other', permissions, false)).toBe(false);
    });

    it('allows write access within granted path', () => {
      const permissions: PluginPermission[] = [
        parsePermission('fs:write:/tmp/output'),
      ];

      expect(PluginSandbox.isFsAccessAllowed('/tmp/output/file.txt', permissions, true)).toBe(true);
      expect(PluginSandbox.isFsAccessAllowed('/tmp/other/file.txt', permissions, true)).toBe(false);
    });

    it('allows wildcard filesystem access', () => {
      const permissions: PluginPermission[] = [
        parsePermission('fs:read:*'),
      ];

      expect(PluginSandbox.isFsAccessAllowed('/any/path', permissions, false)).toBe(true);
    });

    it('requires specific permission type', () => {
      const permissions: PluginPermission[] = [
        parsePermission('fs:read:/home/user'),
      ];

      expect(PluginSandbox.isFsAccessAllowed('/home/user/file.txt', permissions, false)).toBe(true);
      expect(PluginSandbox.isFsAccessAllowed('/home/user/file.txt', permissions, true)).toBe(false);
    });
  });

  describe('isShellAllowed', () => {
    it('allows specific shell command', () => {
      const permissions: PluginPermission[] = [
        parsePermission('shell:git'),
      ];

      expect(PluginSandbox.isShellAllowed('git', permissions)).toBe(true);
      expect(PluginSandbox.isShellAllowed('npm', permissions)).toBe(false);
    });

    it('allows wildcard shell permission', () => {
      const permissions: PluginPermission[] = [
        parsePermission('shell:*'),
      ];

      expect(PluginSandbox.isShellAllowed('git', permissions)).toBe(true);
      expect(PluginSandbox.isShellAllowed('npm', permissions)).toBe(true);
    });

    it('denies when no shell permission', () => {
      const permissions: PluginPermission[] = [
        parsePermission('network:api.github.com'),
      ];

      expect(PluginSandbox.isShellAllowed('git', permissions)).toBe(false);
    });
  });
});
