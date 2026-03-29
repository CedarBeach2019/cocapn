/**
 * Skill Loader Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SkillLoader } from '../../src/skills/loader.js';
import type { SkillCartridge, LoadedSkill } from '../../src/skills/types.js';
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('SkillLoader', () => {
  let loader: SkillLoader;
  let testDir: string;

  const testSkill: SkillCartridge = {
    name: 'test-skill',
    version: '1.0.0',
    description: 'A test skill',
    triggers: ['test', 'testing'],
    category: 'code',
    steps: [
      { action: 'think', description: 'Think about the task' },
      { action: 'execute', description: 'Execute the task' },
    ],
    tokenBudget: 300,
  };

  const hotSkill: SkillCartridge = {
    name: 'hot-skill',
    version: '1.0.0',
    description: 'A hot skill',
    triggers: ['hot'],
    category: 'communication',
    hot: true,
    steps: [
      { action: 'respond', description: 'Quick response' },
    ],
    tokenBudget: 200,
  };

  beforeEach(() => {
    // Create temp directory for test skills
    testDir = join(tmpdir(), `cocapn-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    // Write test skill files
    writeFileSync(join(testDir, 'test-skill.json'), JSON.stringify(testSkill, null, 2));
    writeFileSync(join(testDir, 'hot-skill.json'), JSON.stringify(hotSkill, null, 2));

    // Create loader with small limits for testing eviction
    loader = new SkillLoader({
      maxColdSkills: 2,
      maxMemoryBytes: 1000,
      skillPaths: [testDir],
    });
  });

  describe('registration', () => {
    it('should register a skill cartridge from file', async () => {
      const skillPath = join(testDir, 'test-skill.json');
      const cartridge = await loader.register(skillPath);

      expect(cartridge).toBeDefined();
      expect(cartridge.name).toBe('test-skill');
      expect(cartridge.version).toBe('1.0.0');
    });

    it('should throw on non-existent file', async () => {
      await expect(loader.register('non-existent.json')).rejects.toThrow('Skill file not found');
    });

    it('should throw on invalid cartridge', async () => {
      const invalidPath = join(testDir, 'invalid.json');
      writeFileSync(invalidPath, '{ invalid json');

      await expect(loader.register(invalidPath)).rejects.toThrow();
    });

    it('should load hot skills immediately on registration', async () => {
      const hotPath = join(testDir, 'hot-skill.json');
      await loader.register(hotPath);

      expect(loader.isLoaded('hot-skill')).toBe(true);
    });
  });

  describe('loading', () => {
    it('should load a skill by name after registration', async () => {
      const skillPath = join(testDir, 'test-skill.json');
      await loader.register(skillPath);

      const loaded = loader.load('test-skill');
      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe('test-skill');
    });

    it('should return null for non-existent skill', () => {
      const loaded = loader.load('non-existent');
      expect(loaded).toBeNull();
    });

    it('should return existing cartridge if already loaded', async () => {
      const skillPath = join(testDir, 'test-skill.json');
      await loader.register(skillPath);

      const first = loader.load('test-skill');
      const second = loader.load('test-skill');

      expect(first).toBe(second);
    });

    it('should unload a loaded skill', async () => {
      const skillPath = join(testDir, 'test-skill.json');
      await loader.register(skillPath);
      loader.load('test-skill');

      const unloaded = loader.unload('test-skill');
      expect(unloaded).toBe(true);
      expect(loader.isLoaded('test-skill')).toBe(false);
    });

    it('should return false when unloading non-loaded skill', () => {
      const unloaded = loader.unload('non-existent');
      expect(unloaded).toBe(false);
    });

    it('should load skills by intent keywords', async () => {
      await loader.register(join(testDir, 'test-skill.json'));
      await loader.register(join(testDir, 'hot-skill.json'));

      const skills = loader.loadByIntent(['test', 'hot']);
      expect(skills).toHaveLength(2);
      expect(skills.some(s => s.name === 'test-skill')).toBe(true);
      expect(skills.some(s => s.name === 'hot-skill')).toBe(true);
    });
  });

  describe('querying', () => {
    it('should check if skill is loaded', async () => {
      await loader.register(join(testDir, 'test-skill.json'));
      loader.load('test-skill');

      expect(loader.isLoaded('test-skill')).toBe(true);
      expect(loader.isLoaded('non-existent')).toBe(false);
    });

    it('should get all loaded skills with metadata', async () => {
      await loader.register(join(testDir, 'test-skill.json'));
      loader.load('test-skill');

      const loaded = loader.getLoaded();
      expect(loaded).toHaveLength(1);
      expect(loaded[0].name).toBe('test-skill');
      expect(loaded[0].useCount).toBeGreaterThanOrEqual(0);
      expect(loaded[0].loadedAt).toBeGreaterThan(0);
    });

    it('should get all registered skills', async () => {
      await loader.register(join(testDir, 'test-skill.json'));
      await loader.register(join(testDir, 'hot-skill.json'));

      const all = loader.getAll();
      expect(all).toHaveLength(2);
    });

    it('should get hot skills', async () => {
      await loader.register(join(testDir, 'hot-skill.json'));

      const hot = loader.getHot();
      expect(hot).toHaveLength(1);
      expect(hot[0].name).toBe('hot-skill');
      expect(hot[0].hot).toBe(true);
    });
  });

  describe('context generation', () => {
    it('should build skill context', async () => {
      await loader.register(join(testDir, 'test-skill.json'));
      loader.load('test-skill');

      const context = loader.buildSkillContext();
      expect(context.context).toContain('test-skill');
      expect(context.skills).toContain('test-skill');
      expect(context.tokens).toBeGreaterThan(0);
    });

    it('should respect token budget', async () => {
      await loader.register(join(testDir, 'test-skill.json'));
      loader.load('test-skill');

      const context = loader.buildSkillContext(100);
      expect(context.tokens).toBeLessThanOrEqual(100);
    });

    it('should include hot skills first', async () => {
      await loader.register(join(testDir, 'hot-skill.json'));
      await loader.register(join(testDir, 'test-skill.json'));

      const context = loader.buildSkillContext();
      expect(context.skills[0]).toBe('hot-skill');
    });
  });

  describe('lifecycle', () => {
    it('should evict least recently used skills when limit reached', async () => {
      // Create skills that will exceed limits
      for (let i = 0; i < 5; i++) {
        const skill: SkillCartridge = {
          name: `skill-${i}`,
          version: '1.0.0',
          triggers: [`trigger-${i}`],
          steps: [{ action: 'think', description: `Skill ${i}` }],
          tokenBudget: 300,
        };
        const path = join(testDir, `skill-${i}.json`);
        writeFileSync(path, JSON.stringify(skill));
        await loader.register(path);
        loader.load(`skill-${i}`);
      }

      const stats = loader.stats();
      // Should evict some skills due to cold limit
      expect(stats.cold).toBeLessThanOrEqual(2);
    });

    it('should promote skill to hot', async () => {
      await loader.register(join(testDir, 'test-skill.json'));
      loader.load('test-skill');

      loader.warm('test-skill');

      const hot = loader.getHot();
      expect(hot.some(s => s.name === 'test-skill')).toBe(true);
    });

    it('should return accurate statistics', async () => {
      await loader.register(join(testDir, 'test-skill.json'));
      await loader.register(join(testDir, 'hot-skill.json'));

      const stats = loader.stats();
      expect(stats.total).toBe(2);
      expect(stats.loaded).toBeGreaterThanOrEqual(0);
      expect(stats.hot).toBeGreaterThanOrEqual(0);
      expect(stats.cold).toBeGreaterThanOrEqual(0);
      expect(stats.memoryBytes).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle skills with dependencies', async () => {
      const skillWithDeps: SkillCartridge = {
        name: 'dependent-skill',
        version: '1.0.0',
        triggers: ['dependent'],
        steps: [{ action: 'execute', description: 'Execute' }],
        dependencies: ['test-skill'],
      };

      const path = join(testDir, 'dependent-skill.json');
      writeFileSync(path, JSON.stringify(skillWithDeps));

      const cartridge = await loader.register(path);
      expect(cartridge.dependencies).toEqual(['test-skill']);
    });

    it('should handle skills with tolerance modes', async () => {
      const tolerantSkill: SkillCartridge = {
        name: 'tolerant-skill',
        version: '1.0.0',
        triggers: ['tolerant'],
        steps: [
          {
            action: 'execute',
            description: 'Execute with fallback',
            fallback: 'Use alternative',
          },
        ],
        tolerance: {
          network_failure: 'retry',
          timeout: 'fallback',
        },
      };

      const path = join(testDir, 'tolerant-skill.json');
      writeFileSync(path, JSON.stringify(tolerantSkill));

      const cartridge = await loader.register(path);
      expect(cartridge.tolerance?.network_failure).toBe('retry');
      expect(cartridge.steps[0].fallback).toBe('Use alternative');
    });
  });
});