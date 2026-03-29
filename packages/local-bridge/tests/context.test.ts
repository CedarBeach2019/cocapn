/**
 * Tests for context management components:
 * - TaskComplexityClassifier
 * - ContextAssembler
 * - ConversationTracker
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { TaskComplexityClassifier } from '../src/context/classifier.js';
import { ContextAssembler } from '../src/context/assembler.js';
import { ConversationTracker } from '../src/context/conversation.js';
import type { Message } from '../src/context/classifier.js';

// ─── TaskComplexityClassifier Tests ────────────────────────────────────────────

describe('TaskComplexityClassifier', () => {
  let classifier: TaskComplexityClassifier;

  beforeEach(() => {
    classifier = new TaskComplexityClassifier();
  });

  describe('classify', () => {
    it('classifies trivial messages (< 50 chars)', () => {
      const result = classifier.classify('status?');
      expect(result.complexity).toBe('trivial');
      expect(result.contextBudget).toBe('minimal');
      expect(result.estimatedTokens).toBe(500);
    });

    it('classifies simple messages (< 200 chars)', () => {
      const result = classifier.classify('please update the README file with the new installation instructions');
      expect(result.complexity).toBe('simple');
      expect(result.contextBudget).toBe('low');
      expect(result.estimatedTokens).toBe(2000);
    });

    it('classifies moderate messages (< 500 chars)', () => {
      const message = 'I need you to update the authentication module. First, review the current implementation in src/auth/. Then add support for OAuth2 providers including Google and GitHub. Make sure to update the tests as well.';
      const result = classifier.classify(message);
      expect(result.complexity).toBe('moderate');
      expect(result.contextBudget).toBe('medium');
      expect(result.estimatedTokens).toBe(5000);
    });

    it('classifies complex messages (>= 500 chars)', () => {
      const message = 'We need to refactor the entire payment processing system. The current architecture is tightly coupled and difficult to maintain. I want you to redesign it with proper separation of concerns, implement a new payment gateway abstraction layer, add support for multiple payment providers, update the database schema, write comprehensive tests, and ensure backward compatibility with existing payment data. This is a critical system that needs to be production-ready.';
      const result = classifier.classify(message);
      expect(result.complexity).toBe('complex');
      expect(result.contextBudget).toBe('full');
      expect(result.estimatedTokens).toBe(15000);
    });

    it('bumps to complex for architecture keywords', () => {
      const result = classifier.classify('please refactor the auth module');
      expect(result.complexity).toBe('complex');
      expect(result.reason).toContain('architecture/implementation keywords');
    });

    it('bumps one level for code blocks', () => {
      const message = 'please update this function:\n```\nfunction test() { return true; }\n```\n';
      const result = classifier.classify(message);
      expect(result.complexity).toBe('moderate'); // Bumps from simple to moderate due to code block
      expect(result.reason).toContain('code block');
    });

    it('bumps one level for multiple questions', () => {
      const message = 'I have several questions about the implementation. What is the weather? What time is it? How are you doing today?';
      const result = classifier.classify(message);
      expect(result.complexity).toBe('moderate'); // Multiple questions in longer message
      expect(result.reason).toContain('questions');
    });

    it('recognizes pure questions', () => {
      const result = classifier.classify('what is the meaning of life?');
      expect(result.complexity).toBe('trivial');
      expect(result.reason).toContain('Pure question');
    });
  });

  describe('classifyWithHistory', () => {
    it('bumps complexity for deep conversations (> 10 messages)', () => {
      const history: Message[] = Array.from({ length: 15 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = classifier.classifyWithHistory('continue', history);
      expect(result.complexity).not.toBe('trivial');
      expect(result.reason).toContain('deep history');
    });

    it('does not bump for shallow conversations', () => {
      const history: Message[] = Array.from({ length: 5 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const result = classifier.classifyWithHistory('continue', history);
      expect(result.reason).not.toContain('deep history');
    });
  });
});

// ─── ContextAssembler Tests ────────────────────────────────────────────────────

describe('ContextAssembler', () => {
  let assembler: ContextAssembler;

  beforeEach(() => {
    assembler = new ContextAssembler({
      systemPrompt: 'Test system prompt',
      repoRoot: '/tmp/test',
    });
  });

  describe('assemble', () => {
    it('assembles minimal context for trivial tasks', async () => {
      const result = await assembler.assemble({
        task: 'what time is it?',
        budget: 'minimal',
        conversationHistory: [],
      });

      expect(result.systemPrompt).toContain('Test system prompt');
      expect(result.repoMap).toBeUndefined();
      expect(result.relevantFacts).toHaveLength(0);
      expect(result.fileContents).toHaveLength(0);
      expect(result.conversationHistory).toHaveLength(0);
      expect(result.totalTokens).toBeLessThan(1000);
      expect(result.reason).toContain('System prompt only');
    });

    it('assembles low context for simple tasks', async () => {
      const result = await assembler.assemble({
        task: 'update README',
        budget: 'low',
        conversationHistory: [],
      });

      expect(result.systemPrompt).toBeDefined();
      expect(result.totalTokens).toBeLessThan(3000);
      expect(result.reason).toContain('compact repo map');
    });

    it('assembles medium context for moderate tasks', async () => {
      const result = await assembler.assemble({
        task: 'update auth module',
        budget: 'medium',
        conversationHistory: [],
      });

      expect(result.systemPrompt).toBeDefined();
      expect(result.totalTokens).toBeLessThan(7000);
      expect(result.reason).toContain('facts + files');
    });

    it('assembles full context for complex tasks', async () => {
      const history: Message[] = Array.from({ length: 20 }, (_, i) => ({
        role: 'user',
        content: `Message ${i}`,
      }));

      const result = await assembler.assemble({
        task: 'refactor payment system',
        budget: 'full',
        conversationHistory: history,
      });

      expect(result.systemPrompt).toBeDefined();
      expect(result.conversationHistory.length).toBeGreaterThan(0);
      expect(result.reason).toContain('Full context');
    });

    it('includes active module in system prompt', async () => {
      const result = await assembler.assemble({
        task: 'test',
        budget: 'minimal',
        activeModule: 'auth-module',
        conversationHistory: [],
      });

      expect(result.systemPrompt).toContain('auth-module');
    });

    it('includes active skill in system prompt', async () => {
      const result = await assembler.assemble({
        task: 'test',
        budget: 'minimal',
        activeSkill: 'code-review',
        conversationHistory: [],
      });

      expect(result.systemPrompt).toContain('code-review');
    });

    it('limits conversation history based on budget', async () => {
      const history: Message[] = Array.from({ length: 50 }, (_, i) => ({
        role: 'user',
        content: `Message ${i}`,
      }));

      const result = await assembler.assemble({
        task: 'test',
        budget: 'low',
        conversationHistory: history,
      });

      // Low budget should limit history significantly
      expect(result.conversationHistory.length).toBeLessThan(history.length);
    });
  });

  describe('buildSystemPrompt', () => {
    it('uses default system prompt when none provided', async () => {
      const defaultAssembler = new ContextAssembler();
      const result = await defaultAssembler.assemble({
        task: 'test',
        budget: 'minimal',
        conversationHistory: [],
      });

      expect(result.systemPrompt).toContain('helpful AI assistant');
    });
  });
});

// ─── ConversationTracker Tests ─────────────────────────────────────────────────

describe('ConversationTracker', () => {
  let tracker: ConversationTracker;

  beforeEach(() => {
    tracker = new ConversationTracker();
  });

  describe('update and getState', () => {
    it('creates new state for first message', () => {
      const state = tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      }, 'auth-module', 'login flow');

      expect(state.activeModule).toBe('auth-module');
      expect(state.activeTask).toBe('login flow');
      expect(state.turnCount).toBe(1);
      expect(state.filesInContext).toHaveLength(0);
    });

    it('updates existing state for subsequent messages', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      }, 'auth-module', 'login flow');

      const state = tracker.update('session1', {
        complexity: 'moderate',
        contextBudget: 'medium',
        estimatedTokens: 5000,
        reason: 'test',
      });

      expect(state.turnCount).toBe(2);
      expect(state.activeModule).toBe('auth-module');
      expect(state.lastClassification).toBe('moderate');
    });

    it('retrieves existing state', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      }, 'auth-module', 'login flow');

      const state = tracker.getState('session1');
      expect(state).toBeDefined();
      expect(state?.activeModule).toBe('auth-module');
    });

    it('returns null for non-existent session', () => {
      const state = tracker.getState('nonexistent');
      expect(state).toBeNull();
    });
  });

  describe('suggestModule', () => {
    it('suggests active module for continuing conversation', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      }, 'auth-module', 'implement login');

      const suggestion = tracker.suggestModule('session1', 'add password reset', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      });

      expect(suggestion.module).toBe('auth-module');
      expect(suggestion.confidence).toBeGreaterThan(0);
    });

    it('increases confidence for deeper conversations', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      }, 'auth-module', 'login');

      // Add more turns
      for (let i = 0; i < 10; i++) {
        tracker.update('session1', {
          complexity: 'simple',
          contextBudget: 'low',
          estimatedTokens: 2000,
          reason: 'test',
        });
      }

      const suggestion = tracker.suggestModule('session1', 'continue', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      });

      expect(suggestion.confidence).toBeGreaterThan(0.7);
    });

    it('returns no suggestion for topic changes', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      }, 'auth-module', 'implement login');

      const suggestion = tracker.suggestModule('session1', 'what is the weather today?', {
        complexity: 'trivial',
        contextBudget: 'minimal',
        estimatedTokens: 500,
        reason: 'test',
      });

      expect(suggestion.module).toBeNull();
      expect(suggestion.reason).toContain('Topic changed');
    });

    it('returns no suggestion for timed out conversations', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      }, 'auth-module', 'login');

      // Manually age the conversation
      const state = tracker.getState('session1');
      if (state) {
        state.lastActivity = Date.now() - (31 * 60 * 1000); // 31 minutes ago
      }

      const suggestion = tracker.suggestModule('session1', 'continue', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      });

      expect(suggestion.module).toBeNull();
      expect(suggestion.reason).toContain('timed out');
    });
  });

  describe('trackFile and getFilesInContext', () => {
    it('tracks files in conversation context', () => {
      tracker.trackFile('session1', 'src/auth/login.ts');
      tracker.trackFile('session1', 'src/auth/logout.ts');
      tracker.trackFile('session1', 'src/auth/login.ts'); // Duplicate

      const files = tracker.getFilesInContext('session1');
      expect(files).toHaveLength(2);
      expect(files).toContain('src/auth/login.ts');
      expect(files).toContain('src/auth/logout.ts');
    });

    it('returns empty array for sessions without files', () => {
      const files = tracker.getFilesInContext('nonexistent');
      expect(files).toHaveLength(0);
    });
  });

  describe('reset', () => {
    it('removes conversation state', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      }, 'auth-module', 'login');

      tracker.reset('session1');

      const state = tracker.getState('session1');
      expect(state).toBeNull();
    });
  });

  describe('cleanup and getStats', () => {
    it('cleans up timed out conversations', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      });

      // Manually age the conversation
      const state = tracker.getState('session1');
      if (state) {
        state.lastActivity = Date.now() - (31 * 60 * 1000);
      }

      const cleaned = tracker.cleanup();
      expect(cleaned).toBe(1);
      expect(tracker.getState('session1')).toBeNull();
    });

    it('provides statistics', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      });

      tracker.update('session2', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      });

      const stats = tracker.getStats();
      expect(stats.total).toBe(2);
      expect(stats.active).toBe(2);
    });
  });

  describe('isActive', () => {
    it('returns true for active conversations', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      });

      expect(tracker.isActive('session1')).toBe(true);
    });

    it('returns false for timed out conversations', () => {
      tracker.update('session1', {
        complexity: 'simple',
        contextBudget: 'low',
        estimatedTokens: 2000,
        reason: 'test',
      });

      // Manually age the conversation
      const state = tracker.getState('session1');
      if (state) {
        state.lastActivity = Date.now() - (31 * 60 * 1000);
      }

      expect(tracker.isActive('session1')).toBe(false);
    });

    it('returns false for non-existent sessions', () => {
      expect(tracker.isActive('nonexistent')).toBe(false);
    });
  });
});
