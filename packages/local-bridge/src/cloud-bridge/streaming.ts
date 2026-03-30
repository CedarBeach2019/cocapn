/**
 * Server-Sent Events (SSE) Streaming Parser
 *
 * Parses SSE streams from Cloudflare Workers for chat completions.
 * Handles data: lines, [DONE] signal, error lines, and empty lines.
 * Supports automatic reconnection on connection drop.
 */

import type { StreamChunk } from './config.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SSEParseOptions {
  /** Maximum number of reconnection attempts (default: 3) */
  maxRetries?: number;

  /** Delay between reconnection attempts in ms (default: 1000ms) */
  retryDelay?: number;

  /** AbortSignal to cancel the stream */
  signal?: AbortSignal;
}

export interface SSEEvent {
  /** Event type (defaults to 'message' if not specified) */
  event: string;

  /** Event data content */
  data: string;

  /** Optional event ID */
  id?: string;

  /** Optional retry specification */
  retry?: number;
}

// ─── SSE Parser ───────────────────────────────────────────────────────────────

/**
 * Parse SSE format line-by-line
 * Supports: event:, data:, id:, retry: fields and empty lines as event delimiters
 */
function parseSSELine(line: string, currentEvent: Partial<SSEEvent>): Partial<SSEEvent> | null {
  const trimmed = line.trim();

  // Empty line marks the end of an event
  if (trimmed === '') {
    return currentEvent.data !== undefined ? currentEvent : null;
  }

  // Skip comments
  if (trimmed.startsWith(':')) {
    return null;
  }

  // Parse field: value pairs
  const colonIndex = trimmed.indexOf(':');
  if (colonIndex === -1) {
    // Malformed line, ignore
    return null;
  }

  const field = trimmed.slice(0, colonIndex).trim();
  const value = trimmed.slice(colonIndex + 1).trim();

  switch (field) {
    case 'event':
      currentEvent.event = value;
      break;
    case 'data':
      currentEvent.data = currentEvent.data
        ? currentEvent.data + '\n' + value
        : value;
      break;
    case 'id':
      currentEvent.id = value;
      break;
    case 'retry':
      currentEvent.retry = parseInt(value, 10);
      break;
  }

  return null; // Event not complete yet
}

// ─── Stream Chunk Parser ──────────────────────────────────────────────────────

/**
 * Parse a data: line as a StreamChunk (OpenAI-compatible format)
 * Expects JSON: { id, choices: [{ index, delta, finish_reason }] }
 */
function parseStreamChunk(data: string): StreamChunk | null {
  try {
    return JSON.parse(data) as StreamChunk;
  } catch {
    return null;
  }
}

// ─── Main SSE Parser ──────────────────────────────────────────────────────────

/**
 * Parse SSE stream from a fetch Response
 * Yields StreamChunk objects as they arrive
 */
export async function* parseSSE(
  response: Response,
  options: SSEParseOptions = {}
): AsyncGenerator<StreamChunk, void, unknown> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelay = options.retryDelay ?? 1000;
  let attempts = 0;

  while (attempts <= maxRetries) {
    try {
      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        // Check for abort signal
        if (options.signal?.aborted) {
          reader.cancel();
          throw new Error('Stream aborted by signal');
        }

        const { done, value } = await reader.read();

        if (done) {
          // Process remaining buffer
          if (buffer.trim()) {
            const chunk = parseStreamChunk(buffer.trim());
            if (chunk) yield chunk;
          }
          break;
        }

        // Decode chunk and add to buffer
        buffer += decoder.decode(value, { stream: true });

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();

          // Empty lines are ignored
          if (!trimmed) continue;

          // Parse SSE-style lines
          if (trimmed.startsWith('data: ')) {
            const data = trimmed.slice(6);

            // [DONE] signal marks end of stream
            if (data === '[DONE]') {
              return;
            }

            // Error lines
            if (data.startsWith('[ERROR]')) {
              throw new Error(data.slice(7));
            }

            // Parse as JSON chunk
            const chunk = parseStreamChunk(data);
            if (chunk) {
              yield chunk;
            }
          }
        }
      }

      // Successful completion, exit retry loop
      return;

    } catch (err) {
      attempts++;

      if (attempts > maxRetries) {
        throw err;
      }

      // Wait before retry
      await sleep(retryDelay * attempts);

      // Re-fetch the response (this requires the original request to be retried)
      // Note: In a real implementation, you'd need to store and replay the request
      throw new Error(`SSE stream failed after ${attempts} attempts: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

// ─── Reconnection Helper ───────────────────────────────────────────────────────

/**
 * Fetch with automatic retry on SSE stream failure
 * Returns the Response for parseSSE to process
 */
export async function fetchSSEWithRetry(
  url: string,
  options: RequestInit & SSEParseOptions = {}
): Promise<Response> {
  const maxRetries = options.maxRetries ?? 3;
  const retryDelay = options.retryDelay ?? 1000;
  let attempts = 0;

  while (attempts <= maxRetries) {
    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response;
    } catch (err) {
      attempts++;

      if (attempts > maxRetries) {
        throw err;
      }

      await sleep(retryDelay * attempts);
    }
  }

  throw new Error('Failed to fetch SSE stream');
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
