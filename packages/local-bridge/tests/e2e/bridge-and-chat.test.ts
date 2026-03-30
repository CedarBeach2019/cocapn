/**
 * Bridge & Chat E2E Tests (Phase 16.5)
 *
 * Tests the real WebSocket → dispatcher → ChatHandler → response pipeline.
 * No agents are registered, so CHAT responses contain an error message —
 * but the full protocol round-trip is verified: typed message dispatch,
 * handler invocation, and CHAT_STREAM response format.
 *
 * These tests prove the transport and routing work end-to-end without
 * requiring a running AI agent.
 */

import { describe, it, expect } from 'vitest';
import {
  createTestBridge,
  startTestBridge,
  stopTestBridge,
  createWsClient,
  closeWsClient,
  sendTypedMessage,
  waitForMessage,
} from './helpers.js';

interface ChatStreamResponse {
  type: string;
  id: string;
  chunk: string;
  done: boolean;
  error?: string;
}

describe('E2E: Bridge and Chat', () => {
  it('should send CHAT and receive CHAT_STREAM response', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);
      try {
        const response = await sendTypedMessage<ChatStreamResponse>(
          ws,
          { type: 'CHAT', id: 'e2e-chat-1', content: 'Hello, world!' },
          'CHAT_STREAM',
          5000,
        );

        expect(response.type).toBe('CHAT_STREAM');
        expect(response.id).toBe('e2e-chat-1');
        expect(response.done).toBe(true);
        // No agents registered → expected error
        expect(response.error).toBeDefined();
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should reject empty content with explicit error', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);
      try {
        const response = await sendTypedMessage<ChatStreamResponse>(
          ws,
          { type: 'CHAT', id: 'e2e-empty', content: '' },
          'CHAT_STREAM',
          5000,
        );

        expect(response.type).toBe('CHAT_STREAM');
        expect(response.done).toBe(true);
        expect(response.error).toContain('Missing content');
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should handle multiple sequential CHAT messages', { timeout: 15000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws = await createWsClient(bridge.port);
      try {
        for (let i = 0; i < 3; i++) {
          const response = await sendTypedMessage<ChatStreamResponse>(
            ws,
            { type: 'CHAT', id: `e2e-seq-${i}`, content: `Message ${i}` },
            'CHAT_STREAM',
            5000,
          );

          expect(response.type).toBe('CHAT_STREAM');
          expect(response.id).toBe(`e2e-seq-${i}`);
          expect(response.done).toBe(true);
        }
      } finally {
        await closeWsClient(ws);
      }
    } finally {
      await stopTestBridge(bridge);
    }
  });

  it('should disconnect cleanly and accept new connections', { timeout: 10000 }, async () => {
    const bridge = await createTestBridge({ skipAuth: true });
    await startTestBridge(bridge);

    try {
      const ws1 = await createWsClient(bridge.port);
      await closeWsClient(ws1);

      // Bridge should still be running — accept a second connection
      const ws2 = await createWsClient(bridge.port);
      await closeWsClient(ws2);
    } finally {
      await stopTestBridge(bridge);
    }
  });
});
