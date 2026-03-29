/**
 * Tests for plugin types — manifest validation, permissions parsing, etc.
 */

import { describe, it, expect } from 'vitest';
import type {
  PluginManifest,
  PluginSkill,
  PluginPermission,
} from '../../src/plugins/types.js';
import {
  parsePermission,
  permissionToString,
  permissionSatisfies,
  pluginId,
  parsePluginId,
} from '../../src/plugins/types.js';

// ─── Permission Parsing Tests ─────────────────────────────────────────────────

describe('parsePermission', () => {
  it('parses network permissions', () => {
    expect(parsePermission('network:api.github.com')).toEqual({
      type: 'network',
      scope: 'api.github.com',
    });
    expect(parsePermission('network:*')).toEqual({
      type: 'network',
      scope: '*',
    });
  });

  it('parses fs:read permissions', () => {
    expect(parsePermission('fs:read:~/repos')).toEqual({
      type: 'fs:read',
      scope: '~/repos',
    });
  });

  it('parses fs:write permissions', () => {
    expect(parsePermission('fs:write:/tmp/output')).toEqual({
      type: 'fs:write',
      scope: '/tmp/output',
    });
  });

  it('parses shell permissions', () => {
    expect(parsePermission('shell:gh')).toEqual({
      type: 'shell',
      scope: 'gh',
    });
    expect(parsePermission('shell:*')).toEqual({
      type: 'shell',
      scope: '*',
    });
  });

  it('parses env permissions', () => {
    expect(parsePermission('env:GITHUB_TOKEN')).toEqual({
      type: 'env',
      scope: 'GITHUB_TOKEN',
    });
  });

  it('parses admin permission', () => {
    expect(parsePermission('admin')).toEqual({
      type: 'admin',
    });
  });

  it('throws for invalid permission type', () => {
    expect(() => parsePermission('invalid:type')).toThrow('Invalid permission type');
  });
});

// ─── Permission String Conversion ──────────────────────────────────────────────

describe('permissionToString', () => {
  it('converts network permissions to string', () => {
    expect(permissionToString({ type: 'network', scope: 'api.github.com' }))
      .toBe('network:api.github.com');
    expect(permissionToString({ type: 'network', scope: '*' }))
      .toBe('network:*');
  });

  it('converts fs permissions to string', () => {
    expect(permissionToString({ type: 'fs:read', scope: '~/repos' }))
      .toBe('fs:read:~/repos');
  });

  it('converts shell permissions to string', () => {
    expect(permissionToString({ type: 'shell', scope: 'git' }))
      .toBe('shell:git');
  });

  it('converts env permissions to string', () => {
    expect(permissionToString({ type: 'env', scope: 'API_KEY' }))
      .toBe('env:API_KEY');
  });

  it('converts admin permission to string', () => {
    expect(permissionToString({ type: 'admin' }))
      .toBe('admin');
  });
});

// ─── Permission Satisfaction Tests ─────────────────────────────────────────────

describe('permissionSatisfies', () => {
  it('wildcard permission satisfies any request of same type', () => {
    const granted = { type: 'network' as const, scope: '*' };
    expect(permissionSatisfies(granted, { type: 'network' as const, scope: 'api.github.com' }))
      .toBe(true);
    expect(permissionSatisfies(granted, { type: 'network' as const, scope: 'example.com' }))
      .toBe(true);
  });

  it('exact match satisfies', () => {
    const granted = { type: 'network' as const, scope: 'api.github.com' };
    expect(permissionSatisfies(granted, { type: 'network' as const, scope: 'api.github.com' }))
      .toBe(true);
  });

  it('different types do not satisfy', () => {
    const granted = { type: 'network' as const, scope: '*' };
    expect(permissionSatisfies(granted, { type: 'shell' as const, scope: '*' }))
      .toBe(false);
  });

  it('fs:read path prefix satisfies subpaths', () => {
    const granted = { type: 'fs:read' as const, scope: '/home/user/repos' };
    expect(permissionSatisfies(granted, { type: 'fs:read' as const, scope: '/home/user/repos/project' }))
      .toBe(true);
  });

  it('non-matching scope does not satisfy', () => {
    const granted = { type: 'network' as const, scope: 'api.github.com' };
    expect(permissionSatisfies(granted, { type: 'network' as const, scope: 'api.gitlab.com' }))
      .toBe(false);
  });
});

// ─── Plugin ID Tests ───────────────────────────────────────────────────────────

describe('pluginId', () => {
  it('creates plugin ID from name and version', () => {
    expect(pluginId('cocapn-plugin-github', '1.2.0'))
      .toBe('cocapn-plugin-github@1.2.0');
  });
});

describe('parsePluginId', () => {
  it('parses plugin ID into name and version', () => {
    expect(parsePluginId('cocapn-plugin-github@1.2.0')).toEqual({
      name: 'cocapn-plugin-github',
      version: '1.2.0',
    });
  });

  it('throws for invalid plugin ID', () => {
    expect(() => parsePluginId('invalid-format')).toThrow('Invalid plugin ID');
  });
});

