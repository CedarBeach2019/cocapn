/**
 * LLM Provider Router
 *
 * Routes chat requests to the correct LLM provider based on model name,
 * with fallback chains and cost tracking.
 *
 * Model → Provider mapping:
 *   deepseek-*   → DeepSeekProvider
 *   gpt-* / o*   → OpenAIProvider
 *   claude-*     → AnthropicProvider
 *
 * Fallback: if the primary provider fails, try the next provider
 * in the fallback chain (if configured).
 */

import type {
  LLMProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ChatChunk,
} from './provider.js';
import { DeepSeekProvider } from './deepseek.js';
import { OpenAIProvider } from './openai.js';
import { AnthropicProvider } from './anthropic.js';
import { OllamaProvider } from './local/provider.js';
import { LlamaCppProvider } from './local/provider.js';

// ─── Cost table ($ per 1M tokens) ────────────────────────────────────────────

interface CostEntry {
  input: number;
  output: number;
}

const MODEL_COSTS: Record<string, CostEntry> = {
  'deepseek-chat':          { input: 0.14, output: 0.28 },
  'deepseek-reasoner':      { input: 0.55, output: 2.19 },
  'gpt-4o':                 { input: 2.50, output: 10.00 },
  'gpt-4o-mini':            { input: 0.15, output: 0.60 },
  'gpt-4-turbo':            { input: 10.00, output: 30.00 },
  'claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
};

function getCost(model: string): CostEntry {
  // Exact match first
  if (MODEL_COSTS[model]) return MODEL_COSTS[model];
  // Prefix match (e.g., "deepseek-" or "gpt-4o-2024-...")
  for (const [prefix, cost] of Object.entries(MODEL_COSTS)) {
    if (model.startsWith(prefix)) return cost;
  }
  // Default: assume mid-range
  return { input: 3.00, output: 15.00 };
}

// ─── Router config ───────────────────────────────────────────────────────────

export interface LLMRouterConfig {
  /** Provider configs keyed by provider name */
  providers: {
    deepseek?: { apiKey: string; baseUrl?: string };
    openai?: { apiKey: string; baseUrl?: string };
    anthropic?: { apiKey: string; baseUrl?: string };
    ollama?: { endpoint?: string; timeout?: number };
    'llama-cpp'?: { endpoint?: string; timeout?: number };
  };
  /** Default model to use when none specified */
  defaultModel?: string;
  /** Fallback models to try if primary fails (e.g., ['gpt-4o-mini', 'deepseek-chat']) */
  fallbackModels?: string[];
  /** Timeout for individual requests (ms) */
  timeout?: number;
}

// ─── Cost tracking ───────────────────────────────────────────────────────────

interface CostRecord {
  timestamp: string;
  model: string;
  provider: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  success: boolean;
}

// ─── LLMRouter ───────────────────────────────────────────────────────────────

export class LLMRouter {
  private providers: LLMProvider[] = [];
  private defaultModel: string;
  private fallbackModels: string[];
  private costs: CostRecord[] = [];
  private maxCostRecords: number;

  // ─── Deduplication & concurrency ─────────────────────────────────────────
  private inFlightRequests = new Map<string, Promise<ChatResponse>>();
  private lastStatusQueryTime = 0;
  private activeRequests = 0;
  private readonly maxConcurrency = 10;
  private readonly statusDebounceMs = 100;

