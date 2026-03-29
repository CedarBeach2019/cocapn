/**
 * Tests for PluginRegistryClient — search, install, publish, etc.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { PluginRegistryClient } from '../../src/plugins/registry-client.js';

// ─── Test Setup ───────────────────────────────────────────────────────────────

// Create mock directory using real os.tmpdir() before mocking
const MOCK_HOME = mkdtempSync(join(os.tmpdir(), 'cocapn-registry-test-'));

vi.mock('node:os', async (importOriginal) => {
  const actualOs = await importOriginal<typeof import('os')>();
  return {
    ...actualOs,
    homedir: () => MOCK_HOME,
  };
});

// Mock fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('PluginRegistryClient', () => {
  let client: PluginRegistryClient;

  beforeEach(() => {
    client = new PluginRegistryClient('https://registry.test.com', 'test-token');
    mockFetch.mockClear();
  });

  afterEach(() => {
    rmSync(MOCK_HOME, { recursive: true, force: true });
  });

  describe('search', () => {
    it('searches plugins with query', async () => {
      const mockResponse = {
        plugins: [
          {
            name: 'cocapn-plugin-github',
            version: '1.0.0',
            description: 'GitHub integration',
            author: 'Test',
            installs: 100,
            rating: 4.5,
            keywords: ['github'],
          },
        ],
        total: 1,
        page: 1,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await client.search({ query: 'github' });

      expect(result).toEqual(mockResponse.plugins);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('q=github'),
        expect.any(Object)
      );
    });

    it('handles registry errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Not Found',
      });

      await expect(client.search({ query: 'test' })).rejects.toThrow('Registry search failed');
    });
  });

  describe('get', () => {
    it('gets plugin info by name', async () => {
      const mockInfo = {
        name: 'cocapn-plugin-github',
        version: '1.0.0',
        description: 'GitHub integration',
        author: 'Test',
        license: 'MIT',
        readme: '# GitHub Plugin',
        skills: [],
        permissions: [],
        versions: ['1.0.0'],
        installs: 100,
        rating: 4.5,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => mockInfo,
      });

      const result = await client.get('cocapn-plugin-github');

      expect(result).toEqual(mockInfo);
    });

    it('returns null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await client.get('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('publish', () => {
    it('fails when manifest not found', async () => {
      const result = await client.publish('/nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('cocapn-plugin.json not found');
    });

    it('returns dry run result without publishing', async () => {
      const pluginDir = mkdtempSync(join(os.tmpdir(), 'cocapn-publish-'));

      try {
        const { writeFileSync } = await import('node:fs');

        const manifest = {
          name: 'cocapn-plugin-test',
          version: '1.0.0',
          description: 'Test',
          author: 'Test',
          skills: [],
          permissions: [],
        };

        writeFileSync(
          join(pluginDir, 'cocapn-plugin.json'),
          JSON.stringify(manifest),
          'utf-8'
        );

        const result = await client.publish(pluginDir, { dryRun: true });

        expect(result.success).toBe(true);
        expect(mockFetch).not.toHaveBeenCalled();
      } finally {
        const { rmSync: rm } = await import('node:fs');
        rm(pluginDir, { recursive: true, force: true });
      }
    });
  });

  describe('verify', () => {
    it('fails when manifest not found', async () => {
      const result = await client.verify('/nonexistent');

      expect(result.success).toBe(false);
      expect(result.output).toContain('cocapn-plugin.json not found');
    });

    it('fails when no test script defined', async () => {
      const pluginDir = mkdtempSync(join(os.tmpdir(), 'cocapn-verify-'));

      try {
        const { writeFileSync } = await import('node:fs');

        const manifest = {
          name: 'cocapn-plugin-test',
          version: '1.0.0',
          description: 'Test',
          author: 'Test',
          skills: [],
          permissions: [],
        };

        writeFileSync(
          join(pluginDir, 'cocapn-plugin.json'),
          JSON.stringify(manifest),
          'utf-8'
        );

        const result = await client.verify(pluginDir);

        expect(result.success).toBe(false);
        expect(result.output).toContain('No test script defined');
      } finally {
        const { rmSync: rm } = await import('node:fs');
        rm(pluginDir, { recursive: true, force: true });
      }
    });
  });
});
