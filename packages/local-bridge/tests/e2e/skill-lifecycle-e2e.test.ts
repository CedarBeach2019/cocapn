/**
 * Skill Lifecycle E2E Tests (Phase 16.5)
 *
 * Tests the real skill/* JSON-RPC methods against a live BridgeServer
 * with a real SkillLoader.  Skill cartridges are registered from on-disk
 * JSON files — no mocks.
 *
 * Flow:
 *   1. Start BridgeServer with SkillLoader
 *   2. skill/list  → verify registered skills
 *   3. skill/stats → verify none loaded (cold skill)
 *   4. skill/load  → load a skill by name
 *   5. skill/stats → verify 1 loaded
 *   6. skill/unload → unload the skill
 *   7. skill/stats → verify 0 loaded
 */

import { describe, it, expect } from 'vitest';
import {
  createTestBridgeWithSkills,
  startTestBridge,
  stopTestBridge,
  createWsClient,
  closeWsClient,
  sendJsonRpc,
  createTestSkill,
} from './helpers.js';

interface SkillListResult {
  skills: Array<{ name: string; version: string; description: string; hot: boolean }>;
  stats: { total: number; loaded: number; hot: number; cold: number };
}

interface SkillStatsResult {
  stats: {
    total: number;
    hot: number;
    cold: number;
    memoryBytes: number;
    loaded: Array<{ name: string; useCount: number }>;
  };
}

describe('E2E: Skill Lifecycle', () => {
  it('should list, load, and unload a skill via JSON-RPC', { timeout: 15000 }, async () => {
    const bridge = await createTestBridgeWithSkills({
      skipAuth: true,
      skillFiles: {
        'cocapn/modules/e2e-test-skill/skill.json': createTestSkill('e2e-test-skill'),
      },
    });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);
      try {
        // 1. skill/list — registered skill should appear
        const listResp = await sendJsonRpc(ws, 1, 'skill/list');
        expect(listResp.error).toBeUndefined();
        const listResult = listResp.result as unknown as SkillListResult;
        expect(listResult.skills).toBeDefined();
        expect(listResult.skills.length).toBeGreaterThanOrEqual(1);
        const found = listResult.skills.some(s => s.name === 'e2e-test-skill');
        expect(found).toBe(true);

        // 2. skill/stats — no skills loaded (cold by default)
        const statsResp1 = await sendJsonRpc(ws, 2, 'skill/stats');
        expect(statsResp1.error).toBeUndefined();
        const statsResult1 = statsResp1.result as unknown as SkillStatsResult;
        expect(statsResult1.stats.loaded).toHaveLength(0);

        // 3. skill/load — load the skill
        const loadResp = await sendJsonRpc(ws, 3, 'skill/load', { name: 'e2e-test-skill' });
        expect((loadResp.result as any).error).toBeUndefined();
        expect((loadResp.result as any).loaded).toBe(true);
        expect((loadResp.result as any).skill.name).toBe('e2e-test-skill');

        // 4. skill/stats — now 1 loaded
        const statsResp2 = await sendJsonRpc(ws, 4, 'skill/stats');
        const statsResult2 = statsResp2.result as unknown as SkillStatsResult;
        expect(statsResult2.stats.loaded).toHaveLength(1);

        // 5. skill/unload
        const unloadResp = await sendJsonRpc(ws, 5, 'skill/unload', { name: 'e2e-test-skill' });
        expect(unloadResp.error).toBeUndefined();
        expect((unloadResp.result as any).unloaded).toBe(true);

        // 6. skill/stats — 0 loaded again
        const statsResp3 = await sendJsonRpc(ws, 6, 'skill/stats');
        const statsResult3 = statsResp3.result as unknown as SkillStatsResult;
        expect(statsResult3.stats.loaded).toHaveLength(0);
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should auto-load hot skills on registration', { timeout: 10000 }, async () => {
    const bridge = await createTestBridgeWithSkills({
      skipAuth: true,
      skillFiles: {
        'cocapn/modules/hot-skill/skill.json': createTestSkill('hot-skill', { hot: true }),
      },
    });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);
      try {
        const statsResp = await sendJsonRpc(ws, 1, 'skill/stats');
        const statsResult = statsResp.result as unknown as SkillStatsResult;
        // Hot skill should be auto-loaded
        expect(statsResult.stats.loaded).toHaveLength(1);
        expect(statsResult.stats.hot).toBe(1);
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should return error for loading non-existent skill', { timeout: 10000 }, async () => {
    const bridge = await createTestBridgeWithSkills({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);
      try {
        const resp = await sendJsonRpc(ws, 1, 'skill/load', { name: 'no-such-skill' });
        expect(resp.result).toBeDefined();
        expect((resp.result as any).error).toContain('not found');
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should return unloaded=false when unloading never-loaded skill', { timeout: 10000 }, async () => {
    const bridge = await createTestBridgeWithSkills({
      skipAuth: true,
      skillFiles: {
        'cocapn/modules/cold-skill/skill.json': createTestSkill('cold-skill'),
      },
    });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);
      try {
        // cold-skill is registered but not loaded — unload should return false
        const resp = await sendJsonRpc(ws, 1, 'skill/unload', { name: 'cold-skill' });
        expect(resp.error).toBeUndefined();
        expect((resp.result as any).unloaded).toBe(false);
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should list multiple registered skills', { timeout: 10000 }, async () => {
    const bridge = await createTestBridgeWithSkills({
      skipAuth: true,
      skillFiles: {
        'cocapn/modules/alpha/skill.json': createTestSkill('alpha'),
        'cocapn/modules/beta/skill.json': createTestSkill('beta'),
        'cocapn/modules/gamma/skill.json': createTestSkill('gamma'),
      },
    });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);
      try {
        const resp = await sendJsonRpc(ws, 1, 'skill/list');
        const result = resp.result as unknown as SkillListResult;
        expect(result.stats.total).toBe(3);
        const names = result.skills.map(s => s.name);
        expect(names).toContain('alpha');
        expect(names).toContain('beta');
        expect(names).toContain('gamma');
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });
});
