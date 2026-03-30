/**
 * HandoffProcessor tests.
 */

import { describe, it, expect, vi } from 'vitest';
import {
  HandoffProcessor,
  type ModuleResult,
  type HandoffState,
  type RouteToModuleFn,
} from '../../src/handoff/index.js';

describe('HandoffProcessor', () => {
  describe('simple response', () => {
    it('should return simple response unchanged', async () => {
      const processor = new HandoffProcessor();
      const routeToModule: RouteToModuleFn = vi.fn();

      const initialResult: ModuleResult = {
        type: 'response',
        content: 'Hello, world!',
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result).toEqual({
        type: 'response',
        content: 'Hello, world!',
      });
      expect(routeToModule).not.toHaveBeenCalled();
    });
  });

  describe('single handoff', () => {
    it('should process single handoff correctly', async () => {
      const processor = new HandoffProcessor({ enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn().mockResolvedValue({
        type: 'response',
        content: 'Task completed!',
      });

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'scheduler',
          context: 'remind me tomorrow at 3pm',
        },
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result).toEqual({
        type: 'response',
        content: 'Task completed!',
      });
      expect(routeToModule).toHaveBeenCalledTimes(1);
      expect(routeToModule).toHaveBeenCalledWith(
        'remind me tomorrow at 3pm',
        'scheduler',
        expect.objectContaining({
          depth: 1,
          previousModule: 'scheduler',
        })
      );
    });

    it('should pass handoff options correctly', async () => {
      const processor = new HandoffProcessor({ enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn().mockResolvedValue({
        type: 'response',
        content: 'Done!',
      });

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'git',
          context: 'commit these changes',
          urgency: 'high',
          returnTo: 'chat',
        },
      };

      await processor.process(initialResult, routeToModule);

      expect(routeToModule).toHaveBeenCalledWith(
        'commit these changes',
        'git',
        expect.objectContaining({
          depth: 1,
        })
      );
    });
  });

  describe('return handoff', () => {
    it('should handle return handoff from target back to sender', async () => {
      const processor = new HandoffProcessor({ enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn()
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'chat',
            context: 'reminder created for tomorrow 3pm',
          },
        })
        .mockResolvedValueOnce({
          type: 'response',
          content: 'Done! Reminder set for tomorrow at 3pm.',
        });

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'scheduler',
          context: 'remind me tomorrow at 3pm',
        },
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result).toEqual({
        type: 'response',
        content: 'Done! Reminder set for tomorrow at 3pm.',
      });
      expect(routeToModule).toHaveBeenCalledTimes(2);
    });
  });

  describe('multi-handoff chain', () => {
    it('should process multi-step handoff chain', async () => {
      const processor = new HandoffProcessor({ enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn()
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'git',
            context: 'commit and push changes',
          },
        })
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'chat',
            context: 'changes committed and pushed',
          },
        })
        .mockResolvedValueOnce({
          type: 'response',
          content: 'All done! Changes are live.',
        });

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'publisher',
          context: 'publish this blog post',
        },
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result).toEqual({
        type: 'response',
        content: 'All done! Changes are live.',
      });
      expect(routeToModule).toHaveBeenCalledTimes(3);
    });
  });

  describe('depth limiting', () => {
    it('should enforce max depth limit', async () => {
      const processor = new HandoffProcessor({ maxDepth: 2, enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn().mockResolvedValue({
        type: 'handoff',
        handoff: {
          module: 'next',
          context: 'keep going',
        },
      });

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'first',
          context: 'start',
        },
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result).toEqual({
        type: 'response',
        content: 'I got stuck trying to complete your request. Let me try a different approach.',
      });
      // Should call routeToModule exactly maxDepth times (2 in this case)
      expect(routeToModule).toHaveBeenCalledTimes(2);
    });

    it('should allow handoffs up to max depth', async () => {
      const processor = new HandoffProcessor({ maxDepth: 2, enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn()
        .mockResolvedValueOnce({
          type: 'response',
          content: 'Complete!',
        });

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'first',
          context: 'step 1',
        },
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result).toEqual({
        type: 'response',
        content: 'Complete!',
      });
      expect(routeToModule).toHaveBeenCalledTimes(1);
    });
  });

  describe('circular prevention', () => {
    it('should detect and prevent circular handoffs', async () => {
      const processor = new HandoffProcessor({ enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn();

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'chat',
          context: 'back to chat',
        },
      };

      const state: HandoffState = {
        depth: 1,
        chain: [],
        previousModule: 'chat',
      };

      const result = await processor.process(initialResult, routeToModule, state);

      expect(result).toEqual({
        type: 'response',
        content: 'I got stuck trying to complete your request. Let me try a different approach.',
      });
      expect(routeToModule).not.toHaveBeenCalled();
    });
  });

  describe('error handling', () => {
    it('should handle routing errors gracefully', async () => {
      const processor = new HandoffProcessor({ enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn().mockRejectedValue(
        new Error('Module not found')
      );

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'nonexistent',
          context: 'test',
        },
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result.type).toBe('response');
      expect(result.content).toContain('Module not found');
    });
  });

  describe('multi-type results', () => {
    it('should flatten multi-type results with responses only', async () => {
      const processor = new HandoffProcessor();
      const routeToModule: RouteToModuleFn = vi.fn();

      const initialResult: ModuleResult = {
        type: 'multi',
        responses: ['First part', 'Second part'],
        handoffs: [],
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result).toEqual({
        type: 'response',
        content: 'First part\n\nSecond part',
      });
    });

    it('should process handoffs in multi-type results', async () => {
      const processor = new HandoffProcessor({ enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn().mockResolvedValue({
        type: 'response',
        content: 'Final response',
      });

      const initialResult: ModuleResult = {
        type: 'multi',
        responses: ['Partial result'],
        handoffs: [
          {
            module: 'next',
            context: 'continue',
          },
        ],
      };

      const result = await processor.process(initialResult, routeToModule);

      expect(result).toEqual({
        type: 'response',
        content: 'Final response',
      });
      expect(routeToModule).toHaveBeenCalledWith(
        'continue',
        'next',
        expect.any(Object)
      );
    });
  });

  describe('static helpers', () => {
    it('should create handoff result via static helper', () => {
      const result = HandoffProcessor.handoff('scheduler', 'remind me', {
        urgency: 'high',
        returnTo: 'chat',
      });

      expect(result).toEqual({
        type: 'handoff',
        handoff: {
          module: 'scheduler',
          context: 'remind me',
          urgency: 'high',
          returnTo: 'chat',
        },
      });
    });

    it('should create response result via static helper', () => {
      const result = HandoffProcessor.response('Hello!');

      expect(result).toEqual({
        type: 'response',
        content: 'Hello!',
      });
    });

    it('should create multi result via static helper', () => {
      const handoffs = [
        { module: 'next', context: 'continue' },
        { module: 'final', context: 'finish' },
      ];

      const result = HandoffProcessor.multi(['Part 1', 'Part 2'], handoffs);

      expect(result).toEqual({
        type: 'multi',
        responses: ['Part 1', 'Part 2'],
        handoffs,
      });
    });
  });

  describe('chain tracking', () => {
    it('should track handoff chain correctly', async () => {
      const processor = new HandoffProcessor({ enableLogging: false });
      const routeToModule: RouteToModuleFn = vi.fn()
        .mockResolvedValueOnce({
          type: 'handoff',
          handoff: {
            module: 'second',
            context: 'step 2',
          },
        })
        .mockResolvedValueOnce({
          type: 'response',
          content: 'Done!',
        });

      const initialResult: ModuleResult = {
        type: 'handoff',
        handoff: {
          module: 'first',
          context: 'step 1',
        },
      };

      const state: HandoffState = {
        depth: 0,
        chain: [],
        previousModule: null,
      };

      await processor.process(initialResult, routeToModule, state);

      expect(state.chain.length).toBe(2);
      expect(state.chain[0]).toMatchObject({
        fromModule: 'system',
        toModule: 'first',
        context: 'step 1',
      });
      expect(state.chain[1]).toMatchObject({
        fromModule: 'first',
        toModule: 'second',
        context: 'step 2',
      });
    });

    it('should format chain for display', () => {
      const processor = new HandoffProcessor();
      const state: HandoffState = {
        depth: 2,
        chain: [
          {
            fromModule: 'chat',
            toModule: 'scheduler',
            context: 'remind me',
            timestamp: 1234567890000,
            urgency: 'normal',
          },
        ],
        previousModule: 'scheduler',
      };

      const formatted = processor.formatChain(state);

      expect(formatted).toContain('chat → scheduler');
      expect(formatted).toContain('normal');
    });
  });

  describe('token estimation', () => {
    it('should estimate token cost correctly', () => {
      const processor = new HandoffProcessor();
      const state: HandoffState = {
        depth: 3,
        chain: [
          {
            fromModule: 'a',
            toModule: 'b',
            context: 'This is a test context with some words',
            timestamp: Date.now(),
            urgency: 'normal',
          },
        ],
        previousModule: 'c',
      };

      const cost = processor.estimateTokenCost(state);

      // Should be roughly 200 * depth + context tokens
      expect(cost).toBeGreaterThan(600); // 200 * 3
      expect(cost).toBeLessThan(1000); // Reasonable upper bound
    });

    it('should get accurate stats', () => {
      const processor = new HandoffProcessor();
      const state: HandoffState = {
        depth: 2,
        chain: [
          { fromModule: 'a', toModule: 'b', context: 'test', timestamp: Date.now(), urgency: 'normal' },
          { fromModule: 'b', toModule: 'c', context: 'test2', timestamp: Date.now(), urgency: 'high' },
        ],
        previousModule: 'c',
      };

      const stats = processor.getStats(state);

      expect(stats.depth).toBe(2);
      expect(stats.chainLength).toBe(2);
      expect(stats.estimatedTokens).toBeGreaterThan(0);
      expect(stats.isCircular).toBe(true);
    });
  });

  describe('circular detection helper', () => {
    it('should detect potential circular handoff', () => {
      const processor = new HandoffProcessor();
      const state: HandoffState = {
        depth: 1,
        chain: [],
        previousModule: 'chat',
      };

      const isCircular = processor.wouldBeCircular('chat', state);

      expect(isCircular).toBe(true);
    });

    it('should not detect circular when modules differ', () => {
      const processor = new HandoffProcessor();
      const state: HandoffState = {
        depth: 1,
        chain: [],
        previousModule: 'chat',
      };

      const isCircular = processor.wouldBeCircular('scheduler', state);

      expect(isCircular).toBe(false);
    });
  });
});