  constructor(config: LLMRouterConfig) {
    if (config.providers.deepseek) {
      this.providers.push(new DeepSeekProvider({
        apiKey: config.providers.deepseek.apiKey,
        baseUrl: config.providers.deepseek.baseUrl,
        timeout: config.timeout,
      }));
    }
    if (config.providers.openai) {
      this.providers.push(new OpenAIProvider({
        apiKey: config.providers.openai.apiKey,
        baseUrl: config.providers.openai.baseUrl,
        timeout: config.timeout,
      }));
    }
    if (config.providers.anthropic) {
      this.providers.push(new AnthropicProvider({
        apiKey: config.providers.anthropic.apiKey,
        baseUrl: config.providers.anthropic.baseUrl,
        timeout: config.timeout,
      }));
    }
    if (config.providers.ollama) {
      this.providers.push(new OllamaProvider({
        endpoint: config.providers.ollama.endpoint,
        timeout: config.providers.ollama.timeout ?? config.timeout,
      }));
    }
    if (config.providers['llama-cpp']) {
      this.providers.push(new LlamaCppProvider({
        endpoint: config.providers['llama-cpp'].endpoint,
        timeout: config.providers['llama-cpp'].timeout ?? config.timeout,
      }));
    }

    this.defaultModel = config.defaultModel ?? 'deepseek-chat';
    this.fallbackModels = config.fallbackModels ?? [];
    this.maxCostRecords = 10000;
  }

  // ─── Provider lookup ───────────────────────────────────────────────────────

  /**
   * Find the provider that supports a given model.
   */
  findProvider(model: string): LLMProvider | undefined {
    return this.providers.find((p) => p.supports(model));
  }

  /**
   * Get all registered providers.
   */
  getAllProviders(): LLMProvider[] {
    return [...this.providers];
  }

  /**
   * Get available model names across all providers.
   */
  getAvailableModels(): string[] {
    // Return model names from configured providers
    const models: string[] = [];
    for (const provider of this.providers) {
      switch (provider.name) {
        case 'deepseek':
          models.push('deepseek-chat', 'deepseek-reasoner');
          break;
        case 'openai':
          models.push('gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo');
          break;
        case 'anthropic':
          models.push('claude-sonnet-4-20250514', 'claude-haiku-4-5-20251001');
          break;
        case 'ollama':
          models.push('llama3', 'mistral', 'codellama', 'phi3', 'deepseek-coder');
          break;
        case 'llama-cpp':
          models.push('llama-cpp');
          break;
      }
    }
    return models;
  }

  // ─── Chat (non-streaming) ──────────────────────────────────────────────────

  /**
   * Send a chat request, trying fallback models on failure.
   * Deduplicates identical in-flight requests and enforces concurrency limits.
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model ?? this.defaultModel;

    // ── Request deduplication ────────────────────────────────────────────────
    const dedupKey = this.computeDedupKey(messages, options);
    const existing = this.inFlightRequests.get(dedupKey);
    if (existing) {
      return existing;
    }

    // ── Concurrency control (backpressure) ──────────────────────────────────
    if (this.activeRequests >= this.maxConcurrency) {
      throw new Error(
        `LLM concurrency limit reached (${this.maxConcurrency} active requests). ` +
        `Retry later.`
      );
    }

    const modelsToTry = [model, ...this.fallbackModels.filter((m) => m !== model)];
    const errors: Error[] = [];

    const promise = (async () => {
      this.activeRequests++;
      try {
        for (const tryModel of modelsToTry) {
          const provider = this.findProvider(tryModel);
          if (!provider) continue;

          try {
            const response = await provider.chat(messages, { ...options, model: tryModel });
            this.recordCost(tryModel, provider.name, response.usage, true);
            return response;
          } catch (err) {
            errors.push(err instanceof Error ? err : new Error(String(err)));
            this.recordCost(tryModel, provider.name, { inputTokens: 0, outputTokens: 0 }, false);
            continue;
          }
        }

        const errorMessages = errors.map((e) => e.message).join('; ');
        throw new Error(`All providers failed for model "${model}": ${errorMessages}`);
      } finally {
        this.activeRequests--;
        this.inFlightRequests.delete(dedupKey);
      }
    })();

    this.inFlightRequests.set(dedupKey, promise);
    return promise;
  }

  // ─── Chat (streaming) ──────────────────────────────────────────────────────

  /**
   * Stream a chat request, trying fallback models on failure.
   */
  async *chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk> {
    const model = options?.model ?? this.defaultModel;
    const modelsToTry = [model, ...this.fallbackModels.filter((m) => m !== model)];

    for (const tryModel of modelsToTry) {
      const provider = this.findProvider(tryModel);
      if (!provider) continue;

      try {
        const stream = provider.chatStream(messages, { ...options, model: tryModel });
        let totalInput = 0;
        let totalOutput = 0;

        for await (const chunk of stream) {
          if (chunk.type === 'done') {
            this.recordCost(
              tryModel,
              provider.name,
              {
                inputTokens: chunk.usage?.inputTokens ?? totalInput,
                outputTokens: chunk.usage?.outputTokens ?? totalOutput,
              },
              true,
            );
          }
          if (chunk.type === 'error') {
            throw new Error(chunk.error);
          }
          yield chunk;
        }
        return; // Success — exit the fallback loop
      } catch (err) {
        this.recordCost(tryModel, provider.name, { inputTokens: 0, outputTokens: 0 }, false);
        // Yield the error if no more fallbacks
        if (tryModel === modelsToTry[modelsToTry.length - 1] || !modelsToTry.slice(modelsToTry.indexOf(tryModel) + 1).some((m) => this.findProvider(m))) {
          yield {
            type: 'error',
            error: err instanceof Error ? err.message : String(err),
          };
          return;
        }
        // Otherwise try the next fallback
        continue;
      }
    }

    yield { type: 'error', error: `No provider available for model "${model}"` };
  }

