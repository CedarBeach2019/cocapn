/**
 * Tests for WebhookReceiver
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WebhookManager } from '../../src/webhooks/manager.js';
import { WebhookReceiver } from '../../src/webhooks/receiver.js';

describe('WebhookReceiver', () => {
  let repoRoot: string;
  let manager: WebhookManager;
  let receiver: WebhookReceiver;

  beforeEach(async () => {
    // Create a temporary directory for testing
    repoRoot = join(tmpdir(), `cocapn-test-${Date.now()}`);
    manager = new WebhookManager(repoRoot);
    receiver = new WebhookReceiver(manager, { port: 8788 });

    await receiver.start();
  });

  afterEach(async () => {
    await receiver.stop();

    // Clean up test directory
    const webhooksPath = join(repoRoot, '.cocapn', 'webhooks.json');
    if (existsSync(webhooksPath)) {
      unlinkSync(webhooksPath);
    }
  });

  describe('server lifecycle', () => {
    it('should start the server', async () => {
      // Server should be running
      expect(receiver).toBeDefined();

      const server = (receiver as any).server;
      expect(server).toBeDefined();
      expect(server.listening).toBe(true);
    });

    it('should stop the server', async () => {
      await receiver.stop();

      const server = (receiver as any).server;
      expect(server).toBeNull();
    });
  });

  describe('webhook manager integration', () => {
    it('should create webhooks', () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['test.event']
      );

      expect(webhook).toBeDefined();
      expect(webhook.name).toBe('test-webhook');
      expect(webhook.url).toBe('https://example.com/webhook');
    });

    it('should trigger events to webhooks', async () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['test.event']
      );

      // Mock fetch
      global.fetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => 'OK',
        } as Response;
      };

      const results = await manager.triggerEvent('test.event', { test: 'data' });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
    });

    it('should not trigger disabled webhooks', async () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['test.event']
      );

      manager.updateWebhook(webhook.id, { enabled: false });

      // Mock fetch (should not be called)
      let fetchCalled = false;
      global.fetch = async () => {
        fetchCalled = true;
        return {
          ok: true,
          status: 200,
          text: async () => 'OK',
        } as Response;
      };

      const results = await manager.triggerEvent('test.event', { test: 'data' });

      expect(results).toHaveLength(0);
      expect(fetchCalled).toBe(false);
    });
  });

  describe('signature verification', () => {
    it('should verify correct signature', () => {
      const crypto = require('crypto');
      const payload = '{"test":"data"}';
      const secret = 'test-secret';

      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const signature = hmac.digest('hex');

      const isValid = manager.verifySignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect signature', () => {
      const payload = '{"test":"data"}';
      const secret = 'test-secret';
      const wrongSignature = 'wrongsignature';

      const isValid = manager.verifySignature(payload, wrongSignature, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('webhook persistence', () => {
    it('should persist webhooks to disk', () => {
      const webhook1 = manager.createWebhook(
        'webhook1',
        'https://example.com/1',
        ['skill.loaded']
      );

      // Create a new manager instance (should load from disk)
      const newManager = new WebhookManager(repoRoot);

      const loaded = newManager.getWebhook(webhook1.id);
      expect(loaded).toBeDefined();
      expect(loaded?.name).toBe('webhook1');
    });
  });
});
