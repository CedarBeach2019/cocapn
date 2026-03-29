/**
 * Streaming diff handlers — apply code diffs as they stream from LLM.
 *
 * This module provides WebSocket handlers for real-time diff parsing and
 * incremental application, making the agent feel faster by showing code
 * changes as they're generated.
 *
 * Handlers:
 * - STREAMING_DIFF_START: Begin a streaming diff session
 * - STREAMING_DIFF_CHUNK: Send a chunk for parsing
 * - STREAMING_DIFF_STATUS: Get pending edits status
 * - STREAMING_DIFF_ROLLBACK: Rollback all pending edits
 */

import { WebSocket } from "ws";
import type { TypedHandler, HandlerContext } from "./types.js";
import type { TypedMessage } from "../ws/types.js";
import { DiffStreamParser, type DiffChunk } from "../streaming/diff-parser.js";
import { PartialDiffer, type ApplyResult, type FinalizeResult } from "../streaming/partial-differ.js";
import { sanitizeRepoPath, SanitizationError } from "../utils/path-sanitizer.js";

/**
 * Active streaming sessions. Maps session IDs to session state.
 */
interface StreamingSession {
  id: string;
  parser: DiffStreamParser;
  differ: PartialDiffer;
  currentFile: string | null;
  startTime: number;
  chunksProcessed: number;
}

const activeSessions = new Map<string, StreamingSession>();

/**
 * Clean up sessions older than 1 hour.
 */
function cleanupOldSessions(): void {
  const oneHour = 60 * 60 * 1000;
  const now = Date.now();

  for (const [id, session] of activeSessions) {
    if (now - session.startTime > oneHour) {
      // Rollback any pending changes
      session.differ.rollback().catch(err => {
        console.error(`Failed to cleanup session ${id}:`, err);
      });
      activeSessions.delete(id);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupOldSessions, 10 * 60 * 1000);

/** STREAMING_DIFF_START — begin a streaming diff session. */
export const handleStreamingDiffStart: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const sessionId = msg.id as string | undefined;
  if (!sessionId) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_START_RESULT",
      id: msg.id,
      ok: false,
      error: "COCAPN-060: Missing session ID - Provide 'id' to identify the streaming session",
    });
    return;
  }

  // Check if session already exists
  if (activeSessions.has(sessionId)) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_START_RESULT",
      id: msg.id,
      ok: false,
      error: `Session ${sessionId} already exists`,
    });
    return;
  }

  // Create new session
  const session: StreamingSession = {
    id: sessionId,
    parser: new DiffStreamParser(),
    differ: new PartialDiffer(ctx.repoRoot),
    currentFile: null,
    startTime: Date.now(),
    chunksProcessed: 0,
  };

  activeSessions.set(sessionId, session);

  ctx.audit.log({
    action: "streaming.diff.start",
    agent: undefined,
    user: undefined,
    command: undefined,
    files: [],
    result: "ok",
    detail: `Started streaming diff session ${sessionId}`,
    durationMs: undefined,
  });

  ctx.sender.typed(ws, {
    type: "STREAMING_DIFF_START_RESULT",
    id: msg.id,
    ok: true,
    sessionId,
  });
};

/** STREAMING_DIFF_CHUNK — send a chunk for parsing and application. */
export const handleStreamingDiffChunk: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const sessionId = msg.sessionId as string | undefined;
  const chunk = msg.chunk as string | undefined;
  const filePath = msg.file as string | undefined;

  if (!sessionId || chunk === undefined) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_CHUNK_RESULT",
      id: msg.id,
      ok: false,
      error: "COCAPN-061: Missing sessionId or chunk - Provide both 'sessionId' and 'chunk'",
    });
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_CHUNK_RESULT",
      id: msg.id,
      ok: false,
      error: `Session ${sessionId} not found. Call STREAMING_DIFF_START first.`,
    });
    return;
  }

  try {
    // Parse the chunk
    const diffChunks = session.parser.feed(chunk);

    // Track results for response
    let chunksApplied = 0;
    let errors: string[] = [];

    // Apply each diff chunk
    for (const diffChunk of diffChunks) {
      const targetFile = filePath || diffChunk.file || session.currentFile;

      if (!targetFile) {
        errors.push(`No file specified for diff chunk`);
        continue;
      }

      // Sanitize path
      let sanitizedPath: string;
      try {
        sanitizedPath = sanitizeRepoPath(targetFile, ctx.repoRoot);
      } catch (err) {
        const detail = err instanceof SanitizationError ? err.message : "Invalid path";
        errors.push(`Invalid path ${targetFile}: ${detail}`);
        continue;
      }

      // Start editing file if not already
      if (session.currentFile !== sanitizedPath) {
        // Finalize previous file if any
        if (session.currentFile) {
          const finalizeResult = await session.differ.finalize(session.currentFile);
          if (!finalizeResult.success) {
            errors.push(`Failed to finalize ${session.currentFile}: ${finalizeResult.error}`);
          }
        }

        // Start new file edit
        const startResult = await session.differ.startEdit(sanitizedPath);
        if (!startResult.success) {
          errors.push(`Failed to start editing ${sanitizedPath}: ${startResult.error}`);
          continue;
        }

        session.currentFile = sanitizedPath;
      }

      // Apply the chunk
      const applyResult = await session.differ.applyChunk(sanitizedPath, diffChunk);
      if (applyResult.success) {
        chunksApplied++;
      } else {
        errors.push(`Failed to apply chunk: ${applyResult.error}`);
      }
    }

    session.chunksProcessed += diffChunks.length;

    ctx.audit.log({
      action: "streaming.diff.chunk",
      agent: undefined,
      user: undefined,
      command: undefined,
      files: session.currentFile ? [session.currentFile] : [],
      result: errors.length === 0 ? "ok" : "error",
      detail: `Processed ${diffChunks.length} chunks, ${chunksApplied} applied`,
      durationMs: undefined,
    });

    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_CHUNK_RESULT",
      id: msg.id,
      ok: errors.length === 0,
      sessionId,
      chunksProcessed: diffChunks.length,
      chunksApplied,
      currentFile: session.currentFile,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    ctx.audit.log({
      action: "streaming.diff.chunk",
      agent: undefined,
      user: undefined,
      command: undefined,
      files: session.currentFile ? [session.currentFile] : [],
      result: "error",
      detail: message,
      durationMs: undefined,
    });

    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_CHUNK_RESULT",
      id: msg.id,
      ok: false,
      error: message,
    });
  }
};

