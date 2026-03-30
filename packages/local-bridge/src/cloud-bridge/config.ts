/**
 * Cloud Bridge Configuration Types
 *
 * Defines the configuration interface for the CloudBridge class,
 * which connects cocapn agents to Cloudflare Workers backends.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudBridgeConfig {
  /** Full HTTPS URL of the Cloudflare Worker (e.g., https://personallog.example.workers.dev) */
  workerUrl: string;

  /** Fleet JWT for authentication between bridge and Workers */
  fleetJwt: string;

  /** Whether PII dehydration is enabled before sending to cloud (default: true) */
  piiEnabled?: boolean;

  /** Whether client-side intent routing is enabled (default: true) */
  routingEnabled?: boolean;

  /** Default model to use for chat completions (default: 'deepseek-chat') */
  defaultModel?: string;

  /** Request timeout in milliseconds (default: 30000ms) */
  timeout?: number;
}

export const DEFAULT_CLOUD_BRIDGE_CONFIG: Required<Omit<CloudBridgeConfig, 'workerUrl' | 'fleetJwt'>> = {
  piiEnabled: true,
  routingEnabled: true,
  defaultModel: 'deepseek-chat',
  timeout: 30000,
};

// ─── Model types ──────────────────────────────────────────────────────────────

export interface Model {
  id: string;
  name: string;
  description?: string;
  contextLength: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
}

export interface ChatCompletion {
  id: string;
  model: string;
  choices: Array<{
    index: number;
    message: {
      role: 'assistant';
      content: string;
    };
    finishReason: 'stop' | 'length' | 'content_filter';
  }>;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface UsageStats {
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  requestCount: number;
}

export interface StreamChunk {
  id: string;
  choices: Array<{
    index: number;
    delta?: {
      role?: 'assistant';
      content?: string;
    };
    finishReason: 'stop' | 'length' | 'content_filter' | null;
  }>;
}
