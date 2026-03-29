/**
 * CloudConnector Tests
 *
 * Tests the cloud worker connection management, task submission, and heartbeat.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CloudConnector } from '../../src/cloud-bridge/connector.js';

describe('CloudConnector', () => {
  let connector: CloudConnector;
  let mockFetch: ReturnType<typeof vi.fn>;

  const mockConfig = {
    workerUrl: 'https://cocapn-agent.test.workers.dev',
    fleetJwtSecret: 'test-secret-key-32-bytes-long',
    instanceId: 'test-bridge-123',
    bridgeMode: 'hybrid' as const,
    heartbeatInterval: 1000,
  };

  beforeEach(() => {
    // Mock global fetch
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    if (connector) {
      connector.destroy();
    }
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create a connector with default values', () => {
      connector = new CloudConnector(mockConfig);

      const status = connector['status']; // access private property

      expect(status.workerUrl).toBe(mockConfig.workerUrl);
      expect(status.connected).toBe(false);
      expect(status.latency).toBe(null);
      expect(status.lastHeartbeat).toBe(null);
    });

    it('should use custom heartbeat interval', () => {
      const config = { ...mockConfig, heartbeatInterval: 5000 };
      connector = new CloudConnector(config);

      expect(connector['config'].heartbeatInterval).toBe(5000);
    });
  });

  describe('ping', () => {
    it('should return true when health check succeeds', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      connector = new CloudConnector(mockConfig);
      const result = await connector.ping();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockConfig.workerUrl}/api/health`,
        expect.objectContaining({
          method: 'GET',
        })
      );

      const status = await connector.getStatus();
      expect(status.connected).toBe(true);
      expect(status.latency).toBeGreaterThanOrEqual(0);
      expect(status.error).toBeUndefined();
    });

    it('should return true for degraded status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'degraded',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      connector = new CloudConnector(mockConfig);
      const result = await connector.ping();

      expect(result).toBe(true);
    });

    it('should return false when health check fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      connector = new CloudConnector(mockConfig);
      const result = await connector.ping();

      expect(result).toBe(false);

      const status = await connector.getStatus();
      expect(status.connected).toBe(false);
      expect(status.error).toBe('Network error');
    });

    it('should return false for non-OK responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
      });

      connector = new CloudConnector(mockConfig);
      const result = await connector.ping();

      expect(result).toBe(false);
    });

    it('should measure latency', async () => {
      mockFetch.mockImplementationOnce(async () => {
        // Simulate 100ms delay
        await new Promise(resolve => setTimeout(resolve, 100));
        return {
          ok: true,
          json: async () => ({
            status: 'healthy',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
          }),
        };
      });

      connector = new CloudConnector(mockConfig);
      await connector.ping();

      const status = await connector.getStatus();
      expect(status.latency).toBeGreaterThanOrEqual(100);
    });
  });

  describe('getStatus', () => {
    it('should return current status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      connector = new CloudConnector(mockConfig);
      await connector.ping();

      const status = await connector.getStatus();
      expect(status).toHaveProperty('connected');
      expect(status).toHaveProperty('workerUrl');
      expect(status).toHaveProperty('lastHeartbeat');
      expect(status).toHaveProperty('latency');
      expect(status).toHaveProperty('tasksQueued');
      expect(status).toHaveProperty('tasksCompleted');
    });

    it('should refresh status if heartbeat is stale', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      connector = new CloudConnector(mockConfig);
      await connector.ping();

      // Manually set lastHeartbeat to trigger refresh
      connector['status'].lastHeartbeat = Date.now() - mockConfig.heartbeatInterval - 1;

      mockFetch.mockClear();
      await connector.getStatus();

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('submitTask', () => {
    it('should submit task and return task ID', async () => {
      const mockTaskId = 'task-123';
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: mockTaskId,
          status: 'pending',
        }),
      });

      connector = new CloudConnector(mockConfig);
      const result = await connector.submitTask({
        type: 'test_task',
        payload: { foo: 'bar' },
      });

      expect(result.taskId).toBe(mockTaskId);
      expect(result.status).toBe('pending');

      expect(mockFetch).toHaveBeenCalledWith(
        `${mockConfig.workerUrl}/api/execute-task`,
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );

      // Verify JWT was generated
      const callArgs = mockFetch.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body).toEqual({
        type: 'test_task',
        payload: { foo: 'bar' },
      });

      const authHeader = callArgs[1].headers.Authorization;
      expect(authHeader).toMatch(/^Bearer /);
    });

    it('should track pending tasks', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: 'task-123',
          status: 'pending',
        }),
      });

      connector = new CloudConnector(mockConfig);
      await connector.submitTask({
        type: 'test_task',
        payload: {},
      });

      const status = await connector.getStatus();
      expect(status.tasksQueued).toBe(1);
    });

    it('should throw on submission failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        text: async () => 'Internal server error',
      });

      connector = new CloudConnector(mockConfig);

      await expect(connector.submitTask({
        type: 'test_task',
        payload: {},
      })).rejects.toThrow('Task submission failed');
    });
  });

  describe('getTaskResult', () => {
    it('should fetch task result', async () => {
      const mockResult = {
        taskId: 'task-123',
        status: 'completed',
        result: { output: 'success' },
        log: ['Step 1', 'Step 2'],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResult,
      });

      connector = new CloudConnector(mockConfig);
      const result = await connector.getTaskResult('task-123');

      expect(result).toEqual(mockResult);
      expect(mockFetch).toHaveBeenCalledWith(
        `${mockConfig.workerUrl}/api/tasks/status/task-123`,
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should update completed task count', async () => {
      // First submit a task
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: 'task-123',
          status: 'pending',
        }),
      });

      connector = new CloudConnector(mockConfig);
      await connector.submitTask({
        type: 'test_task',
        payload: {},
      });

      // Then mark it as completed
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: 'task-123',
          status: 'completed',
          log: [],
        }),
      });

      await connector.getTaskResult('task-123');

      const status = await connector.getStatus();
      expect(status.tasksCompleted).toBe(1);
      expect(status.tasksQueued).toBe(0);
    });

    it('should throw on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
        text: async () => 'Task not found',
      });

      connector = new CloudConnector(mockConfig);

      await expect(connector.getTaskResult('task-123'))
        .rejects.toThrow('Task result fetch failed');
    });
  });

  describe('submitTaskAndWait', () => {
    it('should wait for task completion', async () => {
      // Submit
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: 'task-123',
          status: 'pending',
        }),
      });

      connector = new CloudConnector(mockConfig);

      // Poll twice (running, then completed)
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            taskId: 'task-123',
            status: 'running',
            log: [],
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            taskId: 'task-123',
            status: 'completed',
            result: { output: 'done' },
            log: [],
          }),
        });

      const result = await connector.submitTaskAndWait({
        type: 'test_task',
        payload: {},
      }, { pollInterval: 10, timeout: 1000 });

      expect(result.status).toBe('completed');
      expect(result.result).toEqual({ output: 'done' });
    });

    it('should timeout if task does not complete', async () => {
      // Submit
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          taskId: 'task-123',
          status: 'pending',
        }),
      });

      connector = new CloudConnector(mockConfig);

      // Always return running
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          taskId: 'task-123',
          status: 'running',
          log: [],
        }),
      });

      await expect(connector.submitTaskAndWait({
        type: 'test_task',
        payload: {},
      }, { pollInterval: 10, timeout: 100 }))
        .rejects.toThrow('timed out');
    });
  });

  describe('heartbeat', () => {
    it('should start heartbeat loop', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      connector = new CloudConnector(mockConfig);
      connector.startHeartbeat();

      // Wait for initial + one periodic ping
      await new Promise(resolve => setTimeout(resolve, mockConfig.heartbeatInterval + 100));

      expect(mockFetch).toHaveBeenCalledTimes(2);

      connector.stopHeartbeat();
    });

    it('should stop heartbeat loop', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      connector = new CloudConnector(mockConfig);
      connector.startHeartbeat();

      // Stop immediately
      connector.stopHeartbeat();

      await new Promise(resolve => setTimeout(resolve, mockConfig.heartbeatInterval + 100));

      // Should only have initial ping
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('status change events', () => {
    it('should emit status changes', async () => {
      const listener = vi.fn();
      connector = new CloudConnector(mockConfig);
      connector.onStatusChange(listener);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      await connector.ping();

      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({
          connected: true,
        })
      );

      connector.offStatusChange(listener);
    });

    it('should handle multiple listeners', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      connector = new CloudConnector(mockConfig);
      connector.onStatusChange(listener1);
      connector.onStatusChange(listener2);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      await connector.ping();

      expect(listener1).toHaveBeenCalled();
      expect(listener2).toHaveBeenCalled();
    });
  });

  describe('hybrid mode', () => {
    it('should run quick tasks locally in hybrid mode', () => {
      connector = new CloudConnector({ ...mockConfig, bridgeMode: 'hybrid' });

      expect(connector.shouldRunLocally({ type: 'chat', payload: {} })).toBe(true);
      expect(connector.shouldRunLocally({ type: 'status', payload: {} })).toBe(true);
      expect(connector.shouldRunLocally({ type: 'fact_get', payload: {} })).toBe(true);
      expect(connector.shouldRunLocally({ type: 'fact_set', payload: {} })).toBe(true);
    });

    it('should send heavy tasks to cloud in hybrid mode', () => {
      connector = new CloudConnector({ ...mockConfig, bridgeMode: 'hybrid' });

      expect(connector.shouldRunLocally({ type: 'tree_search', payload: {} })).toBe(false);
      expect(connector.shouldRunLocally({ type: 'browser_automation', payload: {} })).toBe(false);
      expect(connector.shouldRunLocally({ type: 'knowledge_graph', payload: {} })).toBe(false);
      expect(connector.shouldRunLocally({ type: 'vector_search', payload: {} })).toBe(false);
    });

    it('should always run locally in local mode', () => {
      connector = new CloudConnector({ ...mockConfig, bridgeMode: 'local' });

      expect(connector.shouldRunLocally({ type: 'tree_search', payload: {} })).toBe(true);
      expect(connector.shouldRunLocally({ type: 'chat', payload: {} })).toBe(true);
    });

    it('should always run in cloud in cloud mode', () => {
      connector = new CloudConnector({ ...mockConfig, bridgeMode: 'cloud' });

      expect(connector.shouldRunLocally({ type: 'chat', payload: {} })).toBe(false);
      expect(connector.shouldRunLocally({ type: 'tree_search', payload: {} })).toBe(false);
    });
  });

  describe('destroy', () => {
    it('should clean up resources', () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          status: 'healthy',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
        }),
      });

      connector = new CloudConnector(mockConfig);
      connector.startHeartbeat();

      const listener = vi.fn();
      connector.onStatusChange(listener);

      connector.destroy();

      // Verify heartbeat is stopped
      expect(connector['heartbeatTimer']).toBe(null);

      // Verify listeners are cleared
      connector['notifyStatusChange']();
      expect(listener).not.toHaveBeenCalled();
    });
  });
});
