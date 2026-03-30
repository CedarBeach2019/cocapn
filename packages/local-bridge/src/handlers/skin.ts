/**
 * CHANGE_SKIN handler — switch the active UI skin/theme.
 *
 * Expects: { type: "CHANGE_SKIN", id, skin, preview? }
 * Emits:   { type: "SKIN_UPDATE", id, skin, previewBranch?, cssVars?, done }
 *
 * Supports both built-in CSS variable themes (dark, light) and installed skin modules.
 */

import { WebSocket } from "ws";
import type { TypedHandler, HandlerContext } from "./types.js";
import type { TypedMessage } from "../ws/types.js";

// Built-in CSS variable skins
const BUILTIN_VARS: Record<string, Record<string, string>> = {
  dark:  { "--color-bg": "#0d0d0d", "--color-surface": "#1a1a1a", "--color-text": "#e8e8e8", "--color-primary": "#7c8aff" },
  light: { "--color-bg": "#ffffff", "--color-surface": "#f4f4f5", "--color-text": "#18181b", "--color-primary": "#3b5bdb" },
};

/** CHANGE_SKIN — switch UI theme/skin. */
export const handleChangeSkin: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const skin    = msg["skin"] as string | undefined;
  const preview = msg["preview"] as boolean | undefined;

  if (!skin) {
    ctx.sender.typed(ws, { type: "SKIN_UPDATE", id: msg.id, done: true, error: "Missing skin name" });
    return;
  }

  const manager = ctx.getModuleManager();
  const modules = manager.list();
  const skinMod  = modules.find(
    (m) => m.type === "skin" && (m.name === skin || m.name.includes(skin))
  );

  if (skinMod) {
    const otherSkins = modules.filter((m) => m.type === "skin" && m.name !== skinMod.name);
    for (const s of otherSkins) {
      try { await manager.disable(s.name); } catch { /* ignore */ }
    }
    try {
      await manager.enable(skinMod.name);
      ctx.sender.typed(ws, {
        type: "SKIN_UPDATE", id: msg.id,
        skin: skinMod.name, done: true,
        message: `Skin **${skinMod.name}** activated.`,
      });
      broadcastSkinUpdate(ctx, skinMod.name);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      ctx.sender.typed(ws, { type: "SKIN_UPDATE", id: msg.id, done: true, error: message });
    }
    return;
  }

  const cssVars = BUILTIN_VARS[skin.toLowerCase()];
  if (cssVars) {
    const branchName = preview ? `skin-preview-${skin}-${Date.now()}` : undefined;
    ctx.sender.typed(ws, {
      type: "SKIN_UPDATE", id: msg.id,
      skin, cssVars, done: true,
      previewBranch: branchName,
      message: preview
        ? `Skin preview created. Reply **"looks good, merge it"** to apply.`
        : `Theme **${skin}** applied.`,
    });
    broadcastSkinUpdate(ctx, skin, cssVars);
    return;
  }

  ctx.sender.typed(ws, {
    type: "SKIN_UPDATE", id: msg.id, done: true,
    error: `Unknown skin: ${skin}. Available: dark, light, or an installed skin module.`,
  });
};

/** Broadcast a skin update to all connected clients. */
export function broadcastSkinUpdate(
  ctx: HandlerContext,
  skin: string,
  cssVars?: Record<string, string>,
): void {
  ctx.broadcast({ type: "SKIN_UPDATE_BROADCAST", skin, cssVars });
}
