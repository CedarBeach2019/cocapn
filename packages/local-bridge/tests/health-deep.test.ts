/**
 * Tests for deep health checks and readiness endpoint.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HealthChecker } from '../src/health/index.js';
import type { HealthCheckFunction, SystemHealthStatus } from '../src/health/index.js';

describe('HealthChecker runDeep', () => {
  let healthChecker: HealthChecker;

  beforeEach(() => {
    healthChecker = new HealthChecker();
  });

  it('should run all checks with per-check latency tracking', async () => {
    const slowCheck: HealthCheckFunction = async () => {
      await new Promise((r) => setTimeout(r, 50));
      return { name: 'slow', status: 'ok' as const };
    };

    const fastCheck: HealthCheckFunction = async () => {
      return { name: 'fast', status: 'ok' as const };
    };

    healthChecker.addCheck('slow', slowCheck);
    healthChecker.addCheck('fast', fastCheck);

    const result = await healthChecker.runDeep();

    expect(result.checks).toHaveLength(2);
    expect(result.status).toBe('healthy');

    const slow = result.checks.find((c) => c.name === 'slow');
    const fast = result.checks.find((c) => c.name === 'fast');

    expect(slow?.latency).toBeGreaterThanOrEqual(40);
    expect(fast?.latency).toBeLessThan(slow!.latency!);
  });

  it('should report degraded when a check returns warn', async () => {
    healthChecker.addCheck('degraded-check', async () => ({
      name: 'degraded-check',
      status: 'warn' as const,
      message: 'Slow response',
    }));

    const result = await healthChecker.runDeep();
    expect(result.status).toBe('degraded');
  });

  it('should report unhealthy when a check returns error', async () => {
    healthChecker.addCheck('broken', async () => ({
      name: 'broken',
      status: 'error' as const,
      message: 'Connection refused',
    }));

    const result = await healthChecker.runDeep();
    expect(result.status).toBe('unhealthy');
  });

  it('should return healthy with empty checks when none registered', async () => {
    const result = await healthChecker.runDeep();

    expect(result.checks).toHaveLength(0);
    expect(result.status).toBe('healthy');
  });

  it('should skip disabled checks', async () => {
    healthChecker.addCheck('enabled', async () => ({
      name: 'enabled',
      status: 'ok' as const,
    }));
    healthChecker.addCheck('disabled', async () => ({
      name: 'disabled',
      status: 'ok' as const,
    }));
    healthChecker.disableCheck('disabled');

    const result = await healthChecker.runDeep();

    expect(result.checks).toHaveLength(1);
    expect(result.checks[0].name).toBe('enabled');
  });

  it('should include uptime and timestamp in result', async () => {
    await new Promise((r) => setTimeout(r, 5));
    const result = await healthChecker.runDeep();
    expect(result.uptime).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
  });

  it('should handle a check that throws an error', async () => {
    healthChecker.addCheck('flaky', async () => {
      throw new Error('Database connection lost');
    });

    const result = await healthChecker.runDeep();

    expect(result.status).toBe('unhealthy');
    const flaky = result.checks.find((c) => c.name === 'flaky');
    expect(flaky?.status).toBe('error');
    expect(flaky?.message).toContain('Database connection lost');
  });
});

describe('BridgeServer readiness', () => {
  it('should have isReady() returning false initially', async () => {
    const { BridgeServer } = await import('../src/ws/server.js');

    const server = new BridgeServer({
      config: {
        config: { mode: 'local', port: 0 },
        soul: '',
        memory: { facts: '', wiki: '' },
        llm: { providers: {} },
      } as any,
      router: {} as any,
      spawner: { stopAll: vi.fn() } as any,
      sync: {} as any,
      repoRoot: '/tmp',
      skipAuth: true,
      cloudAdapters: undefined,
      moduleManager: undefined,
      fleetKey: undefined,
      brain: undefined,
      skillLoader: undefined,
      decisionTree: undefined,
    });

    expect(server.isReady()).toBe(false);
  });

  it('should return true after markLLMReady() is called', async () => {
    const { BridgeServer } = await import('../src/ws/server.js');

    const server = new BridgeServer({
      config: {
        config: { mode: 'local', port: 0 },
        soul: '',
        memory: { facts: '', wiki: '' },
        llm: { providers: {} },
      } as any,
      router: {} as any,
      spawner: { stopAll: vi.fn() } as any,
      sync: {} as any,
      repoRoot: '/tmp',
      skipAuth: true,
      cloudAdapters: undefined,
      moduleManager: undefined,
      fleetKey: undefined,
      brain: undefined,
      skillLoader: undefined,
      decisionTree: undefined,
    });

    server.markLLMReady();
    expect(server.isReady()).toBe(true);
  });
});
