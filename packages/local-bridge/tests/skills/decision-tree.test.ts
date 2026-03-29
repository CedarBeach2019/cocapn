/**
 * Decision Tree Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SkillDecisionTree, SkillMatcher } from '../../src/skills/decision-tree.js';
import type { SkillCartridge } from '../../src/skills/types.js';

describe('SkillDecisionTree', () => {
  let tree: SkillDecisionTree;

  beforeEach(() => {
    tree = new SkillDecisionTree();
  });

  describe('resolution', () => {
    it('should resolve keywords to skills', () => {
      const results = tree.resolve(['code', 'write']);
      expect(Array.isArray(results)).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const results = tree.resolve(['nonexistent']);
      expect(results).toEqual([]);
    });

    it('should handle multiple keywords', () => {
      const results = tree.resolve(['chat', 'message']);
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe('tracing', () => {
    it('should trace path through tree', () => {
      const traces = tree.trace(['code']);
      expect(Array.isArray(traces)).toBe(true);

      if (traces.length > 0) {
        expect(traces[0]).toHaveProperty('skill');
        expect(traces[0]).toHaveProperty('path');
        expect(Array.isArray(traces[0].path)).toBe(true);
      }
    });

    it('should return empty traces for no matches', () => {
      const traces = tree.trace(['xyz123']);
      expect(traces).toEqual([]);
    });
  });

  describe('rebuilding', () => {
    it('should rebuild tree from skills', () => {
      const skills: SkillCartridge[] = [
        {
          name: 'test-chat',
          version: '1.0.0',
          category: 'communication',
          triggers: ['chat', 'message'],
          steps: [{ action: 'respond', description: 'Chat response' }],
        },
        {
          name: 'test-code',
          version: '1.0.0',
          category: 'code',
          triggers: ['code', 'programming'],
          steps: [{ action: 'write', description: 'Write code' }],
        },
      ];

      tree.rebuild(skills);
      const newTree = tree.getTree();
      expect(newTree).toHaveProperty('question');
      expect(newTree).toHaveProperty('branches');
    });
  });

  describe('tree structure', () => {
    it('should have valid tree structure', () => {
      const treeRoot = tree.getTree();
      expect(treeRoot).toHaveProperty('question');
      expect(treeRoot).toHaveProperty('branches');
      expect(typeof treeRoot.question).toBe('string');
      expect(typeof treeRoot.branches).toBe('object');
    });
  });
});

describe('SkillMatcher', () => {
  let matcher: SkillMatcher;

  beforeEach(() => {
    matcher = new SkillMatcher();
  });

  describe('matching', () => {
    it('should add and match skills', () => {
      const skill: SkillCartridge = {
        name: 'test-chat',
        version: '1.0.0',
        triggers: ['chat', 'message', 'conversation'],
        steps: [{ action: 'respond', description: 'Chat response' }],
      };

      matcher.add(skill);
      const matches = matcher.match(['chat']);
      expect(matches).toContain('test-chat');
    });

    it('should match multiple keywords', () => {
      const skill1: SkillCartridge = {
        name: 'chat',
        version: '1.0.0',
        triggers: ['chat'],
        steps: [{ action: 'respond', description: 'Chat' }],
      };

      const skill2: SkillCartridge = {
        name: 'code',
        version: '1.0.0',
        triggers: ['code'],
        steps: [{ action: 'write', description: 'Code' }],
      };

      matcher.add(skill1);
      matcher.add(skill2);

      const matches = matcher.match(['chat', 'code']);
      expect(matches).toContain('chat');
      expect(matches).toContain('code');
    });

    it('should return empty array for no matches', () => {
      const matches = matcher.match(['nonexistent']);
      expect(matches).toEqual([]);
    });

    it('should be case insensitive', () => {
      const skill: SkillCartridge = {
        name: 'test-chat',
        version: '1.0.0',
        triggers: ['Chat', 'MESSAGE'],
        steps: [{ action: 'respond', description: 'Chat' }],
      };

      matcher.add(skill);
      expect(matcher.match(['chat'])).toContain('test-chat');
      expect(matcher.match(['MESSAGE'])).toContain('test-chat');
    });
  });

  describe('management', () => {
    it('should get all skills', () => {
      const skill: SkillCartridge = {
        name: 'test',
        version: '1.0.0',
        triggers: ['test'],
        steps: [{ action: 'think', description: 'Test' }],
      };

      matcher.add(skill);
      const all = matcher.getAll();
      expect(all).toHaveLength(1);
      expect(all[0].name).toBe('test');
    });

    it('should clear all skills', () => {
      const skill: SkillCartridge = {
        name: 'test',
        version: '1.0.0',
        triggers: ['test'],
        steps: [{ action: 'think', description: 'Test' }],
      };

      matcher.add(skill);
      matcher.clear();

      expect(matcher.getAll()).toHaveLength(0);
      expect(matcher.match(['test'])).toEqual([]);
    });
  });
});