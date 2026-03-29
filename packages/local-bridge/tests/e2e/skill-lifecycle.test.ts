/**
 * Skill Lifecycle E2E Tests
 *
 * Tests the complete skill lifecycle from discovery to unloading.
 *
 * Tests:
 * 1. Skill discovery — bridge discovers and lists available skills
 * 2. Dynamic skill loading — load skills at runtime
 * 3. Skill matching — tasks matched to appropriate skills
 * 4. Skill unloading — unload skills and verify cleanup
 * 5. Skill state changes — verify skill availability changes
 */

import { describe, it, expect } from 'vitest';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import {
  createTestBridge,
  startTestBridge,
  stopTestBridge,
  createWsClient,
  closeWsClient,
  sendJsonRpc,
  createTestRepo,
  createCocapnConfig,
  getNextPort,
  createTestSkill,
} from './helpers.js';

interface SkillInfo {
  name: string;
  version: string;
  description: string;
  category: string;
  hot: boolean;
}

describe('E2E: Skill Lifecycle', () => {
  describe('Skill Discovery', () => {
    it('should discover and list available skills', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/test-skill-1/skill.json': JSON.stringify(createTestSkill('test-skill-1')),
          'cocapn/skills/test-skill-2/skill.json': JSON.stringify(createTestSkill('test-skill-2', {
            hot: true,
          })),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          const response = await sendJsonRpc<SkillInfo[]>(ws, 1, 'skill/list');

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();
          expect(Array.isArray(response.result)).toBe(true);

          const skills = response.result!;
          expect(skills.length).toBeGreaterThanOrEqual(2);

          // Verify skill metadata
          const skill1 = skills.find(s => s.name === 'test-skill-1');
          expect(skill1).toBeDefined();
          expect(skill1?.version).toBe('1.0.0');

          const skill2 = skills.find(s => s.name === 'test-skill-2');
          expect(skill2).toBeDefined();
          expect(skill2?.hot).toBe(true);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should filter invalid skills with warnings', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/valid-skill/skill.json': JSON.stringify(createTestSkill('valid-skill')),
          'cocapn/skills/invalid-skill/skill.json': '{ invalid json }',
          'cocapn/skills/missing-fields/skill.json': JSON.stringify({
            name: 'missing-fields',
            // Missing required fields
          }),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          const response = await sendJsonRpc<SkillInfo[]>(ws, 1, 'skill/list');

          expect(response.error).toBeUndefined();

          // Should only have valid skills
          const skills = response.result!;
          expect(skills.length).toBeGreaterThanOrEqual(1);

          const validSkill = skills.find(s => s.name === 'valid-skill');
          expect(validSkill).toBeDefined();

          // Invalid skills should not appear
          expect(skills.find(s => s.name === 'invalid-skill')).toBeUndefined();
          expect(skills.find(s => s.name === 'missing-fields')).toBeUndefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should parse skill manifest correctly', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/complex-skill/skill.json': JSON.stringify({
            name: 'complex-skill',
            version: '2.1.0',
            description: 'A complex skill with full metadata',
            triggers: ['complex', 'advanced', 'sophisticated'],
            category: 'code',
            steps: [
              { action: 'analyze', description: 'Analyze the problem' },
              { action: 'design', description: 'Design a solution' },
              { action: 'implement', description: 'Implement the solution' },
              { action: 'test', description: 'Test the implementation' },
            ],
            hot: false,
            tokenBudget: 1500,
            tags: ['development', 'engineering'],
            author: 'Test Author',
            license: 'MIT',
          }),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          const response = await sendJsonRpc<SkillInfo[]>(ws, 1, 'skill/list');

          expect(response.error).toBeUndefined();

          const skill = response.result!.find(s => s.name === 'complex-skill');
          expect(skill).toBeDefined();
          expect(skill?.version).toBe('2.1.0');
          expect(skill?.description).toBe('A complex skill with full metadata');
          expect(skill?.category).toBe('code');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });
  });

  describe('Dynamic Skill Loading', () => {
    it('should load skill at runtime', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          // Create a skill file after bridge starts
          const skillPath = join(repoDir, 'cocapn', 'skills', 'dynamic-skill', 'skill.json');
          await mkdir(join(skillPath, '..'), { recursive: true });
          await writeFile(skillPath, JSON.stringify(createTestSkill('dynamic-skill')));

          // Load the skill
          const loadResponse = await sendJsonRpc(ws, 1, 'skill/load', {
            path: skillPath,
          });

          expect(loadResponse.error).toBeUndefined();

          // Verify skill appears in list
          const listResponse = await sendJsonRpc<SkillInfo[]>(ws, 2, 'skill/list');

          const skill = listResponse.result!.find(s => s.name === 'dynamic-skill');
          expect(skill).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should load skill within 500ms', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          const skillPath = join(repoDir, 'cocapn', 'skills', 'fast-skill', 'skill.json');
          await mkdir(join(skillPath, '..'), { recursive: true });
          await writeFile(skillPath, JSON.stringify(createTestSkill('fast-skill')));

          const start = Date.now();
          const loadResponse = await sendJsonRpc(ws, 1, 'skill/load', {
            path: skillPath,
          });
          const duration = Date.now() - start;

          expect(loadResponse.error).toBeUndefined();
          expect(duration).toBeLessThan(500);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should make loaded skill immediately available', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          const skillPath = join(repoDir, 'cocapn', 'skills', 'immediate-skill', 'skill.json');
          await mkdir(join(skillPath, '..'), { recursive: true });
          await writeFile(skillPath, JSON.stringify(createTestSkill('immediate-skill')));

          // Load skill
          await sendJsonRpc(ws, 1, 'skill/load', { path: skillPath });

          // Try to match a task to the skill immediately
          const matchResponse = await sendJsonRpc(ws, 2, 'skill/match', {
            task: 'immediate-skill test task',
          });

          expect(matchResponse.error).toBeUndefined();
          expect(matchResponse.result).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });
  });

  describe('Skill Matching', () => {
    it('should match task to appropriate skill', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/read-file/skill.json': JSON.stringify(createTestSkill('read-file', {
            triggers: ['read', 'file', 'open'],
          })),
          'cocapn/skills/search-code/skill.json': JSON.stringify(createTestSkill('search-code', {
            triggers: ['search', 'find', 'grep'],
          })),
          'cocapn/skills/run-tests/skill.json': JSON.stringify(createTestSkill('run-tests', {
            triggers: ['test', 'spec', 'verify'],
          })),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          const response = await sendJsonRpc<{
            skill: string;
            confidence: number;
          }>(ws, 1, 'skill/match', {
            task: 'find all async functions in src/',
          });

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          const match = response.result!;
          expect(match.skill).toBe('search-code');
          expect(match.confidence).toBeGreaterThan(0.8);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should return multiple options for ambiguous tasks', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/code-write/skill.json': JSON.stringify(createTestSkill('code-write', {
            triggers: ['code', 'write', 'implement'],
          })),
          'cocapn/skills/code-read/skill.json': JSON.stringify(createTestSkill('code-read', {
            triggers: ['code', 'read', 'analyze'],
          })),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          const response = await sendJsonRpc<{
            matches: Array<{ skill: string; confidence: number }>;
          }>(ws, 1, 'skill/match', {
            task: 'code',
          });

          expect(response.error).toBeUndefined();

          const matches = response.result?.matches;
          expect(matches).toBeDefined();
          expect(matches!.length).toBeGreaterThan(1);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should provide reasonable confidence scores', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/test-skill/skill.json': JSON.stringify(createTestSkill('test-skill', {
            triggers: ['test', 'testing', 'test-case'],
          })),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          // Exact match should have high confidence
          const exactResponse = await sendJsonRpc<{ confidence: number }>(ws, 1, 'skill/match', {
            task: 'test-skill',
          });

          expect(exactResponse.result?.confidence).toBeGreaterThan(0.8);

          // Partial match should have lower confidence
          const partialResponse = await sendJsonRpc<{ confidence: number }>(ws, 2, 'skill/match', {
            task: 'testing something',
          });

          expect(partialResponse.result?.confidence).toBeGreaterThan(0.5);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });
  });

  describe('Skill Unloading', () => {
    it('should unload skill and remove from list', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/unload-me/skill.json': JSON.stringify(createTestSkill('unload-me')),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          // Verify skill is loaded
          const beforeResponse = await sendJsonRpc<SkillInfo[]>(ws, 1, 'skill/list');
          const beforeSkills = beforeResponse.result!;
          expect(beforeSkills.find(s => s.name === 'unload-me')).toBeDefined();

          // Unload the skill
          const unloadResponse = await sendJsonRpc(ws, 2, 'skill/unload', {
            name: 'unload-me',
          });

          expect(unloadResponse.error).toBeUndefined();

          // Verify skill is removed
          const afterResponse = await sendJsonRpc<SkillInfo[]>(ws, 3, 'skill/list');
          const afterSkills = afterResponse.result!;
          expect(afterSkills.find(s => s.name === 'unload-me')).toBeUndefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should unload skill within 200ms', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/fast-unload/skill.json': JSON.stringify(createTestSkill('fast-unload')),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          const start = Date.now();
          const response = await sendJsonRpc(ws, 1, 'skill/unload', {
            name: 'fast-unload',
          });
          const duration = Date.now() - start;

          expect(response.error).toBeUndefined();
          expect(duration).toBeLessThan(200);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should clean up resources on unload', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        files: {
          'cocapn/skills/resource-skill/skill.json': JSON.stringify(createTestSkill('resource-skill')),
        },
      });

      createCocapnConfig(repoDir);

      const { Bridge } = await import('../../src/bridge.js');
      const bridgeInstance = new Bridge({
        privateRepoRoot: repoDir,
        publicRepoRoot: repoDir,
        port: getNextPort(),
        skipAuth: true,
      });

      await bridgeInstance.start();

      try {
        const ws = await createWsClient(bridgeInstance['server']['port']);

        try {
          // Unload the skill
          await sendJsonRpc(ws, 1, 'skill/unload', {
            name: 'resource-skill',
          });

          // Try to use the skill — should fail gracefully
          const matchResponse = await sendJsonRpc(ws, 2, 'skill/match', {
            task: 'resource-skill',
          });

          // Should not match the unloaded skill
          expect(matchResponse.result?.skill !== 'resource-skill').toBe(true);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });
  });
});
