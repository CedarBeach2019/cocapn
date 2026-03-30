/**
 * Cloud Operation Handlers
 *
 * WebSocket message handlers for cloud worker integration:
 * - CLOUD_STATUS: Get cloud connection status
 * - CLOUD_SUBMIT_TASK: Submit task to cloud worker
 * - CLOUD_TASK_RESULT: Get task result from cloud worker
 */

import type { WebSocket } from "ws";
import type { HandlerContext } from "./types.js";
import type { CloudConnector } from "../cloud-bridge/connector.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CloudStatusMessage {
  type: 'CLOUD_STATUS';
}

export interface CloudSubmitTaskMessage {
  type: 'CLOUD_SUBMIT_TASK';
  taskType: string;
  payload: unknown;
  waitForCompletion?: boolean;
  pollInterval?: number;
  timeout?: number;
}

export interface CloudTaskResultMessage {
  type: 'CLOUD_TASK_RESULT';
  taskId: string;
}

// ─── Get Cloud Connector Helper ────────────────────────────────────────────────

/**
 * Get the CloudConnector instance from the handler context.
 * Returns undefined if cloud is not configured.
 */
function getCloudConnector(ctx: HandlerContext): CloudConnector | undefined {
  // The CloudConnector is stored on the bridge instance
  const bridge = ctx.bridge;
  if (!bridge) return undefined;

  // Try to get the connector from the bridge
  return (bridge as any).cloudConnector as CloudConnector | undefined;
}

// ─── Handlers ───────────────────────────────────────────────────────────────────

/**
 * Handle CLOUD_STATUS message.
 * Returns the current cloud connection status.
 */
export async function handleCloudStatus(
  ws: WebSocket,
  clientId: string,
  _msg: unknown,
  ctx: HandlerContext
): Promise<void> {
  const connector = getCloudConnector(ctx);
  const sender = ctx.sender;

  if (!connector) {
    sender.error(ws, null, 'Cloud connector not available');
    return;
  }

  try {
    const status = await connector.getStatus();
    sender.result(ws, null, {
      type: 'CLOUD_STATUS',
      status,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    sender.error(ws, null, `Failed to get cloud status: ${error}`);
  }
}

/**
 * Handle CLOUD_SUBMIT_TASK message.
 * Submits a task to the cloud worker.
 */
export async function handleCloudSubmitTask(
  ws: WebSocket,
  clientId: string,
  msg: unknown,
  ctx: HandlerContext
): Promise<void> {
  const connector = getCloudConnector(ctx);
  const sender = ctx.sender;

  if (!connector) {
    sender.error(ws, null, 'Cloud connector not available');
    return;
  }

  const message = msg as CloudSubmitTaskMessage;

  if (!message.taskType) {
    sender.error(ws, null, 'Missing taskType');
    return;
  }

  try {
    // Check hybrid mode routing
    const shouldRunLocally = connector.shouldRunLocally({
      type: message.taskType,
      payload: message.payload,
    });

    if (shouldRunLocally) {
      sender.result(ws, null, {
        type: 'CLOUD_SUBMIT_TASK',
        routed: 'local',
        message: 'Task routed to local execution',
      });
      return;
    }

    // Submit to cloud
    const task = {
      type: message.taskType,
      payload: message.payload,
    };

    if (message.waitForCompletion) {
      const result = await connector.submitTaskAndWait(task, {
        pollInterval: message.pollInterval,
        timeout: message.timeout,
      });
      sender.result(ws, null, {
        type: 'CLOUD_SUBMIT_TASK',
        routed: 'cloud',
        result,
      });
    } else {
      const submitResult = await connector.submitTask(task);
      sender.result(ws, null, {
        type: 'CLOUD_SUBMIT_TASK',
        routed: 'cloud',
        taskId: submitResult.taskId,
        status: submitResult.status,
      });
    }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    sender.error(ws, null, `Task submission failed: ${error}`);
  }
}

/**
 * Handle CLOUD_TASK_RESULT message.
 * Gets the result of a previously submitted task.
 */
export async function handleCloudTaskResult(
  ws: WebSocket,
  clientId: string,
  msg: unknown,
  ctx: HandlerContext
): Promise<void> {
  const connector = getCloudConnector(ctx);
  const sender = ctx.sender;

  if (!connector) {
    sender.error(ws, null, 'Cloud connector not available');
    return;
  }

  const message = msg as CloudTaskResultMessage;

  if (!message.taskId) {
    sender.error(ws, null, 'Missing taskId');
    return;
  }

  try {
    const result = await connector.getTaskResult(message.taskId);
    sender.result(ws, null, {
      type: 'CLOUD_TASK_RESULT',
      result,
    });
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    sender.error(ws, null, `Failed to get task result: ${error}`);
  }
}
