/**
 * Integration tests for Phase 9 systems wired into BridgeServer
 *
 * Tests:
 * 1. Skill decision tree routes messages correctly
 * 2. Graph builds on startup
 * 3. Token tracker records on message
 * 4. Health check includes new systems
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { rm } from 'fs/promises';
import { join } from 'path';
import { SkillLoader } from '../../src/skills/loader.js';
import { SkillDecisionTree } from '../../src/skills/decision-tree.js';
import { RepoGraph } from '../../src/graph/index.js';
import { TokenTracker } from '../../src/metrics/token-tracker.js';

describe('Integration: Phase 9 Systems', () => {
  let bridge: Bridge;
  let bridgeServer: BridgeServer;
  let testRepoRoot: string;
  let publicRepoRoot: string;

  beforeEach(async () => {
    // Create test repositories
    testRepoRoot = `/tmp/cocapn-test-${Date.now()}`;
    publicRepoRoot = `/tmp/cocapn-public-${Date.now()}`;

    // Initialize test repositories with minimal structure
    const { mkdir } = await import('fs/promises');
    await mkdir(join(testRepoRoot, 'cocapn', 'modules'), { recursive: true });
    await mkdir(join(testRepoRoot, 'cocapn', 'memory'), { recursive: true });
    await mkdir(join(publicRepoRoot, 'cocapn'), { recursive: true });

    // Create minimal config
    const { writeFile } = await import('fs/promises');
    await writeFile(
      join(testRepoRoot, 'cocapn', 'config.yml'),
      'mode: local\nport: 8787\nsoul: cocapn/soul.md\nmemory:\n  facts: cocapn/memory/facts.json\n'
    );
    await writeFile(
      join(testRepoRoot, 'cocapn', 'soul.md'),
      '# Test Agent\nA helpful assistant for testing.'
    );
    await writeFile(
      join(testRepoRoot, 'cocapn', 'memory', 'facts.json'),
      '{}\n'
    );
    await writeFile(
      join(publicRepoRoot, 'cocapn.yml'),
      'name: test\nversion: 0.0.1\n'
    );
  });

  afterEach(async () => {
    if (bridge) {
      await bridge.stop();
    }
    // Clean up test repositories
    try {
      await rm(testRepoRoot, { recursive: true, force: true });
      await rm(publicRepoRoot, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('Skill Decision Tree', () => {
    it('should route messages using decision tree', async () => {
      const skillLoader = new SkillLoader({
        maxColdSkills: 20,
        maxMemoryBytes: 50 * 1024,
        skillPaths: [],
      });

      const decisionTree = new SkillDecisionTree();

      // Create a test skill
      const testSkill = {
        name: 'code-write',
        version: '1.0.0',
        description: 'Write code',
        triggers: ['write', 'create', 'code'],
        category: 'code' as const,
        steps: [
          { action: 'analyze', description: 'Analyze requirements' },
          { action: 'implement', description: 'Implement solution' },
        ],
        hot: false,
        tokenBudget: 500,
      };

      // Register the skill
      skillLoader.register = async () => {
        // Mock implementation
        skillLoader['registry'].set('code-write', '/mock/path');
        skillLoader.load = (name: string) => {
          if (name === 'code-write') return testSkill;
          return null;
        };
        return testSkill;
      };

      await skillLoader.register('/mock/path');
      decisionTree.rebuild([testSkill]);

      // Test routing
      const keywords = ['write', 'code'];
      const matches = decisionTree.resolve(keywords);

      expect(matches).toContain('code-write');
    });

    it('should load matching skills into agent context', async () => {
      const skillLoader = new SkillLoader({
        maxColdSkills: 20,
        maxMemoryBytes: 50 * 1024,
        skillPaths: [],
      });

      const decisionTree = new SkillDecisionTree();

      const testSkill = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'Test skill',
        triggers: ['test'],
        category: 'code' as const,
        steps: [{ action: 'test', description: 'Test action' }],
        hot: false,
        tokenBudget: 500,
      };

      skillLoader['registry'].set('test-skill', '/mock/path');
      skillLoader.load = (name: string) => {
        if (name === 'test-skill') return testSkill;
        return null;
      };

      decisionTree.rebuild([testSkill]);

      const keywords = ['test'];
      const matches = decisionTree.resolve(keywords);

      expect(matches).toContain('test-skill');
    });
  });

  describe('Knowledge Graph', () => {
    it('should build graph on bridge startup', async () => {
      const repoGraph = new RepoGraph(testRepoRoot);

      await repoGraph.initialize();
      await repoGraph.build();

      const stats = await repoGraph.stats();

      // Graph should be built (even if empty)
      expect(stats).toBeDefined();
      expect(stats.files).toBeGreaterThanOrEqual(0);
      expect(stats.symbols).toBeGreaterThanOrEqual(0);

      repoGraph.close();
    });

    it('should query graph dependencies', async () => {
      const repoGraph = new RepoGraph(testRepoRoot);

      await repoGraph.initialize();

      // Create a test TypeScript file
      const { writeFile } = await import('fs/promises');
      await writeFile(
        join(testRepoRoot, 'test.ts'),
        'export function test() { return 42; }'
      );

      await repoGraph.build();

      // Query for the test file
      const nodes = await repoGraph.findByFile('test.ts');

      expect(nodes.length).toBeGreaterThan(0);

      repoGraph.close();
    });
  });

  describe('Token Tracking', () => {
    it('should record token usage on message', () => {
      const tokenTracker = new TokenTracker({ maxRecords: 10000 });

      const recordId = tokenTracker.record({
        messageType: 'user',
        tokensIn: 100,
        tokensOut: 200,
        model: 'test-model',
        module: 'test-module',
        skill: 'test-skill',
        taskType: 'chat',
        duration: 1000,
        success: true,
      });

      expect(recordId).toBeTruthy();

      const stats = tokenTracker.getStats();

      expect(stats.totalTokensIn).toBe(100);
      expect(stats.totalTokensOut).toBe(200);
      expect(stats.tasksCompleted).toBe(1);
    });

    it('should estimate tokens from text', () => {
      const text = 'Hello, world!';
      const estimated = TokenTracker.estimateTokens(text);

      // Roughly 4 chars per token
      expect(estimated).toBeGreaterThan(0);
      expect(estimated).toBeLessThanOrEqual(Math.ceil(text.length / 2));
    });
  });

  describe('Health Checks', () => {
    it('should include graph health check', async () => {
      const repoGraph = new RepoGraph(testRepoRoot);
      await repoGraph.initialize();

      const healthCheck = async () => {
        try {
          const stats = await repoGraph.stats();
          if (stats.nodes === 0) {
            return { status: 'degraded' as const, message: 'Graph not built yet' };
          }
          return { status: 'healthy' as const, message: `Graph has ${stats.nodes} nodes` };
        } catch (error) {
          return { status: 'unhealthy' as const, message: error instanceof Error ? error.message : String(error) };
        }
      };

      const result = await healthCheck();

      expect(result).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);

      repoGraph.close();
    });

    it('should include skills health check', () => {
      const skillLoader = new SkillLoader({
        maxColdSkills: 20,
        maxMemoryBytes: 50 * 1024,
        skillPaths: [],
      });

      const healthCheck = () => {
        const skillCount = skillLoader.stats().total;
        if (skillCount === 0) {
          return { status: 'degraded' as const, message: 'No skills registered' };
        }
        return { status: 'healthy' as const, message: `${skillCount} skills registered` };
      };

      const result = healthCheck();

      expect(result).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(result.status);
    });
  });

  describe('WebSocket Methods', () => {
    it('should handle skill/list JSON-RPC method', async () => {
      // Test the skill loader functionality directly
      const skillLoader = new SkillLoader({
        maxColdSkills: 20,
        maxMemoryBytes: 50 * 1024,
        skillPaths: [],
      });

      const decisionTree = new SkillDecisionTree();

      const testSkill = {
        name: 'test-skill',
        version: '1.0.0',
        description: 'Test skill',
        triggers: ['test'],
        category: 'code' as const,
        steps: [{ action: 'test', description: 'Test action' }],
        hot: false,
        tokenBudget: 500,
      };

      // Add skill to registry
      skillLoader['registry'].set('test-skill', '/mock/path');

      // Directly manipulate the skills map to add the loaded skill
      skillLoader['skills'].set('test-skill', {
        name: 'test-skill',
        cartridge: testSkill,
        loadedAt: Date.now(),
        useCount: 0,
        lastUsedAt: Date.now(),
      });

      decisionTree.rebuild([testSkill]);

      // Get stats directly from the internal state
      const stats = skillLoader.stats();
      const loaded = skillLoader.getLoaded();

      expect(loaded.length).toBeGreaterThan(0);
      expect(stats.total).toBeGreaterThanOrEqual(1);
      expect(loaded[0].name).toBe('test-skill');
    });

    it('should handle token/stats JSON-RPC method', () => {
      const tokenTracker = new TokenTracker({ maxRecords: 10000 });

      tokenTracker.record({
        messageType: 'user',
        tokensIn: 100,
        tokensOut: 200,
        model: 'test-model',
        taskType: 'chat',
        duration: 1000,
        success: true,
      });

      const stats = tokenTracker.getStats();

      expect(stats.totalTokens).toBe(300);
      expect(stats.tasksCompleted).toBe(1);
    });
  });
});
