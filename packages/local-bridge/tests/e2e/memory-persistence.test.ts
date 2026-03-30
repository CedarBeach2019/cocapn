/**
 * Memory Persistence E2E Tests (Phase 16.5)
 *
 * Tests that facts stored via MEMORY_ADD persist across bridge restarts.
 * Uses a real Brain (on-disk JSON file) — not mocks or in-memory stores.
 *
 * Flow:
 *   1. Start BridgeServer with Brain wired in
 *   2. Store facts via MEMORY_ADD typed message
 *   3. Verify via MEMORY_LIST
 *   4. Stop bridge (keep repo directory on disk)
 *   5. Start NEW BridgeServer with same repo
 *   6. Query MEMORY_LIST — verify facts survived the restart
 *
 * Also tests ConversationMemory heuristic extraction (regex-based fact
 * extraction that works without an LLM).
 */

import { describe, it, expect } from 'vitest';
import {
  createTestBridgeWithBrain,
  startTestBridge,
  stopTestBridge,
  stopBridgeNoCleanup,
  createWsClient,
  closeWsClient,
  sendTypedMessage,
} from './helpers.js';

interface MemoryAddResponse {
  type: string;
  id: string;
  key: string;
  value: string;
  ok: boolean;
  error?: string;
}

interface MemoryListResponse {
  type: string;
  id: string;
  facts: Array<{ key: string; value: string }>;
  count: number;
}

describe('E2E: Memory Persistence', () => {
  describe('MEMORY_ADD / MEMORY_LIST round-trip', () => {
    it('should store and retrieve a single fact', { timeout: 10000 }, async () => {
      const bridge = await createTestBridgeWithBrain({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);
        try {
          const addResp = await sendTypedMessage<MemoryAddResponse>(
            ws,
            { type: 'MEMORY_ADD', id: 'm-1', key: 'user.name', value: 'Casey' },
            'MEMORY_ADD',
            5000,
          );
          expect(addResp.ok).toBe(true);
          expect(addResp.key).toBe('user.name');
          expect(addResp.value).toBe('Casey');

          const listResp = await sendTypedMessage<MemoryListResponse>(
            ws,
            { type: 'MEMORY_LIST', id: 'l-1' },
            'MEMORY_LIST',
            5000,
          );
          expect(listResp.count).toBe(1);
          expect(listResp.facts).toEqual([{ key: 'user.name', value: 'Casey' }]);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should accumulate multiple facts', { timeout: 10000 }, async () => {
      const bridge = await createTestBridgeWithBrain({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);
        try {
          await sendTypedMessage(ws,
            { type: 'MEMORY_ADD', id: 'a', key: 'user.name', value: 'Casey' },
            'MEMORY_ADD',
          );
          await sendTypedMessage(ws,
            { type: 'MEMORY_ADD', id: 'b', key: 'user.organization', value: 'Superinstance' },
            'MEMORY_ADD',
          );

          const listResp = await sendTypedMessage<MemoryListResponse>(
            ws,
            { type: 'MEMORY_LIST', id: 'l' },
            'MEMORY_LIST',
            5000,
          );
          expect(listResp.count).toBe(2);
          expect(listResp.facts.some(f => f.key === 'user.name' && f.value === 'Casey')).toBe(true);
          expect(listResp.facts.some(f => f.key === 'user.organization' && f.value === 'Superinstance')).toBe(true);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });

    it('should reject MEMORY_ADD with missing key or value', { timeout: 10000 }, async () => {
      const bridge = await createTestBridgeWithBrain({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        const ws = await createWsClient(bridge.port);
        try {
          // Missing value
          const resp = await sendTypedMessage<{ type: string; error?: string }>(
            ws,
            { type: 'MEMORY_ADD', id: 'bad-1', key: 'user.name' },
            'MEMORY_ADD_ERROR',
            5000,
          );
          expect(resp.error).toContain('Missing');
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });

  describe('Persistence across bridge restart', () => {
    it('should persist facts after shutdown and restart', { timeout: 15000 }, async () => {
      // --- Phase 1: write facts ---
      const bridge1 = await createTestBridgeWithBrain({ skipAuth: true });
      await startTestBridge(bridge1);
      const repoDir = bridge1.repoDir;

      try {
        const ws1 = await createWsClient(bridge1.port);
        try {
          await sendTypedMessage(ws1,
            { type: 'MEMORY_ADD', id: 'p1a', key: 'user.name', value: 'Casey' },
            'MEMORY_ADD',
          );
          await sendTypedMessage(ws1,
            { type: 'MEMORY_ADD', id: 'p1b', key: 'user.organization', value: 'Superinstance' },
            'MEMORY_ADD',
          );

          // Verify before shutdown
          const list1 = await sendTypedMessage<MemoryListResponse>(
            ws1, { type: 'MEMORY_LIST', id: 'l1' }, 'MEMORY_LIST',
          );
          expect(list1.count).toBe(2);
        } finally {
          await closeWsClient(ws1);
        }
      } finally {
        // Stop bridge but keep repo directory
        await stopBridgeNoCleanup(bridge1);
      }

      // --- Phase 2: new bridge, same repo ---
      const bridge2 = await createTestBridgeWithBrain({ skipAuth: true, repoDir });
      await startTestBridge(bridge2);

      try {
        const ws2 = await createWsClient(bridge2.port);
        try {
          const list2 = await sendTypedMessage<MemoryListResponse>(
            ws2, { type: 'MEMORY_LIST', id: 'l2' }, 'MEMORY_LIST',
          );
          expect(list2.count).toBe(2);
          expect(list2.facts.some(f => f.key === 'user.name' && f.value === 'Casey')).toBe(true);
          expect(list2.facts.some(f => f.key === 'user.organization' && f.value === 'Superinstance')).toBe(true);
        } finally {
          await closeWsClient(ws2);
        }
      } finally {
        await stopTestBridge(bridge2);
      }
    });
  });

  describe('ConversationMemory heuristic extraction', () => {
    it('should extract name and organization from plain text', { timeout: 10000 }, async () => {
      const bridge = await createTestBridgeWithBrain({ skipAuth: true });
      await startTestBridge(bridge);

      try {
        // Use ConversationMemory directly — no agent needed
        // Note: period after "Casey" prevents the case-insensitive name regex
        // from capturing "Casey and" as a multi-word name
        const cm = bridge.conversationMemory!;
        const stored = await cm.extractAndStore(
          'My name is Casey. I work at Superinstance.',
          'Nice to meet you Casey! Superinstance is a great company.',
        );

        expect(stored).toContain('user.name');
        expect(stored).toContain('user.organization');

        // Verify via Brain API
        expect(bridge.brain!.getFact('user.name')).toBe('Casey');
        expect(bridge.brain!.getFact('user.organization')).toBe('Superinstance');

        // Verify via WebSocket MEMORY_LIST
        const ws = await createWsClient(bridge.port);
        try {
          const list = await sendTypedMessage<MemoryListResponse>(
            ws, { type: 'MEMORY_LIST', id: 'l-cm' }, 'MEMORY_LIST',
          );
          expect(list.count).toBeGreaterThanOrEqual(2);
          expect(list.facts.some(f => f.value === 'Casey')).toBe(true);
          expect(list.facts.some(f => f.value === 'Superinstance')).toBe(true);
        } finally {
          await closeWsClient(ws);
        }
      } finally {
        await stopTestBridge(bridge);
      }
    });
  });
});
