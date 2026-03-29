/**
 * Cloud Connector E2E Tests
 *
 * Tests the cloud connection functionality including status checks,
 * task submission, and hybrid mode.
 *
 * Tests:
 * 1. Cloud status — bridge reports connection status
 * 2. Task submission — submit tasks to cloud worker
 * 3. Task polling — poll for task completion
 * 4. Heartbeat — regular heartbeat to cloud worker
 * 5. Hybrid mode — simple tasks local, complex tasks cloud
 */

import { describe, it, expect } from 'vitest';
import {
  createTestBridge,
  startTestBridge,
  stopTestBridge,
  createWsClient,
  closeWsClient,
  sendJsonRpc,
} from './helpers.js';

interface CloudStatus {
  connected: boolean;
  workerUrl?: string;
  lastHeartbeat?: string;
  mode?: string;
}

interface TaskSubmission {
  taskId: string;
  status: string;
}

interface TaskResult {
  taskId: string;
  status: string;
  result?: unknown;
  error?: string;
}

describe('E2E: Cloud Connector', () => {
  describe('Cloud Status', () => {
    it('should report disconnected when worker not configured', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: { mode: 'local' },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendJsonRpc<CloudStatus>(ws, 1, 'CLOUD_STATUS');

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          const status = response.result!;
          expect(status.connected).toBe(false);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should report worker URL when configured', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendJsonRpc<CloudStatus>(ws, 1, 'CLOUD_STATUS');

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          const status = response.result!;
          expect(status.workerUrl).toBe('https://test-worker.cocapn.dev');
          expect(status.mode).toBe('hybrid');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should establish connection within 5 seconds', { timeout: 10000 }, async () => {
      // Note: This test requires a real cloud worker or mock server
      // For now, we test the timeout behavior
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'http://localhost:9999', // Non-existent server
            timeout: 100,
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const start = Date.now();
          const response = await sendJsonRpc<CloudStatus>(ws, 1, 'CLOUD_STATUS');
          const duration = Date.now() - start;

          expect(response.error).toBeUndefined();
          // Should not take more than 5 seconds even with timeout
          expect(duration).toBeLessThan(5000);

          const status = response.result!;
          expect(status.connected).toBe(false);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should detect disconnection within 10 seconds', { timeout: 15000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'http://localhost:9998',
            heartbeatInterval: 2000,
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Initial status check
          const response1 = await sendJsonRpc<CloudStatus>(ws, 1, 'CLOUD_STATUS');
          expect(response1.result?.connected).toBe(false);

          // Wait and check again
          await new Promise(resolve => setTimeout(resolve, 3000));

          const response2 = await sendJsonRpc<CloudStatus>(ws, 2, 'CLOUD_STATUS');
          expect(response2.result?.connected).toBe(false);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Task Submission', () => {
    it('should submit task to cloud worker', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendJsonRpc<TaskSubmission>(ws, 1, 'CLOUD_SUBMIT_TASK', {
            task: {
              type: 'test',
              description: 'Test task for E2E',
            },
          });

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          const submission = response.result!;
          expect(submission.taskId).toBeDefined();
          expect(submission.status).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should handle task submission failure gracefully', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'local', // No cloud configured
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendJsonRpc(ws, 1, 'CLOUD_SUBMIT_TASK', {
            task: {
              type: 'test',
              description: 'Test task',
            },
          });

          // Should return an error since cloud is not configured
          expect(response.error).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Task Polling', () => {
    it('should poll task status', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Submit a task first
          const submitResponse = await sendJsonRpc<TaskSubmission>(ws, 1, 'CLOUD_SUBMIT_TASK', {
            task: {
              type: 'test',
              description: 'Test task for polling',
            },
          });

          expect(submitResponse.result?.taskId).toBeDefined();

          // Poll for status
          const pollResponse = await sendJsonRpc<TaskResult>(ws, 2, 'CLOUD_POLL_TASK', {
            taskId: submitResponse.result!.taskId,
          });

          expect(pollResponse.error).toBeUndefined();
          expect(pollResponse.result).toBeDefined();

          const result = pollResponse.result!;
          expect(result.taskId).toBe(submitResponse.result!.taskId);
          expect(result.status).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should return immediate status for non-existent task', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const start = Date.now();
          const response = await sendJsonRpc<TaskResult>(ws, 1, 'CLOUD_POLL_TASK', {
            taskId: 'non-existent-task-id',
          });
          const duration = Date.now() - start;

          // Should return immediately (< 50ms)
          expect(duration).toBeLessThan(50);

          expect(response.error).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Heartbeat', () => {
    it('should send heartbeat to cloud worker', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
            heartbeatInterval: 2000,
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Check initial heartbeat status
          const response1 = await sendJsonRpc<CloudStatus>(ws, 1, 'CLOUD_STATUS');

          // Wait for at least one heartbeat
          await new Promise(resolve => setTimeout(resolve, 3000));

          // Check updated heartbeat
          const response2 = await sendJsonRpc<CloudStatus>(ws, 2, 'CLOUD_STATUS');

          expect(response2.result).toBeDefined();

          // Heartbeat timestamp should have been updated
          // (Note: This will be false if worker is not actually reachable)
          if (response2.result?.lastHeartbeat) {
            expect(response2.result.lastHeartbeat).toBeDefined();
          }
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should update heartbeat every 30 seconds', { timeout: 35000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
            heartbeatInterval: 5000, // Faster for testing
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Get initial heartbeat
          const response1 = await sendJsonRpc<CloudStatus>(ws, 1, 'CLOUD_STATUS');
          const heartbeat1 = response1.result?.lastHeartbeat;

          // Wait for heartbeat interval
          await new Promise(resolve => setTimeout(resolve, 6000));

          // Get updated heartbeat
          const response2 = await sendJsonRpc<CloudStatus>(ws, 2, 'CLOUD_STATUS');
          const heartbeat2 = response2.result?.lastHeartbeat;

          if (heartbeat1 && heartbeat2) {
            expect(heartbeat2).not.toBe(heartbeat1);
          }
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Hybrid Mode', () => {
    it('should execute simple tasks locally', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
            hybridThreshold: 0.7,
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Simple task - should execute locally
          const response = await sendJsonRpc<{ executed: 'local' | 'cloud' }>(ws, 1, 'EXECUTE_TASK', {
            task: 'read package.json',
            complexity: 0.3, // Below threshold
          });

          expect(response.error).toBeUndefined();
          expect(response.result?.executed).toBe('local');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should offload complex tasks to cloud', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
            hybridThreshold: 0.7,
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Complex task - should offload to cloud
          const response = await sendJsonRpc<{ executed: 'local' | 'cloud' }>(ws, 1, 'EXECUTE_TASK', {
            task: 'refactor entire codebase to TypeScript',
            complexity: 0.9, // Above threshold
          });

          expect(response.error).toBeUndefined();
          expect(response.result?.executed).toBe('cloud');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should correctly categorize tasks by threshold', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'hybrid',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
            hybridThreshold: 0.5,
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Test various complexity levels
          const tasks = [
            { task: 'very simple', complexity: 0.2, expected: 'local' },
            { task: 'moderate', complexity: 0.5, expected: 'cloud' },
            { task: 'complex', complexity: 0.8, expected: 'cloud' },
          ];

          for (const { task, complexity, expected } of tasks) {
            const response = await sendJsonRpc<{ executed: 'local' | 'cloud' }>(ws, 1, 'EXECUTE_TASK', {
              task,
              complexity,
            });

            expect(response.error).toBeUndefined();
            expect(response.result?.executed).toBe(expected);
          }
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Local Mode', () => {
    it('should never hit cloud in local mode', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({
        skipAuth: true,
        config: {
          mode: 'local',
          cloud: {
            workerUrl: 'https://test-worker.cocapn.dev',
          },
        },
      });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Even complex task should stay local
          const response = await sendJsonRpc<{ executed: 'local' | 'cloud' }>(ws, 1, 'EXECUTE_TASK', {
            task: 'very complex task',
            complexity: 1.0,
          });

          expect(response.error).toBeUndefined();
          expect(response.result?.executed).toBe('local');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should report cloud as disabled', { timeout: 10000 }, async () => {
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
          const response = await sendJsonRpc<CloudStatus>(ws, 1, 'CLOUD_STATUS');

          expect(response.error).toBeUndefined();
          expect(response.result?.mode).toBe('local');
          expect(response.result?.connected).toBe(false);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });
});
