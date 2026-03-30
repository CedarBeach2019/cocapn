/**
 * Tree Search Approach Generator
 *
 * The ApproachGenerator uses an LLM to generate different approaches
 * for solving a task. This enables multi-approach exploration where
 * different strategies are tried in parallel.
 */

/**
 * Approach Generator Options
 */
export interface ApproachGeneratorOptions {
  /** Model to use for generation (default: 'deepseek-chat') */
  model?: string;
  /** Maximum number of approaches to generate (default: 3) */
  maxApproaches?: number;
  /** API key for DeepSeek API */
  apiKey: string;
  /** Base URL for API (default: 'https://api.deepseek.com') */
  baseUrl?: string;
}

/**
 * Approach Generator Result
 */
export interface ApproachGenerationResult {
  /** Generated approaches */
  approaches: string[];
  /** Total tokens used */
  tokensUsed: number;
}

/**
 * Mock LLM response for testing
 */
export interface MockLLMResponse {
  /** Approaches to return */
  approaches: string[];
  /** Simulated token cost */
  tokensUsed: number;
}

/**
 * DeepSeek API Response Structure
 */
interface DeepSeekAPIResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

/**
 * Approach structure from LLM response
 */
interface Approach {
  name: string;
  description: string;
  tradeoffs: string;
}

/**
 * Approach Generator — generates different approaches for solving tasks
 *
 * This class is responsible for:
 * - Calling DeepSeek API to generate different approaches
 * - Handling both real LLM calls and mock responses (for testing)
 * - Falling back to heuristic approaches if API fails
 * - Returning structured approach descriptions
 */
export class ApproachGenerator {
  private options: ApproachGeneratorOptions;
  private mockResponse: MockLLMResponse | null = null;

  constructor(options: ApproachGeneratorOptions = {}) {
    this.options = {
      model: options.model || 'deepseek-chat',
      maxApproaches: options.maxApproaches || 3,
      apiKey: options.apiKey,
      baseUrl: options.baseUrl || 'https://api.deepseek.com',
    };
  }

  /**
   * Generate N different approaches to solve a task
   *
   * @param task - The task to generate approaches for
   * @param count - Number of approaches to generate
   * @param context - Optional additional context about the task
   * @returns Promise resolving to array of approach descriptions
   */
  async generateApproaches(
    task: string,
    count: number = this.options.maxApproaches || 3,
    context?: string
  ): Promise<ApproachGenerationResult> {
    // If mock response is set, use it (for testing)
    if (this.mockResponse) {
      const response = this.mockResponse;
      this.mockResponse = null; // Clear after use
      return {
        approaches: response.approaches.slice(0, count),
        tokensUsed: response.tokensUsed,
      };
    }

    // Use maxApproaches from options if count is greater
    const actualCount = Math.min(count, this.options.maxApproaches || count);

    // Try to generate approaches using DeepSeek API
    const result = await this.generateLLMApproaches(task, actualCount, context);

    return result;
  }

  /**
   * Set a mock response for testing
   *
   * @param response - The mock response to return
   */
  setMockResponse(response: MockLLMResponse): void {
    this.mockResponse = response;
  }

  /**
   * Generate approaches using DeepSeek API
   *
   * @param task - The task description
   * @param count - Number of approaches to generate
   * @param context - Optional context
   * @returns ApproachGenerationResult with approaches and token usage
   */
  private async generateLLMApproaches(
    task: string,
    count: number,
    context?: string
  ): Promise<ApproachGenerationResult> {
    const systemPrompt = `You are a software architecture advisor. Given a coding task, generate ${count} different approaches to solve it.

For each approach, provide:
1. A name (2-3 words)
2. A description of the strategy (1-2 sentences)
3. Key tradeoffs (1 sentence)

Format each approach as a JSON array of objects with "name", "description", and "tradeoffs" fields.
Output ONLY the JSON array, no other text.`;

    const userPrompt = `Task: ${task}${context ? '\n\nContext:\n' + context : ''}`;

    try {
      const response = await fetch(`${this.options.baseUrl}/v1/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.7,
          max_tokens: 1000,
        }),
      });

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status} ${response.statusText}`);
      }

      const data = (await response.json()) as DeepSeekAPIResponse;
      const content = data.choices?.[0]?.message?.content || '[]';

      // Parse JSON from response (handle markdown code blocks)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error('No valid JSON array found in response');
      }

