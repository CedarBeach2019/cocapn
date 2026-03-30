/**
 * BASH handler — execute shell commands and stream stdout/stderr.
 *
 * Expects: { type: "BASH", id, command, cwd? }
 * Emits:   { type: "BASH_OUTPUT", id, stdout?, stderr?, done, exitCode? }
 *
 * Security: cwd is resolved relative to the repo root and must not escape it.
 */

import { WebSocket } from "ws";
import { exec } from "child_process";
import { resolve } from "path";
import type { TypedHandler, HandlerContext } from "./types.js";
import type { TypedMessage } from "../ws/types.js";

/** BASH — execute a shell command and stream stdout/stderr. */
export const handleBash: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const command = msg["command"] as string | undefined;
  const rawCwd = (msg["cwd"] as string | undefined) ?? ctx.repoRoot;

  if (!command) {
    ctx.sender.typed(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, error: "COCAPN-050: Missing command - Provide a command to execute. Example: { type: 'BASH', command: 'ls -la' }" });
    return;
  }

  // Ensure cwd stays within repo root
  const cwd = resolve(ctx.repoRoot, rawCwd);
  if (!cwd.startsWith(ctx.repoRoot)) {
    ctx.audit.log({
      action: "bash.exec",
      agent: undefined,
      user: undefined,
      command,
      files: undefined,
      result: "denied",
      detail: "cwd outside repo root",
      durationMs: undefined,
    });
    ctx.sender.typed(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, error: "COCAPN-051: cwd outside repo root - The working directory escapes the repository. Use a path within the repo" });
    return;
  }

  const finish = ctx.audit.start({
    action: "bash.exec",
    agent: undefined,
    user: undefined,
    command,
    files: undefined,
  });

  await new Promise<void>((resolveFn) => {
    const child = exec(command, { cwd });

    child.stdout?.on("data", (chunk: string) => {
      ctx.sender.typed(ws, { type: "BASH_OUTPUT", id: msg.id, stdout: chunk, done: false });
    });

    child.stderr?.on("data", (chunk: string) => {
      ctx.sender.typed(ws, { type: "BASH_OUTPUT", id: msg.id, stderr: chunk, done: false });
    });

    child.on("close", (exitCode) => {
      finish(exitCode === 0 ? "ok" : "error", `exit ${exitCode ?? "null"}`);
      ctx.sender.typed(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, exitCode });
      resolveFn();
    });

    child.on("error", (err) => {
      finish("error", err.message);
      ctx.sender.typed(ws, { type: "BASH_OUTPUT", id: msg.id, done: true, error: err.message });
      resolveFn();
    });
  });
};
