/**
 * Cloud Bridge — Main Module
 *
 * Connects cocapn agents to Cloudflare Workers backends for AI chat completions.
 *
 * Features:
 * - Chat completions (streaming and non-streaming)
 * - PII dehydration/rehydration
 * - Client-side intent routing
 * - Model listing and usage tracking
 * - Fleet JWT authentication
 *
 * Architecture:
 * ```
 * cocapn bridge → CloudBridge → HTTPS → Cloudflare Worker → DeepSeek
 *                   ↓                                ↓
 *              PII engine                    response cache (KV)
 *                   ↓                                ↓
 *            routing rules                   model router
 * ```
 */

import type {
  CloudBridgeConfig,
  ChatMessage,
  ChatCompletionOptions,
  ChatCompletion,
  Model,
  UsageStats,
} from './config.js';
import { DEFAULT_CLOUD_BRIDGE_CONFIG } from './config.js';
import { dehydrate, rehydrate, type DehydratedText } from './pii.js';
import { parseSSE } from './streaming.js';
import { classifyIntent, getModelForRoute } from './routing.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudBridgeOptions extends CloudBridgeConfig {}

export interface StreamOptions extends ChatCompletionOptions {
  /** Callback for each chunk (optional) */
  onChunk?: (chunk: string) => void;
}

// ─── CloudBridge ───────────────────────────────────────────────────────────────

export class CloudBridge {
  private config: Required<Omit<CloudBridgeConfig, 'workerUrl' | 'fleetJwt'>> & Pick<CloudBridgeConfig, 'workerUrl' | 'fleetJwt'>;
  private usage: UsageStats = {
    totalTokens: 0,
    promptTokens: 0,
    completionTokens: 0,
    requestCount: 0,
  };

  constructor(options: CloudBridgeOptions) {
    this.config = {
      ...DEFAULT_CLOUD_BRIDGE_CONFIG,
      ...options,
    };
  }

  // ── Chat Completion (Streaming) ─────────────────────────────────────────────

  /**
   * Send a chat completion request with streaming response
   * Returns an async iterable of text chunks
   */
  async *chat(
    messages: ChatMessage[],
    options: StreamOptions = {}
  ): AsyncGenerator<string, void, unknown> {
    const { stream = true, onChunk, model, temperature, maxTokens } = options;

    // Determine model via routing if not specified
    const finalModel = model || this.routeMessage(messages);

    // Prepare request body
    const requestBody = {
      model: finalModel,
      messages: this.prepareMessages(messages),
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 2048,
      stream: true,
    };

    // Send request
    const response = await this.sendRequest(requestBody);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloud bridge error: ${response.status} ${error}`);
    }

    // Parse SSE stream
    let fullResponse = '';

    for await (const chunk of parseSSE(response)) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        fullResponse += content;
        yield content;

        if (onChunk) {
          onChunk(content);
        }
      }
    }

    // Update usage (estimated - real usage comes from final chunk)
    this.usage.requestCount++;
    this.usage.promptTokens += this.estimateTokens(messages);
    this.usage.completionTokens += this.estimateTokens([{ role: 'assistant', content: fullResponse }]);
    this.usage.totalTokens = this.usage.promptTokens + this.usage.completionTokens;
  }

  // ── Chat Completion (Non-Streaming) ──────────────────────────────────────────

  /**
   * Send a chat completion request without streaming
   * Returns the complete ChatCompletion response
   */
  async complete(
    messages: ChatMessage[],
    options: ChatCompletionOptions = {}
  ): Promise<ChatCompletion> {
    const { stream = false, model, temperature, maxTokens } = options;

    // Determine model via routing if not specified
    const finalModel = model || this.routeMessage(messages);

    // Prepare request body
    const requestBody = {
      model: finalModel,
      messages: this.prepareMessages(messages),
      temperature: temperature ?? 0.7,
      max_tokens: maxTokens ?? 2048,
      stream: false,
    };

    // Send request
    const response = await this.sendRequest(requestBody);

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Cloud bridge error: ${response.status} ${error}`);
    }

    const completion = (await response.json()) as ChatCompletion;

    // Update usage
    this.usage.requestCount++;
    this.usage.promptTokens += completion.usage.promptTokens;
    this.usage.completionTokens += completion.usage.completionTokens;
    this.usage.totalTokens += completion.usage.totalTokens;

    return completion;
  }

  // ── Model Listing ────────────────────────────────────────────────────────────

  /**
   * List available models from the cloud worker
   */
  async listModels(): Promise<Model[]> {
    const response = await fetch(`${this.config.workerUrl}/v1/models`, {
      headers: {
        'Authorization': `Bearer ${this.config.fleetJwt}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to list models: ${response.status}`);
    }

    const data = await response.json() as { data: Model[] };
    return data.data;
  }

  // ── Usage Stats ──────────────────────────────────────────────────────────────

  /**
   * Get current usage statistics
   */
  async getUsage(): Promise<UsageStats> {
    return { ...this.usage };
  }

  /**
   * Reset usage statistics
   */
  resetUsage(): void {
    this.usage = {
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      requestCount: 0,
    };
  }

  // ── Internal Helpers ────────────────────────────────────────────────────────

  /**
   * Determine which model to use based on message content
   */
  private routeMessage(messages: ChatMessage[]): string {
    if (!this.config.routingEnabled) {
      return this.config.defaultModel;
    }

    // Get last user message for classification
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastUserMessage) {
      return this.config.defaultModel;
    }

    const intent = classifyIntent(lastUserMessage.content);
    return getModelForRoute(intent.route);
  }

  /**
   * Prepare messages for sending (apply PII dehydration if enabled)
   */
  private prepareMessages(messages: ChatMessage[]): ChatMessage[] {
    if (!this.config.piiEnabled) {
      return messages;
    }

    return messages.map((msg) => ({
      role: msg.role,
      content: this.dehydrateMessage(msg.content),
    }));
  }

  /**
   * Dehydrate a single message (PII removal)
   */
  private dehydrateMessage(content: string): string {
    const result = dehydrate(content);
    // Store entities for rehydration (in production, would be per-session)
    return result.text;
  }

  /**
   * Send HTTP request to cloud worker
   */
  private async sendRequest(body: Record<string, unknown>): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(`${this.config.workerUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.config.fleetJwt}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (err) {
      clearTimeout(timeoutId);
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw err;
    }
  }

  /**
   * Estimate token count (rough approximation: 1 token ≈ 4 characters)
   */
  private estimateTokens(messages: ChatMessage[]): number {
    const totalChars = messages.reduce((sum, msg) => sum + msg.content.length, 0);
    return Math.ceil(totalChars / 4);
  }

  // ── Accessors ────────────────────────────────────────────────────────────────

  getWorkerUrl(): string {
    return this.config.workerUrl;
  }

  isPIIEnabled(): boolean {
    return this.config.piiEnabled;
  }

  isRoutingEnabled(): boolean {
    return this.config.routingEnabled;
  }

  getDefaultModel(): string {
    return this.config.defaultModel;
  }
}

// ─── Exports ───────────────────────────────────────────────────────────────────

export * from './config.js';
export * from './pii.js';
export * from './streaming.js';
export * from './routing.js';
export * from './connector.js';
