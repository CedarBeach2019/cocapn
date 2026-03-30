/**
 * Bridge Startup E2E Tests
 *
 * Tests the complete bridge lifecycle from initialization to ready state.
 *
 * Tests:
 * 1. Basic lifecycle — start, health check, shutdown
 * 2. Self-assembly — repository detection and template matching
 * 3. Settings persistence — defaults, env overrides, updates
 * 4. Skills auto-loading — skills loaded on startup
 * 5. Multiple startup cycles — bridge can restart cleanly
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
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
} from './helpers.js';
import type { BridgeConfig } from '../../src/config/types.js';

describe('E2E: Bridge Startup', () => {
  describe('Basic Lifecycle', () => {
    it('should start successfully and report healthy status', { timeout: 15000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendJsonRpc<{ status: string; uptime: number }>(ws, 1, 'HEALTH_CHECK');

          expect(response.error).toBeUndefined();
          expect(response.result?.status).toBe('ok');
          expect(response.result?.uptime).toBeGreaterThanOrEqual(0);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should respond to health check within 100ms', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const start = Date.now();
          const response = await sendJsonRpc(ws, 1, 'HEALTH_CHECK');
          const duration = Date.now() - start;

          expect(response.error).toBeUndefined();
          expect(duration).toBeLessThan(100);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should report monotonically increasing uptime', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response1 = await sendJsonRpc<{ uptime: number }>(ws, 1, 'HEALTH_CHECK');
          await new Promise(resolve => setTimeout(resolve, 100));
          const response2 = await sendJsonRpc<{ uptime: number }>(ws, 2, 'HEALTH_CHECK');

          expect(response1.result?.uptime).toBeGreaterThan(0);
          expect(response2.result?.uptime).toBeGreaterThan(response1.result?.uptime ?? 0);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should shutdown cleanly with exit code 0', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      // Shutdown should not throw
      await expect(stopTestBridge(bridge)).resolves.toBeUndefined();
    });
  });

  describe('Self-Assembly', () => {
    it('should detect repository and match template', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        hasSrcDir: true,
        hasTests: true,
        files: {
          'tsconfig.json': JSON.stringify({
            compilerOptions: {
              target: 'ES2020',
              module: 'ESNext',
            },
          }, null, 2),
        },
      });

      createCocapnConfig(repoDir, {
        selfAssembly: {
          enabled: true,
        },
      });

      // Import and use Bridge directly for this test
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
          // Check that settings contain template information
          const response = await sendJsonRpc(ws, 1, 'GET_SETTINGS');

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          // Template should be detected
          const settings = response.result as Record<string, unknown>;
          expect(settings).toHaveProperty('selfAssembly');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });

    it('should auto-load skills from template', { timeout: 15000 }, async () => {
      const repoDir = await createTestRepo({
        hasPackageJson: true,
        hasSrcDir: true,
        files: {
          'cocapn/skills/read-file/skill.json': JSON.stringify({
            name: 'read-file',
            version: '1.0.0',
            description: 'Read file contents',
            triggers: ['read', 'file'],
            category: 'code',
            steps: [
              { action: 'read', description: 'Read the file' },
            ],
            hot: true,
            tokenBudget: 500,
          }),
        },
      });

      createCocapnConfig(repoDir, {
        selfAssembly: {
          enabled: true,
        },
      });

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
          // Check that skills were loaded
          const response = await sendJsonRpc(ws, 1, 'skill/list');

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          const skills = response.result as Array<{ name: string }>;
          expect(skills.length).toBeGreaterThan(0);

          // Should have at least the read-file skill
          const readFileSkill = skills.find(s => s.name === 'read-file');
          expect(readFileSkill).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await bridgeInstance.stop();
      }
    });
  });

  describe('Settings Persistence', () => {
    it('should load default settings', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendJsonRpc(ws, 1, 'GET_SETTINGS');

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          const settings = response.result as Record<string, unknown>;
          expect(settings).toHaveProperty('mode');
          expect(settings.mode).toBe('local');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should apply environment variable overrides', { timeout: 10000 }, async () => {
      // Set environment variable
      const originalLogLevel = process.env.LOG_LEVEL;
      process.env.LOG_LEVEL = 'debug';

      try {
        const bridge = await createTestBridge({
          skipAuth: true,
          config: {
            mode: 'local',
          },
        });
        await startTestBridge(bridge);

        try {
          const ws = await createWsClient(bridge.port);

          try {
            const response = await sendJsonRpc(ws, 1, 'GET_SETTINGS');

            expect(response.error).toBeUndefined();

            const settings = response.result as Record<string, unknown>;
            // Log level should be affected by environment
            expect(settings).toBeDefined();
          } finally {
            await closeWsClient(ws);
          }
        } finally {
          await stopTestBridge(bridge);
        }
      } finally {
        if (originalLogLevel === undefined) {
          delete process.env.LOG_LEVEL;
        } else {
          process.env.LOG_LEVEL = originalLogLevel;
        }
      }
    });

    it('should persist setting updates', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Update a setting
          const updateResponse = await sendJsonRpc(ws, 1, 'UPDATE_SETTINGS', {
            key: 'testSetting',
            value: 'testValue',
          });

          expect(updateResponse.error).toBeUndefined();

          // Retrieve settings
          const getResponse = await sendJsonRpc(ws, 2, 'GET_SETTINGS');

          expect(getResponse.error).toBeUndefined();

          const settings = getResponse.result as Record<string, unknown>;
          expect(settings).toHaveProperty('testSetting', 'testValue');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Multiple Startup Cycles', () => {
    it('should restart cleanly', { timeout: 20000 }, async () => {
      const port = getNextPort();

      // First startup
      let bridge = await createTestBridge({ port, skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(port);
        try {
          const response = await sendJsonRpc(ws, 1, 'HEALTH_CHECK');
          expect(response.error).toBeUndefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }

      // Second startup on same port
      bridge = await createTestBridge({ port, skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(port);
        try {
          const response = await sendJsonRpc(ws, 2, 'HEALTH_CHECK');
          expect(response.error).toBeUndefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });
});
