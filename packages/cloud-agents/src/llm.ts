/**
 * Lightweight LLM client for Cloudflare Workers.
 *
 * Calls DeepSeek API (OpenAI-compatible) directly via fetch.
 * Zero dependencies — uses only the Workers fetch API.
 *
 * Set DEEPSEEK_API_KEY via `wrangler secret put DEEPSEEK_API_KEY`.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatResponse {
  content: string;
  usage: {
    input: number;
    output: number;
  };
}

// ─── Defaults ───────────────────────────────────────────────────────────────

const DEEPSEEK_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-chat';

// ─── Client ─────────────────────────────────────────────────────────────────

/**
 * Send a chat completion request to DeepSeek.
 *
 * @param messages  Conversation messages (system/user/assistant)
 * @param apiKey    DeepSeek API key
 * @param model     Model name (default: deepseek-chat)
 * @param options   Optional overrides for temperature and max_tokens
 */
export async function chatWithDeepSeek(
  messages: ChatMessage[],
  apiKey: string,
  model?: string,
  options?: { temperature?: number; maxTokens?: number },
): Promise<ChatResponse> {
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const response = await fetch(DEEPSEEK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model ?? DEFAULT_MODEL,
      messages,
      max_tokens: options?.maxTokens ?? 4096,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`DeepSeek API error: ${response.status} ${errorText}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
    usage: { prompt_tokens: number; completion_tokens: number };
  };

  const choice = data.choices?.[0];
  if (!choice) {
    throw new Error('DeepSeek returned no choices');
  }

  return {
    content: choice.message.content,
    usage: {
      input: data.usage.prompt_tokens,
      output: data.usage.completion_tokens,
    },
  };
}
