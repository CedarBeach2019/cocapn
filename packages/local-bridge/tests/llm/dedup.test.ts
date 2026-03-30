/**
 * Tests for LLM request deduplication, debouncing, and concurrency control.
 *
 * Uses mock injection via (router as any).providers to avoid network calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LLMRouter } from '../../src/llm/router.js';
import type { LLMProvider, ChatMessage, ChatResponse, ChatChunk } from '../../src/llm/provider.js';

// ─── Mock provider ──────────────────────────────────────────────────────────

function createMockProvider(name: string, latency = 50): LLMProvider {
  return {
    name,
    supports: (model: string) => {
      if (name === 'deepseek') return model.startsWith('deepseek');
      return model.startsWith(name);
    },
    chat: vi.fn(async (_messages: ChatMessage[], _options?: any) => {
      await new Promise((r) => setTimeout(r, latency));
      return {
        content: `response from ${name}`,
        model: name === 'deepseek' ? 'deepseek-chat' : name,
        usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      } satisfies ChatResponse;
    }),
    chatStream: vi.fn(async function* (_messages: ChatMessage[]): AsyncIterable<ChatChunk> {
      yield { type: 'content', text: `hello from ${name}` };
      yield { type: 'done', usage: { inputTokens: 10, outputTokens: 20 } };
    }),
  };
}

function createRouterWithMocks(providerCount = 1, latency = 50): LLMRouter {
  // Create router with minimal config to satisfy the constructor
  const router = new LLMRouter({
    providers: {},
    defaultModel: 'deepseek-chat',
  });

  // Inject mock providers
  const providers: LLMProvider[] = [];
  for (let i = 0; i < providerCount; i++) {
    providers.push(createMockProvider('deepseek', latency));
  }
  (router as any).providers = providers;

  return router;
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('LLMRouter deduplication', () => {
  let router: LLMRouter;

  beforeEach(() => {
    router = createRouterWithMocks(1, 50);
  });

  it('should deduplicate identical concurrent requests', async () => {
    const messages: ChatMessage[] = [
      { role: 'user', content: 'hello world' },
    ];

    // Fire two identical requests concurrently
    const [r1, r2] = await Promise.all([
      router.chat(messages),
      router.chat(messages),
    ]);

    // Both should get responses (dedup returns same promise)
    expect(r1.content).toBe('response from deepseek');
    expect(r2.content).toBe('response from deepseek');

    // Provider should only have been called once (dedup)
    const mockProvider = (router as any).providers[0] as LLMProvider;
    expect((mockProvider.chat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('should NOT deduplicate different requests', async () => {
    const msgs1: ChatMessage[] = [{ role: 'user', content: 'hello' }];
    const msgs2: ChatMessage[] = [{ role: 'user', content: 'world' }];

    const [r1, r2] = await Promise.all([
      router.chat(msgs1),
      router.chat(msgs2),
    ]);

    expect(r1.content).toBeDefined();
    expect(r2.content).toBeDefined();

    const mockProvider = (router as any).providers[0] as LLMProvider;
    expect((mockProvider.chat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });

  it('should allow sequential requests (dedup map clears after completion)', async () => {
    const messages: ChatMessage[] = [{ role: 'user', content: 'same prompt' }];

    const r1 = await router.chat(messages);
    const r2 = await router.chat(messages);

    expect(r1.content).toBe('response from deepseek');
    expect(r2.content).toBe('response from deepseek');

    // Both should execute (sequential, not concurrent)
    const mockProvider = (router as any).providers[0] as LLMProvider;
    expect((mockProvider.chat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(2);
  });
});

describe('LLMRouter concurrency control', () => {
  it('should reject requests when concurrency limit is reached', async () => {
    const router = createRouterWithMocks(1, 200);

    // Set max concurrency to 1 for this test
    (router as any).maxConcurrency = 1;

    // Manually set active requests to the limit
    (router as any).activeRequests = 1;

    const messages: ChatMessage[] = [{ role: 'user', content: 'overflow' }];

    await expect(router.chat(messages)).rejects.toThrow('concurrency limit');
  });

  it('should track active request count', () => {
    const router = createRouterWithMocks(1);

    expect(router.getActiveRequestCount()).toBe(0);
    expect(router.getDedupCount()).toBe(0);
  });

  it('should increment and decrement active requests around a call', async () => {
    const router = createRouterWithMocks(1, 30);

    // No active requests before
    expect(router.getActiveRequestCount()).toBe(0);

    // Call and await
    await router.chat([{ role: 'user', content: 'test' }]);

    // Should be back to 0 after
    expect(router.getActiveRequestCount()).toBe(0);
    expect(router.getDedupCount()).toBe(0);
  });
});

describe('LLMRouter status debounce', () => {
  let router: LLMRouter;

  beforeEach(() => {
    router = createRouterWithMocks(1);
  });

  it('should allow the first status query', () => {
    expect(router.shouldAllowStatusQuery()).toBe(true);
  });

  it('should debounce rapid status queries', () => {
    // First call allowed
    expect(router.shouldAllowStatusQuery()).toBe(true);
    // Second call immediately after should be debounced
    expect(router.shouldAllowStatusQuery()).toBe(false);
  });

  it('should allow status query after debounce period', async () => {
    router.shouldAllowStatusQuery(); // First call, allowed
    // Wait for debounce period
    await new Promise((r) => setTimeout(r, 110));
    expect(router.shouldAllowStatusQuery()).toBe(true);
  });
});

describe('LLMRouter dedup key computation', () => {
  it('should produce the same key for the same messages', async () => {
    const router = createRouterWithMocks(1);

    const messages: ChatMessage[] = [
      { role: 'user', content: 'identical prompt' },
    ];

    // Fire two concurrent requests with identical messages
    const promises = [
      router.chat(messages),
      router.chat(messages),
    ];

    const results = await Promise.all(promises);

    // Both resolve, and provider was called only once
    expect(results[0].content).toBe(results[1].content);
    const mockProvider = (router as any).providers[0] as LLMProvider;
    expect((mockProvider.chat as ReturnType<typeof vi.fn>).mock.calls.length).toBe(1);
  });

  it('should produce different keys for different models', async () => {
    const router = createRouterWithMocks(1);

    // Add another mock provider that supports 'gpt-4o'
    const openaiProvider = createMockProvider('openai', 10);
    openaiProvider.supports = (model: string) => model.startsWith('gpt');
    (router as any).providers = [
      ...((router as any).providers as LLMProvider[]),
      openaiProvider,
    ];

    const messages: ChatMessage[] = [{ role: 'user', content: 'same text' }];

    const [r1, r2] = await Promise.all([
      router.chat(messages, { model: 'deepseek-chat' }),
      router.chat(messages, { model: 'gpt-4o' }),
    ]);

    // Different providers used
    expect(r1.content).toBeDefined();
    expect(r2.content).toBeDefined();
    expect(r1.content).not.toBe(r2.content); // different providers = different responses
  });
});
