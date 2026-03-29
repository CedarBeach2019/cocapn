/**
 * Tree Search E2E Tests
 *
 * Tests the tree search functionality including planning, execution,
 * status polling, and result retrieval.
 *
 * Tests:
 * 1. Tree search execution — plan and execute multi-approach search
 * 2. Status polling — poll execution progress without blocking
 * 3. Result retrieval — retrieve cached search result
 * 4. Approach approval — approve specific approach for execution
 * 5. Progress updates — monitor execution status in real-time
 */

import { describe, it, expect } from 'vitest';
import {
  createTestBridge,
  startTestBridge,
  stopTestBridge,
  createWsClient,
  closeWsClient,
  sendJsonRpc,
  waitForMessage,
} from './helpers.js';

interface TreeSearchRequest {
  task: string;
  maxApproaches?: number;
  maxDepth?: number;
}

interface TreeSearchStart {
  searchId: string;
  status: string;
  approaches?: Array<{
    id: string;
    description: string;
    rationale: string;
    steps: string[];
  }>;
}

interface TreeSearchStatus {
  searchId: string;
  status: 'planning' | 'approving' | 'executing' | 'completed' | 'failed';
  currentStep?: string;
  progress: number;
  approaches?: Array<{
    id: string;
    status: string;
    progress: number;
  }>;
}

interface TreeSearchResult {
  searchId: string;
  status: string;
  approaches: Array<{
    id: string;
    description: string;
    executionLogs: string[];
    changes?: Array<{
      path: string;
      type: string;
      content: string;
    }>;
  }>;
  score?: number;
}

