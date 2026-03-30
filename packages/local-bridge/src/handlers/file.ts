/**
 * FILE_EDIT handler — write content to a file within the repo and auto-commit.
 *
 * Expects: { type: "FILE_EDIT", id, path, content }
 * Emits:   { type: "FILE_EDIT_RESULT", id, ok, path?, error? }
 *
 * Security: Path is sanitized to prevent escaping the repo root.
 *
 * Post-Edit Hook:
 * - After editing a .ts file, automatically generates test skeleton if needed
 * - Runs the test file and reports results
 */

import { WebSocket } from "ws";
import { writeFileSync, existsSync } from "fs";
import type { TypedHandler, HandlerContext } from "./types.js";
import type { TypedMessage } from "../ws/types.js";
import { sanitizeRepoPath, SanitizationError } from "../utils/path-sanitizer.js";

/** FILE_EDIT — write file + auto-commit. Path sandboxed to repo root. */
export const handleFileEdit: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const relPath = msg["path"] as string | undefined;
  const content = msg["content"] as string | undefined;

  if (!relPath || content === undefined) {
    ctx.sender.typed(ws, { type: "FILE_EDIT_RESULT", id: msg.id, ok: false, error: "COCAPN-052: Missing path or content - Provide both 'path' and 'content' when editing files" });
    return;
  }

  let absPath: string;
  try {
    absPath = sanitizeRepoPath(relPath, ctx.repoRoot);
  } catch (err) {
    const detail = err instanceof SanitizationError ? err.message : "Invalid path";
    ctx.audit.log({
      action: "file.edit",
      agent: undefined,
      user: undefined,
      command: undefined,
      files: [relPath],
      result: "denied",
      detail,
      durationMs: undefined,
    });
    ctx.sender.typed(ws, { type: "FILE_EDIT_RESULT", id: msg.id, ok: false, error: detail });
    return;
  }

  const finish = ctx.audit.start({
    action: "file.edit",
    agent: undefined,
    user: undefined,
    command: undefined,
    files: [relPath],
  });

  try {
    writeFileSync(absPath, content, "utf8");
    const filename = relPath.split("/").pop() ?? relPath;
    await ctx.sync.commitFile(filename);
    finish("ok");
    ctx.sender.typed(ws, { type: "FILE_EDIT_RESULT", id: msg.id, ok: true, path: relPath });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finish("error", message);
    ctx.sender.typed(ws, {
      type: "FILE_EDIT_RESULT",
      id: msg.id,
      ok: false,
      error: message,
    });
  }
};
