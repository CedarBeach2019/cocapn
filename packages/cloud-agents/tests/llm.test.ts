/**
 * Tests for the cloud-agents LLM client (DeepSeek).
 *
 * Tests:
 *   - Successful chat completion
 *   - API error handling
 *   - Missing API key
 *   - Empty response from API
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { chatWithDeepSeek } from '../src/llm.js';
import type { ChatMessage } from '../src/llm.js';

// ─── Mock fetch ─────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ─── Helpers ────────────────────────────────────────────────────────────────

const MESSAGES: ChatMessage[] = [
  { role: 'system', content: 'You are helpful.' },
  { role: 'user', content: 'Hello!' },
];

function mockDeepSeekResponse(content: string, usage = { prompt_tokens: 10, completion_tokens: 20 }) {
  mockFetch.mockResolvedValueOnce(
    new Response(JSON.stringify({
      choices: [{ message: { content } }],
      usage,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
}

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('chatWithDeepSeek', () => {
  it('should call DeepSeek API and return content + usage', async () => {
    mockDeepSeekResponse('Hello! How can I help?');

    const result = await chatWithDeepSeek(MESSAGES, 'test-api-key');

    expect(result.content).toBe('Hello! How can I help?');
    expect(result.usage.input).toBe(10);
    expect(result.usage.output).toBe(20);
    expect(mockFetch).toHaveBeenCalledOnce();

    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.deepseek.com/v1/chat/completions');
    expect(options.method).toBe('POST');
    expect(options.headers['Authorization']).toBe('Bearer test-api-key');

    const body = JSON.parse(options.body);
    expect(body.model).toBe('deepseek-chat');
    expect(body.messages).toEqual(MESSAGES);
    expect(body.max_tokens).toBe(4096);
    expect(body.temperature).toBe(0.7);
  });

  it('should use custom model when specified', async () => {
    mockDeepSeekResponse('Custom model response');

    await chatWithDeepSeek(MESSAGES, 'test-key', 'deepseek-reasoner');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.model).toBe('deepseek-reasoner');
  });

  it('should accept temperature and maxTokens overrides', async () => {
    mockDeepSeekResponse('Tuned response');

    await chatWithDeepSeek(MESSAGES, 'test-key', undefined, {
      temperature: 0.3,
      maxTokens: 1024,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.temperature).toBe(0.3);
    expect(body.max_tokens).toBe(1024);
  });

  it('should throw on missing API key', async () => {
    await expect(chatWithDeepSeek(MESSAGES, '')).rejects.toThrow('DEEPSEEK_API_KEY is not configured');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('should throw on API error (e.g. 401 unauthorized)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response('Invalid API key', { status: 401 }),
    );

    await expect(chatWithDeepSeek(MESSAGES, 'bad-key')).rejects.toThrow('DeepSeek API error: 401');
  });

  it('should throw on API error with error body (e.g. 500)', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Internal server error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(chatWithDeepSeek(MESSAGES, 'test-key')).rejects.toThrow('DeepSeek API error: 500');
  });

  it('should throw when API returns no choices', async () => {
    mockFetch.mockResolvedValueOnce(
      new Response(JSON.stringify({
        choices: [],
        usage: { prompt_tokens: 10, completion_tokens: 0 },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    await expect(chatWithDeepSeek(MESSAGES, 'test-key')).rejects.toThrow('DeepSeek returned no choices');
  });
});

// ─── Worker /api/chat integration tests ──────────────────────────────────────

describe('POST /api/chat endpoint', () => {
  let worker: ExportedHandler<Record<string, unknown>>;
  let env: Record<string, unknown>;

  beforeEach(async () => {
    const workerModule = await import('../src/worker.js');
    worker = workerModule.default;
    env = {
      GITHUB_PAT: 'test-pat',
      FLEET_JWT_SECRET: 'test-secret',
      DEEPSEEK_API_KEY: 'test-deepseek-key',
      PRIVATE_REPO: 'test/private',
      PUBLIC_REPO: 'test/public',
      BRIDGE_MODE: 'cloud',
      AUTH_KV: { get: async () => null, put: async () => {} },
      ADMIRAL: {
        idFromName: () => ({ toString: () => 'test-id', equals: () => false }),
        get: () => ({
          id: { toString: () => 'test-id', equals: () => false },
          fetch: async () => new Response(JSON.stringify({ ok: true }), {
            headers: { 'Content-Type': 'application/json' },
          }),
        }),
      } as unknown as DurableObjectNamespace,
    };
  });

  it('should return 400 for missing messages', async () => {
    const req = new Request('https://worker.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    const res = await worker.fetch!(req, env);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain('Missing or empty messages');
  });

  it('should return 503 when DEEPSEEK_API_KEY is not set', async () => {
    env.DEEPSEEK_API_KEY = '';

    const req = new Request('https://worker.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'Hello' }] }),
    });

    const res = await worker.fetch!(req, env);
    expect(res.status).toBe(503);
    const data = await res.json() as { error: string };
    expect(data.error).toContain('DEEPSEEK_API_KEY is not configured');
  });

  it('should return LLM response on success', async () => {
    mockDeepSeekResponse('Hello from DeepSeek!');

    const req = new Request('https://worker.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hello' }],
      }),
    });

    const res = await worker.fetch!(req, env);
    expect(res.status).toBe(200);
    const data = await res.json() as { content: string; usage: { input: number; output: number } };
    expect(data.content).toBe('Hello from DeepSeek!');
    expect(data.usage.input).toBe(10);
  });

  it('should return 400 for invalid message format', async () => {
    const req = new Request('https://worker.test/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'invalid', content: 'test' }] }),
    });

    const res = await worker.fetch!(req, env);
    expect(res.status).toBe(400);
    const data = await res.json() as { error: string };
    expect(data.error).toContain('Invalid message format');
  });
});
