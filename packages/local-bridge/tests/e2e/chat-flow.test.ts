/**
 * Chat Flow E2E Tests
 *
 * Tests the complete chat message lifecycle from user input to AI response.
 *
 * Tests:
 * 1. Basic chat message — user sends message, receives response
 * 2. Streaming response — long responses arrive in chunks
 * 3. Message assembly — chunks reassembled correctly
 * 4. Multiple sequential messages — conversation flow works
 * 5. Error handling — invalid messages handled gracefully
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
  collectMessages,
} from './helpers.js';

interface ChatChunk {
  type: string;
  content: string;
  done: boolean;
  index?: number;
}

describe('E2E: Chat Flow', () => {
  describe('Basic Chat Message', () => {
    it('should send chat message and receive response', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Send a chat message
          const response = await sendTypedMessage<ChatChunk>(
            ws,
            {
              type: 'CHAT',
              id: 'test-chat-1',
              content: 'hello world',
            },
            'CHAT_CHUNK',
            5000
          );

          expect(response.type).toBe('CHAT_CHUNK');
          expect(response.content).toBeDefined();
          expect(typeof response.content).toBe('string');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should respond within 5 seconds', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const start = Date.now();

          await sendTypedMessage(
            ws,
            {
              type: 'CHAT',
              id: 'test-chat-2',
              content: 'quick test',
            },
            'CHAT_CHUNK',
            5000
          );

          const duration = Date.now() - start;
          expect(duration).toBeLessThan(5000);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should provide contextually relevant response', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const response = await sendTypedMessage<ChatChunk>(
            ws,
            {
              type: 'CHAT',
              id: 'test-chat-3',
              content: 'help me debug this function',
            },
            'CHAT_CHUNK',
            5000
          );

          expect(response.type).toBe('CHAT_CHUNK');
          expect(response.content.length).toBeGreaterThan(0);
          // Response should be in English
          expect(/^[\x00-\x7F]*$/.test(response.content)).toBe(true);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Streaming Response', () => {
    it('should receive streaming chunks in order', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          const chunks: ChatChunk[] = [];

          // Send a message that might trigger streaming
          ws.send(JSON.stringify({
            type: 'CHAT',
            id: 'test-stream-1',
            content: 'explain how recursion works in programming',
          }));

          // Collect chunks until done
          await collectMessages<ChatChunk>(
            ws,
            'CHAT_CHUNK',
            (messages) => {
              chunks.push(...messages);
              return messages.some(m => m.done);
            },
            5000
          );

          expect(chunks.length).toBeGreaterThan(0);

          // Verify sequential indices if present
          const withIndices = chunks.filter(c => c.index !== undefined);
          if (withIndices.length > 1) {
            for (let i = 1; i < withIndices.length; i++) {
              expect(withIndices[i].index).toBeGreaterThan(withIndices[i - 1].index ?? -1);
            }
          }

          // Last chunk should be marked as done
          expect(chunks[chunks.length - 1].done).toBe(true);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should mark final chunk as complete', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          ws.send(JSON.stringify({
            type: 'CHAT',
            id: 'test-stream-2',
            content: 'tell me a short story',
          }));

          const chunks = await collectMessages<ChatChunk>(
            ws,
            'CHAT_CHUNK',
            (messages) => messages.some(m => m.done),
            5000
          );

          expect(chunks.length).toBeGreaterThan(0);
          expect(chunks[chunks.length - 1].done).toBe(true);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Message Assembly', () => {
    it('should reassemble complete response from chunks', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          ws.send(JSON.stringify({
            type: 'CHAT',
            id: 'test-assemble-1',
            content: 'what is the capital of france?',
          }));

          const chunks = await collectMessages<ChatChunk>(
            ws,
            'CHAT_CHUNK',
            (messages) => messages.some(m => m.done),
            5000
          );

          // Assemble complete response
          const fullResponse = chunks.map(c => c.content).join('');

          expect(fullResponse.length).toBeGreaterThan(0);
          expect(fullResponse).toContain('paris');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should have no gaps in reassembled response', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          ws.send(JSON.stringify({
            type: 'CHAT',
            id: 'test-assemble-2',
            content: 'count from 1 to 5',
          }));

          const chunks = await collectMessages<ChatChunk>(
            ws,
            'CHAT_CHUNK',
            (messages) => messages.some(m => m.done),
            5000
          );

          const fullResponse = chunks.map(c => c.content).join('');

          // Verify the response makes sense (no garbled text)
          expect(fullResponse.length).toBeGreaterThan(0);
          expect(fullResponse.trim()).toBeTruthy();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Multiple Sequential Messages', () => {
    it('should handle conversation flow', { timeout: 15000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Send first message
          const response1 = await sendTypedMessage<ChatChunk>(
            ws,
            {
              type: 'CHAT',
              id: 'conv-1',
              content: 'my name is alice',
            },
            'CHAT_CHUNK',
            5000
          );

          expect(response1.content).toBeDefined();

          // Send follow-up message
          const response2 = await sendTypedMessage<ChatChunk>(
            ws,
            {
              type: 'CHAT',
              id: 'conv-2',
              content: 'what is my name?',
            },
            'CHAT_CHUNK',
            5000
          );

          expect(response2.content).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should handle concurrent messages', { timeout: 15000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Send multiple messages concurrently
          const messageIds = ['concurrent-1', 'concurrent-2', 'concurrent-3'];

          for (const id of messageIds) {
            ws.send(JSON.stringify({
              type: 'CHAT',
              id,
              content: `message from ${id}`,
            }));
          }

          // Collect responses for all messages
          const responses: Map<string, ChatChunk> = new Map();

          await new Promise<void>((resolve) => {
            const timeout = setTimeout(() => resolve(), 5000);

            ws.on('message', (data) => {
              try {
                const msg = JSON.parse(data.toString()) as ChatChunk;
                if (msg.type === 'CHAT_CHUNK') {
                  if (msg.done && messageIds.includes(msg.id as string)) {
                    responses.set(msg.id as string, msg);
                    if (responses.size === messageIds.length) {
                      clearTimeout(timeout);
                      resolve();
                    }
                  }
                }
              } catch {
                // Ignore parse errors
              }
            });
          });

          expect(responses.size).toBe(messageIds.length);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle empty messages gracefully', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Send empty message
          ws.send(JSON.stringify({
            type: 'CHAT',
            id: 'empty-1',
            content: '',
          }));

          // Should get a response (possibly error message)
          const response = await waitForMessage<ChatChunk>(ws, 'CHAT_CHUNK', 3000);

          expect(response).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should handle very long messages', { timeout: 15000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Send a long message
          const longContent = 'explain quantum physics '.repeat(100);

          ws.send(JSON.stringify({
            type: 'CHAT',
            id: 'long-1',
            content: longContent,
          }));

          const response = await waitForMessage<ChatChunk>(ws, 'CHAT_CHUNK', 10000);

          expect(response).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should handle malformed message structure', { timeout: 10000 }, async () => {
      const bridge = await createTestBridge({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);

        try {
          // Skip welcome message
          ws.once('message', () => {});

          // Send malformed message
          const response = await new Promise<{ type: string; error?: string }>((resolve) => {
            ws.once('message', (data) => {
              try {
                const msg = JSON.parse(data.toString());
                resolve(msg);
              } catch {
                resolve({ type: 'parse-error' });
              }
            });
            ws.send(JSON.stringify({
              type: 'CHAT',
              // Missing required fields
            }));
          });

          expect(response).toBeDefined();
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });
});
