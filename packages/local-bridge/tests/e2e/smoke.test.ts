/**
 * Smoke Test — Quick Health Check
 *
 * Runs basic end-to-end tests to verify the bridge is functioning.
 * Should complete in under 10 seconds.
 *
 * Tests:
 * 1. Bridge starts successfully
 * 2. Bridge status is accessible
 * 3. WebSocket connection works
 * 4. Bridge shuts down cleanly
 */

import { describe, it, expect } from 'vitest';
import {
  createTestBridge,
  startTestBridge,
  stopTestBridge,
  createWsClient,
  closeWsClient,
  sendJsonRpc,
  assertBridgeStatus,
} from './helpers.js';

describe('E2E: Smoke Test', () => {
  it('should start bridge and verify status', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);

      try {
        await assertBridgeStatus(ws, bridge.port);
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should respond to bridge/status with correct port', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);

      try {
        const response = await sendJsonRpc<{ port: number }>(ws, 1, 'bridge/status');

        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
        expect(response.result?.port).toBe(bridge.port);
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should respond to bridge/agents with empty list', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);

      try {
        const response = await sendJsonRpc<unknown[]>(ws, 2, 'bridge/agents');

        expect(response.error).toBeUndefined();
        expect(response.result).toBeDefined();
        expect(Array.isArray(response.result)).toBe(true);
        expect(response.result).toHaveLength(0);
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should return error for unknown method', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);

      try {
        const response = await sendJsonRpc(ws, 3, 'bridge/nonexistent');

        expect(response.result).toBeUndefined();
        expect(response.error).toBeDefined();
        expect(response.error?.code).toBe(-32601); // Method not found
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should return error for invalid JSON', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);

      try {
        // Skip the welcome message
        ws.once('message', () => {});

        const response = await new Promise<{ error: { code: number } }>((resolve) => {
          ws.once('message', (data) => {
            resolve(JSON.parse(data.toString()) as { error: { code: number } });
          });
          ws.send('not json {{');
        });

        expect(response.error).toBeDefined();
        expect(response.error.code).toBe(-32700); // Parse error
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should handle multiple sequential requests', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);

      try {
        // Send multiple requests in sequence
        const statusResponse = await sendJsonRpc(ws, 1, 'bridge/status');
        expect(statusResponse.error).toBeUndefined();

        const agentsResponse = await sendJsonRpc(ws, 2, 'bridge/agents');
        expect(agentsResponse.error).toBeUndefined();

        const sessionsResponse = await sendJsonRpc(ws, 3, 'bridge/sessions');
        expect(sessionsResponse.error).toBeUndefined();

        const syncResponse = await sendJsonRpc(ws, 4, 'bridge/sync');
        expect(syncResponse.error).toBeUndefined();
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });
});
