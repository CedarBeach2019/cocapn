/**
 * A2A_REQUEST handler — route an A2A task to the best available agent.
 *
 * Expects: { type: "A2A_REQUEST", id, task }
 * Emits:   { type: "A2A_RESPONSE", id, routed, agent?, error? }
 */

import { WebSocket } from "ws";
import type { TypedHandler, HandlerContext } from "./types.js";
import type { TypedMessage } from "../ws/types.js";

/** A2A_REQUEST — route A2A task to best agent. */
export const handleA2aRequest: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const taskDescription = JSON.stringify(msg["task"] ?? msg);
  const routeResult = await ctx.router.resolveAndEnsureRunning(taskDescription);

  if (!routeResult) {
    ctx.sender.typed(ws, { type: "A2A_RESPONSE", id: msg.id, routed: false, error: "No agent available" });
    return;
  }

  ctx.sender.typed(ws, {
    type:   "A2A_RESPONSE",
    id:     msg.id,
    routed: true,
    agent:  routeResult.definition.id,
    source: routeResult.source,
  });
};
