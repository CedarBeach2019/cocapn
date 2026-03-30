/**
 * MODULE_INSTALL handler — install a module by git URL, streaming progress.
 *
 * Expects: { type: "MODULE_INSTALL", id, gitUrl }
 * Emits:   { type: "MODULE_PROGRESS", id, line, stream }
 *          { type: "MODULE_RESULT", id, ok, module?, error? }
 *
 * Also provides broadcastModuleList for notifying all clients of module changes.
 */

import { WebSocket } from "ws";
import type { TypedHandler, HandlerContext } from "./types.js";
import type { TypedMessage } from "../ws/types.js";

/** MODULE_INSTALL / INSTALL_MODULE — install module by git URL. */
export const handleModuleInstall: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const gitUrl = msg["gitUrl"] as string | undefined;
  if (!gitUrl) {
    ctx.sender.typed(ws, { type: "MODULE_RESULT", id: msg.id, ok: false, error: "Missing gitUrl" });
    return;
  }

  const manager = ctx.getModuleManager();

  try {
    const mod = await manager.add(gitUrl, (line, stream) => {
      ctx.sender.typed(ws, { type: "MODULE_PROGRESS", id: msg.id, line, stream });
    });
    ctx.sender.typed(ws, { type: "MODULE_RESULT", id: msg.id, ok: true, module: mod });
    // Broadcast updated module list to all connected clients
    broadcastModuleList(ctx);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    ctx.sender.typed(ws, { type: "MODULE_RESULT", id: msg.id, ok: false, error: message });
  }
};

/** Broadcast the current module list to all connected clients. */
export function broadcastModuleList(ctx: HandlerContext): void {
  const modules = ctx.getModuleManager().list();
  ctx.broadcast({ type: "MODULE_LIST_UPDATE", modules });
}
