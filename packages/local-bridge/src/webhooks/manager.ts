/**
 * Webhook Manager — manages webhook registration, event delivery, and persistence.
 *
 * Responsibilities:
 * - Create, update, delete webhooks
 * - Trigger events to matching webhooks
 * - Deliver webhooks with signature verification
 * - Retry failed deliveries
 * - Persist webhooks to ~/.cocapn/webhooks.json
 */

import { randomBytes } from 'crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { createLogger } from '../logger.js';
import type {
  Webhook,
  WebhookEvent,
  WebhookDelivery,
  WebhookDeliveryResult,
} from './types.js';

const logger = createLogger('webhooks');

/**
 * Storage path for webhooks configuration.
 */
function getWebhooksStoragePath(repoRoot: string): string {
  return join(repoRoot, '.cocapn', 'webhooks.json');
}

/**
 * Webhook manager class.
 */
export class WebhookManager {
  private webhooks: Map<string, Webhook>;
  private deliveries: Map<string, WebhookDelivery>;
  private repoRoot: string;
  private storagePath: string;
  private deliveryQueue: Map<string, WebhookDeliveryResult[]>;

  constructor(repoRoot: string) {
    this.repoRoot = repoRoot;
    this.webhooks = new Map();
    this.deliveries = new Map();
    this.deliveryQueue = new Map();
    this.storagePath = getWebhooksStoragePath(repoRoot);
    this.load();
  }

  /**
   * Create a new webhook.
   */
  createWebhook(
    name: string,
    url: string,
    events: string[],
    secret?: string
  ): Webhook {
    const id = this.generateId();
    const webhookSecret = secret || this.generateSecret();

    const webhook: Webhook = {
      id,
      name,
      url,
      events,
      secret: webhookSecret,
      enabled: true,
      createdAt: Date.now(),
      successCount: 0,
      failureCount: 0,
    };

    this.webhooks.set(id, webhook);
    this.save();

    logger.info('Webhook created', { id, name, url, events });
    return webhook;
  }

  /**
   * Delete a webhook by ID.
   */
  deleteWebhook(id: string): boolean {
    const deleted = this.webhooks.delete(id);
    if (deleted) {
      this.save();
      logger.info('Webhook deleted', { id });
    }
    return deleted;
  }

  /**
   * Get a webhook by ID.
   */
  getWebhook(id: string): Webhook | undefined {
    return this.webhooks.get(id);
  }

  /**
   * List all webhooks.
   */
  listWebhooks(): Webhook[] {
    return Array.from(this.webhooks.values());
  }

  /**
   * Update a webhook.
   */
  updateWebhook(
    id: string,
    updates: Partial<Omit<Webhook, 'id' | 'createdAt'>>
  ): Webhook | undefined {
    const webhook = this.webhooks.get(id);
    if (!webhook) return undefined;

    const updated = { ...webhook, ...updates };
    this.webhooks.set(id, updated);
    this.save();

    logger.info('Webhook updated', { id, updates });
    return updated;
  }

