/**
 * Fleet handlers — typed-message handlers for fleet operations on the bridge WS.
 *
 * These handlers expose fleet functionality to UI clients and other consumers
 * connected to the bridge WebSocket.  They delegate to the FleetAgent instance
 * stored on the HandlerContext.
 *
 * Wire message types:
 *   FLEET_JOIN        — join an existing fleet as worker (or create if leader)
 *   FLEET_SUBMIT_TASK — submit a task to the fleet (leader only)
 *   FLEET_TASK_STATUS — query task status
 *   FLEET_LIST_AGENTS — list all agents in the fleet
 *   FLEET_HEARTBEAT   — send a heartbeat to the fleet leader
 */

import type { WebSocket } from 'ws';
import type { TypedMessage } from '../ws/types.js';
import type { HandlerContext } from './types.js';
import type { FleetAgent } from '../fleet/agent.js';

// ─── Accessor ────────────────────────────────────────────────────────────────

/**
 * The FleetAgent is stored on the HandlerContext bridge reference.
 * We use a dynamic property to avoid modifying the core types.
 */
function getFleetAgent(ctx: HandlerContext): FleetAgent | undefined {
  return (ctx as any).fleetAgent as FleetAgent | undefined;
}

// ─── FLEET_JOIN ───────────────────────────────────────────────────────────────

export async function handleFleetJoin(
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  const agent = getFleetAgent(ctx);
  if (!agent) {
    ctx.sender.typed(ws, {
      type: 'FLEET_JOIN_ERROR',
      id: msg.id,
      error: 'Fleet agent not initialized',
    });
    return;
  }

  try {
    const leaderUrl = msg.leaderUrl as string | undefined;
    const role = agent.getRole();

    if (role === 'leader') {
      const result = await agent.createFleet();
      ctx.sender.typed(ws, {
        type: 'FLEET_JOIN_RESULT',
        id: msg.id,
        fleetId: result.fleetId,
        port: result.port,
        role: 'leader',
      });
    } else if (leaderUrl) {
      const result = await agent.joinFleet(leaderUrl);
      ctx.sender.typed(ws, {
        type: 'FLEET_JOIN_RESULT',
        id: msg.id,
        fleetId: result.fleetId,
        role: result.role,
        agents: result.agents,
      });
    } else {
      ctx.sender.typed(ws, {
        type: 'FLEET_JOIN_ERROR',
        id: msg.id,
        error: 'leaderUrl is required for workers',
      });
    }
  } catch (err) {
    ctx.sender.typed(ws, {
      type: 'FLEET_JOIN_ERROR',
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── FLEET_SUBMIT_TASK ────────────────────────────────────────────────────────

export async function handleFleetSubmitTask(
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  const agent = getFleetAgent(ctx);
  if (!agent) {
    ctx.sender.typed(ws, {
      type: 'FLEET_SUBMIT_TASK_ERROR',
      id: msg.id,
      error: 'Fleet agent not initialized',
    });
    return;
  }

  try {
    const task = msg.task as {
      type: string;
      payload: unknown;
      subtasks?: Array<{ id: string; description: string; payload?: unknown }>;
      mergeStrategy?: 'concat' | 'vote' | 'quorum' | 'custom';
    };

    if (!task || !task.type) {
      ctx.sender.typed(ws, {
        type: 'FLEET_SUBMIT_TASK_ERROR',
        id: msg.id,
        error: 'Missing task.type',
      });
      return;
    }

    const taskId = await agent.submitTask(task);
    ctx.sender.typed(ws, {
      type: 'FLEET_SUBMIT_TASK_RESULT',
      id: msg.id,
      taskId,
    });
  } catch (err) {
    ctx.sender.typed(ws, {
      type: 'FLEET_SUBMIT_TASK_ERROR',
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── FLEET_TASK_STATUS ───────────────────────────────────────────────────────

export async function handleFleetTaskStatus(
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  const agent = getFleetAgent(ctx);
  if (!agent) {
    ctx.sender.typed(ws, {
      type: 'FLEET_TASK_STATUS_ERROR',
      id: msg.id,
      error: 'Fleet agent not initialized',
    });
    return;
  }

  try {
    const taskId = msg.taskId as string;
    if (!taskId) {
      ctx.sender.typed(ws, {
        type: 'FLEET_TASK_STATUS_ERROR',
        id: msg.id,
        error: 'Missing taskId',
      });
      return;
    }

    const task = await agent.getTaskStatus(taskId);
    ctx.sender.typed(ws, {
      type: 'FLEET_TASK_STATUS_RESULT',
      id: msg.id,
      task,
    });
  } catch (err) {
    ctx.sender.typed(ws, {
      type: 'FLEET_TASK_STATUS_ERROR',
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── FLEET_LIST_AGENTS ────────────────────────────────────────────────────────

export async function handleFleetListAgents(
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  const agent = getFleetAgent(ctx);
  if (!agent) {
    ctx.sender.typed(ws, {
      type: 'FLEET_LIST_AGENTS_ERROR',
      id: msg.id,
      error: 'Fleet agent not initialized',
    });
    return;
  }

  try {
    const agents = await agent.listAgents();
    ctx.sender.typed(ws, {
      type: 'FLEET_LIST_AGENTS_RESULT',
      id: msg.id,
      agents,
    });
  } catch (err) {
    ctx.sender.typed(ws, {
      type: 'FLEET_LIST_AGENTS_ERROR',
      id: msg.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── FLEET_HEARTBEAT ──────────────────────────────────────────────────────────

export async function handleFleetHeartbeat(
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> {
  const agent = getFleetAgent(ctx);
  if (!agent) {
    ctx.sender.typed(ws, {
      type: 'FLEET_HEARTBEAT_ERROR',
      id: msg.id,
      error: 'Fleet agent not initialized',
    });
    return;
  }

  // Heartbeat is a no-op over the bridge WS — fleet agents send
  // heartbeats directly via their dedicated fleet WebSocket connection.
  ctx.sender.typed(ws, {
    type: 'FLEET_HEARTBEAT_RESULT',
    id: msg.id,
    status: 'ok',
    fleetId: agent.getFleetId(),
    agentId: agent.getAgentId(),
  });
}
