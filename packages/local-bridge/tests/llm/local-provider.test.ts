/**
 * Tests for local LLM providers — Ollama + llama.cpp
 *
 * Uses fetch mocking to verify API format, streaming, and graceful
 * degradation when the local model server is offline.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OllamaProvider, LlamaCppProvider } from '../../src/llm/local/provider.js';

// ─── Fetch mock helpers ─────────────────────────────────────────────────────

type FetchMock = ReturnType<typeof vi.fn>;

function mockFetch(mock: FetchMock, responses: Array<{
  ok: boolean;
  status?: number;
  body?: string | AsyncIterable<Uint8Array>;
}>) {
  let callIndex = 0;
  mock.mockImplementation(async (url: string, init?: RequestInit) => {
    const resp = responses[callIndex] ?? responses[responses.length - 1];
    callIndex++;

    const body = resp.body;
    let readableStream: ReadableStream<Uint8Array> | undefined;

    if (body && typeof body !== 'string') {
      const asyncIter = body;
      readableStream = new ReadableStream<Uint8Array>({
        async start(controller) {
          try {
            for await (const chunk of asyncIter) {
              controller.enqueue(chunk);
            }
            controller.close();
          } catch (err) {
            controller.error(err);
          }
        },
      });
    }

    // For streaming responses, return a Response with a body ReadableStream
    if (readableStream) {
      return new Response(readableStream, {
        status: resp.status ?? 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    }

    return new Response(body as string, {
      status: resp.status ?? (resp.ok ? 200 : 500),
      headers: { 'Content-Type': 'application/json' },
    });
  });
}

function sseChunks(chunks: object[]): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = chunks.map((c) => `data: ${JSON.stringify(c)}\n`);
  lines.push('data: [DONE]\n');
  const full = lines.join('');

  return (async function* () {
    yield encoder.encode(full);
  })();
}

function ndjsonChunks(chunks: object[]): AsyncIterable<Uint8Array> {
  const encoder = new TextEncoder();
  const lines = chunks.map((c) => JSON.stringify(c) + '\n');
  const full = lines.join('');

  return (async function* () {
    yield encoder.encode(full);
  })();
}

// ─── Ollama Provider ────────────────────────────────────────────────────────

describe('OllamaProvider', () => {
  let provider: OllamaProvider;
  let fetchMock: FetchMock;

  beforeEach(() => {
    provider = new OllamaProvider({ endpoint: 'http://localhost:11434' });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('supports()', () => {
    it('recognizes known Ollama models', () => {
      expect(provider.supports('llama3')).toBe(true);
      expect(provider.supports('mistral')).toBe(true);
      expect(provider.supports('codellama')).toBe(true);
      expect(provider.supports('phi3')).toBe(true);
      expect(provider.supports('deepseek-coder')).toBe(true);
      expect(provider.supports('qwen2.5')).toBe(true);
      expect(provider.supports('gemma2')).toBe(true);
    });

    it('recognizes tagged models (e.g. llama3:8b)', () => {
      expect(provider.supports('llama3:8b')).toBe(true);
      expect(provider.supports('mistral:7b-instruct')).toBe(true);
    });

    it('rejects non-Ollama models', () => {
      expect(provider.supports('gpt-4o')).toBe(false);
      expect(provider.supports('deepseek-chat')).toBe(false);
      expect(provider.supports('claude-sonnet-4-20250514')).toBe(false);
    });
  });

  describe('isAvailable()', () => {
    it('returns true when Ollama is reachable', async () => {
      mockFetch(fetchMock, [{ ok: true, body: '{"models":[]}' }]);
      expect(await provider.isAvailable()).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:11434/api/tags',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('returns false when connection is refused', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      expect(await provider.isAvailable()).toBe(false);
    });

    it('returns false when timeout', async () => {
      fetchMock.mockRejectedValue(new DOMException('The operation was aborted', 'AbortError'));
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('listModels()', () => {
    it('returns model names from Ollama', async () => {
      mockFetch(fetchMock, [{
        ok: true,
        body: JSON.stringify({
          models: [
            { name: 'llama3:8b' },
            { name: 'mistral:7b' },
            { name: 'codellama:13b' },
          ],
        }),
      }]);

      const models = await provider.listModels();
      expect(models).toEqual(['llama3:8b', 'mistral:7b', 'codellama:13b']);
    });

    it('throws when Ollama is unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      await expect(provider.listModels()).rejects.toThrow('Ollama unavailable');
    });
  });

  describe('chat()', () => {
    it('sends correct Ollama chat format and parses response', async () => {
      mockFetch(fetchMock, [{
        ok: true,
        body: JSON.stringify({
          model: 'llama3:8b',
          message: { role: 'assistant', content: 'Hello! How can I help?' },
          prompt_eval_count: 42,
          eval_count: 17,
        }),
      }]);

      const response = await provider.chat([
        { role: 'user', content: 'Hi there' },
      ], { model: 'llama3' });

      expect(response.content).toBe('Hello! How can I help?');
      expect(response.model).toBe('llama3:8b');
      expect(response.usage.inputTokens).toBe(42);
      expect(response.usage.outputTokens).toBe(17);
      expect(response.usage.totalTokens).toBe(59);
    });

    it('prepends system prompt', async () => {
      mockFetch(fetchMock, [{
        ok: true,
        body: JSON.stringify({
          model: 'llama3',
          message: { role: 'assistant', content: 'ok' },
        }),
      }]);

      await provider.chat(
        [{ role: 'user', content: 'hello' }],
        { systemPrompt: 'You are helpful.' },
      );

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'hello' });
    });

    it('throws helpful error when model not found (404)', async () => {
      mockFetch(fetchMock, [{ ok: false, status: 404, body: 'model not found' }]);

      await expect(
        provider.chat([{ role: 'user', content: 'hi' }], { model: 'nonexistent' }),
      ).rejects.toThrow(/not found.*ollama pull nonexistent/);
    });

    it('throws error when connection refused', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        provider.chat([{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('fetch failed');
    });
  });

  describe('chatStream()', () => {
    it('streams content chunks and yields done with usage', async () => {
      mockFetch(fetchMock, [{
        ok: true,
        body: ndjsonChunks([
          { model: 'llama3', message: { role: 'assistant', content: 'Hello' }, done: false },
          { model: 'llama3', message: { role: 'assistant', content: '!' }, done: false },
          { model: 'llama3', message: { role: 'assistant', content: '' }, done: true, prompt_eval_count: 10, eval_count: 5 },
        ]),
      }]);

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'content', text: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'content', text: '!' });
      expect(chunks[2].type).toBe('done');
      expect(chunks[2].usage.inputTokens).toBe(10);
      expect(chunks[2].usage.outputTokens).toBe(5);
    });

    it('yields error when server unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toContain('fetch failed');
    });

    it('yields error on HTTP error', async () => {
      mockFetch(fetchMock, [{ ok: false, status: 500, body: 'internal error' }]);

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toContain('Ollama error 500');
    });
  });
});

// ─── llama.cpp Provider ─────────────────────────────────────────────────────

describe('LlamaCppProvider', () => {
  let provider: LlamaCppProvider;
  let fetchMock: FetchMock;

  beforeEach(() => {
    provider = new LlamaCppProvider({ endpoint: 'http://localhost:8080' });
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('supports()', () => {
    it('recognizes llama-cpp models', () => {
      expect(provider.supports('llama-cpp')).toBe(true);
      expect(provider.supports('llamacpp')).toBe(true);
      expect(provider.supports('llama-cpp:7b')).toBe(true);
    });

    it('rejects non-llama-cpp models', () => {
      expect(provider.supports('gpt-4o')).toBe(false);
      expect(provider.supports('llama3')).toBe(false);
    });
  });

  describe('isAvailable()', () => {
    it('returns true when llama.cpp is reachable', async () => {
      mockFetch(fetchMock, [{ ok: true, body: '{}' }]);
      expect(await provider.isAvailable()).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(
        'http://localhost:8080/health',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    it('returns false when connection refused', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));
      expect(await provider.isAvailable()).toBe(false);
    });
  });

  describe('chat()', () => {
    it('sends correct llama.cpp completion format', async () => {
      mockFetch(fetchMock, [{
        ok: true,
        body: JSON.stringify({
          content: 'Hello! How can I help?',
          tokens_evaluated: 30,
          tokens_predicted: 8,
          stop: 'eos',
        }),
      }]);

      const response = await provider.chat([
        { role: 'user', content: 'Hi there' },
      ]);

      expect(response.content).toBe('Hello! How can I help?');
      expect(response.usage.inputTokens).toBe(30);
      expect(response.usage.outputTokens).toBe(8);
      expect(response.model).toBe('llama-cpp');

      // Verify the prompt format
      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.prompt).toContain('User: Hi there');
      expect(body.prompt).toContain('Assistant:');
      expect(body.stream).toBe(false);
    });

    it('includes system prompt in the text prompt', async () => {
      mockFetch(fetchMock, [{
        ok: true,
        body: JSON.stringify({
          content: 'ok',
          tokens_evaluated: 0,
          tokens_predicted: 0,
        }),
      }]);

      await provider.chat(
        [{ role: 'user', content: 'hello' }],
        { systemPrompt: 'You are helpful.' },
      );

      const callArgs = fetchMock.mock.calls[0];
      const body = JSON.parse(callArgs[1].body);
      expect(body.prompt).toContain('System: You are helpful.');
    });

    it('throws helpful error when server is unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      await expect(
        provider.chat([{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow('fetch failed');
    });

    it('throws error on HTTP error', async () => {
      mockFetch(fetchMock, [{ ok: false, status: 500, body: 'model error' }]);

      await expect(
        provider.chat([{ role: 'user', content: 'hi' }]),
      ).rejects.toThrow(/llama.cpp error 500/);
    });
  });

  describe('chatStream()', () => {
    it('streams content chunks and yields done', async () => {
      mockFetch(fetchMock, [{
        ok: true,
        body: sseChunks([
          { content: 'Hello', stop: false },
          { content: ' world', stop: false },
          { content: '', stop: true, tokens_evaluated: 20, tokens_predicted: 5 },
        ]),
      }]);

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(3);
      expect(chunks[0]).toEqual({ type: 'content', text: 'Hello' });
      expect(chunks[1]).toEqual({ type: 'content', text: ' world' });
      expect(chunks[2].type).toBe('done');
      expect(chunks[2].usage.inputTokens).toBe(20);
      expect(chunks[2].usage.outputTokens).toBe(5);
    });

    it('yields error when server unreachable', async () => {
      fetchMock.mockRejectedValue(new TypeError('fetch failed'));

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toContain('llama.cpp');
    });

    it('yields error on HTTP error', async () => {
      mockFetch(fetchMock, [{ ok: false, status: 503, body: 'server overloaded' }]);

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream([{ role: 'user', content: 'hi' }])) {
        chunks.push(chunk);
      }

      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('error');
      expect(chunks[0].error).toContain('503');
    });
  });
});

// ─── Router integration ─────────────────────────────────────────────────────

describe('Local providers in LLMRouter', () => {
  it('can be constructed with ollama and llama-cpp providers', async () => {
    const { LLMRouter } = await import('../../src/llm/router.js');

    const router = new LLMRouter({
      providers: {
        ollama: { endpoint: 'http://localhost:11434' },
        'llama-cpp': { endpoint: 'http://localhost:8080' },
      },
      defaultModel: 'llama3',
    });

    const providers = router.getAllProviders();
    const names = providers.map((p) => p.name);
    expect(names).toContain('ollama');
    expect(names).toContain('llama-cpp');
  });

  it('finds the right provider for local model names', async () => {
    const { LLMRouter } = await import('../../src/llm/router.js');

    const router = new LLMRouter({
      providers: {
        ollama: { endpoint: 'http://localhost:11434' },
        'llama-cpp': { endpoint: 'http://localhost:8080' },
      },
      defaultModel: 'llama3',
    });

    expect(router.findProvider('llama3')?.name).toBe('ollama');
    expect(router.findProvider('mistral')?.name).toBe('ollama');
    expect(router.findProvider('llama-cpp')?.name).toBe('llama-cpp');
    expect(router.findProvider('gpt-4o')).toBeUndefined();
  });

  it('includes local models in getAvailableModels', async () => {
    const { LLMRouter } = await import('../../src/llm/router.js');

    const router = new LLMRouter({
      providers: {
        ollama: { endpoint: 'http://localhost:11434' },
      },
    });

    const models = router.getAvailableModels();
    expect(models).toContain('llama3');
    expect(models).toContain('mistral');
    expect(models).toContain('codellama');
    expect(models).toContain('phi3');
    expect(models).toContain('deepseek-coder');
  });
});
