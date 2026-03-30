/**
 * Handoff integration tests — end-to-end module handoff flows.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HandoffProcessor,
  HandoffProcessor as HP,
  type ModuleResult,
  type HandoffState,
  type RouteToModuleFn,
} from '../../src/handoff/index.js';

describe('Handoff Integration Tests', () => {
  let processor: HandoffProcessor;
  let routeToModule: RouteToModuleFn;
  let handoffState: HandoffState;

  beforeEach(() => {
    processor = new HandoffProcessor({ enableLogging: false });
    handoffState = {
      depth: 0,
      chain: [],
      previousModule: null,
    };
  });

  describe('chat → schedule → chat flow', () => {
    it('should complete full scheduling handoff cycle', async () => {
      // Simulate schedule module receiving the handoff
      routeToModule = vi.fn()
        // First call: schedule module receives the user message, creates reminder, hands back to chat
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'chat',
            context: 'reminder created for tomorrow 3pm',
          },
        })
        // Second call: chat module responds to user
        .mockResolvedValueOnce({
          type: 'response',
          content: "I've set a reminder for tomorrow at 3pm to review the PR.",
        });

      const userMessage = 'remind me to review the auth PR tomorrow';
      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'schedule',
          context: userMessage,
        },
      };

      const result = await processor.process(initialResult, routeToModule, handoffState);

      // Verify final response
      expect(result.type).toBe('response');
      expect(result.content).toContain('reminder');

      // Verify handoff chain
      expect(routeToModule).toHaveBeenCalledTimes(2);
      expect(handoffState.chain).toHaveLength(2);

      // Verify chain entries
      expect(handoffState.chain[0]).toMatchObject({
        fromModule: 'system',
        toModule: 'schedule',
        context: userMessage,
      });
      expect(handoffState.chain[1]).toMatchObject({
        fromModule: 'schedule',
        toModule: 'chat',
        context: 'reminder created for tomorrow 3pm',
      });
    });
  });

  describe('chat → git → chat flow', () => {
    it('should handle git operations with handoff back to chat', async () => {
      routeToModule = vi.fn()
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'chat',
            context: 'changes committed and pushed to origin/main',
          },
        })
        .mockResolvedValueOnce({
          type: 'response',
          content: 'Pushed! Your changes are now on origin/main.',
        });

      const userMessage = 'commit and push these changes';
      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'git',
          context: userMessage,
          urgency: 'high',
        },
      };

      const result = await processor.process(initialResult, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(result.content).toContain('Pushed');

      // Verify high urgency was tracked
      expect(handoffState.chain[0]).toMatchObject({
        urgency: 'high',
      });
    });
  });

  describe('chat → publish → chat flow', () => {
    it('should handle content publishing workflow', async () => {
      routeToModule = vi.fn()
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'chat',
            context: 'blog post published at https://blog.example.com/new-auth',
          },
        })
        .mockResolvedValueOnce({
          type: 'response',
          content: 'Published! Here is the link: https://blog.example.com/new-auth',
        });

      const userMessage = 'write a blog post about the new auth system and publish it';
      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'publish',
          context: userMessage,
        },
      };

      const result = await processor.process(initialResult, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(result.content).toContain('https://');
    });
  });

  describe('complex multi-step workflow', () => {
    it('should handle chat → git → publish → chat flow', async () => {
      routeToModule = vi.fn()
        // Git commits and pushes
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'publish',
            context: 'publish release notes for version 1.0.0',
          },
        })
        // Publish creates release
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'chat',
            context: 'release 1.0.0 published and notes available',
          },
        })
        // Chat responds to user
        .mockResolvedValueOnce({
          type: 'response',
          content: 'All done! Version 1.0.0 has been released.',
        });

      const userMessage = 'finish the release and publish it';
      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'git',
          context: userMessage,
        },
      };

      const result = await processor.process(initialResult, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(result.content).toContain('1.0.0');

      // Verify full chain
      expect(handoffState.chain).toHaveLength(3);
      expect(handoffState.chain[0].toModule).toBe('git');
      expect(handoffState.chain[1].toModule).toBe('publish');
      expect(handoffState.chain[2].toModule).toBe('chat');
    });
  });

  describe('error recovery', () => {
    it('should handle module failure gracefully', async () => {
      routeToModule = vi.fn().mockRejectedValueOnce(new Error('Module crashed'));

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'broken-module',
          context: 'test',
        },
      };

      const result = await processor.process(initialResult, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(result.content).toContain('Module crashed');
    });

    it('should handle timeout gracefully', async () => {
      routeToModule = vi.fn().mockRejectedValueOnce(new Error('Timeout'));

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'slow-module',
          context: 'test',
        },
      };

      const result = await processor.process(initialResult, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(result.content).toContain('Timeout');
    });
  });

  describe('state persistence across handoffs', () => {
    it('should maintain state across multiple handoffs', async () => {
      let callCount = 0;
      routeToModule = vi.fn().mockImplementation(async (context, module, state) => {
        callCount++;
        if (callCount === 1) {
          // First call: depth should be 1, previousModule should be 'a'
          expect(state?.depth).toBe(1);
          expect(state?.previousModule).toBe('a');
          return {
            type: 'handoff',
            handoff: { module: 'b', context: 'step 2' },
          } as ModuleResult;
        } else if (callCount === 2) {
          // Second call: depth should be 2, previousModule should be 'b'
          expect(state?.depth).toBe(2);
          expect(state?.previousModule).toBe('b');
          return {
            type: 'response',
            content: 'Complete!',
          } as ModuleResult;
        }
        throw new Error('Unexpected call');
      });

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: { module: 'a', context: 'step 1' },
      };

      const result = await processor.process(initialResult, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(handoffState.depth).toBe(2);
    });
  });

  describe('static helper integration', () => {
    it('should work with static helpers in real flow', async () => {
      routeToModule = vi.fn().mockResolvedValue({
        type: 'response',
        content: 'Done!',
      });

      // Create handoff using static helper
      const handoff = HP.handoff('scheduler', 'remind me at 3pm', {
        urgency: 'high',
        returnTo: 'chat',
      });

      const result = await processor.process(handoff, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(routeToModule).toHaveBeenCalledWith(
        'remind me at 3pm',
        'scheduler',
        expect.any(Object)
      );
    });
  });

  describe('token tracking', () => {
    it('should track token usage across handoff chain', async () => {
      routeToModule = vi.fn()
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: { module: 'b', context: 'step 2' },
        })
        .mockResolvedValueOnce({
          type: 'response',
          content: 'Done!',
        });

      const initialResult: ModuleResult = HP.handoff('a', 'step 1');

      await processor.process(initialResult, routeToModule, handoffState);

      const stats = processor.getStats(handoffState);

      expect(stats.depth).toBe(2);
      expect(stats.chainLength).toBe(2);
      expect(stats.estimatedTokens).toBeGreaterThan(0);

      // Token savings: handoff saves ~300 tokens vs full re-classification
      const savings = handoffState.depth * 300;
      expect(savings).toBeGreaterThan(0);
    });
  });

  describe('multi-response with handoffs', () => {
    it('should process multi with both responses and handoffs', async () => {
      routeToModule = vi.fn().mockResolvedValue({
        type: 'response',
        content: 'Final response',
      });

      const multiResult: ModuleResult = {
        type: 'multi',
        responses: ['Partial result 1', 'Partial result 2'],
        handoffs: [
          { module: 'next', context: 'continue' },
        ],
      };

      const result = await processor.process(multiResult, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(result.content).toBe('Final response');
    });
  });

  describe('real-world scenario: task delegation', () => {
    it('should handle realistic multi-module task', async () => {
      // User: "Write a blog post about the feature and publish it"
      routeToModule = vi.fn()
        // Writer completes and delegates to publisher
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'publisher',
            context: 'publish blog post: "New Authentication Feature Explained"',
          },
        })
        // Publisher publishes and delegates back to chat
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'chat',
            context: 'blog post published at https://blog.example.com/new-auth',
          },
        })
        // Chat responds to user
        .mockResolvedValueOnce({
          type: 'response',
          content: 'All set! Your blog post "New Authentication Feature Explained" has been published.',
        });

      const initialResult: ModuleResult = HP.handoff(
        'writer',
        'Write a blog post about the new authentication feature and publish it'
      );

      const result = await processor.process(initialResult, routeToModule, handoffState);

      expect(result.type).toBe('response');
      expect(result.content).toContain('published');

      // Verify complete workflow
      expect(handoffState.chain).toHaveLength(3);
      const modules = handoffState.chain.map((c) => c.toModule);
      expect(modules).toEqual(['writer', 'publisher', 'chat']);
    });
  });
});
