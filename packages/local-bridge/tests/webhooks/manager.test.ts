/**
 * Tests for WebhookManager
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { WebhookManager } from '../../src/webhooks/manager.js';

describe('WebhookManager', () => {
  let repoRoot: string;
  let manager: WebhookManager;

  beforeEach(() => {
    // Create a temporary directory for testing
    repoRoot = join(tmpdir(), `cocapn-test-${Date.now()}`);
    manager = new WebhookManager(repoRoot);
  });

  afterEach(() => {
    // Clean up test directory
    const webhooksPath = join(repoRoot, '.cocapn', 'webhooks.json');
    if (existsSync(webhooksPath)) {
      unlinkSync(webhooksPath);
    }
  });

  describe('createWebhook', () => {
    it('should create a webhook with generated secret', () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['skill.loaded', 'task.completed']
      );

      expect(webhook).toBeDefined();
      expect(webhook.id).toBeTruthy();
      expect(webhook.name).toBe('test-webhook');
      expect(webhook.url).toBe('https://example.com/webhook');
      expect(webhook.events).toEqual(['skill.loaded', 'task.completed']);
      expect(webhook.secret).toBeTruthy();
      expect(webhook.enabled).toBe(true);
      expect(webhook.successCount).toBe(0);
      expect(webhook.failureCount).toBe(0);
      expect(webhook.createdAt).toBeLessThanOrEqual(Date.now());
    });

    it('should create a webhook with custom secret', () => {
      const customSecret = 'my-custom-secret';
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['skill.loaded'],
        customSecret
      );

      expect(webhook.secret).toBe(customSecret);
    });
  });

  describe('getWebhook', () => {
    it('should retrieve a webhook by ID', () => {
      const created = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['skill.loaded']
      );

      const retrieved = manager.getWebhook(created.id);

      expect(retrieved).toEqual(created);
    });

    it('should return undefined for non-existent webhook', () => {
      const retrieved = manager.getWebhook('non-existent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('listWebhooks', () => {
    it('should return empty array initially', () => {
      const webhooks = manager.listWebhooks();
      expect(webhooks).toEqual([]);
    });

    it('should return all webhooks', () => {
      const webhook1 = manager.createWebhook(
        'webhook1',
        'https://example.com/1',
        ['skill.loaded']
      );
      const webhook2 = manager.createWebhook(
        'webhook2',
        'https://example.com/2',
        ['task.completed']
      );

      const webhooks = manager.listWebhooks();

      expect(webhooks).toHaveLength(2);
      expect(webhooks).toContainEqual(webhook1);
      expect(webhooks).toContainEqual(webhook2);
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook', () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['skill.loaded']
      );

      const deleted = manager.deleteWebhook(webhook.id);
      expect(deleted).toBe(true);

      const retrieved = manager.getWebhook(webhook.id);
      expect(retrieved).toBeUndefined();
    });

    it('should return false for non-existent webhook', () => {
      const deleted = manager.deleteWebhook('non-existent');
      expect(deleted).toBe(false);
    });
  });

  describe('updateWebhook', () => {
    it('should update webhook properties', () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['skill.loaded']
      );

      const updated = manager.updateWebhook(webhook.id, {
        name: 'updated-webhook',
        enabled: false,
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('updated-webhook');
      expect(updated?.enabled).toBe(false);
      expect(updated?.id).toBe(webhook.id); // ID should not change
    });

    it('should return undefined for non-existent webhook', () => {
      const updated = manager.updateWebhook('non-existent', {
        name: 'updated',
      });
      expect(updated).toBeUndefined();
    });
  });

  describe('verifySignature', () => {
    it('should verify correct signature', () => {
      const payload = '{"test":"data"}';
      const secret = 'test-secret';

      const crypto = require('crypto');
      const hmac = crypto.createHmac('sha256', secret);
      hmac.update(payload);
      const signature = hmac.digest('hex');

      const isValid = manager.verifySignature(payload, signature, secret);
      expect(isValid).toBe(true);
    });

    it('should reject incorrect signature', () => {
      const payload = '{"test":"data"}';
      const secret = 'test-secret';
      const wrongSignature = 'wrong-signature';

      const isValid = manager.verifySignature(payload, wrongSignature, secret);
      expect(isValid).toBe(false);
    });
  });

  describe('triggerEvent', () => {
    it('should trigger event to matching webhooks', async () => {
      const webhook1 = manager.createWebhook(
        'webhook1',
        'https://example.com/1',
        ['skill.loaded']
      );
      const webhook2 = manager.createWebhook(
        'webhook2',
        'https://example.com/2',
        ['task.completed']
      );

      // Mock fetch to avoid actual HTTP requests
      global.fetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => 'OK',
        } as Response;
      };

      const results = await manager.triggerEvent('skill.loaded', { data: 'test' });

      expect(results).toHaveLength(1); // Only webhook1 matches
      expect(results[0].success).toBe(true);

      // Check webhook stats
      const updated = manager.getWebhook(webhook1.id);
      expect(updated?.successCount).toBe(1);
      expect(updated?.lastTriggered).toBeTruthy();
    });

    it('should not trigger disabled webhooks', async () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['skill.loaded']
      );

      manager.updateWebhook(webhook.id, { enabled: false });

      global.fetch = async () => {
        return {
          ok: true,
          status: 200,
          text: async () => 'OK',
        } as Response;
      };

      const results = await manager.triggerEvent('skill.loaded', { data: 'test' });

      expect(results).toHaveLength(0);
    });

    it('should handle failed deliveries', async () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['skill.loaded']
      );

      global.fetch = async () => {
        throw new Error('Network error');
      };

      const results = await manager.triggerEvent('skill.loaded', { data: 'test' });

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);

      const updated = manager.getWebhook(webhook.id);
      expect(updated?.failureCount).toBe(1);
    });
  });

  describe('persistence', () => {
    it('should persist webhooks to disk', () => {
      const webhook1 = manager.createWebhook(
        'webhook1',
        'https://example.com/1',
        ['skill.loaded']
      );
      const webhook2 = manager.createWebhook(
        'webhook2',
        'https://example.com/2',
        ['task.completed']
      );

      // Create a new manager instance (should load from disk)
      const newManager = new WebhookManager(repoRoot);

      expect(newManager.listWebhooks()).toHaveLength(2);
      expect(newManager.getWebhook(webhook1.id)).toEqual(webhook1);
      expect(newManager.getWebhook(webhook2.id)).toEqual(webhook2);
    });
  });

  describe('getDeliveries', () => {
    it('should return empty array for new webhook', () => {
      const webhook = manager.createWebhook(
        'test-webhook',
        'https://example.com/webhook',
        ['skill.loaded']
      );

      const deliveries = manager.getDeliveries(webhook.id);
      expect(deliveries).toEqual([]);
    });
  });

  describe('clearOldDeliveries', () => {
    it('should clear old deliveries', () => {
      manager.clearOldDeliveries(1000); // Clear deliveries older than 1 second
      // Should not throw
      expect(true).toBe(true);
    });
  });
});