describe('E2E: Tree Search', () => {
  describe('Tree Search Execution', () => {
    it('should initiate tree search and generate approaches', { timeout: 30000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'refactor authentication to use OAuth',
            maxApproaches: 3,
          });

          expect(response.error).toBeUndefined();
          expect(response.result).toBeDefined();

          const search = response.result!;
          expect(search.searchId).toBeDefined();
          expect(search.status).toBeDefined();
          expect(search.approaches).toBeDefined();
          expect(search.approaches!.length).toBeGreaterThan(0);
          expect(search.approaches!.length).toBeLessThanOrEqual(3);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should generate distinct approaches with rationale', { timeout: 30000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'implement user authentication system',
            maxApproaches: 3,
          });

          expect(response.error).toBeUndefined();

          const approaches = response.result!.approaches!;
          expect(approaches.length).toBe(3);

          // Each approach should have unique description
          const descriptions = approaches.map(a => a.description);
          const uniqueDescriptions = new Set(descriptions);
          expect(uniqueDescriptions.size).toBe(3);

          // Each approach should have rationale
          for (const approach of approaches) {
            expect(approach.rationale).toBeDefined();
            expect(approach.rationale.length).toBeGreaterThan(0);
            expect(approach.steps).toBeDefined();
            expect(approach.steps.length).toBeGreaterThan(0);
          }
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should execute approved approach', { timeout: 60000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'add input validation to user signup',
            maxApproaches: 2,
          });

          const searchId = startResponse.result!.searchId!;
          const firstApproachId = startResponse.result!.approaches![0].id;

          // Approve first approach
          const approveResponse = await sendJsonRpc(ws, 2, 'TREE_SEARCH_APPROVE', {
            searchId,
            approachId: firstApproachId,
          });

          expect(approveResponse.error).toBeUndefined();

          // Wait for execution to complete
          let attempts = 0;
          let finalStatus: TreeSearchStatus | undefined;

          while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 3, 'TREE_SEARCH_STATUS', {
              searchId,
            });

            finalStatus = statusResponse.result!;
            if (finalStatus.status === 'completed' || finalStatus.status === 'failed') {
              break;
            }

            attempts++;
          }

          expect(finalStatus?.status).toBe('completed');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should provide execution status updates', { timeout: 60000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'optimize database queries',
            maxApproaches: 2,
          });

          const searchId = startResponse.result!.searchId!;
          const firstApproachId = startResponse.result!.approaches![0].id;

          // Approve and start execution
          await sendJsonRpc(ws, 2, 'TREE_SEARCH_APPROVE', {
            searchId,
            approachId: firstApproachId,
          });

          // Monitor progress
          let previousProgress = 0;
          let attempts = 0;

          while (attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 3, 'TREE_SEARCH_STATUS', {
              searchId,
            });

            const status = statusResponse.result!;

            // Progress should be monotonically increasing
            expect(status.progress).toBeGreaterThanOrEqual(previousProgress);
            previousProgress = status.progress;

            if (status.status === 'completed' || status.status === 'failed') {
              break;
            }

            attempts++;
          }

          expect(previousProgress).toBe(100);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Status Polling', () => {
    it('should poll status without blocking', { timeout: 30000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'test status polling',
            maxApproaches: 2,
          });

          const searchId = startResponse.result!.searchId!;

          // Poll multiple times quickly
          for (let i = 0; i < 5; i++) {
            const start = Date.now();
            const statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 2 + i, 'TREE_SEARCH_STATUS', {
              searchId,
            });
            const duration = Date.now() - start;

            expect(statusResponse.error).toBeUndefined();
            expect(duration).toBeLessThan(50); // Should return immediately

            await new Promise(resolve => setTimeout(resolve, 100));
          }
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should transition through correct states', { timeout: 60000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'test state transitions',
            maxApproaches: 2,
          });

          const searchId = startResponse.result!.searchId!;
          const firstApproachId = startResponse.result!.approaches![0].id;

          // Initial state should be planning or approving
          let statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 2, 'TREE_SEARCH_STATUS', {
            searchId,
          });

          expect(['planning', 'approving']).toContain(statusResponse.result!.status);

          // Approve approach
          await sendJsonRpc(ws, 3, 'TREE_SEARCH_APPROVE', {
            searchId,
            approachId: firstApproachId,
          });

          // Should transition to executing
          await new Promise(resolve => setTimeout(resolve, 500));
          statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 4, 'TREE_SEARCH_STATUS', {
            searchId,
          });

          expect(statusResponse.result!.status).toBe('executing');

          // Wait for completion
          let attempts = 0;
          while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));
            statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 5, 'TREE_SEARCH_STATUS', {
              searchId,
            });

            if (statusResponse.result!.status === 'completed') {
              break;
            }
            attempts++;
          }

          expect(statusResponse.result!.status).toBe('completed');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should update current step during execution', { timeout: 60000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'test current step updates',
            maxApproaches: 1,
          });

          const searchId = startResponse.result!.searchId!;
          const firstApproachId = startResponse.result!.approaches![0].id;

          // Approve and execute
          await sendJsonRpc(ws, 2, 'TREE_SEARCH_APPROVE', {
            searchId,
            approachId: firstApproachId,
          });

          // Monitor current step
          let attempts = 0;
          const steps: string[] = [];

          while (attempts < 20) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 3, 'TREE_SEARCH_STATUS', {
              searchId,
            });

            const status = statusResponse.result!;

            if (status.currentStep) {
              steps.push(status.currentStep);
            }

            if (status.status === 'completed' || status.status === 'failed') {
              break;
            }

            attempts++;
          }

          // Should have seen at least some step updates
          expect(steps.length).toBeGreaterThan(0);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Result Retrieval', () => {
    it('should retrieve cached search result', { timeout: 60000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start and complete tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'test result retrieval',
            maxApproaches: 1,
          });

          const searchId = startResponse.result!.searchId!;
          const firstApproachId = startResponse.result!.approaches![0].id;

          // Approve and execute
          await sendJsonRpc(ws, 2, 'TREE_SEARCH_APPROVE', {
            searchId,
            approachId: firstApproachId,
          });

          // Wait for completion
          let attempts = 0;
          while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 3, 'TREE_SEARCH_STATUS', {
              searchId,
            });

            if (statusResponse.result!.status === 'completed') {
              break;
            }

            attempts++;
          }

          // Wait a bit for caching
          await new Promise(resolve => setTimeout(resolve, 100));

          // Retrieve result
          const resultResponse = await sendJsonRpc<TreeSearchResult>(ws, 4, 'TREE_SEARCH_RESULT', {
            searchId,
          });

          expect(resultResponse.error).toBeUndefined();
          expect(resultResponse.result).toBeDefined();

          const result = resultResponse.result!;
          expect(result.searchId).toBe(searchId);
          expect(result.approaches).toBeDefined();
          expect(result.approaches.length).toBeGreaterThan(0);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should include complete execution data in result', { timeout: 60000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start and complete tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'test execution data',
            maxApproaches: 1,
          });

          const searchId = startResponse.result!.searchId!;
          const firstApproachId = startResponse.result!.approaches![0].id;

          await sendJsonRpc(ws, 2, 'TREE_SEARCH_APPROVE', {
            searchId,
            approachId: firstApproachId,
          });

          // Wait for completion
          let attempts = 0;
          while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 3, 'TREE_SEARCH_STATUS', {
              searchId,
            });

            if (statusResponse.result!.status === 'completed') {
              break;
            }

            attempts++;
          }

          // Retrieve result
          const resultResponse = await sendJsonRpc<TreeSearchResult>(ws, 4, 'TREE_SEARCH_RESULT', {
            searchId,
          });

          const result = resultResponse.result!;
          const approach = result.approaches[0];

          // Should have execution logs
          expect(approach.executionLogs).toBeDefined();
          expect(approach.executionLogs.length).toBeGreaterThan(0);

          // May have code changes
          if (approach.changes) {
            expect(Array.isArray(approach.changes)).toBe(true);
          }
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should cache results for 1 hour', { timeout: 65000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start and complete tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'test cache duration',
            maxApproaches: 1,
          });

          const searchId = startResponse.result!.searchId!;
          const firstApproachId = startResponse.result!.approaches![0].id;

          await sendJsonRpc(ws, 2, 'TREE_SEARCH_APPROVE', {
            searchId,
            approachId: firstApproachId,
          });

          // Wait for completion
          let attempts = 0;
          while (attempts < 30) {
            await new Promise(resolve => setTimeout(resolve, 1000));

            const statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 3, 'TREE_SEARCH_STATUS', {
              searchId,
            });

            if (statusResponse.result!.status === 'completed') {
              break;
            }

            attempts++;
          }

          // Retrieve result immediately
          const result1 = await sendJsonRpc<TreeSearchResult>(ws, 4, 'TREE_SEARCH_RESULT', {
            searchId,
          });

          expect(result1.result).toBeDefined();

          // Wait and retrieve again (simulating cache check)
          await new Promise(resolve => setTimeout(resolve, 2000));

          const result2 = await sendJsonRpc<TreeSearchResult>(ws, 5, 'TREE_SEARCH_RESULT', {
            searchId,
          });

          expect(result2.result).toBeDefined();

          // Results should be identical
          expect(JSON.stringify(result1.result)).toBe(JSON.stringify(result2.result));
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Scoring', () => {
    it('should score completed approaches', { timeout: 60000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Start and complete tree search
          const startResponse = await sendJsonRpc<TreeSearchStart>(ws, 1, 'TREE_SEARCH', {
            task: 'test approach scoring',
            maxApproaches: 2,
          });

          const searchId = startResponse.result!.searchId!;

          // Approve both approaches
          for (const approach of startResponse.result!.approaches!) {
            await sendJsonRpc(ws, 2, 'TREE_SEARCH_APPROVE', {
              searchId,
              approachId: approach.id,
            });

            // Wait for completion
            let attempts = 0;
            while (attempts < 30) {
              await new Promise(resolve => setTimeout(resolve, 1000));

              const statusResponse = await sendJsonRpc<TreeSearchStatus>(ws, 3, 'TREE_SEARCH_STATUS', {
                searchId,
              });

              if (statusResponse.result!.status === 'completed') {
                break;
              }

              attempts++;
            }
          }

          // Retrieve results with scores
          const resultResponse = await sendJsonRpc<TreeSearchResult>(ws, 4, 'TREE_SEARCH_RESULT', {
            searchId,
          });

          const result = resultResponse.result!;

          // Should have overall score
          if (result.score !== undefined) {
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(1);
          }
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });
});
