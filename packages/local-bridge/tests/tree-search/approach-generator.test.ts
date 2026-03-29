/**
 * Tests for ApproachGenerator
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ApproachGenerator } from '../../src/tree-search/approach-generator.js';

describe('ApproachGenerator', () => {
  const mockApiKey = 'test-api-key-12345';

  beforeEach(() => {
    // Reset any mocks before each test
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    // Clean up after each test
    vi.unstubAllGlobals();
  });

  describe('generateApproaches with real API', () => {
    it('should call DeepSeek API and return parsed approaches', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    name: 'Direct Approach',
                    description: 'Implement the feature straightforwardly',
                    tradeoffs: 'Fast to implement but less flexible',
                  },
                  {
                    name: 'Modular Approach',
                    description: 'Break into smaller components',
                    tradeoffs: 'More flexible but slower to implement',
                  },
                  {
                    name: 'Test-Driven Approach',
                    description: 'Write tests first, then implementation',
                    tradeoffs: 'Better quality but requires more upfront effort',
                  },
                ]),
              },
            },
          ],
          usage: {
            total_tokens: 350,
          },
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const result = await generator.generateApproaches('Add user profile feature', 3);

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.deepseek.com/v1/chat/completions',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mockApiKey}`,
          }),
        })
      );

      expect(result.approaches).toHaveLength(3);
      expect(result.approaches[0]).toContain('Direct Approach');
      expect(result.approaches[0]).toContain('Implement the feature straightforwardly');
      expect(result.approaches[0]).toContain('Tradeoff: Fast to implement but less flexible');
      expect(result.tokensUsed).toBe(350);
    });

    it('should handle API response with markdown code blocks', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'Here are some approaches:\n```json\n[\n  {\n    "name": "Test Approach",\n    "description": "Write tests first",\n    "tradeoffs": "Slower but better quality"\n  }\n]\n```',
              },
            },
          ],
          usage: {
            total_tokens: 300,
          },
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const result = await generator.generateApproaches('Write tests', 1);

      expect(result.approaches).toHaveLength(1);
      expect(result.approaches[0]).toContain('Test Approach');
      expect(result.approaches[0]).toContain('Write tests first');
    });

    it('should return fallback approaches on API error', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
      });

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: 'invalid-key' });
      const result = await generator.generateApproaches('Add feature', 3);

      // Should return heuristic fallback approaches
      expect(result.approaches).toHaveLength(3);
      expect(result.approaches.some(a => a.includes('implement') || a.includes('feature'))).toBe(true);
      expect(result.tokensUsed).toBeGreaterThan(0);
    });

    it('should return fallback approaches on network error', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockRejectedValue(new Error('Network error'));

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const result = await generator.generateApproaches('Fix bug', 2);

      // Should return heuristic fallback approaches
      expect(result.approaches).toHaveLength(2);
      expect(result.approaches.some(a => a.includes('fix') || a.includes('bug'))).toBe(true);
    });

    it('should return fallback approaches on malformed JSON response', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: 'This is not valid JSON',
              },
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const result = await generator.generateApproaches('Any task', 2);

      // Should return heuristic fallback approaches
      expect(result.approaches).toHaveLength(2);
    });

    it('should return fallback approaches on empty approaches array', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: '[]',
              },
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const result = await generator.generateApproaches('Any task', 2);

      // Should return heuristic fallback approaches
      expect(result.approaches).toHaveLength(2);
    });

    it('should use custom baseUrl when provided', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    name: 'Approach 1',
                    description: 'Description',
                    tradeoffs: 'Tradeoffs',
                  },
                ]),
              },
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const customUrl = 'https://custom.api.com';
      const generator = new ApproachGenerator({ apiKey: mockApiKey, baseUrl: customUrl });
      await generator.generateApproaches('Task', 1);

      expect(mockFetch).toHaveBeenCalledWith(
        `${customUrl}/v1/chat/completions`,
        expect.any(Object)
      );
    });

    it('should use custom model when provided', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    name: 'Approach 1',
                    description: 'Description',
                    tradeoffs: 'Tradeoffs',
                  },
                ]),
              },
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const customModel = 'deepseek-coder';
      const generator = new ApproachGenerator({ apiKey: mockApiKey, model: customModel });
      await generator.generateApproaches('Task', 1);

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callArgs.model).toBe(customModel);
    });

    it('should include context in the API request', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  {
                    name: 'Approach 1',
                    description: 'Description',
                    tradeoffs: 'Tradeoffs',
                  },
                ]),
              },
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const context = 'This is a Node.js project using TypeScript';
      await generator.generateApproaches('Add feature', 1, context);

      const callArgs = JSON.parse(mockFetch.mock.calls[0][1].body);
      const userMessage = callArgs.messages.find((m: any) => m.role === 'user');
      expect(userMessage.content).toContain('This is a Node.js project using TypeScript');
    });
  });

  describe('generateApproaches with mock response', () => {
    it('should use mock response when set', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      generator.setMockResponse({
        approaches: ['Mock approach 1', 'Mock approach 2', 'Mock approach 3'],
        tokensUsed: 100,
      });

      const result = await generator.generateApproaches('Any task', 3);

      // Should not call fetch when using mock
      expect(mockFetch).not.toHaveBeenCalled();
      expect(result.approaches).toEqual(['Mock approach 1', 'Mock approach 2', 'Mock approach 3']);
      expect(result.tokensUsed).toBe(100);
    });

    it('should clear mock response after use', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { name: 'Real Approach', description: 'From API', tradeoffs: 'None' },
                ]),
              },
            },
          ],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      generator.setMockResponse({
        approaches: ['Mock approach'],
        tokensUsed: 100,
      });

      // First call uses mock
      const result1 = await generator.generateApproaches('Task 1', 1);
      expect(result1.approaches).toEqual(['Mock approach']);
      expect(mockFetch).not.toHaveBeenCalled();

      // Second call uses real API
      const result2 = await generator.generateApproaches('Task 2', 1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result2.approaches).not.toEqual(['Mock approach']);
    });

    it('should limit mock approaches to count parameter', async () => {
      const mockFetch = vi.fn();
      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      generator.setMockResponse({
        approaches: ['Mock 1', 'Mock 2', 'Mock 3', 'Mock 4'],
        tokensUsed: 150,
      });

      const result = await generator.generateApproaches('Any task', 2);

      expect(result.approaches).toEqual(['Mock 1', 'Mock 2']);
    });
  });

  describe('maxApproaches option', () => {
    it('should respect maxApproaches when count is greater', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { name: 'A1', description: 'D1', tradeoffs: 'T1' },
                  { name: 'A2', description: 'D2', tradeoffs: 'T2' },
                ]),
              },
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey, maxApproaches: 2 });
      const result = await generator.generateApproaches('Task', 5);

      expect(result.approaches).toHaveLength(2);
    });

    it('should use count when less than maxApproaches', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify([
                  { name: 'A1', description: 'D1', tradeoffs: 'T1' },
                ]),
              },
            },
          ],
        }),
      });

      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey, maxApproaches: 5 });
      const result = await generator.generateApproaches('Task', 1);

      expect(result.approaches).toHaveLength(1);
    });
  });

  describe('fallback heuristic approaches', () => {
    it('should generate test-related approaches', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockRejectedValue(new Error('API down'));
      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const result = await generator.generateApproaches('Write tests for auth module', 3);

      expect(result.approaches).toHaveLength(3);
      expect(result.approaches.some(a => a.includes('test'))).toBe(true);
    });

    it('should generate refactor-related approaches', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockRejectedValue(new Error('API down'));
      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const result = await generator.generateApproaches('Refactor the handler code', 3);

      expect(result.approaches).toHaveLength(3);
      expect(result.approaches.some(a => a.includes('refactor') || a.includes('Extract'))).toBe(true);
    });

    it('should generate optimization-related approaches', async () => {
      const mockFetch = vi.fn();
      mockFetch.mockRejectedValue(new Error('API down'));
      vi.stubGlobal('fetch', mockFetch);

      const generator = new ApproachGenerator({ apiKey: mockApiKey });
      const result = await generator.generateApproaches('Optimize database queries', 3);

      expect(result.approaches).toHaveLength(3);
      expect(result.approaches.some(a => a.includes('optimize') || a.includes('Optimize'))).toBe(true);
    });
  });
});