      const approaches = JSON.parse(jsonMatch[0]) as Approach[];

      // Validate that we got valid approaches
      if (!Array.isArray(approaches) || approaches.length === 0) {
        throw new Error('Invalid or empty approaches array');
      }

      // Format approaches as readable strings
      const formattedApproaches = approaches.map(
        (a) => `${a.name}: ${a.description} (Tradeoff: ${a.tradeoffs})`
      );

      // Get actual token usage from API response
      const tokensUsed = data.usage?.total_tokens || this.estimateTokenCost(task, context);

      return {
        approaches: formattedApproaches.slice(0, count),
        tokensUsed,
      };
    } catch (error) {
      // Fallback to heuristic approaches on API failure
      const fallbackApproaches = this.generateHeuristicApproaches(task, count, context);
      const fallbackTokens = this.estimateTokenCost(task, context);

      return {
        approaches: fallbackApproaches,
        tokensUsed: fallbackTokens,
      };
    }
  }

  /**
   * Generate heuristic-based approaches without LLM
   *
   * This is a fallback that generates reasonable approaches
   * based on common patterns for different task types.
   *
   * @param task - The task description
   * @param count - Number of approaches to generate
   * @param context - Optional context
   * @returns Array of approach descriptions
   */
  private generateHeuristicApproaches(
    task: string,
    count: number,
    context?: string
  ): string[] {
    const approaches: string[] = [];
    const taskLower = task.toLowerCase();

    // Pattern-based approach generation
    if (taskLower.includes('test') || taskLower.includes('testing')) {
      approaches.push(
        'Write unit tests for the main functionality',
        'Write integration tests for the API endpoints',
        'Write end-to-end tests for user workflows'
      );
    } else if (taskLower.includes('refactor') || taskLower.includes('clean')) {
      approaches.push(
        'Extract repeated logic into reusable functions',
        'Rename variables and functions for clarity',
        'Reorganize file structure for better separation of concerns'
      );
    } else if (taskLower.includes('fix') || taskLower.includes('bug')) {
      approaches.push(
        'Fix the bug with minimal changes',
        'Refactor the affected code to prevent similar bugs',
        'Add tests to prevent regression'
      );
    } else if (taskLower.includes('add') || taskLower.includes('implement') || taskLower.includes('feature')) {
      approaches.push(
        'Implement the feature in a straightforward way',
        'Implement the feature with extensive error handling',
        'Implement the feature with comprehensive tests'
      );
    } else if (taskLower.includes('optimize') || taskLower.includes('performance')) {
      approaches.push(
        'Optimize hot paths and bottlenecks',
        'Optimize memory usage and allocations',
        'Optimize I/O operations and caching'
      );
    } else if (taskLower.includes('document') || taskLower.includes('docs')) {
      approaches.push(
        'Write inline comments and JSDoc',
        'Write separate documentation files',
        'Write usage examples and tutorials'
      );
    } else {
      // Generic approaches for unknown task types
      approaches.push(
        'Solve the task directly',
        'Break down into smaller subtasks and solve each',
        'Consider edge cases and handle them explicitly'
      );
    }

    // Ensure we have enough approaches
    while (approaches.length < count) {
      approaches.push(`Alternative approach ${approaches.length + 1}`);
    }

    return approaches.slice(0, count);
  }

  /**
   * Estimate token cost for a generation request
   *
   * @param task - The task description
   * @param context - Optional context
   * @returns Estimated token cost
   */
  private estimateTokenCost(task: string, context?: string): number {
    // Rough estimate: ~4 chars per token
    const taskTokens = task.length / 4;
    const contextTokens = context ? context.length / 4 : 0;

    // Input tokens + estimated output tokens
    const inputTokens = taskTokens + contextTokens + 100; // +100 for prompt overhead
    const outputTokens = 200; // Assume ~200 tokens for output

    return Math.ceil(inputTokens + outputTokens);
  }
}