/** STREAMING_DIFF_STATUS — get pending edits status. */
export const handleStreamingDiffStatus: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const sessionId = msg.sessionId as string | undefined;

  if (!sessionId) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_STATUS_RESULT",
      id: msg.id,
      ok: false,
      error: "COCAPN-062: Missing sessionId - Provide 'sessionId' to query status",
    });
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_STATUS_RESULT",
      id: msg.id,
      ok: false,
      error: `Session ${sessionId} not found`,
    });
    return;
  }

  const pending = session.differ.getPending();
  const editCount = session.differ.getEditCount();

  ctx.sender.typed(ws, {
    type: "STREAMING_DIFF_STATUS_RESULT",
    id: msg.id,
    ok: true,
    sessionId,
    currentFile: session.currentFile,
    pendingFiles: pending,
    editCount,
    chunksProcessed: session.chunksProcessed,
    uptimeMs: Date.now() - session.startTime,
  });
};

/** STREAMING_DIFF_FINALIZE — finalize all pending edits. */
export const handleStreamingDiffFinalize: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const sessionId = msg.sessionId as string | undefined;

  if (!sessionId) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_FINALIZE_RESULT",
      id: msg.id,
      ok: false,
      error: "COCAPN-063: Missing sessionId - Provide 'sessionId' to finalize",
    });
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_FINALIZE_RESULT",
      id: msg.id,
      ok: false,
      error: `Session ${sessionId} not found`,
    });
    return;
  }

  try {
    // Flush parser
    const remainingChunks = session.parser.flush();

    // Apply remaining chunks
    for (const chunk of remainingChunks) {
      if (session.currentFile) {
        await session.differ.applyChunk(session.currentFile, chunk);
      }
    }

    // Finalize current file
    let finalizedFile: string | null = null;
    if (session.currentFile) {
      const result = await session.differ.finalize(session.currentFile);
      if (result.success) {
        finalizedFile = session.currentFile;
      }
    }

    // Commit changes
    if (finalizedFile) {
      const filename = finalizedFile.split('/').pop() || finalizedFile;
      await ctx.sync.commitFile(filename);
    }

    // Clean up session
    activeSessions.delete(sessionId);

    ctx.audit.log({
      action: "streaming.diff.finalize",
      agent: undefined,
      user: undefined,
      command: undefined,
      files: finalizedFile ? [finalizedFile] : [],
      result: "ok",
      detail: `Finalized streaming diff session ${sessionId}`,
      durationMs: Date.now() - session.startTime,
    });

    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_FINALIZE_RESULT",
      id: msg.id,
      ok: true,
      sessionId,
      finalizedFile,
      totalChunks: session.chunksProcessed,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    ctx.audit.log({
      action: "streaming.diff.finalize",
      agent: undefined,
      user: undefined,
      command: undefined,
      files: [],
      result: "error",
      detail: message,
      durationMs: undefined,
    });

    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_FINALIZE_RESULT",
      id: msg.id,
      ok: false,
      error: message,
    });
  }
};

/** STREAMING_DIFF_ROLLBACK — rollback all pending edits. */
export const handleStreamingDiffRollback: TypedHandler = async (
  ws: WebSocket,
  _clientId: string,
  msg: TypedMessage,
  ctx: HandlerContext,
): Promise<void> => {
  const sessionId = msg.sessionId as string | undefined;

  if (!sessionId) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_ROLLBACK_RESULT",
      id: msg.id,
      ok: false,
      error: "COCAPN-064: Missing sessionId - Provide 'sessionId' to rollback",
    });
    return;
  }

  const session = activeSessions.get(sessionId);
  if (!session) {
    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_ROLLBACK_RESULT",
      id: msg.id,
      ok: false,
      error: `Session ${sessionId} not found`,
    });
    return;
  }

  try {
    const restored = await session.differ.rollback();

    // Clean up session
    activeSessions.delete(sessionId);

    ctx.audit.log({
      action: "streaming.diff.rollback",
      agent: undefined,
      user: undefined,
      command: undefined,
      files: [],
      result: "ok",
      detail: `Rolled back ${restored} files in session ${sessionId}`,
      durationMs: Date.now() - session.startTime,
    });

    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_ROLLBACK_RESULT",
      id: msg.id,
      ok: true,
      sessionId,
      filesRestored: restored,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    ctx.audit.log({
      action: "streaming.diff.rollback",
      agent: undefined,
      user: undefined,
      command: undefined,
      files: [],
      result: "error",
      detail: message,
      durationMs: undefined,
    });

    ctx.sender.typed(ws, {
      type: "STREAMING_DIFF_ROLLBACK_RESULT",
      id: msg.id,
      ok: false,
      error: message,
    });
  }
};