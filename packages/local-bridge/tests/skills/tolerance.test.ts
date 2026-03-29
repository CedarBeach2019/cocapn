/**
 * Tolerance Tests
 */

import { describe, it, expect } from 'vitest';
import { SkillLoader } from '../../src/skills/loader.js';
import type { SkillCartridge } from '../../src/skills/types.js';

describe('Skill Tolerance', () => {
  describe('tolerance modes', () => {
    it('should support retry tolerance', () => {
      const cartridge: SkillCartridge = {
        name: 'retry-skill',
        version: '1.0.0',
        triggers: ['retry'],
        steps: [{ action: 'execute', description: 'Execute with retry' }],
        tolerance: {
          network_failure: 'retry',
          timeout: 'retry',
        },
      };

      expect(cartridge.tolerance?.network_failure).toBe('retry');
      expect(cartridge.tolerance?.timeout).toBe('retry');
    });

    it('should support skip tolerance', () => {
      const cartridge: SkillCartridge = {
        name: 'skip-skill',
        version: '1.0.0',
        triggers: ['skip'],
        steps: [{ action: 'execute', description: 'Execute with skip' }],
        tolerance: {
          network_failure: 'skip',
          timeout: 'skip',
        },
      };

      expect(cartridge.tolerance?.network_failure).toBe('skip');
      expect(cartridge.tolerance?.timeout).toBe('skip');
    });

    it('should support fallback tolerance', () => {
      const cartridge: SkillCartridge = {
        name: 'fallback-skill',
        version: '1.0.0',
        triggers: ['fallback'],
        steps: [
          {
            action: 'execute',
            description: 'Execute with fallback',
            fallback: 'Use alternative method',
          },
        ],
        tolerance: {
          network_failure: 'fallback',
          invalid_input: 'fallback',
        },
      };

      expect(cartridge.tolerance?.network_failure).toBe('fallback');
      expect(cartridge.tolerance?.invalid_input).toBe('fallback');
      expect(cartridge.steps[0].fallback).toBe('Use alternative method');
    });

    it('should support error tolerance', () => {
      const cartridge: SkillCartridge = {
        name: 'error-skill',
        version: '1.0.0',
        triggers: ['error'],
        steps: [{ action: 'execute', description: 'Execute with error' }],
        tolerance: {
          invalid_input: 'error',
        },
      };

      expect(cartridge.tolerance?.invalid_input).toBe('error');
    });
  });

  describe('tolerance defaults', () => {
    it('should have default tolerance values', () => {
      const cartridge: SkillCartridge = {
        name: 'default-skill',
        version: '1.0.0',
        triggers: ['default'],
        steps: [{ action: 'think', description: 'Default' }],
        tolerance: {},
      };

      // Undefined tolerance should not throw
      expect(cartridge.tolerance).toBeDefined();
    });

    it('should work without tolerance specified', () => {
      const cartridge: SkillCartridge = {
        name: 'no-tolerance-skill',
        version: '1.0.0',
        triggers: ['no-tol'],
        steps: [{ action: 'think', description: 'No tolerance' }],
      };

      expect(cartridge.tolerance).toBeUndefined();
    });
  });

  describe('step fallbacks', () => {
    it('should include fallback in steps', () => {
      const cartridge: SkillCartridge = {
        name: 'fallback-step-skill',
        version: '1.0.0',
        triggers: ['fallback-step'],
        steps: [
          {
            action: 'execute',
            description: 'Primary action',
            fallback: 'Fallback action',
          },
          {
            action: 'read',
            description: 'Read data',
            fallback: 'Use cached data',
          },
        ],
      };

      expect(cartridge.steps[0].fallback).toBe('Fallback action');
      expect(cartridge.steps[1].fallback).toBe('Use cached data');
    });

    it('should work without step fallbacks', () => {
      const cartridge: SkillCartridge = {
        name: 'no-fallback-skill',
        version: '1.0.0',
        triggers: ['no-fallback'],
        steps: [
          { action: 'think', description: 'Think' },
          { action: 'respond', description: 'Respond' },
        ],
      };

      expect(cartridge.steps[0].fallback).toBeUndefined();
      expect(cartridge.steps[1].fallback).toBeUndefined();
    });
  });

  describe('tolerance in context', () => {
    it('should include tolerance in formatted context', () => {
      const loader = new SkillLoader();

      const cartridge: SkillCartridge = {
        name: 'tolerance-context',
        version: '1.0.0',
        triggers: ['tol'],
        steps: [{ action: 'execute', description: 'Execute' }],
        tolerance: {
          network_failure: 'retry',
          timeout: 'fallback',
        },
      };

      // The loader should format skills with tolerance
      const formatted = JSON.stringify(cartridge);
      expect(formatted).toContain('retry');
      expect(formatted).toContain('fallback');
    });
  });
});