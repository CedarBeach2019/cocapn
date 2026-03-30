/**
 * Webhooks Handler — WebSocket handlers for webhook operations
 */

import type { Sender } from '../ws/send.js';
import type { HandlerContext } from './types.js';

/**
 * Handle WEBHOOK_LIST WebSocket method
 * Returns list of all webhooks
 */
export async function handleWebhookList(
  context: HandlerContext,
  sender: Sender
): Promise<void> {
  const webhookManager = context.getModuleManager().get('webhooks');

  if (!webhookManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook manager not available',
        webhooks: [],
      },
    });
    return;
  }

  const webhooks = webhookManager.listWebhooks();

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      webhooks: webhooks.map(w => ({
        id: w.id,
        name: w.name,
        url: w.url,
        events: w.events,
        enabled: w.enabled,
        createdAt: w.createdAt,
        lastTriggered: w.lastTriggered,
        successCount: w.successCount,
        failureCount: w.failureCount,
      })),
    },
  });
}

/**
 * Handle WEBHOOK_CREATE WebSocket method
 * Creates a new webhook
 */
export async function handleWebhookCreate(
  context: HandlerContext,
  sender: Sender,
  params: {
    name: string;
    url: string;
    events: string[];
    secret?: string;
  }
): Promise<void> {
  const webhookManager = context.getModuleManager().get('webhooks');

  if (!webhookManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook manager not available',
      },
    });
    return;
  }

  try {
    const webhook = webhookManager.createWebhook(
      params.name,
      params.url,
      params.events,
      params.secret
    );

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        webhook: {
          id: webhook.id,
          name: webhook.name,
          url: webhook.url,
          events: webhook.events,
          secret: webhook.secret, // Only returned on creation
          enabled: webhook.enabled,
          createdAt: webhook.createdAt,
        },
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * Handle WEBHOOK_DELETE WebSocket method
 * Deletes a webhook
 */
export async function handleWebhookDelete(
  context: HandlerContext,
  sender: Sender,
  params: { id: string }
): Promise<void> {
  const webhookManager = context.getModuleManager().get('webhooks');

  if (!webhookManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook manager not available',
      },
    });
    return;
  }

  const deleted = webhookManager.deleteWebhook(params.id);

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: deleted,
      deleted,
      id: params.id,
    },
  });
}

/**
 * Handle WEBHOOK_UPDATE WebSocket method
 * Updates a webhook
 */
export async function handleWebhookUpdate(
  context: HandlerContext,
  sender: Sender,
  params: {
    id: string;
    name?: string;
    url?: string;
    events?: string[];
    enabled?: boolean;
  }
): Promise<void> {
  const webhookManager = context.getModuleManager().get('webhooks');

  if (!webhookManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook manager not available',
      },
    });
    return;
  }

  const webhook = webhookManager.getWebhook(params.id);

  if (!webhook) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook not found',
      },
    });
    return;
  }

  const updates: Partial<{ name: string; url: string; events: string[]; enabled: boolean }> = {};
  if (params.name !== undefined) updates.name = params.name;
  if (params.url !== undefined) updates.url = params.url;
  if (params.events !== undefined) updates.events = params.events;
  if (params.enabled !== undefined) updates.enabled = params.enabled;

  const updated = webhookManager.updateWebhook(params.id, updates);

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      webhook: updated ? {
        id: updated.id,
        name: updated.name,
        url: updated.url,
        events: updated.events,
        enabled: updated.enabled,
        createdAt: updated.createdAt,
        lastTriggered: updated.lastTriggered,
        successCount: updated.successCount,
        failureCount: updated.failureCount,
      } : null,
    },
  });
}

/**
 * Handle WEBHOOK_GET_DELIVERIES WebSocket method
 * Returns delivery history for a webhook
 */
export async function handleWebhookGetDeliveries(
  context: HandlerContext,
  sender: Sender,
  params: { id: string }
): Promise<void> {
  const webhookManager = context.getModuleManager().get('webhooks');

  if (!webhookManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook manager not available',
        deliveries: [],
      },
    });
    return;
  }

  const webhook = webhookManager.getWebhook(params.id);

  if (!webhook) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook not found',
        deliveries: [],
      },
    });
    return;
  }

  const deliveries = webhookManager.getDeliveries(params.id);

  await sender({
    jsonrpc: '2.0',
    id: null,
    result: {
      success: true,
      deliveries: deliveries.map(d => ({
        id: d.id,
        webhookId: d.webhookId,
        eventId: d.eventId,
        status: d.status,
        responseCode: d.responseCode,
        responseBody: d.responseBody,
        attempts: d.attempts,
        createdAt: d.createdAt,
      })),
    },
  });
}

/**
 * Handle WEBHOOK_TRIGGER WebSocket method
 * Manually trigger an event
 */
export async function handleWebhookTrigger(
  context: HandlerContext,
  sender: Sender,
  params: {
    type: string;
    payload: unknown;
  }
): Promise<void> {
  const webhookManager = context.getModuleManager().get('webhooks');

  if (!webhookManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook manager not available',
      },
    });
    return;
  }

  try {
    const results = await webhookManager.triggerEvent(params.type, params.payload);

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
        results,
        count: results.length,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

/**
 * Handle WEBHOOK_RETRY_FAILED WebSocket method
 * Retries failed webhook deliveries
 */
export async function handleWebhookRetryFailed(
  context: HandlerContext,
  sender: Sender,
  params: { maxRetries?: number }
): Promise<void> {
  const webhookManager = context.getModuleManager().get('webhooks');

  if (!webhookManager) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: 'Webhook manager not available',
      },
    });
    return;
  }

  try {
    await webhookManager.retryFailed(params.maxRetries);

    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: true,
      },
    });
  } catch (error) {
    await sender({
      jsonrpc: '2.0',
      id: null,
      result: {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
  }
}