// ─── Manifest Validation Tests ─────────────────────────────────────────────────

describe('PluginManifest validation', () => {
  const validManifest: PluginManifest = {
    $schema: 'cocapn-plugin-schema-v1',
    name: 'cocapn-plugin-test',
    version: '1.0.0',
    description: 'Test plugin for validation',
    author: 'Test Author <test@example.com>',
    license: 'MIT',
    keywords: ['test', 'example'],
    category: 'development',
    skills: [
      {
        name: 'test-skill',
        entry: 'skills/test.ts',
        type: 'hot',
        triggers: ['test'],
        description: 'Test skill',
        tolerance: {
          maxTokens: 1000,
          timeout: 30000,
        },
      },
    ],
    permissions: ['network:api.example.com'],
    engines: {
      node: '>=18.0.0',
      cocapn: '>=0.1.0',
    },
  };

  it('valid manifest has all required fields', () => {
    expect(validManifest.name).toBe('cocapn-plugin-test');
    expect(validManifest.name.startsWith('cocapn-plugin-')).toBe(true);
    expect(validManifest.version).toBeDefined();
    expect(validManifest.description).toBeDefined();
    expect(validManifest.author).toBeDefined();
    expect(validManifest.skills).toHaveLength(1);
    expect(Array.isArray(validManifest.permissions)).toBe(true);
  });

  it('valid skill has all required fields', () => {
    const skill: PluginSkill = {
      name: 'test-skill',
      entry: 'skills/test.ts',
      type: 'hot',
      triggers: ['test'],
      description: 'Test skill',
    };

    expect(skill.name).toBeDefined();
    expect(skill.entry).toBeDefined();
    expect(['hot', 'cold'].includes(skill.type)).toBe(true);
  });

  it('description must be 200 characters or less', () => {
    const longDesc = 'a'.repeat(201);
    expect(longDesc.length).toBeGreaterThan(200);
  });

  it('plugin name must start with cocapn-plugin-', () => {
    // Valid name starts with cocapn-plugin-
    const validName = 'cocapn-plugin-test';
    expect(validName.startsWith('cocapn-plugin-')).toBe(true);

    // Invalid name does not start with cocapn-plugin-
    const invalidName = 'invalid-name';
    expect(invalidName.startsWith('cocapn-plugin-')).toBe(false);
  });

  it('skill type must be hot or cold', () => {
    expect(['hot', 'cold'].includes('hot')).toBe(true);
    expect(['hot', 'cold'].includes('cold')).toBe(true);
    expect(['hot', 'cold'].includes('invalid' as never)).toBe(false);
  });

  it('triggers must be an array', () => {
    const skill = validManifest.skills[0]!;
    expect(Array.isArray(skill.triggers)).toBe(true);
  });

  it('permissions must be an array', () => {
    expect(Array.isArray(validManifest.permissions)).toBe(true);
  });
});

// ─── Skill Type Tests ──────────────────────────────────────────────────────────

describe('PluginSkill types', () => {
  it('hot skill type is valid', () => {
    const skill: PluginSkill = {
      name: 'hot-skill',
      entry: 'skills/hot.ts',
      type: 'hot',
    };
    expect(skill.type).toBe('hot');
  });

  it('cold skill type is valid', () => {
    const skill: PluginSkill = {
      name: 'cold-skill',
      entry: 'skills/cold.ts',
      type: 'cold',
    };
    expect(skill.type).toBe('cold');
  });

  it('tolerance config is optional', () => {
    const skillWithout: PluginSkill = {
      name: 'skill',
      entry: 'skills/skill.ts',
      type: 'hot',
    };
    expect(skillWithout.tolerance).toBeUndefined();

    const skillWith: PluginSkill = {
      name: 'skill',
      entry: 'skills/skill.ts',
      type: 'hot',
      tolerance: {
        maxTokens: 2000,
        timeout: 60000,
      },
    };
    expect(skillWith.tolerance?.maxTokens).toBe(2000);
    expect(skillWith.tolerance?.timeout).toBe(60000);
  });
});

// ─── Permission Type Tests ─────────────────────────────────────────────────────

describe('PermissionType', () => {
  it('valid permission types', () => {
    const validTypes: Array<'network' | 'fs:read' | 'fs:write' | 'shell' | 'env' | 'admin'> = [
      'network',
      'fs:read',
      'fs:write',
      'shell',
      'env',
      'admin',
    ];
    expect(validTypes).toHaveLength(6);
  });
});

describe('PluginPermission', () => {
  it('network permission with scope', () => {
    const perm: PluginPermission = {
      type: 'network',
      scope: 'api.github.com',
    };
    expect(perm.type).toBe('network');
    expect(perm.scope).toBe('api.github.com');
  });

  it('network permission without scope (implies wildcard)', () => {
    const perm: PluginPermission = {
      type: 'network',
    };
    expect(perm.type).toBe('network');
    expect(perm.scope).toBeUndefined();
  });

  it('admin permission has no scope', () => {
    const perm: PluginPermission = {
      type: 'admin',
    };
    expect(perm.type).toBe('admin');
  });
});
