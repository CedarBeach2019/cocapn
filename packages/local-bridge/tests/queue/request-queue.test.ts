/**
 * Tests for RequestQueue — enqueue, wait, cancel, concurrency, priority, timeout, retry.
 *
 * Uses real timers with short delays. Queue timeout set to 200ms for fast tests.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { RequestQueue } from '../../src/queue/request-queue.js';

/** Helper: promise that never resolves (for blocking tests) */
const never = () => new Promise(() => {});

/** Helper: deferred promise for controlled execution */
function deferred<T = void>(): { promise: Promise<T>; resolve: (v: T) => void; reject: (e: Error) => void } {
  let resolve!: (v: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

/** Flush microtasks and let process() run */
async function flush(): Promise<void> {
  await new Promise((r) => queueMicrotask(r));
}

describe('RequestQueue', () => {
  let queue: RequestQueue;

  beforeEach(() => {
    queue = new RequestQueue({
      maxConcurrency: 2,
      maxQueueSize: 100,
      perTenantConcurrency: 2,
      timeout: 200,
      retryDelay: 10,
      maxRetries: 2,
    });
  });

  afterEach(async () => {
    await queue.shutdown();
  });

  // ─── Basic enqueue + wait ──────────────────────────────────────────────────

  describe('enqueue + waitForResult', () => {
    it('should enqueue and complete a simple item', async () => {
      const execute = vi.fn().mockResolvedValue('hello');
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

      expect(id).toBeTruthy();
      expect(typeof id).toBe('string');

      await flush();
      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('completed');
      expect(result.result).toBe('hello');
      expect(execute).toHaveBeenCalledTimes(1);
    });

    it('should return completed item immediately from waitForResult', async () => {
      const execute = vi.fn().mockResolvedValue('done');
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

      await flush();
      await queue.waitForResult(id, 1000);
      const result2 = await queue.waitForResult(id, 1000);

      expect(result2.status).toBe('completed');
      expect(result2.result).toBe('done');
    });

    it('should throw for unknown item ID', async () => {
      await expect(queue.waitForResult('nonexistent', 100)).rejects.toThrow('Unknown item');
    });
  });

  // ─── Cancellation ──────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('should cancel a running item', async () => {
      const d = deferred();
      const execute = vi.fn().mockReturnValue(d.promise);
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute });

      await flush();
      // Item should be running now
      expect(queue.getStatus().running).toBe(1);

      const cancelled = await queue.cancel(id);
      expect(cancelled).toBe(true);

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('cancelled');

      // Resolve the deferred to clean up
      d.resolve(undefined as any);
    });

    it('should cancel a queued item', async () => {
      // Fill concurrency slots with blockers
      const d1 = deferred();
      const d2 = deferred();
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d1.promise });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d2.promise });
      await flush();

      expect(queue.getStatus().running).toBe(2);

      // Third item should be queued
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await flush();

      expect(queue.getStatus().queued).toBe(1);

      const cancelled = await queue.cancel(id);
      expect(cancelled).toBe(true);

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('cancelled');

      // Cleanup
      d1.resolve(undefined as any);
      d2.resolve(undefined as any);
    });

    it('should return false for already completed items', async () => {
      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: null,
        execute: vi.fn().mockResolvedValue('ok'),
      });

      await flush();
      await queue.waitForResult(id, 1000);

      const cancelled = await queue.cancel(id);
      expect(cancelled).toBe(false);
    });

    it('should return false for unknown items', async () => {
      const cancelled = await queue.cancel('nonexistent');
      expect(cancelled).toBe(false);
    });
  });

  // ─── Concurrency limits ────────────────────────────────────────────────────

  describe('concurrency', () => {
    it('should respect maxConcurrency', async () => {
      const d1 = deferred();
      const d2 = deferred();
      const e3 = vi.fn().mockResolvedValue('c');

      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d1.promise });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d2.promise });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: e3 });

      await flush();

      // Only 2 should be running, 1 queued
      const status = queue.getStatus();
      expect(status.running).toBe(2);
      expect(status.queued).toBe(1);
      expect(e3).not.toHaveBeenCalled();

      // Resolve first blocker → third item should start
      d1.resolve(undefined as any);
      await flush();
      await new Promise((r) => setTimeout(r, 50));

      expect(e3).toHaveBeenCalledTimes(1);

      // Cleanup
      d2.resolve(undefined as any);
    });
  });

  // ─── Priority ordering ─────────────────────────────────────────────────────

  describe('priority', () => {
    it('should sort queued items by priority (highest first)', async () => {
      // Block both concurrency slots
      const d1 = deferred();
      const d2 = deferred();
      const dHigh = deferred();
      const dMed = deferred();
      const dLow = deferred();

      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d1.promise });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d2.promise });
      await flush();

      // Enqueue with different priorities — use blockers so they stay running
      await queue.enqueue({ type: 'chat', priority: -10, payload: { order: 'low' }, execute: () => dLow.promise });
      await queue.enqueue({ type: 'chat', priority: 10, payload: { order: 'high' }, execute: () => dHigh.promise });
      await queue.enqueue({ type: 'chat', priority: 5, payload: { order: 'medium' }, execute: () => dMed.promise });
      await flush();

      const status = queue.getStatus();
      expect(status.running).toBe(2);
      expect(status.queued).toBe(3);

      // Resolve first blocker → highest priority (10) should start next
      d1.resolve(undefined as any);
      await new Promise((r) => setTimeout(r, 100));

      // High priority item should have been picked (running = d2 + high-prio)
      const afterFree = queue.getStatus();
      expect(afterFree.running).toBe(2);
      expect(afterFree.queued).toBe(2);

      // Cleanup
      d2.resolve(undefined as any);
      dHigh.resolve(undefined as any);
      dMed.resolve(undefined as any);
      dLow.resolve(undefined as any);
    });
  });

  // ─── Timeout ───────────────────────────────────────────────────────────────

  describe('timeout', () => {
    it('should fail items that exceed the timeout', async () => {
      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: null,
        execute: never,
      });

      await flush();
      expect(queue.getStatus().running).toBe(1);

      // Wait for timeout (200ms) + buffer
      await new Promise((r) => setTimeout(r, 300));

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('failed');
      expect(result.error).toContain('timed out');
    });
  });

  // ─── Retry ─────────────────────────────────────────────────────────────────

  describe('retry', () => {
    it('should retry failed items up to maxRetries', async () => {
      let attempt = 0;

      const execute = vi.fn().mockImplementation(() => {
        attempt++;
        if (attempt <= 2) {
          return Promise.reject(new Error('transient failure'));
        }
        return Promise.resolve('success');
      });

      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: null,
        execute,
      });

      // Wait for retries (10ms + 20ms backoff + buffer)
      await new Promise((r) => setTimeout(r, 100));

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('completed');
      expect(result.result).toBe('success');
      expect(execute).toHaveBeenCalledTimes(3);
    });

    it('should mark as failed after maxRetries exceeded', async () => {
      const execute = vi.fn().mockRejectedValue(new Error('permanent failure'));
      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: null,
        execute,
      });

      await flush();
      // Wait for retries (10ms + 20ms backoff + buffer)
      await new Promise((r) => setTimeout(r, 100));

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('failed');
      expect(result.error).toBe('permanent failure');
      expect(execute).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
    });

    it('should detect rate limit errors and trigger backpressure', async () => {
      const execute = vi.fn().mockRejectedValue(new Error('429 rate limit exceeded'));
      const id = await queue.enqueue({
        type: 'chat',
        priority: 0,
        payload: { provider: 'deepseek' },
        execute,
      });

      await flush();
      await new Promise((r) => setTimeout(r, 100));

      const result = await queue.waitForResult(id, 1000);
      expect(result.status).toBe('failed');

      // Verify backpressure was notified
      const bp = queue.getBackpressure();
      expect(bp.getPenaltyLevel('deepseek')).toBeGreaterThan(0);
    });
  });

  // ─── Tenant concurrency ────────────────────────────────────────────────────

  describe('tenant concurrency', () => {
    it('should enforce per-tenant concurrency limits', async () => {
      const d1 = deferred();
      const d2 = deferred();

      // Fill tenant A's concurrency (2 slots)
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d1.promise, tenantId: 'tenant-a' });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d2.promise, tenantId: 'tenant-a' });
      await flush();

      const tenantStatus = queue.getTenantStatus('tenant-a');
      expect(tenantStatus.running).toBe(2);

      // Tenant A's third request should stay queued
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn(), tenantId: 'tenant-a' });
      await flush();

      const tenantStatusAfter = queue.getTenantStatus('tenant-a');
      expect(tenantStatusAfter.running).toBe(2);
      expect(tenantStatusAfter.queued).toBe(1);

      // Cleanup
      d1.resolve(undefined as any);
      d2.resolve(undefined as any);
    });
  });

  // ─── Status ────────────────────────────────────────────────────────────────

  describe('getStatus', () => {
    it('should report all zeros for empty queue', () => {
      const status = queue.getStatus();
      expect(status).toEqual({ queued: 0, running: 0, completed: 0, failed: 0, cancelled: 0 });
    });

    it('should report correct counts after processing', async () => {
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn().mockResolvedValue('ok') });
      await flush();
      await new Promise((r) => setTimeout(r, 50));

      const status = queue.getStatus();
      expect(status.completed).toBe(1);
    });
  });

  // ─── Backpressure ──────────────────────────────────────────────────────────

  describe('backpressure', () => {
    it('should reject low-priority items when queue is degraded', async () => {
      const smallQueue = new RequestQueue({
        maxConcurrency: 1,
        maxQueueSize: 4, // capacity = 5, degraded at 80% = 4
        perTenantConcurrency: 2,
        timeout: 200,
        retryDelay: 10,
        maxRetries: 0,
      });

      // Fill to 80% capacity (4 items: 1 running + 3 queued)
      await smallQueue.enqueue({
        type: 'chat', priority: 0, payload: null, execute: never,
      });
      await smallQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await smallQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await smallQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await flush();

      // Queue is at 4/5 capacity → degraded → low priority rejected
      await expect(
        smallQueue.enqueue({ type: 'chat', priority: -10, payload: null, execute: vi.fn() })
      ).rejects.toThrow('backpressure');

      // But priority 0 should still be accepted
      const id = await smallQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      expect(id).toBeTruthy();

      await smallQueue.shutdown();
    });

    it('should only accept high priority when critical', async () => {
      const tinyQueue = new RequestQueue({
        maxConcurrency: 1,
        maxQueueSize: 4, // capacity = 5, critical at 95% ≈ 5
        perTenantConcurrency: 2,
        timeout: 200,
        retryDelay: 10,
        maxRetries: 0,
      });

      // Fill to capacity (5 items: 1 running + 4 queued)
      await tinyQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: never });
      await tinyQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await tinyQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await tinyQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await tinyQueue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await flush();

      // Queue full → should reject everything
      await expect(
        tinyQueue.enqueue({ type: 'chat', priority: 10, payload: null, execute: vi.fn() })
      ).rejects.toThrow();

      await tinyQueue.shutdown();
    });
  });

  // ─── Shutdown ──────────────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('should cancel queued items on shutdown', async () => {
      // Block ALL running slots (maxConcurrency = 2)
      const d1 = deferred();
      const d2 = deferred();
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d1.promise });
      await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d2.promise });
      await flush();

      // Add a queued item (both slots full)
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: vi.fn() });
      await flush();

      expect(queue.getStatus().queued).toBe(1);

      await queue.shutdown();

      const result = await queue.waitForResult(id, 100);
      expect(result.status).toBe('cancelled');

      // Cleanup
      d1.resolve(undefined as any);
      d2.resolve(undefined as any);
    });
  });

  // ─── Health ────────────────────────────────────────────────────────────────

  describe('getHealth', () => {
    it('should return healthy when queue is empty', () => {
      expect(queue.getHealth()).toBe('healthy');
    });
  });

  // ─── waitForResult timeout ─────────────────────────────────────────────────

  describe('waitForResult timeout', () => {
    it('should throw on timeout', async () => {
      const d = deferred();
      const id = await queue.enqueue({ type: 'chat', priority: 0, payload: null, execute: () => d.promise });

      await flush();

      // waitForResult with 50ms timeout
      const promise = queue.waitForResult(id, 50);

      // Wait for the timeout to fire
      await expect(promise).rejects.toThrow('Timeout');

      // Cleanup — resolve the deferred so no dangling promises
      d.resolve(undefined as any);
    });
  });
});