  // ─── Cost tracking ─────────────────────────────────────────────────────────

  getCostRecords(): CostRecord[] {
    return [...this.costs];
  }

  getTotalCost(): number {
    return this.costs.reduce((sum, r) => sum + r.costUsd, 0);
  }

  getCostByProvider(): Record<string, { total: number; requests: number }> {
    const byProvider: Record<string, { total: number; requests: number }> = {};
    for (const record of this.costs) {
      if (!byProvider[record.provider]) {
        byProvider[record.provider] = { total: 0, requests: 0 };
      }
      byProvider[record.provider].total += record.costUsd;
      byProvider[record.provider].requests++;
    }
    return byProvider;
  }

  resetCosts(): void {
    this.costs = [];
  }

  // ─── Dedup helpers ──────────────────────────────────────────────────────────

  /**
   * Compute a deduplication key from messages + options.
   * Identical prompt+model combinations get the same key.
   */
  private computeDedupKey(messages: ChatMessage[], options?: ChatOptions): string {
    const model = options?.model ?? this.defaultModel;
    const content = messages.map((m) => `${m.role}:${m.content}`).join('|');
    return `${model}:${content.length}:${this.simpleHash(content)}`;
  }

  /**
   * Simple, fast string hash (djb2). Not cryptographic — just for dedup keys.
   */
  private simpleHash(str: string): number {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) + hash + str.charCodeAt(i)) & 0x7fffffff;
    }
    return hash;
  }

  /**
   * Check if a status query should be debounced.
   * Returns true if the query should proceed, false if it should be skipped.
   */
  shouldAllowStatusQuery(): boolean {
    const now = Date.now();
    if (now - this.lastStatusQueryTime < this.statusDebounceMs) {
      return false;
    }
    this.lastStatusQueryTime = now;
    return true;
  }

  /**
   * Get the number of currently in-flight requests.
   */
  getActiveRequestCount(): number {
    return this.activeRequests;
  }

  /**
   * Get the number of deduplicated (shared) requests currently in flight.
   */
  getDedupCount(): number {
    return this.inFlightRequests.size;
  }

  private recordCost(
    model: string,
    provider: string,
    usage: { inputTokens: number; outputTokens: number },
    success: boolean,
  ): void {
    const cost = getCost(model);
    const costUsd = (usage.inputTokens * cost.input / 1_000_000) + (usage.outputTokens * cost.output / 1_000_000);

    const record: CostRecord = {
      timestamp: new Date().toISOString(),
      model,
      provider,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      costUsd,
      success,
    };

    this.costs.push(record);
    if (this.costs.length > this.maxCostRecords) {
      this.costs.shift();
    }
  }
}
