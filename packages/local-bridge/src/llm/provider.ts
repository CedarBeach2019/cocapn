/**
 * LLM Provider — core interface for LLM backends.
 *
 * All providers implement this interface to give the bridge
 * a uniform way to call any LLM (DeepSeek, OpenAI, Anthropic, etc.)
 * with both streaming and non-streaming modes.
 */

// ─── Message types ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
}

export interface ChatResponse {
  content: string;
  model: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  };
}

export interface ChatChunk {
  type: 'content' | 'done' | 'error';
  text?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  error?: string;
}

// ─── Provider config ──────────────────────────────────────────────────────────

export interface ProviderConfig {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

// ─── Provider interface ───────────────────────────────────────────────────────

export interface LLMProvider {
  readonly name: string;

  /** Non-streaming chat completion */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Streaming chat completion — yields chunks */
  chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<ChatChunk>;

  /** Check if this provider can handle the given model name */
  supports(model: string): boolean;
}