  /**
   * Trigger an event to all matching webhooks.
   * Returns delivery results for each webhook.
   */
  async triggerEvent(type: string, payload: unknown): Promise<WebhookDeliveryResult[]> {
    const event: WebhookEvent = {
      id: this.generateId(),
      type,
      payload,
      timestamp: Date.now(),
    };

    const matchingWebhooks = Array.from(this.webhooks.values()).filter(
      (w) => w.enabled && w.events.includes(type)
    );

    if (matchingWebhooks.length === 0) {
      logger.debug('No webhooks matched event', { type });
      return [];
    }

    logger.info('Triggering event to webhooks', {
      type,
      webhookCount: matchingWebhooks.length,
    });

    const results: WebhookDeliveryResult[] = [];

    for (const webhook of matchingWebhooks) {
      try {
        const result = await this.deliverWebhook(webhook, event);
        results.push(result);

        // Update webhook stats
        if (result.success) {
          webhook.successCount++;
          webhook.lastTriggered = Date.now();
        } else {
          webhook.failureCount++;
        }
      } catch (error) {
        logger.error('Failed to deliver webhook', error, { webhookId: webhook.id });
        results.push({
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.save();
    return results;
  }

  /**
   * Deliver a webhook to its target URL.
   */
  private async deliverWebhook(
    webhook: Webhook,
    event: WebhookEvent
  ): Promise<WebhookDeliveryResult> {
    const deliveryId = this.generateId();
    const delivery: WebhookDelivery = {
      id: deliveryId,
      webhookId: webhook.id,
      eventId: event.id,
      status: 'pending',
      attempts: 1,
      createdAt: Date.now(),
    };

    try {
      const signature = this.signPayload(event, webhook.secret);

      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Cocapn-Webhook/1.0',
          'X-Webhook-Id': webhook.id,
          'X-Webhook-Event': event.type,
          'X-Webhook-Delivery': deliveryId,
          'X-Webhook-Signature': signature,
          'X-Webhook-Timestamp': event.timestamp.toString(),
        },
        body: JSON.stringify(event),
      });

      const responseBody = await response.text();
      const success = response.ok;

      delivery.status = success ? 'success' : 'failed';
      delivery.responseCode = response.status;
      delivery.responseBody = responseBody.slice(0, 1000); // Truncate

      if (success) {
        logger.info('Webhook delivered successfully', {
          webhookId: webhook.id,
          deliveryId,
          statusCode: response.status,
        });
        return {
          success: true,
          statusCode: response.status,
          body: responseBody,
        };
      } else {
        logger.warn('Webhook delivery failed', {
          webhookId: webhook.id,
          deliveryId,
          statusCode: response.status,
        });
        return {
          success: false,
          statusCode: response.status,
          body: responseBody,
          error: `HTTP ${response.status}`,
        };
      }
    } catch (error) {
      delivery.status = 'failed';

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Webhook delivery error', error, {
        webhookId: webhook.id,
        deliveryId,
      });

      return {
        success: false,
        error: errorMessage,
      };
    } finally {
      this.deliveries.set(deliveryId, delivery);
    }
  }

  /**
   * Retry failed webhook deliveries.
   */
  async retryFailed(maxRetries: number = 3): Promise<void> {
    const failedDeliveries = Array.from(this.deliveries.values()).filter(
      (d) => d.status === 'failed' && d.attempts < maxRetries
    );

    logger.info('Retrying failed webhooks', {
      count: failedDeliveries.length,
    });

    for (const delivery of failedDeliveries) {
      const webhook = this.webhooks.get(delivery.webhookId);
      if (!webhook || !webhook.enabled) continue;

      delivery.attempts++;

      // Reconstruct event (simplified - in production you'd store the full event)
      const event: WebhookEvent = {
        id: delivery.eventId,
        type: '', // Would need to look up from storage
        payload: null,
        timestamp: delivery.createdAt,
      };

      try {
        await this.deliverWebhook(webhook, event);
      } catch (error) {
        logger.error('Retry failed', error, { deliveryId: delivery.id });
      }
    }
  }

  /**
   * Verify webhook signature.
   */
  verifySignature(
    payload: string,
    signature: string,
    secret: string
  ): boolean {
    const expectedSignature = this.signPayloadString(payload, secret);
    return signature === expectedSignature;
  }

  /**
   * Sign a payload with HMAC-SHA256.
   */
  private signPayload(event: WebhookEvent, secret: string): string {
    return this.signPayloadString(JSON.stringify(event), secret);
  }

  /**
   * Sign a payload string with HMAC-SHA256.
   */
  private signPayloadString(payload: string, secret: string): string {
    const crypto = require('crypto');
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload);
    return hmac.digest('hex');
  }

  /**
   * Load webhooks from storage.
   */
  private load(): void {
    if (!existsSync(this.storagePath)) {
      logger.info('No webhooks file found, starting fresh');
      return;
    }

    try {
      const data = readFileSync(this.storagePath, 'utf-8');
      const parsed = JSON.parse(data);

      this.webhooks.clear();
      for (const webhook of parsed.webhooks || []) {
        this.webhooks.set(webhook.id, webhook);
      }

      logger.info('Webhooks loaded', { count: this.webhooks.size });
    } catch (error) {
      logger.error('Failed to load webhooks', error);
    }
  }

  /**
   * Save webhooks to storage.
   */
  private save(): void {
    try {
      const dir = join(this.repoRoot, '.cocapn');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      const data = {
        webhooks: Array.from(this.webhooks.values()),
        updatedAt: Date.now(),
      };

      writeFileSync(this.storagePath, JSON.stringify(data, null, 2));
    } catch (error) {
      logger.error('Failed to save webhooks', error);
    }
  }

  /**
   * Generate a unique ID.
   */
  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Generate a random webhook secret.
   */
  private generateSecret(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Get delivery history for a webhook.
   */
  getDeliveries(webhookId: string): WebhookDelivery[] {
    return Array.from(this.deliveries.values()).filter(
      (d) => d.webhookId === webhookId
    );
  }

  /**
   * Clear old delivery records.
   */
  clearOldDeliveries(olderThanMs: number = 7 * 24 * 60 * 60 * 1000): void {
    const cutoff = Date.now() - olderThanMs;
    let cleared = 0;

    for (const [id, delivery] of this.deliveries.entries()) {
      if (delivery.createdAt < cutoff) {
        this.deliveries.delete(id);
        cleared++;
      }
    }

    if (cleared > 0) {
      logger.info('Cleared old deliveries', { count: cleared });
    }
  }
}
