/**
 * Tests for enhanced graceful shutdown — signal handlers, draining, error recovery.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

import { BridgeServer } from '../../src/ws/server.js';

import type { BridgeConfig } from '../../src/config/types.js';

function makeConfig(): BridgeConfig {
  return {
    config: { mode: 'local' as const, port: 0 },
    soul: '',
    memory: { facts: 'cocapn/memory/facts.json', wiki: 'cocapn/wiki' },
    llm: { providers: {} },
  } as BridgeConfig;
}

function makeServerOptions() {
  return {
    config: makeConfig(),
    router: {} as any,
    spawner: { stopAll: vi.fn() } as any,
    sync: {} as any,
    repoRoot: '/tmp',
    skipAuth: true as any,
    cloudAdapters: undefined,
    moduleManager: undefined,
    fleetKey: undefined,
    brain: undefined,
    skillLoader: undefined,
    decisionTree: undefined,
  };
}

describe('Bridge signal handlers', () => {
  it('should have registerSignalHandlers on Bridge prototype', async () => {
    const { Bridge } = await import('../../src/bridge.js');
    expect(typeof Bridge.prototype.registerSignalHandlers).toBe('function');
  });
});

describe('BridgeServer connection draining', () => {
  it('should reject new connections when draining is true', async () => {
    const server = new BridgeServer(makeServerOptions());

    // Set draining flag
    (server as any).draining = true;

    const mockWs = {
      close: vi.fn(),
      send: vi.fn(),
    };

    await (server as any).authenticateAndConnect(mockWs, {} as any, 'test-client');

    expect(mockWs.close).toHaveBeenCalledWith(1001, 'Server is shutting down');
  });

  it('should send close code 1001 during shutdown', async () => {
    const server = new BridgeServer(makeServerOptions());

    const mockClients = [
      { send: vi.fn(), close: vi.fn() },
      { send: vi.fn(), close: vi.fn() },
    ];

    // Use a Set that simulates client removal on close
    const clientSet = new Set(mockClients);
    for (const client of mockClients) {
      (client.close as ReturnType<typeof vi.fn>).mockImplementation(() => {
        clientSet.delete(client);
      });
    }

    (server as any).wss = {
      clients: clientSet,
      close: vi.fn((cb: () => void) => cb()),
    };

    await server.shutdown();

    for (const client of mockClients) {
      expect(client.close).toHaveBeenCalledWith(1001, 'Server shutting down');
      expect(client.send).toHaveBeenCalledWith(
        JSON.stringify({ type: 'SHUTDOWN', message: 'Bridge is shutting down' }),
      );
    }
  });

  it('should be a no-op when wss is null', async () => {
    const server = new BridgeServer(makeServerOptions());
    (server as any).wss = null;

    // Should not throw
    await server.shutdown();
  });
});

describe('Brain lock release', () => {
  it('should have releaseLock method on Brain', async () => {
    const { Brain } = await import('../../src/brain/index.js');
    expect(typeof Brain.prototype.releaseLock).toBe('function');
  });
});

describe('Shutdown idempotency', () => {
  it('should handle double-shutdown gracefully', async () => {
    const server = new BridgeServer(makeServerOptions());

    (server as any).wss = {
      clients: new Set(),
      close: vi.fn((cb: () => void) => cb()),
    };

    // First shutdown
    await server.shutdown();

    // wss is null after first shutdown, second should be no-op
    await server.shutdown();
  });

});
